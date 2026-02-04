/**
 * @file TranslationService
 * @description メッセージの翻訳ロジックと関連するデータ処理を管理するサービス。
 *              言語検出、Geminiを使った翻訳、履歴の管理、ログの保存を行います。
 */

import { GeminiClient } from './gemini';
import { PostRepository, LogRepository, Env } from '../db';
import { Post } from '../types/db';

export class TranslationService {
  private geminiClient: GeminiClient;
  private postRepository: PostRepository;
  private logRepository: LogRepository;

  constructor(env: Env) {
    this.geminiClient = new GeminiClient(env);
    this.postRepository = new PostRepository(env);
    this.logRepository = new LogRepository(env);
  }

  /**
   * @method detectLanguage
   * @description テキストの言語を検出します。
   * @param {string} text 検出するテキスト
   * @returns {'ja' | 'pl' | 'en'} 検出された言語コード
   */
  private detectLanguage(text: string): 'ja' | 'pl' | 'en' {
    // 日本語のひらがな、カタカナ、漢字のいずれかが含まれているか
    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) {
      return 'ja';
    }
    // ポーランド語の特殊文字が含まれているか
    if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) {
      return 'pl';
    }
    // デフォルトは英語
    return 'en';
  }

  /**
   * @method translateMessage
   * @description メッセージを翻訳し、結果をデータベースに保存します。
   * @param {string} postId 翻訳対象の投稿ID
   * @param {string} userId 投稿者のユーザーID
   * @param {string | null} roomId 投稿があったルームID (個人チャットの場合はnull)
   * @param {string} messageText 翻訳する元のメッセージテキスト
   * @returns {Promise<string | null>} 翻訳されたテキスト(複数言語の場合は改行区切り)、または翻訳不要/失敗の場合はnull
   */
  async translateMessage(
    postId: string,
    userId: string,
    roomId: string | null,
    messageText: string
  ): Promise<string | null> {
    const sourceLang = this.detectLanguage(messageText);
    let targetLangs: ('ja' | 'pl' | 'en')[] = [];

    if (sourceLang === 'ja') {
      targetLangs = ['en', 'pl'];
    } else if (sourceLang === 'en' || sourceLang === 'pl') {
      targetLangs = ['ja'];
    } else {
      // 翻訳が不要なケース
      return null;
    }

    const context = await this.getContext(userId, roomId);
    const translations: string[] = [];

    for (const targetLang of targetLangs) {
      const prompt = this.createTranslationPrompt(messageText, context, sourceLang, targetLang);
      try {
        const translatedText = await this.geminiClient.generateText(prompt);
        translations.push(`[${targetLang.toUpperCase()}] ${translatedText}`);

        // 最初の翻訳成功時にログを記録
        if (translations.length === 1) {
          await this.logRepository.createTranslationLog({
            timestamp: new Date().toISOString(),
            user_id: userId,
            language: sourceLang,
            original_message: messageText,
            translation: translatedText, // 最初の翻訳結果を記録
            prompt: prompt,
            history_count: context.length,
          });
        }
      } catch (error) {
        console.error(`Translation from ${sourceLang} to ${targetLang} failed:`, error);
        await this.logRepository.createDebugLog({
          timestamp: new Date().toISOString(),
          message: `Translation error for post ${postId} (${sourceLang} -> ${targetLang}): ${
            error instanceof Error ? error.message : String(error)
          }`,
          stack: error instanceof Error ? error.stack : null,
        });
        // 1つでも翻訳に失敗したら、そこで処理を中断することも検討できるが、一旦続行する
      }
    }

    if (translations.length > 0) {
      const combinedTranslations = translations.join('\n');
      await this.postRepository.updateTranslatedText(postId, combinedTranslations);
      return combinedTranslations;
    }

    return null;
  }

  /**
   * @method getContext
   * @description 翻訳のための会話コンテキストを取得します。
   * @param {string} userId ユーザーID
   * @param {string | null} roomId 会話が行われているルームID。nullの場合は個人チャット。
   * @returns {Promise<Post[]>} 直近のメッセージの配列
   */
  private async getContext(userId: string, roomId: string | null): Promise<Post[]> {
    const CONTEXT_LIMIT = 2;
    if (roomId) {
      return await this.postRepository.findLatestPostsByRoomId(roomId, CONTEXT_LIMIT);
    } else {
      return await this.postRepository.findLatestPostsByUserId(userId, CONTEXT_LIMIT);
    }
  }

  /**
   * @method createTranslationPrompt
   * @description Gemini APIに渡す翻訳プロンプトを構築します。
   * @param {string} messageText 翻訳対象のメッセージ
   * @param {Post[]} context 会話のコンテキスト
   * @param {'ja' | 'pl' | 'en'} sourceLang 元のメッセージの言語コード
   * @param {'ja' | 'pl' | 'en'} targetLang 翻訳先の言語コード
   * @returns {string} 構築されたプロンプト
   */
  private createTranslationPrompt(
    messageText: string,
    context: Post[],
    sourceLang: 'ja' | 'pl' | 'en',
    targetLang: 'ja' | 'pl' | 'en'
  ): string {
    const contextString = context
      .map(post => `> ${post.message_text || ''}`)
      .reverse()
      .join('\n');

    let roleplayInstruction: string;
    let translationInstruction: string;

    // Based on specs-on-cloudflareworker.md
    if (sourceLang === 'ja') {
      // 保護者(ja) -> 先生(en/pl)
      roleplayInstruction = `You are a professional translator for a children's ballet school. Translate the following Japanese message from a parent into natural, polite ${
        targetLang === 'en' ? 'English' : 'Polish'
      }. Ballet-specific terms (e.g., ポアント, プリエ) should be translated appropriately.`;
      translationInstruction = `Please translate the following Japanese message into ${
        targetLang === 'en' ? 'English' : 'Polish'
      }.`;
    } else {
      // 先生(en/pl) -> 保護者(ja)
      roleplayInstruction = `あなたはバレエ教室のプロの翻訳者です。以下の${
        sourceLang === 'en' ? '英語' : 'ポーランド語'
      }のメッセージを、生徒の日本の保護者向けに、自然で丁寧な日本語に翻訳してください。先生の親しみやすい人柄が伝わるように、少し柔らかい表現を加えてください。バレエの専門用語は適切に翻訳してください。`;
      translationInstruction = `以下のメッセージを日本語に翻訳してください。`;
    }

    return `
# Role
${roleplayInstruction}

# Context (Recent conversation history)
${contextString || 'None'}

# Instruction
${translationInstruction}
---
${messageText}
---
`;
  }
}

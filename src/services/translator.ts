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
   * @returns {Promise<string | null>} 翻訳されたテキスト、または翻訳不要/失敗の場合はnull
   */
  async translateMessage(
    postId: string,
    userId: string,
    roomId: string | null,
    messageText: string
  ): Promise<string | null> {
    const sourceLang = this.detectLanguage(messageText);
    console.log(`Detected language: ${sourceLang} for text: ${messageText}`);

    // 翻訳対象の言語かチェック
    if (sourceLang !== 'ja' && sourceLang !== 'en' && sourceLang !== 'pl') {
      console.log('No target languages identified. Skipping translation.');
      return null;
    }

    const context = await this.getContext(userId, roomId);
    const prompt = this.createTranslationPrompt(messageText, context, sourceLang);

    try {
      const translatedText = await this.geminiClient.generateText(prompt);

      // ログを記録
      await this.logRepository.createTranslationLog({
        timestamp: new Date().toISOString(),
        user_id: userId,
        language: sourceLang,
        original_message: messageText,
        translation: translatedText,
        prompt: prompt,
        history_count: context.length,
      });

      await this.postRepository.updateTranslatedText(postId, translatedText);
      return translatedText;
    } catch (error) {
      console.error(`Translation failed:`, error);
      await this.logRepository.createDebugLog({
        timestamp: new Date().toISOString(),
        message: `Translation error for post ${postId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        stack: error instanceof Error ? error.stack : null,
      });
      return null;
    }
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
   *              GASの実装(gas-src/code.gs)と完全に一致するようにしています。
   * @param {string} messageText 翻訳対象のメッセージ
   * @param {Post[]} context 会話のコンテキスト
   * @param {'ja' | 'pl' | 'en'} sourceLang 元のメッセージの言語コード
   * @returns {string} 構築されたプロンプト
   */
  private createTranslationPrompt(
    messageText: string,
    context: Post[],
    sourceLang: 'ja' | 'pl' | 'en'
  ): string {
    let prompt = '';

    if (sourceLang === 'ja') {
      prompt += 'あなたはプロの通訳アシスタントです。以下の日本語テキストを「英語」と「ポーランド語」の両方に翻訳してください。\n\n';
      prompt += '【出力形式】\n';
      prompt += 'Polish: [ポーランド語の翻訳結果]\n';
      prompt += 'English: [英語の翻訳結果]\n\n';
    } else {
      prompt += 'あなたはプロの通訳アシスタントです。以下のテキストを自然な日本語に翻訳してください。\n\n';
    }

    if (context && context.length > 0) {
      prompt += '【会話の文脈】\n';
      prompt += '以下は過去のユーザーの発言です。代名詞や省略表現を翻訳する際の参考にしてください。\n\n';
      // コンテキストは新しい順(DESC)で来るので、古い順に並べ替える
      const chronologicalContext = [...context].reverse();
      chronologicalContext.forEach((post, index) => {
        prompt += (index + 1) + '. ' + (post.message_text || '') + '\n';
      });
      prompt += '\n';
    }

    prompt += '【翻訳対象】\n';
    prompt += messageText + '\n\n';
    prompt += '【指示】\n';
    prompt += '- 翻訳結果のみを出力してください（説明や追加情報は不要）\n';
    prompt += '- 子供バレエ教室のチャットでのメッセージです。バレエ用語は正しく訳してください。ポーランド語は先生で、日本語は生徒の保護者です。バレエ教室の先生とのやりとりとして自然な文章にしてください。\n';
    prompt += '- 原文に含まれるニュアンス（感情、皮肉、丁寧さの度合い、ユーモアなど）を鋭敏に汲み取り、それをターゲット言語で適切に表現してください。直訳よりも、この「空気感」の再現を優先してください。\n';
    prompt += '- ポーランド人が言葉に込める親密さを表現してください\n';
    prompt += '- 翻訳した文章が長くなっても構いませんので、元の文章の意図が完全に伝わるようにしてください\n';

    if (context && context.length > 0) {
      prompt += '- 代名詞や省略表現は、上記の文脈を考慮して適切に翻訳してください\n';
    }

    return prompt;
  }
}

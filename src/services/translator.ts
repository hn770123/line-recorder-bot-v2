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
   *              簡易的な検出ロジックのため、より高度なものが必要な場合は外部APIを検討。
   * @param {string} text 検出するテキスト
   * @returns {string} 検出された言語コード (例: 'ja', 'en', 'pl')
   */
  private detectLanguage(text: string): string {
    // 非常に簡易的な言語検出（実際にはより堅牢なライブラリやサービスを使用すべき）
    // 日本語のひらがな、カタカナ、漢字がある程度含まれていれば日本語と判断
    if (/[ぁ-んァ-ヶ一- universally-accepted-japanese-symbols]/.test(text)) {
      return 'ja';
    }
    // ポーランド語の特殊文字が含まれていればポーランド語と判断
    // ąćęłńóśźżĄĆĘŁŃÓŚŹŻ
    if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) {
      return 'pl';
    }
    return 'en'; // デフォルトは英語
  }

  /**
   * @method translateMessage
   * @description メッセージを翻訳し、結果をデータベースに保存します。
   * @param {string} postId 翻訳対象の投稿ID
   * @param {string} userId 投稿者のユーザーID
   * @param {string | null} roomId 投稿があったルームID (個人チャットの場合はnull)
   * @param {string} messageText 翻訳する元のメッセージテキスト
   * @returns {Promise<string | null>} 翻訳されたテキスト、または翻訳に失敗した場合はnull
   */
  async translateMessage(
    postId: string,
    userId: string,
    roomId: string | null,
    messageText: string
  ): Promise<string | null> {
    const detectedLanguage = this.detectLanguage(messageText);

    // 翻訳が必要な場合のみ処理
    if (detectedLanguage === 'ja') { // 日本語からの翻訳を想定
      const context = await this.getContext(roomId);
      const prompt = this.createTranslationPrompt(messageText, context);

      try {
        const translatedText = await this.geminiClient.generateText(
          prompt,
          context.map(post => ({ role: 'user', parts: post.message_text || '' })), // Geminiの履歴形式に変換
          3 // リトライ回数
        );

        // 翻訳結果をpostsテーブルに保存
        await this.postRepository.updateTranslatedText(postId, translatedText);

        // 翻訳ログを保存
        await this.logRepository.createTranslationLog({
          timestamp: new Date().toISOString(),
          user_id: userId,
          language: detectedLanguage,
          original_message: messageText,
          translation: translatedText,
          prompt: prompt,
          history_count: context.length,
        });

        return translatedText;
      } catch (error) {
        console.error('Translation failed:', error);
        await this.logRepository.createDebugLog({
          timestamp: new Date().toISOString(),
          message: `Translation error for post ${postId}: ${error instanceof Error ? error.message : String(error)}`,
          stack: error instanceof Error ? error.stack : null,
        });
        return null;
      }
    }
    return null; // 翻訳不要な場合はnullを返す
  }

  /**
   * @method getContext
   * @description 翻訳のための会話コンテキストを取得します。
   *              直近の2つのメッセージをPostRepositoryから取得します。
   * @param {string | null} roomId 会話が行われているルームID。nullの場合は個人チャット。
   * @returns {Promise<Post[]>} 直近のメッセージの配列
   */
  private async getContext(roomId: string | null): Promise<Post[]> {
    if (roomId) {
      // ルームIDがある場合は、そのルームのメッセージ履歴を取得
      return await this.postRepository.findLatestPostsByRoomId(roomId, 2);
    } else {
      // 個人チャットの場合は、現時点ではコンテキストなしとするか、ユーザーIDで履歴を取得する
      // TODO: 個人チャットの履歴取得ロジックを追加
      return [];
    }
  }

  /**
   * @method createTranslationPrompt
   * @description Gemini APIに渡す翻訳プロンプトを構築します。
   * @param {string} messageText 翻訳対象のメッセージ
   * @param {Post[]} context 会話のコンテキスト
   * @param {string} sourceLang 元のメッセージの言語コード (例: 'ja', 'en', 'pl')
   * @param {string} targetLang 翻訳先の言語コード (例: 'ja', 'en', 'pl')
   * @returns {string} 構築されたプロンプト
   */
  private createTranslationPrompt(messageText: string, context: Post[], sourceLang: string, targetLang: string): string {
    let contextString = '';
    if (context.length > 0) {
      contextString = context
        .map(post => `${post.user_id}: ${post.message_text || ''}`)
        .filter(s => s.trim() !== '')
        .join('\n');
    }

    let roleplayInstruction: string;
    let translationInstruction: string;

    if (sourceLang === 'ja' && targetLang === 'en') {
      // 日本語話者（保護者）から英語話者（先生）への翻訳を想定
      roleplayInstruction = 'あなたは日本語を英語に翻訳する、厳格だが優しいバレエ教師です。生徒の保護者が理解しやすいように、自然で丁寧な英語に翻訳してください。専門用語（例: ポアント、プリエ）はバレエ用語として適切に翻訳してください。';
      translationInstruction = `以下の日本語のメッセージを英語に翻訳してください。`;
    } else if (sourceLang === 'en' && targetLang === 'ja') {
      // 英語話者（先生）から日本語話者（保護者）への翻訳を想定
      roleplayInstruction = 'あなたは英語を日本語に翻訳する、厳格だが優しいバレエ教師です。保護者が理解しやすいように、自然で丁寧な日本語に翻訳してください。専門用語（例: plié, pointe）はバレエ用語として適切に翻訳してください。';
      translationInstruction = `以下の英語のメッセージを日本語に翻訳してください。`;
    } else if (sourceLang === 'ja' && targetLang === 'pl') {
      // 日本語話者（保護者）からポーランド語話者（先生）への翻訳を想定
      roleplayInstruction = 'あなたは日本語をポーランド語に翻訳する、厳格だが優しいバレエ教師です。生徒の保護者が理解しやすいように、自然で丁寧なポーランド語に翻訳してください。専門用語（例: ポアント、プリエ）はバレエ用語として適切に翻訳してください。';
      translationInstruction = `以下の日本語のメッセージをポーランド語に翻訳してください。`;
    } else if (sourceLang === 'pl' && targetLang === 'ja') {
      // ポーランド語話者（先生）から日本語話者（保護者）への翻訳を想定
      roleplayInstruction = 'あなたはポーランド語を日本語に翻訳する、厳格だが優しいバレエ教師です。保護者が理解しやすいように、自然で丁寧な日本語に翻訳してください。専門用語はバレエ用語として適切に翻訳してください。';
      translationInstruction = `以下のポーランド語のメッセージを日本語に翻訳してください。`;
    }
    else {
      // デフォルトの翻訳指示 (例: 英語から日本語、またはその他の組み合わせ)
      roleplayInstruction = `あなたは${sourceLang}を${targetLang}に翻訳するプロの翻訳者です。自然な${targetLang}に翻訳してください。`;
      translationInstruction = `以下の${sourceLang}のメッセージを${targetLang}に翻訳してください。`;
    }

    return `
      ${roleplayInstruction}

      過去の会話の文脈:
      ${contextString || 'なし'}

      ${translationInstruction}
      ${messageText}
    `;
  }
}

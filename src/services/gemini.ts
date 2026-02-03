/**
 * @file GeminiClient
 * @description Google Generative AI (Gemini) APIとの連携を管理するクライアント。
 *              テキスト生成、エラーハンドリング、リトライロジックを提供します。
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { Env } from '../db/BaseRepository';

export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private apiKey: string;

  constructor(env: Env) {
    this.apiKey = env.GEMINI_API_KEY;
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    // TODO: モデルの選択はユースケースに応じて調整
    // 例えば、text-onlyの場合は'gemini-pro'、visionを含む場合は'gemini-pro-vision'
    // 現状は'gemini-pro'を使用
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  /**
   * @method generateText
   * @description 指定されたプロンプトと履歴に基づいてテキストを生成します。
   *              リトライロジックを含みます。
   * @param {string} prompt プロンプトテキスト
   * @param {string[]} history 過去のメッセージ履歴 (例: ['user: こんにちは', 'model: こんにちは！'])
   * @param {number} retries リトライ試行回数
   * @returns {Promise<string>} 生成されたテキスト
   * @throws {Error} リトライ回数を超えてもテキスト生成に失敗した場合
   */
  async generateText(prompt: string, history: { role: string; parts: string }[] = [], retries = 3): Promise<string> {
    for (let i = 0; i < retries; i++) {
      try {
        const chat = this.model.startChat({
          history: history,
        });

        const result = await chat.sendMessage(prompt);
        const response = await result.response;
        const text = response.text();
        if (!text) {
          throw new Error('Gemini API did not return text.');
        }
        return text;
      } catch (error: any) {
        console.error(`Gemini API text generation failed (Attempt ${i + 1}/${retries}):`, error);
        // 429 Too Many Requests, 500 Internal Server Error, 503 Service Unavailable
        if (error.response?.status === 429 || error.response?.status === 500 || error.response?.status === 503) {
          const delay = Math.pow(2, i) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error; // Other errors are not retried
        }
      }
    }
    throw new Error(`Failed to generate text from Gemini API after ${retries} attempts.`);
  }
}

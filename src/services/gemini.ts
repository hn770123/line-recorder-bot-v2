/**
 * @file GeminiClient
 * @description Google Generative AI (Gemini) APIとの連携を管理するクライアント。
 *              テキスト生成、エラーハンドリング、リトライロジックを提供します。
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { Env } from '../db/BaseRepository';

const GEMINI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemma-3-27b-it'
];

export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private apiKey: string;

  constructor(env: Env) {
    this.apiKey = env.GEMINI_API_KEY;
    this.genAI = new GoogleGenerativeAI(this.apiKey);
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
    if (!this.apiKey || this.apiKey.length !== 39) {
      console.error('Gemini API Key is invalid or missing (expected 39 chars).');
    }

    let lastError: any;

    for (const modelName of GEMINI_MODELS) {
      const model = this.genAI.getGenerativeModel({ model: modelName });

      for (let i = 0; i < retries; i++) {
        try {
          const chat = model.startChat({
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
          console.error(`Gemini API text generation failed (Model: ${modelName}, Attempt ${i + 1}/${retries}):`, error);
          lastError = error;

          const status = error.response?.status;

          // 429 Too Many Requests: Switch to next model immediately
          if (status === 429) {
             console.warn(`Model ${modelName} hit rate limit (429). Switching to next model.`);
             break; // Break inner loop to continue to next model in outer loop
          }

          // 500 Internal Server Error, 503 Service Unavailable: Retry on same model
          if (status === 500 || status === 503) {
             if (i < retries - 1) {
                const delay = Math.pow(2, i) * 1000; // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay));
                continue; // Retry inner loop
             }
             // Retries exhausted, loop will finish naturally
          } else {
            // Other errors (not 429, not 500, not 503): Fail immediately
            throw error;
          }
        }
      }

      // If we are here, inner loop finished.
      // If it was due to 429 break, lastError.response.status is 429.
      if (lastError?.response?.status === 429) {
        continue; // Try next model
      }

      // If we are here, it means retries exhausted for 500/503 (or somehow else), we throw.
      throw lastError;
    }

    throw lastError || new Error(`Failed to generate text from Gemini API after trying all models.`);
  }
}

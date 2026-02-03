/**
 * @file LogRepository
 * @description 'translation_logs' および 'debug_logs' テーブルに対するデータベース操作を管理するリポジトリ。
 */

import { BaseRepository, Env } from './BaseRepository';
import { TranslationLog, DebugLog } from '../types/db';

export class LogRepository extends BaseRepository {
  constructor(env: Env) {
    super(env);
  }

  /**
   * @method createTranslationLog
   * @description 新しい翻訳ログを作成します。
   * @param {Omit<TranslationLog, 'id'>} log 作成する翻訳ログデータ（IDは自動採番のため除く）
   * @returns {Promise<D1Result<TranslationLog>>} 作成操作の結果
   */
  async createTranslationLog(log: Omit<TranslationLog, 'id'>): Promise<D1Result<TranslationLog>> {
    const query = `
      INSERT INTO translation_logs (timestamp, user_id, language, original_message, translation, prompt, history_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    return await this.execute<TranslationLog>(query, [
      log.timestamp,
      log.user_id,
      log.language,
      log.original_message,
      log.translation,
      log.prompt,
      log.history_count,
    ]);
  }

  /**
   * @method createDebugLog
   * @description 新しいデバッグログを作成します。
   * @param {Omit<DebugLog, 'id'>} log 作成するデバッグログデータ（IDは自動採番のため除く）
   * @returns {Promise<D1Result<DebugLog>>} 作成操作の結果
   */
  async createDebugLog(log: Omit<DebugLog, 'id'>): Promise<D1Result<DebugLog>> {
    const query = `
      INSERT INTO debug_logs (timestamp, message, stack)
      VALUES (?, ?, ?)
    `;
    return await this.execute<DebugLog>(query, [
      log.timestamp,
      log.message,
      log.stack,
    ]);
  }

  /**
   * @method getRecentTranslationLogs
   * @description 最新の翻訳ログを指定数だけ取得します。
   * @param {number} limit 取得するログの最大数
   * @returns {Promise<TranslationLog[]>} 翻訳ログの配列
   */
  async getRecentTranslationLogs(limit: number): Promise<TranslationLog[]> {
    const query = `
      SELECT * FROM translation_logs
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    return await this.queryAll<TranslationLog>(query, [limit]);
  }

  /**
   * @method getRecentDebugLogs
   * @description 最新のデバッグログを指定数だけ取得します。
   * @param {number} limit 取得するログの最大数
   * @returns {Promise<DebugLog[]>} デバッグログの配列
   */
  async getRecentDebugLogs(limit: number): Promise<DebugLog[]> {
    const query = `
      SELECT * FROM debug_logs
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    return await this.queryAll<DebugLog>(query, [limit]);
  }
}

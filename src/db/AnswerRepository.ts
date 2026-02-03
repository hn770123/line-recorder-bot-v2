/**
 * @file AnswerRepository
 * @description 'answers' テーブルに対するデータベース操作を管理するリポジトリ。
 */

import { BaseRepository, Env } from './BaseRepository';
import { Answer } from '../types/db';

export class AnswerRepository extends BaseRepository {
  constructor(env: Env) {
    super(env);
  }

  /**
   * @method findById
   * @description 指定された回答IDに基づいて回答を検索します。
   * @param {string} answerId 回答ID
   * @returns {Promise<Answer | null>} 回答オブジェクト、または見つからない場合はnull
   */
  async findById(answerId: string): Promise<Answer | null> {
    const query = 'SELECT * FROM answers WHERE answer_id = ?';
    return await this.queryOne<Answer>(query, [answerId]);
  }

  /**
   * @method create
   * @description 新しいアンケート回答を作成します。
   * @param {Answer} answer 作成する回答データ
   * @returns {Promise<D1Result<Answer>>} 作成操作の結果
   */
  async create(answer: Answer): Promise<D1Result<Answer>> {
    const query = `
      INSERT INTO answers (answer_id, timestamp, poll_post_id, user_id, answer_value)
      VALUES (?, ?, ?, ?, ?)
    `;
    return await this.execute<Answer>(query, [
      answer.answer_id,
      answer.timestamp,
      answer.poll_post_id,
      answer.user_id,
      answer.answer_value,
    ]);
  }

  /**
   * @method upsert
   * @description アンケート回答が存在しない場合は作成し、存在する場合は更新します。
   *              poll_post_id と user_id の組み合わせで一意性を保ちます。
   * @param {Answer} answer 作成または更新する回答データ
   * @returns {Promise<D1Result<Answer>>} 操作の結果
   */
  async upsert(answer: Answer): Promise<D1Result<Answer>> {
    const query = `
      INSERT INTO answers (answer_id, timestamp, poll_post_id, user_id, answer_value)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(poll_post_id, user_id) DO UPDATE SET
        timestamp = EXCLUDED.timestamp,
        answer_value = EXCLUDED.answer_value;
    `;
    return await this.execute<Answer>(query, [
      answer.answer_id,
      answer.timestamp,
      answer.poll_post_id,
      answer.user_id,
      answer.answer_value,
    ]);
  }

  /**
   * @method getAnswersByPollPostId
   * @description 指定されたアンケート投稿IDに対するすべての回答を取得します。
   * @param {string} pollPostId アンケート対象の投稿ID
   * @returns {Promise<Answer[]>} 回答の配列
   */
  async getAnswersByPollPostId(pollPostId: string): Promise<Answer[]> {
    const query = 'SELECT * FROM answers WHERE poll_post_id = ?';
    return await this.queryAll<Answer>(query, [pollPostId]);
  }
}

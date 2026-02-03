/**
 * @file UserRepository
 * @description 'users' テーブルに対するデータベース操作を管理するリポジトリ。
 */

import { BaseRepository, Env } from './BaseRepository';
import { User } from '../types/db';

export class UserRepository extends BaseRepository {
  constructor(env: Env) {
    super(env);
  }

  /**
   * @method findById
   * @description 指定されたユーザーIDに基づいてユーザーを検索します。
   * @param {string} userId LINEユーザーID
   * @returns {Promise<User | null>} ユーザーオブジェクト、または見つからない場合はnull
   */
  async findById(userId: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE user_id = ?';
    return await this.queryOne<User>(query, [userId]);
  }

  /**
   * @method create
   * @description 新しいユーザーを作成します。
   * @param {User} user 作成するユーザーデータ
   * @returns {Promise<D1Result<User>>} 作成操作の結果
   */
  async create(user: User): Promise<D1Result<User>> {
    const query = 'INSERT INTO users (user_id, display_name) VALUES (?, ?)';
    return await this.execute<User>(query, [user.user_id, user.display_name]);
  }

  /**
   * @method upsert
   * @description ユーザーが存在しない場合は作成し、存在する場合は更新します。
   * @param {User} user 作成または更新するユーザーデータ
   * @returns {Promise<D1Result<User>>} 操作の結果
   */
  async upsert(user: User): Promise<D1Result<User>> {
    const query = `
      INSERT INTO users (user_id, display_name)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name;
    `;
    return await this.execute<User>(query, [user.user_id, user.display_name]);
  }
}

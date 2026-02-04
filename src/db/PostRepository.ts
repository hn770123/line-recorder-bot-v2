/**
 * @file PostRepository
 * @description 'posts' テーブルに対するデータベース操作を管理するリポジトリ。
 */

import { BaseRepository, Env } from './BaseRepository';
import { Post } from '../types/db';

export class PostRepository extends BaseRepository {
  constructor(env: Env) {
    super(env);
  }

  /**
   * @method findById
   * @description 指定された投稿IDに基づいて投稿を検索します。
   * @param {string} postId LINEメッセージID
   * @returns {Promise<Post | null>} 投稿オブジェクト、または見つからない場合はnull
   */
  async findById(postId: string): Promise<Post | null> {
    const query = 'SELECT * FROM posts WHERE post_id = ?';
    return await this.queryOne<Post>(query, [postId]);
  }

  /**
   * @method create
   * @description 新しい投稿を作成します。
   * @param {Post} post 作成する投稿データ
   * @returns {Promise<D1Result<Post>>} 作成操作の結果
   */
  async create(post: Post): Promise<D1Result<Post>> {
    const query = `
      INSERT INTO posts (post_id, timestamp, user_id, room_id, message_text, has_poll, translated_text)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    return await this.execute<Post>(query, [
      post.post_id,
      post.timestamp,
      post.user_id,
      post.room_id,
      post.message_text,
      post.has_poll,
      post.translated_text,
    ]);
  }

  /**
   * @method findLatestPostsByRoomId
   * @description 指定されたルームIDの最新の投稿を指定数だけ取得します。
   * @param {string} roomId ルームID
   * @param {number} limit 取得する投稿の最大数
   * @returns {Promise<Post[]>} 投稿の配列
   */
  async findLatestPostsByRoomId(roomId: string, limit: number): Promise<Post[]> {
    const query = `
      SELECT * FROM posts
      WHERE room_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    return await this.queryAll<Post>(query, [roomId, limit]);
  }

  /**
   * @method findLatestPostsByUserId
   * @description 指定されたユーザーIDの最新の投稿を指定数だけ取得します。
   * @param {string} userId ユーザーID
   * @param {number} limit 取得する投稿の最大数
   * @returns {Promise<Post[]>} 投稿の配列
   */
  async findLatestPostsByUserId(userId: string, limit: number): Promise<Post[]> {
    const query = `
      SELECT * FROM posts
      WHERE user_id = ? AND room_id IS NULL
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    return await this.queryAll<Post>(query, [userId, limit]);
  }

  /**
   * @method updateTranslatedText
   * @description 投稿の翻訳済みテキストを更新します。
   * @param {string} postId 更新する投稿のID
   * @param {string} translatedText 設定する翻訳済みテキスト
   * @returns {Promise<D1Result<Post>>} 更新操作の結果
   */
  async updateTranslatedText(postId: string, translatedText: string): Promise<D1Result<Post>> {
    const query = `
      UPDATE posts
      SET translated_text = ?
      WHERE post_id = ?
    `;
    return await this.execute<Post>(query, [translatedText, postId]);
  }

  /**
   * @method updateHasPoll
   * @description 投稿がアンケートであるかを更新します。
   * @param {string} postId 更新する投稿のID
   * @param {0 | 1} hasPoll アンケートが設定されているか (0: false, 1: true)
   * @returns {Promise<D1Result<Post>>} 更新操作の結果
   */
  async updateHasPoll(postId: string, hasPoll: 0 | 1): Promise<D1Result<Post>> {
    const query = `
      UPDATE posts
      SET has_poll = ?
      WHERE post_id = ?
    `;
    return await this.execute<Post>(query, [hasPoll, postId]);
  }
}

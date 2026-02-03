/**
 * @file RoomRepository
 * @description 'rooms' テーブルに対するデータベース操作を管理するリポジトリ。
 */

import { BaseRepository, Env } from './BaseRepository';
import { Room } from '../types/db';

export class RoomRepository extends BaseRepository {
  constructor(env: Env) {
    super(env);
  }

  /**
   * @method findById
   * @description 指定されたルームIDに基づいてルームを検索します。
   * @param {string} roomId LINEルームIDまたはグループID
   * @returns {Promise<Room | null>} ルームオブジェクト、または見つからない場合はnull
   */
  async findById(roomId: string): Promise<Room | null> {
    const query = 'SELECT * FROM rooms WHERE room_id = ?';
    return await this.queryOne<Room>(query, [roomId]);
  }

  /**
   * @method create
   * @description 新しいルームを作成します。
   * @param {Room} room 作成するルームデータ
   * @returns {Promise<D1Result<Room>>} 作成操作の結果
   */
  async create(room: Room): Promise<D1Result<Room>> {
    const query = 'INSERT INTO rooms (room_id, room_name) VALUES (?, ?)';
    return await this.execute<Room>(query, [room.room_id, room.room_name]);
  }

  /**
   * @method upsert
   * @description ルームが存在しない場合は作成し、存在する場合は更新します。
   * @param {Room} room 作成または更新するルームデータ
   * @returns {Promise<D1Result<Room>>} 操作の結果
   */
  async upsert(room: Room): Promise<D1Result<Room>> {
    const query = `
      INSERT INTO rooms (room_id, room_name)
      VALUES (?, ?)
      ON CONFLICT(room_id) DO UPDATE SET
        room_name = EXCLUDED.room_name;
    `;
    return await this.execute<Room>(query, [room.room_id, room.room_name]);
  }
}

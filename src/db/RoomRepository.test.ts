/**
 * @file RoomRepository.test.ts
 * @description RoomRepositoryの単体テスト。
 *              モックされたCloudflare D1データベースを使用して、CRUD操作を検証します。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoomRepository } from '../db/RoomRepository';
import { createMockD1Database } from '../test/utils/mockD1';
import { Env } from '../db/BaseRepository';
import { Room } from '../types/db';

describe('RoomRepository', () => {
  let mockD1: D1Database;
  let roomRepository: RoomRepository;
  let mockEnv: Env;

  beforeEach(() => {
    mockD1 = createMockD1Database();
    mockEnv = {
      DB: mockD1,
      LINE_CHANNEL_ACCESS_TOKEN: 'mock_token',
      LINE_CHANNEL_SECRET: 'mock_secret',
      GEMINI_API_KEY: 'mock_gemini_key',
      BASE_URL: 'https://example.com',
    };
    roomRepository = new RoomRepository(mockEnv);
  });

  it('should find a room by ID', async () => {
    const mockRoom: Room = { room_id: 'R123', room_name: 'Test Room' };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [mockRoom],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 }
    });

    const room = await roomRepository.findById('R123');
    expect(room).toEqual(mockRoom);
    expect(mockD1.prepare).toHaveBeenCalledWith('SELECT * FROM rooms WHERE room_id = ?');
    expect(mockD1.bind).toHaveBeenCalledWith('R123');
  });

  it('should return null if room not found', async () => {
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 }
    });

    const room = await roomRepository.findById('R456');
    expect(room).toBeNull();
  });

  it('should create a new room', async () => {
    const newRoom: Room = { room_id: 'R789', room_name: 'New Room' };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 1, last_row_id: 1 }
    });

    const result = await roomRepository.create(newRoom);
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith('INSERT INTO rooms (room_id, room_name) VALUES (?, ?)');
    expect(mockD1.bind).toHaveBeenCalledWith('R789', 'New Room');
  });

  it('should upsert a room (insert)', async () => {
    const newRoom: Room = { room_id: 'R101', room_name: 'Upsert Room' };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 1, last_row_id: 1 }
    });

    const result = await roomRepository.upsert(newRoom);
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO rooms'));
    expect(mockD1.bind).toHaveBeenCalledWith('R101', 'Upsert Room');
  });

  it('should upsert a room (update)', async () => {
    const existingRoom: Room = { room_id: 'R101', room_name: 'Updated Room' };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 1, last_row_id: 0 }
    });

    const result = await roomRepository.upsert(existingRoom);
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT(room_id) DO UPDATE SET'));
    expect(mockD1.bind).toHaveBeenCalledWith('R101', 'Updated Room');
  });
});

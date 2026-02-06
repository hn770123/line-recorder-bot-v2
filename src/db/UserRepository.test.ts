/**
 * @file UserRepository.test.ts
 * @description UserRepositoryの単体テスト。
 *              モックされたCloudflare D1データベースを使用して、CRUD操作を検証します。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserRepository } from '../db/UserRepository';
import { createMockD1Database } from '../test/utils/mockD1';
import { Env } from '../db/BaseRepository';
import { User } from '../types/db';

describe('UserRepository', () => {
  let mockD1: D1Database;
  let userRepository: UserRepository;
  let mockEnv: Env;

  beforeEach(() => {
    mockD1 = createMockD1Database();
    // EnvオブジェクトにD1Databaseモックを注入
    mockEnv = {
      DB: mockD1,
      LINE_CHANNEL_ACCESS_TOKEN: 'mock_token',
      LINE_CHANNEL_SECRET: 'mock_secret',
      GEMINI_API_KEY: 'mock_gemini_key',
    };
    userRepository = new UserRepository(mockEnv);
  });

  it('should find a user by ID', async () => {
    const mockUser: User = { user_id: 'U123', display_name: 'Test User' };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [mockUser],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 }
    });

    const user = await userRepository.findById('U123');
    expect(user).toEqual(mockUser);
    expect(mockD1.prepare).toHaveBeenCalledWith('SELECT * FROM users WHERE user_id = ?');
    expect(mockD1.bind).toHaveBeenCalledWith('U123');
  });

  it('should return null if user not found', async () => {
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 }
    });

    const user = await userRepository.findById('U456');
    expect(user).toBeNull();
  });

  it('should create a new user', async () => {
    const newUser: User = { user_id: 'U789', display_name: 'New User' };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 1, last_row_id: 1 }
    }); // For INSERT, 'all' might return empty results but success.

    const result = await userRepository.create(newUser);
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith('INSERT INTO users (user_id, display_name) VALUES (?, ?)');
    expect(mockD1.bind).toHaveBeenCalledWith('U789', 'New User');
  });

  it('should upsert a user (insert)', async () => {
    const newUser: User = { user_id: 'U101', display_name: 'Upsert User' };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 1, last_row_id: 1 }
    });

    const result = await userRepository.upsert(newUser);
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'));
    expect(mockD1.bind).toHaveBeenCalledWith('U101', 'Upsert User');
  });

  it('should upsert a user (update)', async () => {
    const existingUser: User = { user_id: 'U101', display_name: 'Updated User' };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 1, last_row_id: 0 }
    });

    const result = await userRepository.upsert(existingUser);
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT(user_id) DO UPDATE SET'));
    expect(mockD1.bind).toHaveBeenCalledWith('U101', 'Updated User');
  });

  it('should create a user only if not exists', async () => {
    const newUser: User = { user_id: 'U999', display_name: '' };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 }
    });

    const result = await userRepository.createIfNotExists(newUser);
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith('INSERT OR IGNORE INTO users (user_id, display_name) VALUES (?, ?)');
    expect(mockD1.bind).toHaveBeenCalledWith('U999', '');
  });
});

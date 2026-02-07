/**
 * @file PostRepository.test.ts
 * @description PostRepositoryの単体テスト。
 *              モックされたCloudflare D1データベースを使用して、CRUD操作を検証します。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostRepository } from '../db/PostRepository';
import { createMockD1Database } from '../test/utils/mockD1';
import { Env } from '../db/BaseRepository';
import { Post } from '../types/db';

describe('PostRepository', () => {
  let mockD1: D1Database;
  let postRepository: PostRepository;
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
    postRepository = new PostRepository(mockEnv);
  });

  it('should find a post by ID', async () => {
    const mockPost: Post = {
      post_id: 'P123',
      timestamp: '2023-01-01T10:00:00Z',
      user_id: 'U123',
      room_id: 'R123',
      message_text: 'Test message',
      has_poll: 0,
      translated_text: null,
    };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [mockPost],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 }
    });

    const post = await postRepository.findById('P123');
    expect(post).toEqual(mockPost);
    expect(mockD1.prepare).toHaveBeenCalledWith('SELECT * FROM posts WHERE post_id = ?');
    expect(mockD1.bind).toHaveBeenCalledWith('P123');
  });

  it('should return null if post not found', async () => {
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 }
    });

    const post = await postRepository.findById('P456');
    expect(post).toBeNull();
  });

  it('should create a new post', async () => {
    const newPost: Post = {
      post_id: 'P789',
      timestamp: '2023-01-01T11:00:00Z',
      user_id: 'U456',
      room_id: 'R456',
      message_text: 'New message',
      has_poll: 0,
      translated_text: null,
    };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 1, last_row_id: 1 }
    });

    const result = await postRepository.create(newPost);
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO posts'));
    expect(mockD1.bind).toHaveBeenCalledWith(
      newPost.post_id,
      newPost.timestamp,
      newPost.user_id,
      newPost.room_id,
      newPost.message_text,
      newPost.has_poll,
      newPost.translated_text
    );
  });

  it('should find latest posts by room ID', async () => {
    const mockPosts: Post[] = [
      { post_id: 'P002', timestamp: '2023-01-01T12:05:00Z', user_id: 'U1', room_id: 'R1', message_text: 'Msg 2', has_poll: 0, translated_text: null },
      { post_id: 'P001', timestamp: '2023-01-01T12:00:00Z', user_id: 'U1', room_id: 'R1', message_text: 'Msg 1', has_poll: 0, translated_text: null },
    ];
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: mockPosts,
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 }
    });

    const posts = await postRepository.findLatestPostsByRoomId('R1', 2);
    expect(posts).toEqual(mockPosts);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringMatching(/SELECT \* FROM posts.*WHERE room_id = \?.*ORDER BY timestamp DESC.*LIMIT \?/s));
    expect(mockD1.bind).toHaveBeenCalledWith('R1', 2);
  });

  it('should update translated text', async () => {
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 1, last_row_id: 0 }
    });

    const result = await postRepository.updateTranslatedText('P123', 'Translated text');
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringMatching(/UPDATE posts.*SET translated_text = \?.*WHERE post_id = \?/s));
    expect(mockD1.bind).toHaveBeenCalledWith('Translated text', 'P123');
  });

  it('should update has_poll status', async () => {
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 1, last_row_id: 0 }
    });

    const result = await postRepository.updateHasPoll('P123', 1);
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringMatching(/UPDATE posts.*SET has_poll = \?.*WHERE post_id = \?/s));
    expect(mockD1.bind).toHaveBeenCalledWith(1, 'P123');
  });
});

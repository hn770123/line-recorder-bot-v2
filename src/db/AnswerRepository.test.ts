/**
 * @file AnswerRepository.test.ts
 * @description AnswerRepositoryの単体テスト。
 *              モックされたCloudflare D1データベースを使用して、CRUD操作を検証します。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnswerRepository } from '../db/AnswerRepository';
import { createMockD1Database } from '../test/utils/mockD1';
import { Env } from '../db/BaseRepository';
import { Answer } from '../types/db';

describe('AnswerRepository', () => {
  let mockD1: D1Database;
  let answerRepository: AnswerRepository;
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
    answerRepository = new AnswerRepository(mockEnv);
  });

  it('should find an answer by ID', async () => {
    const mockAnswer: Answer = {
      answer_id: 'A123',
      timestamp: '2023-01-01T10:00:00Z',
      poll_post_id: 'P123',
      user_id: 'U123',
      answer_value: 'OK',
    };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [mockAnswer],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 }
    });

    const answer = await answerRepository.findById('A123');
    expect(answer).toEqual(mockAnswer);
    expect(mockD1.prepare).toHaveBeenCalledWith('SELECT * FROM answers WHERE answer_id = ?');
    expect(mockD1.bind).toHaveBeenCalledWith('A123');
  });

  it('should return null if answer not found', async () => {
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 }
    });

    const answer = await answerRepository.findById('A456');
    expect(answer).toBeNull();
  });

  it('should create a new answer', async () => {
    const newAnswer: Answer = {
      answer_id: 'A789',
      timestamp: '2023-01-01T11:00:00Z',
      poll_post_id: 'P456',
      user_id: 'U456',
      answer_value: 'NG',
    };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 1, last_row_id: 1 }
    });

    const result = await answerRepository.create(newAnswer);
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO answers'));
    expect(mockD1.bind).toHaveBeenCalledWith(
      newAnswer.answer_id,
      newAnswer.timestamp,
      newAnswer.poll_post_id,
      newAnswer.user_id,
      newAnswer.answer_value
    );
  });

  it('should upsert an answer (insert)', async () => {
    const newAnswer: Answer = {
      answer_id: 'A101',
      timestamp: '2023-01-01T12:00:00Z',
      poll_post_id: 'P101',
      user_id: 'U101',
      answer_value: 'OK',
    };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 1, last_row_id: 1 }
    });

    const result = await answerRepository.upsert(newAnswer);
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO answers'));
    expect(mockD1.bind).toHaveBeenCalledWith(
      newAnswer.answer_id,
      newAnswer.timestamp,
      newAnswer.poll_post_id,
      newAnswer.user_id,
      newAnswer.answer_value
    );
  });

  it('should upsert an answer (update)', async () => {
    const existingAnswer: Answer = {
      answer_id: 'A101',
      timestamp: '2023-01-01T12:30:00Z',
      poll_post_id: 'P101',
      user_id: 'U101',
      answer_value: 'NA',
    };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 1, last_row_id: 0 }
    });

    const result = await answerRepository.upsert(existingAnswer);
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT(poll_post_id, user_id) DO UPDATE SET'));
    expect(mockD1.bind).toHaveBeenCalledWith(
      existingAnswer.answer_id,
      existingAnswer.timestamp,
      existingAnswer.poll_post_id,
      existingAnswer.user_id,
      existingAnswer.answer_value
    );
  });

  it('should get answers by poll post ID', async () => {
    const mockAnswers: Answer[] = [
      { answer_id: 'A001', timestamp: '2023-01-01T12:00:00Z', poll_post_id: 'P_POLL', user_id: 'U_RESP1', answer_value: 'OK' },
      { answer_id: 'A002', timestamp: '2023-01-01T12:05:00Z', poll_post_id: 'P_POLL', user_id: 'U_RESP2', answer_value: 'NG' },
    ];
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: mockAnswers,
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 }
    });

    const answers = await answerRepository.getAnswersByPollPostId('P_POLL');
    expect(answers).toEqual(mockAnswers);
    expect(mockD1.prepare).toHaveBeenCalledWith('SELECT * FROM answers WHERE poll_post_id = ?');
    expect(mockD1.bind).toHaveBeenCalledWith('P_POLL');
  });

  it('should get answers with user names by poll post ID', async () => {
    const mockAnswersWithNames = [
      { answer_id: 'A001', timestamp: '2023-01-01T12:00:00Z', poll_post_id: 'P_POLL', user_id: 'U_RESP1', answer_value: 'OK', display_name: 'User 1' },
      { answer_id: 'A002', timestamp: '2023-01-01T12:05:00Z', poll_post_id: 'P_POLL', user_id: 'U_RESP2', answer_value: 'NG', display_name: null },
    ];
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: mockAnswersWithNames,
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 }
    });

    const answers = await answerRepository.getAnswersWithUserNames('P_POLL');
    expect(answers).toEqual(mockAnswersWithNames);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN users'));
    expect(mockD1.bind).toHaveBeenCalledWith('P_POLL');
  });
});

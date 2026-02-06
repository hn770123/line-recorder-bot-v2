/**
 * @file LogRepository.test.ts
 * @description LogRepositoryの単体テスト。
 *              モックされたCloudflare D1データベースを使用して、ログ操作を検証します。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LogRepository } from '../db/LogRepository';
import { createMockD1Database } from '../test/utils/mockD1';
import { Env } from '../db/BaseRepository';
import { TranslationLog, DebugLog } from '../types/db';

describe('LogRepository', () => {
  let mockD1: D1Database;
  let logRepository: LogRepository;
  let mockEnv: Env;

  beforeEach(() => {
    mockD1 = createMockD1Database();
    mockEnv = {
      DB: mockD1,
      LINE_CHANNEL_ACCESS_TOKEN: 'mock_token',
      LINE_CHANNEL_SECRET: 'mock_secret',
      GEMINI_API_KEY: 'mock_gemini_key',
    };
    logRepository = new LogRepository(mockEnv);
  });

  it('should create a translation log', async () => {
    const newLog: Omit<TranslationLog, 'id'> = {
      timestamp: '2023-01-01T10:00:00Z',
      user_id: 'U123',
      language: 'en',
      original_message: 'Hello',
      translation: 'こんにちは',
      prompt: 'Translate to Japanese',
      history_count: 0,
    };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 1, last_row_id: 1 }
    });

    const result = await logRepository.createTranslationLog(newLog);
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO translation_logs'));
    expect(mockD1.bind).toHaveBeenCalledWith(
      newLog.timestamp,
      newLog.user_id,
      newLog.language,
      newLog.original_message,
      newLog.translation,
      newLog.prompt,
      newLog.history_count
    );
  });

  it('should create a debug log', async () => {
    const newLog: Omit<DebugLog, 'id'> = {
      timestamp: '2023-01-01T10:00:00Z',
      message: 'An error occurred',
      stack: 'Error: An error...',
    };
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: [],
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 1, last_row_id: 1 }
    });

    const result = await logRepository.createDebugLog(newLog);
    expect(result.success).toBe(true);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO debug_logs'));
    expect(mockD1.bind).toHaveBeenCalledWith(
      newLog.timestamp,
      newLog.message,
      newLog.stack
    );
  });

  it('should get recent translation logs', async () => {
    const mockLogs: TranslationLog[] = [
      { id: 2, timestamp: '2023-01-01T10:05:00Z', user_id: 'U1', language: 'en', original_message: 'Hi', translation: 'やあ', prompt: 'Prompt', history_count: 1 },
      { id: 1, timestamp: '2023-01-01T10:00:00Z', user_id: 'U1', language: 'ja', original_message: 'こんにちは', translation: 'Hello', prompt: 'Prompt', history_count: 0 },
    ];
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: mockLogs,
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 }
    });

    const logs = await logRepository.getRecentTranslationLogs(2);
    expect(logs).toEqual(mockLogs);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringMatching(/SELECT \* FROM translation_logs.*ORDER BY timestamp DESC.*LIMIT \?/s));
    expect(mockD1.bind).toHaveBeenCalledWith(2);
  });

  it('should get recent debug logs', async () => {
    const mockLogs: DebugLog[] = [
      { id: 2, timestamp: '2023-01-01T10:05:00Z', message: 'Error 2', stack: 'Stack 2' },
      { id: 1, timestamp: '2023-01-01T10:00:00Z', message: 'Error 1', stack: 'Stack 1' },
    ];
    vi.spyOn(mockD1, 'prepare').mockReturnThis();
    vi.spyOn(mockD1, 'bind').mockReturnThis();
    vi.spyOn(mockD1, 'all').mockResolvedValueOnce({
      results: mockLogs,
      success: true,
      meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 }
    });

    const logs = await logRepository.getRecentDebugLogs(2);
    expect(logs).toEqual(mockLogs);
    expect(mockD1.prepare).toHaveBeenCalledWith(expect.stringMatching(/SELECT \* FROM debug_logs.*ORDER BY timestamp DESC.*LIMIT \?/s));
    expect(mockD1.bind).toHaveBeenCalledWith(2);
  });
});

/**
 * @file GeminiClient.test.ts
 * @description GeminiClientの単体テスト。
 *              @google/generative-aiライブラリをモックして、テキスト生成とリトライ・フォールバックロジックを検証します。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeminiClient } from './gemini';
import { Env } from '../db/BaseRepository';
import { GoogleGenerativeAI } from '@google/generative-ai';

// vi.hoisted を使用してモック関数を定義（vi.mock内から参照できるようにする）
const mocks = vi.hoisted(() => {
  const sendMessage = vi.fn();
  const startChat = vi.fn(() => ({ sendMessage }));
  const getGenerativeModel = vi.fn(() => ({ startChat }));
  const GoogleGenerativeAI = vi.fn(function () {
    return { getGenerativeModel };
  });

  return {
    sendMessage,
    startChat,
    getGenerativeModel,
    GoogleGenerativeAI
  };
});

// @google/generative-aiライブラリのモック
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: mocks.GoogleGenerativeAI
  };
});

describe('GeminiClient', () => {
  let geminiClient: GeminiClient;
  let mockEnv: Env;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEnv = {
      DB: {} as D1Database,
      LINE_CHANNEL_ACCESS_TOKEN: 'mock_token',
      LINE_CHANNEL_SECRET: 'mock_secret',
      GEMINI_API_KEY: '123456789012345678901234567890123456789', // 39 chars
      BASE_URL: 'https://example.com',
      ADMIN_PASSWORD: 'mock_password',
    };
    geminiClient = new GeminiClient(mockEnv);
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should generate text successfully with the first model', async () => {
    const expectedText = 'Generated response';
    mocks.sendMessage.mockResolvedValueOnce({
      response: {
        text: () => expectedText,
      },
    });

    const result = await geminiClient.generateText('Test prompt');

    expect(result).toBe(expectedText);
    expect(mocks.getGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-2.5-flash-lite' });
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('should switch to the next model on 429 error', async () => {
    const expectedText = 'Response from second model';

    // First model fails with 429
    const error429 = new Error('Rate limit exceeded');
    (error429 as any).response = { status: 429 };
    mocks.sendMessage.mockRejectedValueOnce(error429);

    // Second model succeeds
    mocks.sendMessage.mockResolvedValueOnce({
      response: {
        text: () => expectedText,
      },
    });

    const result = await geminiClient.generateText('Test prompt');

    expect(result).toBe(expectedText);

    // Check that detailed error log was called
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Gemini API text generation failed'),
      expect.objectContaining({ stack: expect.any(String) }) // Check stack trace object
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Detail: Rate limit exceeded'), // Check error message
      expect.any(Object)
    );

    // Check that models were called in order
    expect(mocks.getGenerativeModel).toHaveBeenNthCalledWith(1, { model: 'gemini-2.5-flash-lite' });
    expect(mocks.getGenerativeModel).toHaveBeenNthCalledWith(2, { model: 'gemini-2.5-flash' });

    // sendMessage called twice (once for each model)
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('should retry on 503 error on the SAME model', async () => {
    const expectedText = 'Response after retry';

    // First attempt fails with 503
    mocks.sendMessage.mockRejectedValueOnce({ response: { status: 503 } });

    // Second attempt (retry) succeeds
    mocks.sendMessage.mockResolvedValueOnce({
      response: {
        text: () => expectedText,
      },
    });

    const promise = geminiClient.generateText('Test prompt');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(expectedText);

    // Check log for 503
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Gemini API Service Unavailable (503)'));

    // getGenerativeModel should be called ONLY ONCE (for the first model)
    // because we are retrying on the same model instance
    expect(mocks.getGenerativeModel).toHaveBeenCalledTimes(1);
    expect(mocks.getGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-2.5-flash-lite' });

    // sendMessage called twice (1 failure + 1 success)
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('should retry on 500 error on the SAME model', async () => {
    const expectedText = 'Response after 500 retry';

    // First attempt fails with 500
    mocks.sendMessage.mockRejectedValueOnce({ response: { status: 500 } });

    // Second attempt (retry) succeeds
    mocks.sendMessage.mockResolvedValueOnce({
      response: {
        text: () => expectedText,
      },
    });

    const promise = geminiClient.generateText('Test prompt');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(expectedText);

    // Check log for 500
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Gemini API Internal Server Error (500)'));

    // getGenerativeModel should be called ONLY ONCE
    expect(mocks.getGenerativeModel).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('should switch model if all retries fail with 503? No, it should fail based on implementation', async () => {
    // Current implementation throws error if 503 retries exhausted.
    // It does NOT switch model for 503 errors.

    mocks.sendMessage.mockRejectedValue({ response: { status: 503 } }); // All attempts fail

    const promise = geminiClient.generateText('Test prompt', [], 3);

    const assertPromise = expect(promise).rejects.toThrow();

    await vi.runAllTimersAsync();

    await assertPromise;

    // Should have tried retries on the first model
    // 3 attempts total
    expect(mocks.sendMessage).toHaveBeenCalledTimes(3);
    // Should NOT have tried second model
    expect(mocks.getGenerativeModel).toHaveBeenCalledTimes(1);
  });

  it('should iterate through all models if all return 429', async () => {
    // All calls return 429
    mocks.sendMessage.mockRejectedValue({ response: { status: 429 } });

    // Expect the last error (429 object), not a specific message string
    await expect(geminiClient.generateText('Test prompt')).rejects.toEqual({ response: { status: 429 } });

    // Should have tried all 4 models
    expect(mocks.getGenerativeModel).toHaveBeenCalledTimes(4);
    expect(mocks.getGenerativeModel).toHaveBeenNthCalledWith(1, { model: 'gemini-2.5-flash-lite' });
    expect(mocks.getGenerativeModel).toHaveBeenNthCalledWith(2, { model: 'gemini-2.5-flash' });
    expect(mocks.getGenerativeModel).toHaveBeenNthCalledWith(3, { model: 'gemini-3-flash-preview' });
    expect(mocks.getGenerativeModel).toHaveBeenNthCalledWith(4, { model: 'gemma-3-27b-it' });
  });

  it('should handle mixed errors: 429 on first model, 503 retry on second model', async () => {
    const expectedText = 'Success after mixed errors';

    // Model 1: 429 (switch)
    mocks.sendMessage.mockRejectedValueOnce({ response: { status: 429 } });

    // Model 2: 503 (retry) -> Success
    mocks.sendMessage
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ response: { text: () => expectedText } });

    const promise = geminiClient.generateText('Test prompt');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(expectedText);

    expect(mocks.getGenerativeModel).toHaveBeenCalledTimes(2);
    expect(mocks.getGenerativeModel).toHaveBeenNthCalledWith(1, { model: 'gemini-2.5-flash-lite' });
    expect(mocks.getGenerativeModel).toHaveBeenNthCalledWith(2, { model: 'gemini-2.5-flash' });

    // Total 3 calls: 1 (Model 1) + 2 (Model 2)
    expect(mocks.sendMessage).toHaveBeenCalledTimes(3);
  });

  it('should wait between 2-5 seconds when 503 error occurs', async () => {
    const expectedText = 'Response after 503 retry';

    // Mock Math.random to return 0.5.
    // Logic: Math.floor(0.5 * 3001) + 2000 = Math.floor(1500.5) + 2000 = 1500 + 2000 = 3500
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    // Spy on setTimeout to verify delay
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    // First attempt fails with 503
    mocks.sendMessage.mockRejectedValueOnce({ response: { status: 503 } });

    // Second attempt (retry) succeeds
    mocks.sendMessage.mockResolvedValueOnce({
      response: {
        text: () => expectedText,
      },
    });

    const promise = geminiClient.generateText('Test prompt');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(expectedText);

    // Verify setTimeout was called with 3500ms
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3500);
  });
});

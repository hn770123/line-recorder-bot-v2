/**
 * @file GeminiClient.test.ts
 * @description GeminiClientの単体テスト。
 *              @google/generative-aiライブラリをモックして、テキスト生成とリトライロジックを検証します。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiClient } from '../services/gemini';
import { Env } from '../db/BaseRepository';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

// @google/generative-aiライブラリ全体をモック
vi.mock('@google/generative-ai', () => {
  const mockGenerativeModel = {
    startChat: vi.fn(() => ({
      sendMessage: vi.fn(),
    })),
  };
  const mockGoogleGenerativeAI = vi.fn(() => ({
    getGenerativeModel: vi.fn(() => mockGenerativeModel),
  }));
  return { GoogleGenerativeAI: mockGoogleGenerativeAI, GenerativeModel: mockGenerativeModel };
});

describe('GeminiClient', () => {
  let geminiClient: GeminiClient;
  let mockEnv: Env;
  let mockSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      DB: {} as D1Database,
      LINE_CHANNEL_ACCESS_TOKEN: 'mock_token',
      LINE_CHANNEL_SECRET: 'mock_secret',
      GEMINI_API_KEY: 'mock_gemini_key',
    };
    geminiClient = new GeminiClient(mockEnv);

    // モックされたsendMessage関数への参照を取得
    mockSendMessage = (GoogleGenerativeAI as unknown as ReturnType<typeof vi.fn>)()
      .getGenerativeModel().startChat().sendMessage;
  });

  it('should generate text successfully', async () => {
    const expectedText = 'Generated response';
    mockSendMessage.mockResolvedValueOnce({
      response: {
        text: () => expectedText,
      },
    });

    const result = await geminiClient.generateText('Test prompt');
    expect(result).toBe(expectedText);
    expect(mockSendMessage).toHaveBeenCalledWith('Test prompt');
  });

  it('should retry on 429 error and succeed', async () => {
    const expectedText = 'Generated response after retry';
    mockSendMessage
      .mockRejectedValueOnce({ response: { status: 429 } }) // First attempt fails with 429
      .mockResolvedValueOnce({
        response: {
          text: () => expectedText,
        },
      }); // Second attempt succeeds

    const result = await geminiClient.generateText('Test prompt');
    expect(result).toBe(expectedText);
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(mockSendMessage).toHaveBeenCalledWith('Test prompt');
  });

  it('should retry on 500 error and succeed', async () => {
    const expectedText = 'Generated response after retry';
    mockSendMessage
      .mockRejectedValueOnce({ response: { status: 500 } }) // First attempt fails with 500
      .mockResolvedValueOnce({
        response: {
          text: () => expectedText,
        },
      }); // Second attempt succeeds

    const result = await geminiClient.generateText('Test prompt');
    expect(result).toBe(expectedText);
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
  });

  it('should retry on 503 error and succeed', async () => {
    const expectedText = 'Generated response after retry';
    mockSendMessage
      .mockRejectedValueOnce({ response: { status: 503 } }) // First attempt fails with 503
      .mockResolvedValueOnce({
        response: {
          text: () => expectedText,
        },
      }); // Second attempt succeeds

    const result = await geminiClient.generateText('Test prompt');
    expect(result).toBe(expectedText);
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
  });

  it('should throw error after max retries', async () => {
    mockSendMessage.mockRejectedValue({ response: { status: 429 } }); // All attempts fail with 429

    await expect(geminiClient.generateText('Test prompt', [], 3)).rejects.toThrow(
      'Failed to generate text from Gemini API after 3 attempts.'
    );
    expect(mockSendMessage).toHaveBeenCalledTimes(3); // 最初の試行 + 2回のリトライ
  });

  it('should throw error for other types of failures immediately', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('Network error')); // Non-retriable error

    await expect(geminiClient.generateText('Test prompt')).rejects.toThrow('Network error');
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it('should handle history correctly', async () => {
    const expectedText = 'Generated response with history';
    mockSendMessage.mockResolvedValueOnce({
      response: {
        text: () => expectedText,
      },
    });

    const history = [
      { role: 'user', parts: 'Hi' },
      { role: 'model', parts: 'Hello there!' },
    ];
    await geminiClient.generateText('New prompt', history);

    expect(geminiClient['model'].startChat).toHaveBeenCalledWith({ history });
  });

  it('should throw error if Gemini API returns no text', async () => {
    mockSendMessage.mockResolvedValueOnce({
      response: {
        text: () => '', // Empty string, simulating no text returned
      },
    });

    await expect(geminiClient.generateText('Test prompt')).rejects.toThrow('Gemini API did not return text.');
  });
});

/**
 * @file LineClient.test.ts
 * @description LineClientの単体テスト。
 *              fetch APIとWeb Crypto APIをモックして、LINE Messaging APIとの連携機能を検証します。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LineClient } from '../services/line';
import { Env } from '../db/BaseRepository';

// fetch APIをモック
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Web Crypto APIをモック (HMAC-SHA256署名検証用)
const mockSubtle = {
  importKey: vi.fn(async () => 'mockKey'),
  sign: vi.fn(async () => new ArrayBuffer(0)), // 空のArrayBufferを返す
};
Object.defineProperty(global.crypto, 'subtle', { value: mockSubtle, writable: true });
// btoaもモック（ArrayBufferをBase64に変換する部分）
global.btoa = vi.fn(() => 'mockExpectedSignature');


describe('LineClient', () => {
  let lineClient: LineClient;
  let mockEnv: Env;

  beforeEach(() => {
    vi.clearAllMocks(); // 各テストの前にモックの状態をリセット
    mockEnv = {
      DB: {} as D1Database, // D1DatabaseはLineClientでは直接使用されない
      LINE_CHANNEL_ACCESS_TOKEN: 'test_access_token',
      LINE_CHANNEL_SECRET: 'test_channel_secret',
      GEMINI_API_KEY: 'mock_gemini_key',
      BASE_URL: 'https://example.com',
    };
    lineClient = new LineClient(mockEnv);
  });

  it('should send a reply message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    const replyToken = 'test_reply_token';
    const messages = [{ type: 'text', text: 'Hello' }];
    const response = await lineClient.replyMessage(replyToken, messages);

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockEnv.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ replyToken, messages }),
    });
  });

  it('should send a push message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    const to = 'test_user_id';
    const messages = [{ type: 'text', text: 'Push message' }];
    const response = await lineClient.pushMessage(to, messages);

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockEnv.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ to, messages }),
    });
  });

  it('should get a user profile', async () => {
    const mockProfile = { userId: 'test_user', displayName: 'Test User' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockProfile),
    });

    const profile = await lineClient.getProfile('test_user');
    expect(profile).toEqual(mockProfile);
    expect(mockFetch).toHaveBeenCalledWith('https://api.line.me/v2/bot/profile/test_user', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${mockEnv.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });
  });

  it('should throw error when getting profile fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(lineClient.getProfile('non_existent_user')).rejects.toThrow('LINE API error: 404');
  });

  it('should get a group member profile', async () => {
    const mockProfile = { userId: 'test_member', displayName: 'Test Member' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockProfile),
    });

    const profile = await lineClient.getGroupMemberProfile('test_group', 'test_member');
    expect(profile).toEqual(mockProfile);
    expect(mockFetch).toHaveBeenCalledWith('https://api.line.me/v2/bot/group/test_group/member/test_member', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${mockEnv.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });
  });

  it('should throw error when getting group member profile fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(lineClient.getGroupMemberProfile('test_group', 'non_existent_member')).rejects.toThrow('LINE API error: 404');
  });

  it('should start loading animation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    const chatId = 'test_user_id';
    const loadingSeconds = 60;
    const response = await lineClient.startLoadingAnimation(chatId, loadingSeconds);

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('https://api.line.me/v2/bot/chat/loading/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockEnv.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ chatId, loadingSeconds }),
    });
  });

  it('should validate a correct signature', async () => {
    const signature = 'mockExpectedSignature';
    const body = '{"events":[]}';

    // crypto.subtle.signが正しいMACを生成するようにモック
    (mockSubtle.sign as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
        // encoder.encode(this.channelSecret) -> test_channel_secretのバイナリ
        // encoder.encode(body) -> bodyのバイナリ
        // ここでは単純化のため、"mockExpectedSignature"に対応するArrayBufferを生成
        // 実際のHMAC計算は複雑なので、テストでは期待するBase64エンコード結果を先に決めておく
        const textEncoder = new TextEncoder();
        const secretKey = textEncoder.encode(mockEnv.LINE_CHANNEL_SECRET);
        const data = textEncoder.encode(body);

        // 実際のHMAC計算はテストでは行わず、モックされたbtoaの結果と一致するように調整
        // Vitestのvi.fn()は通常、実際の関数を置き換える。ここではcrypto.subtle.signをモックして
        // 期待される出力を返すようにする。
        // btoaのモックと整合性を持たせるため、ここでは空のArrayBufferを返す
        // そしてbtoaのモックが「mockExpectedSignature」を返すことで検証をパスさせる
        return new ArrayBuffer(0);
    });

    const isValid = await lineClient.validateSignature(signature, body);
    expect(isValid).toBe(true);
    expect(mockSubtle.importKey).toHaveBeenCalledWith(
      'raw',
      new TextEncoder().encode(mockEnv.LINE_CHANNEL_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    expect(mockSubtle.sign).toHaveBeenCalled();
    expect(global.btoa).toHaveBeenCalled();
  });

  it('should invalidate an incorrect signature', async () => {
    const signature = 'incorrectSignature';
    const body = '{"events":[]}';

    // crypto.subtle.signが正しいMACを生成するようにモック
    (mockSubtle.sign as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
        return new ArrayBuffer(0); // 正しいMACではないArrayBuffer
    });
    // btoaは「mockExpectedSignature」を返すので、signatureと一致しない

    const isValid = await lineClient.validateSignature(signature, body);
    expect(isValid).toBe(false);
  });
});

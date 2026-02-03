/**
 * @file TranslationService.test.ts
 * @description TranslationServiceの単体テスト。
 *              GeminiClient、PostRepository、LogRepositoryをモックして、
 *              翻訳ロジックとログ保存機能を検証します。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TranslationService } from '../services/translator';
import { GeminiClient } from '../services/gemini';
import { PostRepository, LogRepository } from '../db';
import { Env } from '../db/BaseRepository';
import { Post } from '../types/db';

// 各依存サービス/リポジトリをモック
vi.mock('../services/gemini');
vi.mock('../db/PostRepository');
vi.mock('../db/LogRepository');

describe('TranslationService', () => {
  let translationService: TranslationService;
  let mockEnv: Env;
  let mockGeminiClient: vi.Mocked<GeminiClient>;
  let mockPostRepository: vi.Mocked<PostRepository>;
  let mockLogRepository: vi.Mocked<LogRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      DB: {} as D1Database,
      LINE_CHANNEL_ACCESS_TOKEN: 'mock_token',
      LINE_CHANNEL_SECRET: 'mock_secret',
      GEMINI_API_KEY: 'mock_gemini_key',
    };

    // モックされたインスタンスを取得
    mockGeminiClient = new GeminiClient(mockEnv) as vi.Mocked<GeminiClient>;
    mockPostRepository = new PostRepository(mockEnv) as vi.Mocked<PostRepository>;
    mockLogRepository = new LogRepository(mockEnv) as vi.Mocked<LogRepository>;

    // コンストラクタでモックインスタンスが使われるようにする
    // (new GeminiClient(env)) などが呼ばれた際に、モックされたインスタンスを返すようにする
    vi.mocked(GeminiClient).mockImplementation(() => mockGeminiClient);
    vi.mocked(PostRepository).mockImplementation(() => mockPostRepository);
    vi.mocked(LogRepository).mockImplementation(() => mockLogRepository);


    translationService = new TranslationService(mockEnv);
  });

  it('should detect Japanese and translate the message', async () => {
    const originalText = 'こんにちは、元気ですか？';
    const translatedText = 'Hello, how are you?';
    const postId = 'test_post_id';
    const userId = 'test_user_id';
    const roomId = 'test_room_id';

    mockPostRepository.findLatestPostsByRoomId.mockResolvedValueOnce([]);
    mockGeminiClient.generateText.mockResolvedValueOnce(translatedText);
    mockPostRepository.updateTranslatedText.mockResolvedValueOnce({ success: true } as D1Result<Post>);
    mockLogRepository.createTranslationLog.mockResolvedValueOnce({ success: true } as D1Result<any>);

    const result = await translationService.translateMessage(
      postId,
      userId,
      roomId,
      originalText
    );

    expect(result).toBe(translatedText);
    expect(mockPostRepository.findLatestPostsByRoomId).toHaveBeenCalledWith(roomId, 2);
    expect(mockGeminiClient.generateText).toHaveBeenCalled();
    expect(mockPostRepository.updateTranslatedText).toHaveBeenCalledWith(postId, translatedText);
    expect(mockLogRepository.createTranslationLog).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        language: 'ja',
        original_message: originalText,
        translation: translatedText,
        history_count: 0,
      })
    );
  });

  it('should not translate if language is not Japanese (as per simple detection)', async () => {
    const originalText = 'Hello, how are you?';
    const postId = 'test_post_id';
    const userId = 'test_user_id';
    const roomId = 'test_room_id';

    const result = await translationService.translateMessage(
      postId,
      userId,
      roomId,
      originalText
    );

    expect(result).toBeNull();
    expect(mockPostRepository.findLatestPostsByRoomId).not.toHaveBeenCalled();
    expect(mockGeminiClient.generateText).not.toHaveBeenCalled();
    expect(mockPostRepository.updateTranslatedText).not.toHaveBeenCalled();
    expect(mockLogRepository.createTranslationLog).not.toHaveBeenCalled();
  });

  it('should log debug info if translation fails', async () => {
    const originalText = 'こんにちは';
    const postId = 'test_post_id';
    const userId = 'test_user_id';
    const roomId = 'test_room_id';
    const error = new Error('Gemini API error');

    mockPostRepository.findLatestPostsByRoomId.mockResolvedValueOnce([]);
    mockGeminiClient.generateText.mockRejectedValueOnce(error);
    mockLogRepository.createDebugLog.mockResolvedValueOnce({ success: true } as D1Result<any>);

    const result = await translationService.translateMessage(
      postId,
      userId,
      roomId,
      originalText
    );

    expect(result).toBeNull();
    expect(mockLogRepository.createDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `Translation error for post ${postId}: ${error.message}`,
        stack: error.stack,
      })
    );
    expect(mockPostRepository.updateTranslatedText).not.toHaveBeenCalled(); // 翻訳失敗時は更新しない
  });

  it('should include context in the prompt', async () => {
    const originalText = 'ありがとう';
    const translatedText = 'Thank you';
    const postId = 'test_post_id';
    const userId = 'test_user_id';
    const roomId = 'test_room_id';

    const mockContext: Post[] = [
      { post_id: 'ctx1', timestamp: 'old', user_id: 'U1', room_id: roomId, message_text: 'こんにちは', has_poll: 0, translated_text: 'Hello' },
      { post_id: 'ctx2', timestamp: 'older', user_id: 'U2', room_id: roomId, message_text: '元気ですか', has_poll: 0, translated_text: 'How are you' },
    ];
    mockPostRepository.findLatestPostsByRoomId.mockResolvedValueOnce(mockContext);
    mockGeminiClient.generateText.mockResolvedValueOnce(translatedText);
    mockPostRepository.updateTranslatedText.mockResolvedValueOnce({ success: true } as D1Result<Post>);
    mockLogRepository.createTranslationLog.mockResolvedValueOnce({ success: true } as D1Result<any>);

    await translationService.translateMessage(postId, userId, roomId, originalText);

    const expectedPromptPart = '過去の会話の文脈:\nU1: こんにちは\nU2: 元気ですか';
    expect(mockGeminiClient.generateText).toHaveBeenCalledWith(
      expect.stringContaining(expectedPromptPart),
      expect.any(Array), // history array is passed
      3
    );
  });
});

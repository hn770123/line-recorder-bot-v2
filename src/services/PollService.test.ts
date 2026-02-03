/**
 * @file PollService.test.ts
 * @description PollServiceの単体テスト。
 *              LineClient、PostRepository、AnswerRepositoryをモックして、
 *              アンケートの作成、解析、回答処理機能を検証します。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PollService } from '../services/poll';
import { LineClient } from '../services/line';
import { PostRepository, AnswerRepository } from '../db';
import { Env } from '../db/BaseRepository';
import { Post, Answer } from '../types/db';

// 各依存サービス/リポジトリをモック
vi.mock('../services/line');
vi.mock('../db/PostRepository');
vi.mock('../db/AnswerRepository');

describe('PollService', () => {
  let pollService: PollService;
  let mockEnv: Env;
  let mockLineClient: vi.Mocked<LineClient>;
  let mockPostRepository: vi.Mocked<PostRepository>;
  let mockAnswerRepository: vi.Mocked<AnswerRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      DB: {} as D1Database,
      LINE_CHANNEL_ACCESS_TOKEN: 'mock_token',
      LINE_CHANNEL_SECRET: 'mock_secret',
      GEMINI_API_KEY: 'mock_gemini_key',
    };

    // モックされたインスタンスを取得
    mockLineClient = new LineClient(mockEnv) as vi.Mocked<LineClient>;
    mockPostRepository = new PostRepository(mockEnv) as vi.Mocked<PostRepository>;
    mockAnswerRepository = new AnswerRepository(mockEnv) as vi.Mocked<AnswerRepository>;

    vi.mocked(LineClient).mockImplementation(() => mockLineClient);
    vi.mocked(PostRepository).mockImplementation(() => mockPostRepository);
    vi.mocked(AnswerRepository).mockImplementation(() => mockAnswerRepository);

    pollService = new PollService(mockEnv);

    // crypto.randomUUIDをモック
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => 'mock-uuid'),
    });
  });

  it('should detect poll command', () => {
    expect(pollService.isPollCommand('[check]Is this a poll?')).toBe(true);
    expect(pollService.isPollCommand('No poll here.')).toBe(false);
  });

  it('should parse poll question', () => {
    const question = pollService.parsePollQuestion('[check]What is your favorite color?');
    expect(question).toBe('What is your favorite color?');
  });

  it('should create a poll and send Flex Message', async () => {
    const replyToken = 'test_reply_token';
    const postId = 'test_post_id';
    const question = 'Test Question';
    const userId = 'test_user_id';
    const roomId = 'test_room_id';

    mockLineClient.replyMessage.mockResolvedValueOnce({ ok: true } as Response);

    await pollService.createPoll(replyToken, postId, question, userId, roomId);

    expect(mockLineClient.replyMessage).toHaveBeenCalledWith(
      replyToken,
      [expect.objectContaining({ type: 'flex', altText: expect.stringContaining(question) })]
    );
  });

  it('should handle poll answer via postback', async () => {
    const userId = 'voter_user_id';
    const data = 'action=vote&postId=poll_post_1&answer=OK';

    mockAnswerRepository.upsert.mockResolvedValueOnce({ success: true } as D1Result<Answer>);

    await pollService.handlePollAnswer(userId, data);

    expect(mockAnswerRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        answer_id: 'mock-uuid',
        poll_post_id: 'poll_post_1',
        user_id: userId,
        answer_value: 'OK',
      })
    );
  });

  it('should throw error for invalid poll answer data', async () => {
    const userId = 'voter_user_id';
    const data = 'action=vote&postId=poll_post_1'; // Missing answer

    await expect(pollService.handlePollAnswer(userId, data)).rejects.toThrow('Invalid poll answer data.');
  });
});

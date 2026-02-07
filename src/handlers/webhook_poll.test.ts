import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LineWebhookHandler } from './webhook';
import { PostbackEvent } from '../types/line';
import { Env } from '../db/BaseRepository';

const {
  mockLineClient,
  mockPostRepository,
  mockAnswerRepository,
  mockTranslationService,
  mockUserRepository,
  mockRoomRepository,
  mockLogRepository
} = vi.hoisted(() => {
  return {
    mockLineClient: {
      replyMessage: vi.fn(),
      startLoadingAnimation: vi.fn(),
      validateSignature: vi.fn().mockResolvedValue(true),
    },
    mockPostRepository: {
      create: vi.fn(),
      updateTranslatedText: vi.fn(),
    },
    mockAnswerRepository: {
      upsert: vi.fn(),
    },
    mockTranslationService: {
      translateMessage: vi.fn().mockResolvedValue('Translated Text'),
    },
    mockUserRepository: {
      createIfNotExists: vi.fn(),
    },
    mockRoomRepository: {
      upsert: vi.fn(),
    },
    mockLogRepository: {},
  };
});

vi.mock('../services/line', () => {
  return {
    LineClient: vi.fn().mockImplementation(function() { return mockLineClient; }),
  };
});

vi.mock('../db', () => {
  return {
    PostRepository: vi.fn().mockImplementation(function() { return mockPostRepository; }),
    AnswerRepository: vi.fn().mockImplementation(function() { return mockAnswerRepository; }),
    UserRepository: vi.fn().mockImplementation(function() { return mockUserRepository; }),
    RoomRepository: vi.fn().mockImplementation(function() { return mockRoomRepository; }),
    LogRepository: vi.fn().mockImplementation(function() { return mockLogRepository; }),
  };
});

vi.mock('../services/translator', () => {
  return {
    TranslationService: vi.fn().mockImplementation(function() { return mockTranslationService; }),
  };
});

describe('LineWebhookHandler Poll Logic', () => {
  let handler: LineWebhookHandler;
  const mockEnv = {
    BASE_URL: 'https://example.com',
    LINE_BOT_QUEUE: {
      send: vi.fn(),
    },
    ADMIN_PASSWORD: 'mock_password',
  } as unknown as Env;

  beforeEach(() => {
    handler = new LineWebhookHandler();
    vi.clearAllMocks();
  });

  it('should detect [check] and send Flex Message', async () => {
    const event = {
      type: 'message',
      timestamp: 1234567890,
      source: { type: 'user', userId: 'user1' },
      message: {
        type: 'text',
        id: 'msg1',
        text: '[check] Poll Question',
      },
      replyToken: 'replyToken1',
    };

    const batch = {
      messages: [
        {
          body: event,
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ],
    } as any;

    await handler.handleQueue(batch, mockEnv);

    // Verify PostRepository.create called with has_poll: 1
    expect(mockPostRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      post_id: 'msg1',
      has_poll: 1,
      message_text: '[check] Poll Question',
    }));

    // Verify TranslationService called with 'Poll Question'
    expect(mockTranslationService.translateMessage).toHaveBeenCalledWith(
      'msg1', 'user1', null, 'Poll Question'
    );

    // Verify LineClient.replyMessage called with Flex Message
    expect(mockLineClient.replyMessage).toHaveBeenCalledWith(
      'replyToken1',
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: 'Translated Text' }),
        expect.objectContaining({ type: 'flex', altText: 'アンケート' }),
      ])
    );
  });

  it('should handle postback event and record answer', async () => {
    const event: PostbackEvent = {
      type: 'postback',
      timestamp: 1234567890,
      source: { type: 'user', userId: 'user1' },
      postback: {
        data: 'action=answer&value=OK&postId=post1',
      },
      mode: 'active',
    };

    const batch = {
      messages: [
        {
          body: event,
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ],
    } as any;

    await handler.handleQueue(batch, mockEnv);

    // Verify AnswerRepository.upsert called
    expect(mockAnswerRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      poll_post_id: 'post1',
      user_id: 'user1',
      answer_value: 'OK',
    }));

    // Verify loading animation
    expect(mockLineClient.startLoadingAnimation).toHaveBeenCalledWith('user1', 5);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LineWebhookHandler } from './webhook';

// Define mock functions outside so we can assert on them
const mockUpsert = vi.fn().mockResolvedValue({});
const mockTranslateMessage = vi.fn().mockResolvedValue('Translated Name Declaration');
const mockReplyMessage = vi.fn();

// Mock dependencies
const mockLineClient = {
  validateSignature: vi.fn(),
  startLoadingAnimation: vi.fn(),
  replyMessage: mockReplyMessage,
};

// Mock the LineClient class constructor
vi.mock('../services/line', () => {
  return {
    LineClient: vi.fn().mockImplementation(function() { return mockLineClient; }),
  };
});

// Mock repositories and services
vi.mock('../db', () => ({
  UserRepository: vi.fn().mockImplementation(function() {
    return {
      createIfNotExists: vi.fn(),
      upsert: mockUpsert,
    };
  }),
  RoomRepository: vi.fn().mockImplementation(function() {
    return {
      upsert: vi.fn(),
    };
  }),
  PostRepository: vi.fn().mockImplementation(function() {
    return {
      create: vi.fn(),
      updateTranslatedText: vi.fn(),
    };
  }),
  LogRepository: vi.fn().mockImplementation(function() { return {
      createTranslationLog: vi.fn(),
  }; }),
  AnswerRepository: vi.fn().mockImplementation(function() { return {}; }),
}));

vi.mock('../services/translator', () => ({
  TranslationService: vi.fn().mockImplementation(function() {
    return {
      translateMessage: mockTranslateMessage,
    };
  }),
}));


describe('LineWebhookHandler - Name Registration', () => {
  let handler: LineWebhookHandler;
  let mockContext: any;
  let mockQueue: any;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new LineWebhookHandler();

    mockQueue = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    mockContext = {
      req: {
        header: vi.fn(),
        text: vi.fn(),
      },
      env: {
        BYPASS_LINE_VALIDATION: 'false',
        LINE_CHANNEL_ACCESS_TOKEN: 'token',
        LINE_CHANNEL_SECRET: 'secret',
        LINE_BOT_QUEUE: mockQueue,
      },
      executionCtx: {
        waitUntil: vi.fn(),
      },
      json: vi.fn().mockReturnValue(new Response('{"message":"ok"}', { status: 200 })),
    };
  });

  it('should update user name and reply with confirmation when triggered', async () => {
     const batch: any = {
       messages: [
         {
           body: {
             type: 'message',
             timestamp: 1234567890,
             source: { type: 'user', userId: 'user1' },
             replyToken: 'replyToken1',
             message: { type: 'text', id: 'msg1', text: '私は"NewName"' }
           },
           ack: vi.fn(),
           retry: vi.fn(),
         }
       ]
     };

     await handler.handleQueue(batch, mockContext.env);

     // Verify UserRepository.upsert was called with the new name
     expect(mockUpsert).toHaveBeenCalledWith({
         user_id: 'user1',
         display_name: 'NewName'
     });

     // Verify TranslationService.translateMessage was called
     expect(mockTranslateMessage).toHaveBeenCalled();

     // Verify replyMessage was called with correct messages
     expect(mockReplyMessage).toHaveBeenCalledWith('replyToken1', [
       { type: 'text', text: 'Translated Name Declaration' },
       { type: 'text', text: '名前を「NewName」に更新しました。' }
     ]);

     // Verify message acknowledgement
     expect(batch.messages[0].ack).toHaveBeenCalled();
  });

  it('should handle "私の名前は" variation correctly', async () => {
     const batch: any = {
       messages: [
         {
           body: {
             type: 'message',
             timestamp: 1234567890,
             source: { type: 'user', userId: 'user2' },
             replyToken: 'replyToken2',
             message: { type: 'text', id: 'msg2', text: '私の名前は"AnotherName"' }
           },
           ack: vi.fn(),
           retry: vi.fn(),
         }
       ]
     };

     await handler.handleQueue(batch, mockContext.env);

     expect(mockUpsert).toHaveBeenCalledWith({
         user_id: 'user2',
         display_name: 'AnotherName'
     });

     expect(mockReplyMessage).toHaveBeenCalledWith('replyToken2', expect.arrayContaining([
         expect.objectContaining({ text: '名前を「AnotherName」に更新しました。' })
     ]));
  });
});

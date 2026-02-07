import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LineWebhookHandler } from './webhook';
import { Context } from 'hono';

// Mock dependencies
const mockLineClient = {
  validateSignature: vi.fn(),
  startLoadingAnimation: vi.fn(),
  replyMessage: vi.fn(),
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
    };
  }),
  LogRepository: vi.fn().mockImplementation(function() { return {}; }),
}));

vi.mock('../services/translator', () => ({
  TranslationService: vi.fn().mockImplementation(function() {
    return {
      translateMessage: vi.fn().mockResolvedValue('Translated Text'),
    };
  }),
}));


describe('LineWebhookHandler', () => {
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

  it('handleWebhook should return 200, start loading sync, and queue event', async () => {
    mockContext.req.header.mockReturnValue('valid-signature');
    mockContext.req.text.mockResolvedValue(JSON.stringify({
      events: [
        {
          type: 'message',
          timestamp: 1234567890,
          source: { type: 'user', userId: 'user1' },
          replyToken: 'replyToken1',
          message: { type: 'text', id: 'msg1', text: 'Hello' }
        }
      ]
    }));
    mockLineClient.validateSignature.mockResolvedValue(true);

    const response = await handler.handleWebhook(mockContext as unknown as Context<any>);

    expect(response.status).toBe(200);
    expect(mockContext.json).toHaveBeenCalledWith({ message: 'ok' }, 200);

    // Verify startLoadingAnimation was called synchronously
    expect(mockLineClient.startLoadingAnimation).toHaveBeenCalledWith('user1', 60);

    // Verify event was sent to queue
    expect(mockQueue.send).toHaveBeenCalledTimes(1);
    expect(mockQueue.send).toHaveBeenCalledWith(expect.objectContaining({
       type: 'message',
       source: expect.objectContaining({ userId: 'user1' })
    }));
  });

  it('handleQueue should process messages and acknowledge them', async () => {
     const batch: any = {
       messages: [
         {
           body: {
             type: 'message',
             timestamp: 1234567890,
             source: { type: 'user', userId: 'user1' },
             replyToken: 'replyToken1',
             message: { type: 'text', id: 'msg1', text: 'Hello' }
           },
           ack: vi.fn(),
           retry: vi.fn(),
         }
       ]
     };

     await handler.handleQueue(batch, mockContext.env);

     // Verify processing logic
     // TranslationService mock returns 'Translated Text', so replyMessage should be called
     expect(mockLineClient.replyMessage).toHaveBeenCalledWith('replyToken1', [
       { type: 'text', text: 'Translated Text' }
     ]);

     // Verify message acknowledgement
     expect(batch.messages[0].ack).toHaveBeenCalled();
  });
});

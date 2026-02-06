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
  let mockExecutionCtx: any;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new LineWebhookHandler();

    mockExecutionCtx = {
      waitUntil: vi.fn(),
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
      },
      executionCtx: mockExecutionCtx,
      json: vi.fn().mockReturnValue(new Response('{"message":"ok"}', { status: 200 })),
    };
  });

  it('should return 200 immediately and schedule background processing', async () => {
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

    // Verify waitUntil was called
    expect(mockExecutionCtx.waitUntil).toHaveBeenCalled();

    // To verify that the background process actually runs and calls startLoadingAnimation,
    // we need to await the promise passed to waitUntil.
    const backgroundPromise = mockExecutionCtx.waitUntil.mock.calls[0][0];
    await backgroundPromise;

    // Verify startLoadingAnimation was called
    expect(mockLineClient.startLoadingAnimation).toHaveBeenCalledWith('user1', 60);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PollResultHandler } from './poll-result';
import { Context } from 'hono';

// Mock repositories
vi.mock('../db', () => ({
  PostRepository: vi.fn().mockImplementation(function() {
    return {
      findById: vi.fn().mockResolvedValue({
        post_id: 'post1',
        has_poll: 1,
        message_text: 'Poll Question',
        translated_text: 'Translated Question'
      }),
    };
  }),
  AnswerRepository: vi.fn().mockImplementation(function() {
    return {
      getAnswersWithUserNames: vi.fn().mockResolvedValue([
        {
          timestamp: '2023-10-05T12:00:00Z',
          user_id: 'user1',
          answer_value: 'OK',
          display_name: 'User One'
        }
      ]),
    };
  }),
}));

describe('PollResultHandler', () => {
  let handler: PollResultHandler;
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new PollResultHandler();
    mockContext = {
      req: {
        param: vi.fn().mockReturnValue('post1'),
      },
      env: {},
      // Mock c.html to simply return the content so we can inspect it
      html: vi.fn((content) => content.toString()),
    };
  });

  it('handleResults should render date in month/day format', async () => {
    // Execute
    const result = await handler.handleResults(mockContext as unknown as Context<any>);

    // Result should be the HTML string because of our mock
    const htmlString = result as unknown as string;

    // Assert
    // We expect "10/05" for "2023-10-05T12:00:00Z"
    // The current implementation uses full date format, so this should fail initially.
    expect(htmlString).toContain('<td>10/05</td>');
  });
});

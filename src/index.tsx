import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { Env } from './db/BaseRepository';
import { LineWebhookHandler } from './handlers/webhook';
import { PollResultHandler } from './handlers/poll-result'; // Import PollResultHandler

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger())

// Webhookハンドラをインスタンス化
const webhookHandler = new LineWebhookHandler();

// LINE WebhookからのPOSTリクエストを処理
app.post('/webhook', async (c) => await webhookHandler.handleWebhook(c));

// PollResultHandlerをインスタンス化
const pollResultHandler = new PollResultHandler();

// アンケート結果のWeb Viewルートを処理
app.get('/poll/:id', async (c) => await pollResultHandler.handleResults(c));

app.get('/', (c) => {
  return c.text('Hello, World!')
})

export default app

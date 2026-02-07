/**
 * @file LineWebhookHandler
 * @description LINE Messaging APIからのWebhookイベントを処理するハンドラ。
 *              署名検証を行い、Loadingアニメーションを表示した後、
 *              イベントをCloudflare Queueに送信して非同期処理を行います。
 */

import { Context } from 'hono';
import { LineClient } from '../services/line';
import { Env } from '../db/BaseRepository';
import {
  UserRepository,
  RoomRepository,
  PostRepository,
  LogRepository,
  AnswerRepository,
} from '../db';
import {
  WebhookEvent,
  MessageEvent,
  TextMessage,
  PostbackEvent,
  GroupSource,
  RoomSource,
} from '../types/line';
import { TranslationService } from '../services/translator';
import { createPollFlexMessage } from '../utils/flexMessages';

type ServiceCollection = {
  lineClient: LineClient;
  userRepository: UserRepository;
  roomRepository: RoomRepository;
  postRepository: PostRepository;
  logRepository: LogRepository;
  answerRepository: AnswerRepository;
  translationService: TranslationService;
  env: Env;
};

export class LineWebhookHandler {
  constructor() {
    // constructor is intentionally empty.
  }

  /**
   * @method handleWebhook
   * @description LINE Webhookからのリクエストを処理するメインメソッド。
   *              署名を検証し、Loadingアニメーションを表示してイベントをキューに入れます。
   * @param {Context<Env>} c Honoコンテキストオブジェクト
   * @returns {Promise<Response>} Honoレスポンスオブジェクト
   */
  async handleWebhook(c: Context<{ Bindings: Env }>): Promise<Response> {
    const signature = c.req.header('X-Line-Signature');
    const body = await c.req.text();
    const lineClient = new LineClient(c.env);

    if (c.env.BYPASS_LINE_VALIDATION !== "true") {
      if (!signature) {
        console.error('X-Line-Signature header is missing.');
        return c.json({ message: 'Bad Request: X-Line-Signature header is missing.' }, 400);
      }

      const isValid = await lineClient.validateSignature(signature, body);
      if (!isValid) {
        console.error('Invalid LINE signature.');
        return c.json({ message: 'Unauthorized: Invalid LINE signature.' }, 401);
      }
    } else {
      console.warn('LINE signature validation bypassed as BYPASS_LINE_VALIDATION is true.');
    }

    const webhookRequestBody = JSON.parse(body);

    // イベントごとに同期的にLoadingアニメーションを表示し、キューに送信
    for (const event of webhookRequestBody.events) {
      // メッセージイベントかつuserIdが存在する場合、Loadingアニメーションを表示
      if (event.type === 'message' && event.source && event.source.userId) {
        try {
          console.log('startLoadingAnimation userId:', event.source.userId);
          await lineClient.startLoadingAnimation(event.source.userId, 60);
        } catch (e) {
          console.warn('Failed to start loading animation:', e);
        }
      }

      // イベントをキューに送信
      try {
        await c.env.LINE_BOT_QUEUE.send(event);
      } catch (e) {
        console.error('Failed to send event to queue:', e);
        // キューへの送信に失敗した場合でも、LINEには200を返してリトライさせるか、
        // ここでエラーを返してLINEに再送させるか。
        // ここではエラーをログに出力し、処理を続行（他のイベントがあれば）しますが、
        // クリティカルなエラーとして扱う場合はthrowしてください。
        // 現状はログ出力にとどめます。
      }
    }

    return c.json({ message: 'ok' }, 200);
  }

  /**
   * @method handleQueue
   * @description Cloudflare Queueからのメッセージバッチを処理します。
   * @param {MessageBatch<WebhookEvent>} batch メッセージバッチ
   * @param {Env} env 環境変数
   */
  async handleQueue(batch: MessageBatch<WebhookEvent>, env: Env): Promise<void> {
    const services: ServiceCollection = {
      lineClient: new LineClient(env),
      userRepository: new UserRepository(env),
      roomRepository: new RoomRepository(env),
      postRepository: new PostRepository(env),
      logRepository: new LogRepository(env),
      answerRepository: new AnswerRepository(env),
      translationService: new TranslationService(env),
      env: env,
    };

    for (const message of batch.messages) {
      const event = message.body;
      try {
        await this.processEvent(event, services);
        message.ack(); // 処理成功時に明示的にack（必須ではないが推奨）
      } catch (e) {
        console.error('Error processing queued event:', e);
        message.retry(); // エラー時はリトライ
      }
    }
  }

  /**
   * @method processEvent
   * @description 個々のWebhookイベントを処理します。
   * @param {WebhookEvent} event 処理するWebhookイベント
   * @param {ServiceCollection} services サービスとリポジトリのインスタンス
   */
  private async processEvent(event: WebhookEvent, services: ServiceCollection): Promise<void> {
    console.log(`Processing event type: ${event.type}`);

    switch (event.type) {
      case 'message':
        await this.handleMessageEvent(event as MessageEvent, services);
        break;
      case 'follow':
        console.log('Follow event received:', event);
        break;
      case 'join':
        console.log('Join event received:', event);
        break;
      case 'postback':
        await this.handlePostbackEvent(event as PostbackEvent, services);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
        break;
    }
  }

  /**
   * @method getSourceId
   * @description イベントソースからgroup IDまたはroom IDを返します。
   * @param source イベントソース
   * @returns {string | null}
   */
  private getSourceId(source: WebhookEvent['source']): string | null {
    if (source.type === 'group') {
      return (source as GroupSource).groupId;
    }
    if (source.type === 'room') {
      return (source as RoomSource).roomId;
    }
    return null;
  }

  /**
   * @method handleMessageEvent
   * @description メッセージイベントを処理します。
   * @param {MessageEvent} event 処理するメッセージイベント
   * @param {ServiceCollection} services サービスとリポジトリのインスタンス
   */
  private async handleMessageEvent(event: MessageEvent, services: ServiceCollection): Promise<void> {
    const { lineClient, userRepository, roomRepository, postRepository, translationService } = services;
    const sourceId = this.getSourceId(event.source);
    const userId = event.source.userId;

    if (!userId) {
      console.error('No userId found in message event.');
      return;
    }

    // ユーザーとルーム/グループ情報をupsert
    await userRepository.createIfNotExists({ user_id: userId, display_name: "" });

    if (sourceId) {
      await roomRepository.upsert({ room_id: sourceId, room_name: null });
    }

    if (event.message.type === 'text') {
      const message = event.message as TextMessage;
      const checkRegex = /\[check\]/i;
      const hasPoll = checkRegex.test(message.text);

      // 投稿をDBに保存
      await postRepository.create({
        post_id: message.id,
        timestamp: new Date(event.timestamp).toISOString(),
        user_id: userId,
        room_id: sourceId,
        message_text: message.text,
        has_poll: hasPoll ? 1 : 0,
        translated_text: null,
      });

      console.log(`Text message from ${userId} in ${sourceId || 'private chat'}: ${message.text}`);

      // LoadingアニメーションはProducer側で実行済みのため、ここでは削除

      if (hasPoll) {
        const pollContent = message.text.replace(checkRegex, '').trim();
        let translatedPoll = '';

        // アンケート内容の翻訳（内容がある場合のみ）
        if (pollContent) {
          try {
            translatedPoll = await translationService.translateMessage(
              message.id,
              userId,
              sourceId,
              pollContent
            );
            // 翻訳結果をDBに更新
            await postRepository.updateTranslatedText(message.id, translatedPoll);
          } catch (e) {
            console.error('Poll translation failed:', e);
          }
        }

        const flexMessage = createPollFlexMessage(message.id, services.env.BASE_URL);
        const messagesToSend = [];

        if (translatedPoll) {
          messagesToSend.push({
            type: 'text',
            text: translatedPoll,
          });
        }
        messagesToSend.push(flexMessage);

        if (event.replyToken) {
          await lineClient.replyMessage(event.replyToken, messagesToSend);
        }
      } else {
        // 通常の翻訳サービスを呼び出す
        const translatedText = await translationService.translateMessage(
          message.id,
          userId,
          sourceId,
          message.text
        );

        // 翻訳結果があれば返信する
        if (translatedText && event.replyToken) {
          await lineClient.replyMessage(event.replyToken, [
            {
              type: 'text',
              text: translatedText,
            },
          ]);
        }
      }
    } else {
      console.log(`Received a non-text message type: ${event.message.type}`);
    }
  }

  /**
   * @method handlePostbackEvent
   * @description ポストバックイベントを処理します。
   * @param {PostbackEvent} event 処理するポストバックイベント
   * @param {ServiceCollection} services サービスとリポジトリのインスタンス
   */
  private async handlePostbackEvent(event: PostbackEvent, services: ServiceCollection): Promise<void> {
    const { answerRepository, lineClient } = services;
    const data = event.postback.data;
    const params = new URLSearchParams(data);
    const action = params.get('action');

    if (action === 'answer') {
      const userId = event.source.userId;
      if (!userId) return;

      const value = params.get('value');
      const pollPostId = params.get('postId');

      if (value && pollPostId) {
        // ローディングアニメーションを表示
        try {
          await lineClient.startLoadingAnimation(userId, 5);
        } catch (e) {
          console.warn('Failed to start loading animation for postback:', e);
        }

        // 回答を保存/更新
        await answerRepository.upsert({
          answer_id: crypto.randomUUID(), // 新規作成時はUUIDを生成（upsertのConflict時は無視される）
          timestamp: new Date(event.timestamp).toISOString(),
          poll_post_id: pollPostId,
          user_id: userId,
          answer_value: value,
        });

        console.log(`Answer recorded: User ${userId} answered ${value} to post ${pollPostId}`);
      }
    }
  }
}

/**
 * @file LineWebhookHandler
 * @description LINE Messaging APIからのWebhookイベントを処理するハンドラ。
 *              署名検証、イベント解析、適切なサービスへのイベントディスパッチを行います。
 */

import { Context } from 'hono';
import { LineClient } from '../services/line';
import { Env } from '../db/BaseRepository';
import {
  UserRepository,
  RoomRepository,
  PostRepository,
  LogRepository,
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

type ServiceCollection = {
  lineClient: LineClient;
  userRepository: UserRepository;
  roomRepository: RoomRepository;
  postRepository: PostRepository;
  logRepository: LogRepository;
  translationService: TranslationService;
};

export class LineWebhookHandler {
  constructor() {
    // constructor is intentionally empty.
  }

  /**
   * @method handleWebhook
   * @description LINE Webhookからのリクエストを処理するメインメソッド。
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

    const services: ServiceCollection = {
      lineClient,
      userRepository: new UserRepository(c.env),
      roomRepository: new RoomRepository(c.env),
      postRepository: new PostRepository(c.env),
      logRepository: new LogRepository(c.env),
      translationService: new TranslationService(c.env),
    };

    const webhookRequestBody = JSON.parse(body);
    for (const event of webhookRequestBody.events) {
      await this.processEvent(event, services);
    }

    return c.json({ message: 'ok' }, 200);
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
        // Postback events are for polls (Phase 5)
        console.log('Postback event received and ignored for now:', event);
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
    const userProfile = await lineClient.getProfile(userId);
    await userRepository.upsert({ user_id: userId, display_name: userProfile.displayName });

    if (sourceId) {
      await roomRepository.upsert({ room_id: sourceId, room_name: null });
    }

    if (event.message.type === 'text') {
      const message = event.message as TextMessage;

      // 投稿をDBに保存
      await postRepository.create({
        post_id: message.id,
        timestamp: new Date(event.timestamp).toISOString(),
        user_id: userId,
        room_id: sourceId,
        message_text: message.text,
        has_poll: 0,
        translated_text: null,
      });

      console.log(`Text message from ${userId} in ${sourceId || 'private chat'}: ${message.text}`);

      // 翻訳サービスを呼び出す
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
    } else {
      console.log(`Received a non-text message type: ${event.message.type}`);
    }
  }
}

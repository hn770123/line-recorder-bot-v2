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
  AnswerRepository,
  LogRepository,
} from '../db';
import { WebhookEvent, MessageEvent, TextMessage } from '../types/line';
import { TranslationService } from '../services/translator';

export class LineWebhookHandler {
  // private lineClient: LineClient;
  // private userRepository: UserRepository;
  // private roomRepository: RoomRepository;
  // private postRepository: PostRepository;
  // private answerRepository: AnswerRepository;
  // private logRepository: LogRepository;
  // private translationService: TranslationService;

  constructor() {
    // コンストラクタでEnvを受け取らないように変更
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

    // サービスとリポジトリをリクエストごとにインスタンス化
    const lineClient = new LineClient(c.env);
    const userRepository = new UserRepository(c.env);
    const roomRepository = new RoomRepository(c.env);
    const postRepository = new PostRepository(c.env);
    const answerRepository = new AnswerRepository(c.env);
    const logRepository = new LogRepository(c.env);
    const translationService = new TranslationService(c.env);
    const pollService = new PollService(c.env); // Instantiate PollService

    if (!signature) {
      console.error('X-Line-Signature header is missing.');
      return c.json({ message: 'Bad Request: X-Line-Signature header is missing.' }, 400);
    }

    // 署名検証
    const isValid = await lineClient.validateSignature(signature, body);
    if (!isValid) {
      console.error('Invalid LINE signature.');
      return c.json({ message: 'Unauthorized: Invalid LINE signature.' }, 401);
    }

    const webhookRequestBody = JSON.parse(body);

    // 各イベントの処理
    for (const event of webhookRequestBody.events) {
      await this.processEvent(event, {
        lineClient,
        userRepository,
        roomRepository,
        postRepository,
        answerRepository,
        logRepository,
        translationService,
        pollService,
      });
    }

    return c.json({ message: 'ok' }, 200);
  }

  /**
   * @method processEvent
   * @description 個々のWebhookイベントを処理します。
   * @param {WebhookEvent} event 処理するWebhookイベント
   * @param {object} services サービスとリポジトリのインスタンス
   */
  private async processEvent(event: WebhookEvent, services: {
    lineClient: LineClient;
    userRepository: UserRepository;
    roomRepository: RoomRepository;
    postRepository: PostRepository;
    answerRepository: AnswerRepository;
    logRepository: LogRepository;
    translationService: TranslationService;
    pollService: PollService; // Add PollService
  }): Promise<void> {
    console.log('Processing event:', JSON.stringify(event));

    switch (event.type) {
      case 'message':
        await this.handleMessageEvent(event as MessageEvent, services);
        break;
      case 'follow':
        // TODO: フォローイベントの処理
        console.log('Follow event received:', event);
        break;
      case 'join':
        // TODO: 参加イベントの処理
        console.log('Join event received:', event);
        break;
      case 'postback':
        // ポストバックイベントを処理
        await this.handlePostbackEvent(event as PostbackEvent, services);
        break;
      // 他のイベントタイプもここに追加
      default:
        console.log(`Unhandled event type: ${event.type}`);
        break;
    }
  }

  /**
   * @method handleMessageEvent
   * @description メッセージイベントを処理します。
   * @param {MessageEvent} event 処理するメッセージイベント
   * @param {object} services サービスとリポジトリのインスタンス
   */
  private async handleMessageEvent(event: MessageEvent, services: {
    lineClient: LineClient;
    userRepository: UserRepository;
    roomRepository: RoomRepository;
    postRepository: PostRepository;
    answerRepository: AnswerRepository;
    logRepository: LogRepository;
    translationService: TranslationService;
    pollService: PollService; // Add PollService here
  }): Promise<void> {
    const { lineClient, userRepository, roomRepository, postRepository, translationService, pollService } = services;
    const sourceId = this.getSourceId(event.source);
    const userId = event.source.userId;

    // ユーザーとルーム/グループ情報をupsert
    if (userId) {
      const userProfile = await lineClient.getProfile(userId);
      await userRepository.upsert({ user_id: userId, display_name: userProfile.displayName });
    }

    if (sourceId && (event.source.type === 'group' || event.source.type === 'room')) {
      // TODO: getGroupSummary or getRoomSummaryがあれば使う
      // 現状APIがないため、room_nameは一旦null
      await roomRepository.upsert({ room_id: sourceId, room_name: null });
    }

    if (event.message.type === 'text') {
      const message = event.message as TextMessage;

      // アンケートコマンドの検出と処理
      if (pollService.isPollCommand(message.text)) {
        const question = pollService.parsePollQuestion(message.text);
        if (event.replyToken) {
          await pollService.createPoll(event.replyToken, message.id, question, userId, sourceId);
          await postRepository.updateHasPoll(message.id, 1); // 投稿をアンケートとしてマーク
          console.log(`Poll created: ${question}`);
          return; // アンケートを処理したら、それ以上のメッセージ処理は不要
        }
      }

      // ポストを保存
      await postRepository.create({
        post_id: message.id,
        timestamp: new Date(event.timestamp).toISOString(),
        user_id: userId,
        room_id: sourceId,
        message_text: message.text,
        has_poll: 0, // アンケートとして処理されなければ0
        translated_text: null, // 翻訳はサービスで行うため、ここではnull
      });

      // 翻訳サービスを呼び出す
      const translatedText = await translationService.translateMessage(
        message.id,
        userId,
        sourceId,
        message.text
      );

      console.log(`Text message from ${userId} in ${sourceId || 'private chat'}: ${message.text}`);

      if (event.replyToken) {
        let replyText = `Echo: ${message.text}`;
        if (translatedText) {
          replyText += `\nTranslated: ${translatedText}`;
        }
        await lineClient.replyMessage(event.replyToken, [
          {
            type: 'text',
            text: replyText,
          },
        ]);
      }
    } else {
      // テキスト以外のメッセージタイプ
      if (event.replyToken) {
        await lineClient.replyMessage(event.replyToken, [
          {
            type: 'text',
            text: `Received a ${event.message.type} message.`,
          },
        ]);
      }
    }
  }

  private async getSourceId(source: WebhookEvent['source']): string | null {
    if (source.type === 'group') {
      return source.groupId;
    }
    if (source.type === 'room') {
      return source.roomId;
    }
    return null;
  }

  /**
   * @method handlePostbackEvent
   * @description ポストバックイベントを処理します。
   * @param {PostbackEvent} event 処理するポストバックイベント
   * @param {object} services サービスとリポジトリのインスタンス
   */
  private async handlePostbackEvent(event: PostbackEvent, services: {
    lineClient: LineClient;
    userRepository: UserRepository;
    roomRepository: RoomRepository;
    postRepository: PostRepository;
    answerRepository: AnswerRepository;
    logRepository: LogRepository;
    translationService: TranslationService;
    pollService: PollService;
  }): Promise<void> {
    const { pollService } = services;
    const userId = event.source.userId;
    const data = event.postback.data;

    if (data.startsWith('action=vote')) {
      try {
        await pollService.handlePollAnswer(userId, data);
        console.log(`User ${userId} voted: ${data}`);
        // TODO: ユーザーに回答が受け付けられたことを通知するなどのフィードバック
      } catch (error) {
        console.error(`Failed to handle poll answer for user ${userId} with data ${data}:`, error);
        // TODO: エラー通知
      }
    } else {
      console.log(`Unhandled postback data: ${data}`);
    }
  }
}}

/**
 * @file PollService
 * @description アンケート機能のロジックを管理するサービス。
 *              '[check]' コマンドの検出、質問の解析、Flex Messageの作成、アンケート回答の処理を行います。
 */

import { LineClient } from '../services/line';
import { PostRepository, AnswerRepository, Env } from '../db';
import { Post, Answer } from '../types/db';

// LINE Flex Messageの構造を定義（簡易版）
interface FlexMessage {
  type: 'flex';
  altText: string;
  contents: any; // 詳細な型は後で必要に応じて定義
}

export class PollService {
  private lineClient: LineClient;
  private postRepository: PostRepository;
  private answerRepository: AnswerRepository;

  constructor(env: Env) {
    this.lineClient = new LineClient(env);
    this.postRepository = new PostRepository(env);
    this.answerRepository = new AnswerRepository(env);
  }

  /**
   * @method isPollCommand
   * @description メッセージがアンケートコマンド '[check]' で始まるかどうかを判定します。
   * @param {string} messageText メッセージ本文
   * @returns {boolean} アンケートコマンドであればtrue
   */
  isPollCommand(messageText: string): boolean {
    return messageText.startsWith('[check]');
  }

  /**
   * @method parsePollQuestion
   * @description アンケートコマンドから質問文を解析します。
   * @param {string} messageText アンケートコマンドを含むメッセージ本文
   * @returns {string} 質問文
   */
  parsePollQuestion(messageText: string): string {
    return messageText.replace('[check]', '').trim();
  }

  /**
   * @method createPoll
   * @description アンケートを作成し、Flex Messageを送信します。
   * @param {string} replyToken 返信トークン
   * @param {string} postId アンケートの元となる投稿ID
   * @param {string} question 質問文
   * @param {string | null} userId 質問者のユーザーID
   * @param {string | null} roomId 質問が行われたルームID
   * @returns {Promise<Response>} LINE APIからのレスポンス
   */
  async createPoll(
    replyToken: string,
    postId: string,
    question: string,
    userId: string | null,
    roomId: string | null
  ): Promise<Response> {
    // 投稿をアンケートとしてマーク
    // TODO: PostRepositoryにhas_pollを更新するメソッドを追加する
    // await this.postRepository.updateHasPoll(postId, 1);

    const flexMessage = this.buildPollFlexMessage(postId, question, userId);

    // Flex Messageを送信
    return this.lineClient.replyMessage(replyToken, [flexMessage]);
  }

  /**
   * @method buildPollFlexMessage
   * @description アンケート用のFlex Messageを構築します。
   * @param {string} postId アンケートの元となる投稿ID
   * @param {string} question 質問文
   * @param {string | null} userId 質問者のユーザーID
   * @returns {FlexMessage} 構築されたFlex Messageオブジェクト
   */
  private buildPollFlexMessage(postId: string, question: string, userId: string | null): FlexMessage {
    // ここでFlex MessageのJSON構造を構築します。
    // LINEのFlex Message Simulator (https://developers.line.biz/flex-simulator/) を使うと便利です。
    // 以下は非常にシンプルな例です。

    // postback data の例: "action=vote&postId=xxx&answer=OK"
    return {
      type: 'flex',
      altText: `アンケート: ${question}`,
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'アンケート',
              weight: 'bold',
              color: '#1DB446',
              size: 'sm',
            },
            {
              type: 'text',
              text: question,
              weight: 'bold',
              size: 'md',
              margin: 'md',
              wrap: true,
            },
            {
              type: 'separator',
              margin: 'xxl',
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'xxl',
              spacing: 'sm',
              contents: [
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'OK',
                    data: `action=vote&postId=${postId}&answer=OK`,
                    displayText: 'OK',
                  },
                  style: 'primary',
                  color: '#1DB446',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'NG',
                    data: `action=vote&postId=${postId}&answer=NG`,
                    displayText: 'NG',
                  },
                  style: 'primary',
                  color: '#FF0000',
                  margin: 'md',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'どちらでもない',
                    data: `action=vote&postId=${postId}&answer=NA`,
                    displayText: 'どちらでもない',
                  },
                  style: 'secondary',
                  margin: 'md',
                },
                {
                  type: 'button',
                  action: {
                    type: 'uri',
                    label: '結果を見る',
                    uri: `https://your-worker-domain.com/poll/${postId}`, // TODO: ドメインは環境変数から取得
                  },
                  style: 'link',
                  margin: 'md',
                },
              ],
            },
          ],
        },
      },
    };
  }

  /**
   * @method handlePollAnswer
   * @description アンケートの回答を処理し、データベースに保存します。
   * @param {string} userId 回答者のユーザーID
   * @param {string} data postbackイベントのデータ文字列
   * @returns {Promise<D1Result<Answer>>} 回答保存の結果
   */
  async handlePollAnswer(userId: string, data: string): Promise<D1Result<Answer>> {
    const params = new URLSearchParams(data);
    const postId = params.get('postId');
    const answerValue = params.get('answer');

    if (!postId || !answerValue) {
      throw new Error('Invalid poll answer data.');
    }

    // UUIDを生成
    const answerId = crypto.randomUUID();

    const answer: Answer = {
      answer_id: answerId,
      timestamp: new Date().toISOString(),
      poll_post_id: postId,
      user_id: userId,
      answer_value: answerValue,
    };

    return this.answerRepository.upsert(answer);
  }
}

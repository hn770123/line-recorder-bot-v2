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
  private env: Env;

  constructor(env: Env) {
    this.env = env;
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
   *              GASの実装(gas-src/code.gs)と一致するように修正しました。
   * @param {string} postId アンケートの元となる投稿ID
   * @param {string} question 質問文（GAS版ではFlex Message内に表示しないが、altTextには使用）
   * @param {string | null} userId 質問者のユーザーID
   * @returns {FlexMessage} 構築されたFlex Messageオブジェクト
   */
  private buildPollFlexMessage(postId: string, question: string, userId: string | null): FlexMessage {
    const resultsUrl = `${this.env.BASE_URL}/poll/${postId}`;

    return {
      type: 'flex',
      altText: `アンケート`, // GASでは単に"アンケート"
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'Select one. Can be changed.',
              weight: 'bold',
              size: 'sm',
            },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              spacing: 'sm',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  height: 'sm',
                  action: {
                    type: 'postback',
                    label: 'OK',
                    data: `action=vote&postId=${postId}&answer=OK`,
                  },
                },
                {
                  type: 'button',
                  style: 'secondary',
                  height: 'sm',
                  action: {
                    type: 'postback',
                    label: 'NG',
                    data: `action=vote&postId=${postId}&answer=NG`,
                  },
                },
                {
                  type: 'button',
                  style: 'secondary',
                  height: 'sm',
                  action: {
                    type: 'postback',
                    label: 'N/A',
                    data: `action=vote&postId=${postId}&answer=N/A`,
                  },
                },
              ],
            },
            {
              type: 'separator',
              margin: 'sm',
            },
            {
              type: 'button',
              style: 'link',
              height: 'sm',
              action: {
                type: 'uri',
                label: 'See results',
                uri: resultsUrl,
              },
            },
          ],
          flex: 0,
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

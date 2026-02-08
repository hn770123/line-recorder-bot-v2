/**
 * @file PollResultHandler
 * @description アンケート結果を表示するためのWeb Viewハンドラ。
 *              Hono JSXを使用して、指定されたアンケートの回答を集計し、HTMLページとしてレンダリングします。
 */

import { Context } from 'hono';
import { PostRepository, AnswerRepository, Env } from '../db';
import { Post, Answer } from '../types/db';
import { html } from 'hono/html';

export class PollResultHandler {
  // private postRepository: PostRepository;
  // private answerRepository: AnswerRepository;

  constructor() {
    // コンストラクタでEnvを受け取らないように変更。handleResultsでContextからEnvを取得
  }

  /**
   * @method handleResults
   * @description アンケート結果ページをレンダリングします。
   * @param {Context<{ Bindings: Env }>} c Honoコンテキストオブジェクト
   * @returns {Promise<Response>} アンケート結果のHTMLページ
   */
  async handleResults(c: Context<{ Bindings: Env }>): Promise<Response> {
    const postId = c.req.param('id'); // URLパラメータからpostIdを取得

    // サービスとリポジトリをリクエストごとにインスタンス化
    const postRepository = new PostRepository(c.env);
    const answerRepository = new AnswerRepository(c.env);

    const post = await postRepository.findById(postId);
    if (!post || post.has_poll !== 1) {
      return c.html(html`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Poll Not Found</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: sans-serif; padding: 20px; color: #333; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f2f2f2; }
              .container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              h1 { margin-bottom: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>アンケートが見つかりません</h1>
              <p>指定されたIDのアンケートは存在しないか、アンケートとして設定されていません。</p>
            </div>
          </body>
        </html>
      `, 404);
    }

    const answers = await answerRepository.getAnswersWithUserNames(postId);

    // 回答の集計は不要になった（GASではリスト表示のみだったため）。
    // 必要なら追加するが、GASのHTMLには集計テーブルはない。

    return c.html(html`
      <!DOCTYPE html>
      <html>
        <head>
          <title>See results</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: sans-serif; padding: 20px; color: #333; }
            .container { max-width: 800px; margin: 0 auto; border: 1px solid #ccc; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            h2 { margin-bottom: 20px; text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border-bottom: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #f2f2f2; }
            .ok { color: #06c755; font-weight: bold; }
            .ng { color: #ef454d; font-weight: bold; }
            .footer { margin-top: 30px; font-size: 0.8em; color: #666; text-align: center; }
            .poll-content { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 5px solid #06c755; }
            .poll-content p { white-space: pre-wrap; margin-bottom: 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>See results</h2>
            ${post.message_text ? html`
              <div class="poll-content">
                <p>${post.message_text}</p>
                ${post.translated_text ? html`
                  <hr style="border: 0; border-top: 1px solid #ddd; margin: 10px 0;">
                  <p style="color: #666; font-size: 0.9em;">${post.translated_text}</p>
                ` : ''}
              </div>
            ` : ''}

            ${answers.length > 0 ? html`
              <table>
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>名前</th>
                    <th>回答</th>
                  </tr>
                </thead>
                <tbody>
                  ${answers.map((answer) => {
                    const date = new Date(answer.timestamp).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo' });
                    // display_nameが型の定義上存在しない場合はanyキャスト等が必要だが、
                    // getAnswersWithUserNamesの実装依存。ここではanyキャストして回避するか、
                    // 以前のコードが通っていたので、Answer型にdisplay_nameが含まれているか、
                    // もしくはgetAnswersWithUserNamesの戻り値が拡張された型であると想定。
                    // エラー回避のため (answer as any).display_name を使用するか、
                    // 以前のコードを見る限り answer.display_name でアクセスしていたのでそのままにする。
                    // もし型エラーが出るようなら修正が必要。
                    const displayName = (answer as any).display_name || "-";
                    const answerClass = (answer.answer_value || '').toLowerCase();
                    return html`
                      <tr>
                        <td>${date}</td>
                        <td>${displayName}</td>
                        <td class="${answerClass}">${answer.answer_value}</td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            ` : html`
              <p style="text-align: center;">まだ回答はありません。</p>
            `}

            <div class="footer">
              <p>対象投稿ID: ${postId}</p>
              <p style="margin-top: 20px; font-size: 0.9em; line-height: 1.6;">
                <strong>[Check]</strong> でアンケートを作成<br>
                <strong>私の名前は"〇〇"</strong> で名前を設定
              </p>
            </div>
          </div>
        </body>
      </html>
    `);
  }
}

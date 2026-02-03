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
            <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
          </head>
          <body class="bg-gray-100 flex items-center justify-center h-screen">
            <div class="text-center p-8 bg-white rounded shadow-md">
              <h1 class="text-2xl font-bold mb-4">アンケートが見つかりません</h1>
              <p>指定されたIDのアンケートは存在しないか、アンケートとして設定されていません。</p>
            </div>
          </body>
        </html>
      `, 404);
    }

    const answers = await answerRepository.getAnswersByPollPostId(postId);

    // 回答の集計
    const tallies = answers.reduce((acc, answer) => {
      const value = answer.answer_value || 'N/A'; // nullの場合は'N/A'として扱う
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalVotes = answers.length;

    return c.html(html`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Poll Results: ${post.message_text}</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        </head>
        <body class="bg-gray-100 p-8">
          <div class="max-w-xl mx-auto bg-white p-6 rounded shadow-md">
            <h1 class="text-3xl font-bold mb-4">アンケート結果</h1>
            <p class="text-xl mb-6">${post.message_text}</p>

            <div class="mb-4">
              <h2 class="text-2xl font-semibold mb-2">投票合計: ${totalVotes}</h2>
              ${Object.entries(tallies).map(([answer, count]) => html`
                <div class="flex justify-between items-center py-2 border-b last:border-b-0">
                  <span class="text-lg">${answer}</span>
                  <span class="text-lg font-bold">${count}票 (${totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(1) : 0}%)</span>
                </div>
              `)}
            </div>

            <p class="text-gray-600 text-sm mt-8">
              ※ このページはCloudflare Workerで生成されています。
            </p>
          </div>
        </body>
      </html>
    `);
  }
}

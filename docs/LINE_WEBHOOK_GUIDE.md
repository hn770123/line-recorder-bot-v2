# LINE Webhook + Cloudflare Workers + Gemini API 実装ガイド

このドキュメントでは、LINE Webhook仕様に基づき、Cloudflare Workers上でGemini APIを用いて応答するボットの実装手順、注意点、および現在の実装との比較・改善案についてまとめます。

## 1. 実装手順

LINE Messaging APIのWebhookを受け取り、Gemini APIで生成したテキストを返信するCloudflare Workerの基本的な実装フローは以下の通りです。

### 手順概要

1.  **環境設定 (`wrangler.toml`)**
    *   `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `GEMINI_API_KEY` などの環境変数をバインディングします。
    *   データベース（D1など）を利用する場合はそのバインディングも行います。

2.  **署名検証 (Security)**
    *   LINEプラットフォームからの正当なリクエストであることを確認するため、`X-Line-Signature` ヘッダーの値を検証します。
    *   `channelSecret` とリクエストボディを用いてHMAC-SHA256ハッシュを生成し、ヘッダーの値と比較します。

3.  **イベント解析**
    *   リクエストボディをパースし、`events` 配列に含まれる各イベント（`message`, `follow`, `join` など）を処理します。

4.  **即時レスポンス (重要)**
    *   LINE Webhookは応答速度を重視します。処理に時間がかかる場合（LLM呼び出しなど）は、**署名検証と基本的なバリデーション完了後、直ちに `200 OK` を返します**。
    *   重い処理は `context.waitUntil()` を使用してバックグラウンドで実行します。

5.  **メッセージ処理とGemini API呼び出し (非同期)**
    *   ユーザーからのメッセージを取得します。
    *   重複処理を防ぐためのチェック（Deduplication）を行います。
    *   Gemini APIを呼び出し、応答を生成します。

6.  **返信 (Reply)**
    *   生成された応答を LINE Messaging API の `/message/reply` エンドポイントに送信します。

## 2. 実装上の注意点 (Caveats)

### 2.1 セキュリティ: 署名検証
*   **必須:** LINE以外からの悪意あるリクエストを防ぐため、必ず署名検証を行ってください。
*   検証に失敗した場合は `401 Unauthorized` または `400 Bad Request` を返し、処理を中断します。

### 2.2 タイムアウトと非同期処理
*   **LINEのタイムアウト:** LINEプラットフォームは、Webhook送信後一定時間（通常数秒～10秒程度、最大でも短時間）以内にレスポンスがない場合、タイムアウトとみなします。
*   **Workersの制限:** Cloudflare WorkersにもCPU時間の制限があります（Freeプランは10ms、Paidは高いが上限あり）。Wall clock time（実時間）の制限もあります。
*   **対策:** Gemini APIの応答には数秒～十数秒かかることがあるため、**HTTPレスポンスとしてGeminiの結果を待ってはいけません**。`c.executionCtx.waitUntil(promise)` を使用し、LINEへの `200 OK` 返却と処理を切り離してください。

### 2.3 冪等性 (Idempotency) と重複排除
*   **リトライ:** LINEプラットフォームは、Webhookへの応答がタイムアウトした場合やエラー（5xx）が返された場合、同じイベントIDでWebhookを再送することがあります。
*   **対策:** `webhookEventId` またはメッセージIDを用いて、既に処理済みのイベントかどうかを確認するロジック（Deduplication）が必要です。DBの `INSERT` 時に一意制約違反（Unique Constraint Violation）を利用するのが一般的です。

### 2.4 コンテキスト管理
*   LLMはステートレスです。会話の文脈（履歴）を維持するには、過去のメッセージをDB（D1など）に保存し、Gemini API呼び出し時に `history` パラメータとして渡す必要があります。
*   履歴のトークン数が増えすぎないよう、古い履歴の切り捨てや要約が必要です。

### 2.5 エラーハンドリング
*   Gemini APIのレート制限（429）やサーバーエラー（500/503）に対するリトライロジックを実装します。
*   内部エラーが発生した場合でも、LINEサーバーには（再送を防ぐため）成功ステータスを返すか、適切にエラーログを記録して終了させることが望ましいです。

---

## 3. 現在の実装との比較・分析

現在のコードベース (`src/handlers/webhook.ts`, `src/services/gemini.ts` 等) を分析した結果です。

| 項目 | 現在の実装状況 | 評価 |
| :--- | :--- | :--- |
| **署名検証** | `LineClient.validateSignature` で実装済み。Web Crypto APIを使用しており適切。 | ✅ OK |
| **即時レスポンス** | **未実装**。`handleWebhook` 内で `processEvent` を `await` しており、Geminiの応答が完了するまでLINEへのレスポンスが保留されます。 | ⚠️ **要改善** (リスク大) |
| **重複排除** | `postRepository.create` でDB保存を行っていますが、エラーハンドリング（`try/catch`）が明示的ではありません。重複時に例外が発生し、ハンドラ全体がクラッシュ（500エラー）する可能性があります。これによりLINEが再送ループに陥る恐れがあります。 | ⚠️ **要改善** |
| **Gemini連携** | `GeminiClient` クラスで実装済み。モデルフォールバックやリトライロジックも適切に含まれています。 | ✅ OK |
| **コンテキスト** | DB (`posts` table) に会話履歴を保存する設計になっています。 | ✅ OK |

## 4. 改善提案

現在の実装における安定性と信頼性を向上させるため、以下の2点を推奨します。

### 改善案1: `waitUntil` による非同期化

**現状:**
```typescript
// src/index.tsx
app.post('/api/webhook', async (c) => await webhookHandler.handleWebhook(c));

// src/handlers/webhook.ts
async handleWebhook(c) {
  // ... 署名検証 ...
  // ここで全処理が終わるまで待っている
  for (const event of webhookRequestBody.events) {
    await this.processEvent(event, services);
  }
  return c.json({ message: 'ok' }, 200);
}
```

**修正案:**
署名検証とJSONパースが完了したら、すぐにレスポンスを返し、イベント処理はバックグラウンドで行うように変更します。

```typescript
// src/index.tsx
app.post('/api/webhook', async (c) => {
  // ハンドラ内で waitUntil を使うか、ここで分離する
  return await webhookHandler.handleWebhook(c);
});

// src/handlers/webhook.ts
async handleWebhook(c: Context<{ Bindings: Env }>): Promise<Response> {
  // 1. 署名検証 (同期的に行う)
  // ... (省略) ...

  // 2. イベントループ処理をPromiseとして定義
  const services = { ... };
  const processingPromise = (async () => {
    for (const event of webhookRequestBody.events) {
      // エラーをキャッチしてログ出力し、プロセスを落とさないようにする
      try {
        await this.processEvent(event, services);
      } catch (e) {
        console.error('Error processing event:', e);
      }
    }
  })();

  // 3. バックグラウンド実行キューに入れる
  c.executionCtx.waitUntil(processingPromise);

  // 4. 即時レスポンス
  return c.json({ message: 'ok' }, 200);
}
```

### 改善案2: 重複排除 (Deduplication) の堅牢化

**現状:**
`postRepository.create` が一意制約違反でエラーになった場合、処理が中断され、Honoがエラーレスポンスを返す可能性があります。

**修正案:**
`create` メソッド呼び出しを `try/catch` で囲むか、リポジトリ側でエラーを吸収し、「既に存在する場合は処理をスキップする」ことを明示的に扱います。

```typescript
// src/handlers/webhook.ts (handleMessageEvent内)

try {
  await postRepository.create({ ... });
} catch (error: any) {
  if (error.message.includes('UNIQUE constraint failed') || error.message.includes('D1_ERROR')) {
    console.warn(`Message ${message.id} already exists. Skipping.`);
    return; // 重複している場合は以降の処理（翻訳・返信）を行わず終了
  }
  throw error; // その他のエラーは再スロー
}
```
これにより、LINE側からのリトライが来た場合でも、安全に無視して終了できます。

# システムフロー図 (System Flow Diagrams)

本ドキュメントでは、LINE Botシステムの各種フローをmermaid記法による図解で説明します。

## 1. システムアーキテクチャ (System Architecture)

システム全体の構成とデータフローの概要です。

```mermaid
graph TD
    User((User))
    LINE[LINE Platform]

    subgraph Cloudflare
        Webhook[Worker: Webhook Handler]
        Queue[Cloudflare Queue]
        Consumer[Worker: Queue Consumer]
        D1[(D1 Database)]
    end

    Gemini[Google Gemini API]

    User -- Message --> LINE
    LINE -- Webhook (POST) --> Webhook
    Webhook -- Enqueue Event --> Queue
    Webhook -- 200 OK --> LINE

    Queue -- Batch Trigger --> Consumer
    Consumer -- Read/Write --> D1
    Consumer -- Generate Text --> Gemini
    Consumer -- Reply Message --> LINE

    Browser((Browser)) -- GET /poll/:id --> Webhook
    Webhook -- Read Poll Data --> D1
```

## 2. Webhook & キュー処理フロー (Webhook & Queue Processing Flow)

メッセージ受信から非同期処理、返信までの詳細なシーケンスです。

```mermaid
sequenceDiagram
    participant User
    participant LINE as LINE Platform
    participant Webhook as Webhook Handler
    participant Queue as Cloudflare Queue
    participant Consumer as Queue Consumer
    participant DB as D1 Database
    participant Gemini as Gemini API

    User->>LINE: メッセージ送信
    LINE->>Webhook: POST /api/webhook

    activate Webhook
    Webhook->>Webhook: 署名検証 (Validate Signature)
    alt Valid Signature
        Webhook->>LINE: Loading Animation開始 (POST /loading)
        Webhook->>Queue: メッセージイベントを送信 (send)
        Webhook-->>LINE: 200 OK
    else Invalid Signature
        Webhook-->>LINE: 401 Unauthorized
    end
    deactivate Webhook

    loop 非同期処理 (Async Processing)
        Queue->>Consumer: バッチ処理開始 (handleQueue)
        activate Consumer

        Consumer->>DB: ユーザー/ルーム情報の保存 (Upsert)

        alt Text Message
            Consumer->>DB: 投稿データの保存 (Create Post)

            rect rgb(240, 248, 255)
                note right of Consumer: 翻訳プロセス
                Consumer->>Consumer: 言語検出 (Detect Language)
                Consumer->>DB: コンテキスト取得 (Last 2 posts)
                Consumer->>Gemini: 翻訳リクエスト (Generate Text)
                Gemini-->>Consumer: 翻訳結果
                Consumer->>DB: 翻訳ログ保存 & 投稿更新
            end

            opt 翻訳成功
                Consumer->>LINE: 返信メッセージ送信 (Reply Message)
            end
        else Other Message
            Consumer->>Consumer: Log & Ignore
        end

        deactivate Consumer
    end
```

## 3. 翻訳ロジック (Translation Logic)

`TranslationService` における言語検出と翻訳実行のロジックフローです。

```mermaid
flowchart TD
    Start([開始]) --> Detect["言語検出"]

    Detect -- 日本語 (JA) --> TargetJA["ターゲット: EN, PL"]
    Detect -- 英語/ポーランド語 (EN/PL) --> TargetENPL["ターゲット: JA"]
    Detect -- その他 --> End([終了: null])

    TargetJA --> GetContext["コンテキスト取得 (直近2件)"]
    TargetENPL --> GetContext

    GetContext --> LoopStart{ターゲット言語ループ}

    LoopStart -- 次の言語 --> CreatePrompt["プロンプト作成 (Roleplay)"]
    CreatePrompt --> CallGemini["Gemini API呼び出し"]

    CallGemini -- 成功 --> SaveLog["ログ保存"]
    SaveLog --> AddList["翻訳リストに追加"]

    CallGemini -- 失敗 --> LogError["エラーログ出力"]
    LogError --> LoopStart

    LoopStart -- 全言語終了 --> CheckResult{翻訳結果あり?}

    CheckResult -- Yes --> UpdateDB["DB更新 (updateTranslatedText)"]
    UpdateDB --> ReturnResult([翻訳テキストを返す])

    CheckResult -- No --> End
```

## 4. Gemini API リトライ/フォールバック (Gemini Client Logic)

`GeminiClient` におけるモデルローテーションとエラーリトライの堅牢なロジックです。

```mermaid
stateDiagram-v2
    [*] --> ModelLoop: モデルリスト順次試行

    state ModelLoop {
        [*] --> RetryLoop: モデル選択 (Lite -> Flash -> Preview -> Gemma)

        state RetryLoop {
            [*] --> CallAPI: API呼び出し

            CallAPI --> Success: 成功
            CallAPI --> Error429: 429 Too Many Requests
            CallAPI --> Error503: 503 Service Unavailable
            CallAPI --> Error500: 500 Internal Server Error
            CallAPI --> ErrorOther: その他エラー

            Error503 --> WaitRandom: 2-5秒待機
            WaitRandom --> CallAPI: リトライ (Max 3回)

            Error500 --> WaitExp: 指数バックオフ待機
            WaitExp --> CallAPI: リトライ (Max 3回)
        }

        Success --> [*]: 結果を返す
        Error429 --> [*]: 次のモデルへ即時移行
        ErrorOther --> [*]: 例外スロー

        RetryLoop --> [*]: リトライ回数超過 (次のモデルへ?)
    }

    ModelLoop --> [*]: 全モデル失敗 (Error)
    ModelLoop --> [*]: 成功 (Text)
```

## 5. アンケート結果表示 (Poll Result View)

`PollResultHandler` によるアンケート結果ページの表示フローです。

```mermaid
sequenceDiagram
    participant Browser
    participant Worker as PollResultHandler
    participant DB as D1 Database

    Browser->>Worker: GET /poll/:id
    activate Worker

    Worker->>DB: 投稿取得 (findById)

    alt Post Not Found or Not a Poll
        Worker-->>Browser: 404 Not Found Page
    else Poll Exists
        Worker->>DB: 回答取得 (getAnswersWithUserNames)
        DB-->>Worker: 回答リスト

        Worker->>Worker: 集計 (Tally Votes)
        Worker->>Worker: HTMLレンダリング (Tailwind CSS)

        Worker-->>Browser: 200 OK (HTML Page)
    end
    deactivate Worker
```

# LINE Bot 仕様書 (Cloudflare Workers版)

本ドキュメントは、Cloudflare Workers + Hono + D1 ベースの LINE ボットの仕様をまとめたものです。
`specs-on-gas.md` (Google Apps Script版) を元に、Cloudflare Workers 環境向けに再設計されています。

## 概要

本ボットは、子供バレエ教室における保護者（主に日本人）と先生（主にポーランド人）のコミュニケーションを支援するために設計されています。主な機能として、多言語間の文脈考慮型翻訳機能と、簡易アンケート機能を提供します。

## システム構成

*   **ランタイム環境**: Cloudflare Workers
*   **フレームワーク**: Hono (TypeScript)
*   **インターフェース**: LINE Messaging API (Webhook / Push / Reply)
*   **AIエンジン**: Google Gemini API (`gemini-2.5-flash-lite`, `gemini-2.5-flash` 等、複数モデルへのリトライ対応)
*   **データストア**: Cloudflare D1 (SQLite)
*   **フロントエンド**: Cloudflare Workers (Hono JSX または静的HTML配信によるアンケート結果表示)

## ファイル構成

*   `src/index.tsx`: バックエンドロジック（Webhook処理、翻訳、DB操作、API連携）およびフロントエンド配信
*   `schema.sql`: Cloudflare D1 データベーススキーマ定義
*   `wrangler.toml`: Cloudflare Workers 設定ファイル

## 機能詳細

### 1. 多言語翻訳機能

ユーザーからのメッセージを自動的に翻訳して返信します。

*   **言語検出**: メッセージ内容から日本語 (`ja`)、ポーランド語 (`pl`)、その他（英語 `en` 扱い）を自動検出します。
*   **翻訳方向**:
    *   日本語 -> 英語 & ポーランド語
    *   その他 -> 日本語
*   **文脈考慮 (Context Aware)**: ユーザーごとの直近2件の会話履歴を D1 から取得し、代名詞や文脈を補完して翻訳します。
*   **ロールプレイ**:
    *   **日本語話者**: 生徒の保護者として扱われます。
    *   **ポーランド語話者**: バレエ教室の先生として扱われ、親密さを表現する指示がプロンプトに含まれます。
    *   **専門用語**: バレエ用語を適切に翻訳するよう指示されています。
*   **ローディング表示**: 翻訳処理中、LINEのローディングアニメーションを表示します（最大60秒）。
*   **エラーハンドリング**: Gemini API のレート制限 (429) やサーバーエラー (503) に対するリトライロジックを実装しています。

### 2. アンケート機能

メッセージに特定のキーワードを含めることで、簡易アンケートを作成できます。

*   **作成方法**: メッセージに `[check]` （大文字小文字区別なし）を含めて送信します。`[check]` を除いた部分が質問文として翻訳・登録されます。
*   **回答インターフェース**: Flex Message が返信され、「OK」「NG」「N/A」のボタンで回答できます。
*   **結果確認**: Flex Message 内の "See results" リンクから、Webブラウザで詳細な回答結果（日時、回答者名、回答内容）を確認できます。
    *   結果ページは Hono のルートハンドラによって生成・配信されます。

### 3. ユーザー管理機能

*   **名前登録**: `私の名前は"〇〇"` という形式のメッセージを送信すると、表示名を登録・更新できます。
    *   更新後、システムメッセージと翻訳されたメッセージの両方が返信されます。
*   **自動登録**: メッセージ受信時、未登録ユーザーは自動的に `users` テーブルに追加されます。

## データモデル (Cloudflare D1)

データは Cloudflare D1 (SQLite) の各テーブルに保存されます。詳細は `schema.sql` を参照してください。

### テーブル一覧

| テーブル名 | 用途 | 主要カラム |
| :--- | :--- | :--- |
| **posts** | 全メッセージのログ | `post_id`, `timestamp`, `user_id`, `room_id`, `message_text`, `has_poll`, `translated_text` |
| **answers** | アンケートの回答 | `answer_id`, `timestamp`, `poll_post_id`, `user_id`, `answer_value` |
| **users** | ユーザー情報 | `user_id`, `display_name` |
| **rooms** | グループ/ルーム情報 | `room_id`, `room_name` |
| **translation_logs** | 翻訳精度の分析用 | `timestamp`, `user_id`, `language`, `original_message`, `translation`, `prompt`, `history_count` |
| **debug_logs** | エラーログ | `timestamp`, `message`, `stack` |

## 環境設定 (wrangler.toml / Secrets)

動作には以下の環境変数（Secrets）の設定が必要です。

| 変数名 | 説明 |
| :--- | :--- |
| `CHANNEL_ACCESS_TOKEN` | LINE Messaging API のチャネルアクセストークン |
| `CHANNEL_SECRET` | LINE Messaging API のチャネルシークレット（署名検証用） |
| `GEMINI_API_KEY` | Google Gemini API キー |

※ D1 データベースのバインディング名は `DB` とすることを想定しています。

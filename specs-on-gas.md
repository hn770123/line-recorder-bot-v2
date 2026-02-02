# LINE Bot 仕様書 (Google Apps Script版)

本ドキュメントは、`gas-src/` ディレクトリに含まれる Google Apps Script (GAS) ベースの LINE ボットの仕様をまとめたものです。

## 概要

本ボットは、子供バレエ教室における保護者（主に日本人）と先生（主にポーランド人）のコミュニケーションを支援するために設計されています。主な機能として、多言語間の文脈考慮型翻訳機能と、簡易アンケート機能を提供します。

## システム構成

*   **ランタイム環境**: Google Apps Script (GAS)
*   **インターフェース**: LINE Messaging API (Webhook / Push / Reply)
*   **AIエンジン**: Google Gemini API (`gemini-2.5-flash-lite`, `gemini-2.5-flash` 等、複数モデルへのリトライ対応)
*   **データストア**: Google Spreadsheet
*   **フロントエンド**: GAS HTML Service (アンケート結果表示用)

## ファイル構成

*   `gas-src/code.gs`: バックエンドロジック（Webhook処理、翻訳、DB操作、API連携）
*   `gas-src/index.html`: アンケート結果を表示するWebページ（`doGet` で配信）

## 機能詳細

### 1. 多言語翻訳機能

ユーザーからのメッセージを自動的に翻訳して返信します。

*   **言語検出**: メッセージ内容から日本語 (`ja`)、ポーランド語 (`pl`)、その他（英語 `en` 扱い）を自動検出します。
*   **翻訳方向**:
    *   日本語 -> 英語 & ポーランド語
    *   その他 -> 日本語
*   **文脈考慮 (Context Aware)**: ユーザーごとの直近2件の会話履歴を保持し、代名詞や文脈を補完して翻訳します。
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
    *   結果ページは `index.html` をテンプレートとして生成されます。

### 3. ユーザー管理機能

*   **名前登録**: `私の名前は"〇〇"` という形式のメッセージを送信すると、表示名を登録・更新できます。
    *   更新後、システムメッセージと翻訳されたメッセージの両方が返信されます。
*   **自動登録**: メッセージ受信時、未登録ユーザーは自動的にユーザーテーブルに追加されます。

## データモデル (Google Spreadsheet)

データはスプレッドシートの各シートに保存されます。

### シート一覧

| シート名 | 用途 | 主要カラム |
| :--- | :--- | :--- |
| **投稿** (POSTS) | 全メッセージのログ | `post_id`, `timestamp`, `user_id`, `room_id`, `message_text`, `has_poll`, `translated_text` |
| **回答** (ANSWERS) | アンケートの回答 | `answer_id`, `timestamp`, `poll_post_id`, `user_id`, `answer_value` |
| **ユーザー** (USERS) | ユーザー情報 | `user_id`, `display_name` |
| **トークルーム** (ROOMS) | グループ/ルーム情報 | `room_id`, `room_name` |
| **翻訳ログ** (TRANSLATION_LOG) | 翻訳精度の分析用 | `timestamp`, `user_id`, `language`, `original_message`, `translation`, `prompt` |
| **デバッグ** (DEBUG) | エラーログ | `timestamp`, `message`, `stack` |

## 環境設定 (Script Properties)

動作には以下のスクリプトプロパティの設定が必要です。

| プロパティ名 | 説明 |
| :--- | :--- |
| `CHANNEL_ACCESS_TOKEN` | LINE Messaging API のチャネルアクセストークン |
| `GEMINI_API_KEY` | Google Gemini API キー |
| `SPREADSHEET_ID` | データ保存用スプレッドシートのID |
| `WEB_APP_URL` | デプロイされた GAS Web アプリの URL（アンケート結果表示用） |

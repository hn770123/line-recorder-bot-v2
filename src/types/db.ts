/**
 * @file データベースのテーブルに対応するTypeScriptの型定義
 * @description Cloudflare D1 (SQLite) のスキーマに基づいて、各テーブルのエンティティ型を定義します。
 */

/**
 * @interface User
 * @description ユーザー情報を表すインターフェース
 */
export interface User {
  user_id: string; // LINEのユーザーID
  display_name: string; // ユーザーの表示名
}

/**
 * @interface Room
 * @description トークルーム/グループ情報を表すインターフェース
 */
export interface Room {
  room_id: string; // LINEのルームIDまたはグループID
  room_name: string | null; // ルーム名
}

/**
 * @interface Post
 * @description 投稿メッセージを表すインターフェース
 */
export interface Post {
  post_id: string; // LINEのメッセージID
  timestamp: string; // 投稿日時 (ISO8601形式推奨)
  user_id: string; // 投稿者のユーザーID
  room_id: string | null; // トークルームID（個人チャットの場合はNULLまたは空文字）
  message_text: string | null; // メッセージ本文
  has_poll: 0 | 1; // アンケートが含まれているか (0: false, 1: true)
  translated_text: string | null; // 翻訳されたテキスト
}

/**
 * @interface Answer
 * @description アンケート回答を表すインターフェース
 */
export interface Answer {
  answer_id: string; // 回答ID (UUID)
  timestamp: string; // 回答日時
  poll_post_id: string; // アンケート対象の投稿ID (posts.post_id)
  user_id: string; // 回答者のユーザーID
  answer_value: string | null; // 回答内容 ('OK', 'NG', 'N/A')
}

/**
 * @interface TranslationLog
 * @description 翻訳ログを表すインターフェース
 */
export interface TranslationLog {
  id: number; // ログID (自動採番)
  timestamp: string; // ログ日時
  user_id: string | null; // ユーザーID
  language: string | null; // 検出された言語 ('ja', 'pl', 'en' 等)
  original_message: string | null; // 元のメッセージ
  translation: string | null; // 翻訳結果
  prompt: string | null; // Gemini APIへのプロンプト
  history_count: number | null; // コンテキスト履歴の数
}

/**
 * @interface DebugLog
 * @description デバッグログを表すインターフェース
 */
export interface DebugLog {
  id: number; // ログID (自動採番)
  timestamp: string; // ログ日時
  message: string | null; // エラーメッセージ等
  stack: string | null; // スタックトレース
}

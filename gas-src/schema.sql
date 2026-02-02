-- LINE Bot (GAS版) SQLite テーブル定義
-- 元の Google Spreadsheet の構造に基づいています。

-- ユーザー情報を保存するテーブル
-- シート名: USERS ('ユーザー')
CREATE TABLE users (
    user_id TEXT PRIMARY KEY, -- LINEのユーザーID
    display_name TEXT         -- ユーザーの表示名
);

-- トークルーム/グループ情報を保存するテーブル
-- シート名: ROOMS ('トークルーム')
CREATE TABLE rooms (
    room_id TEXT PRIMARY KEY, -- LINEのルームIDまたはグループID
    room_name TEXT            -- ルーム名（現在は未使用/手動入力）
);

-- 投稿メッセージを保存するテーブル
-- シート名: POSTS ('投稿')
CREATE TABLE posts (
    post_id TEXT PRIMARY KEY,     -- LINEのメッセージID
    timestamp TEXT NOT NULL,      -- 投稿日時 (ISO8601形式推奨)
    user_id TEXT NOT NULL,        -- 投稿者のユーザーID
    room_id TEXT,                 -- トークルームID（個人チャットの場合はNULLまたは空文字）
    message_text TEXT,            -- メッセージ本文
    has_poll INTEGER DEFAULT 0,   -- アンケートが含まれているか (0: false, 1: true)
    translated_text TEXT,         -- 翻訳されたテキスト
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- アンケート回答を保存するテーブル
-- シート名: ANSWERS ('回答')
CREATE TABLE answers (
    answer_id TEXT PRIMARY KEY,   -- 回答ID (UUID)
    timestamp TEXT NOT NULL,      -- 回答日時
    poll_post_id TEXT NOT NULL,   -- アンケート対象の投稿ID (posts.post_id)
    user_id TEXT NOT NULL,        -- 回答者のユーザーID
    answer_value TEXT,            -- 回答内容 ('OK', 'NG', 'N/A')
    UNIQUE(poll_post_id, user_id), -- 1つのアンケートにつき1ユーザー1回答
    FOREIGN KEY (poll_post_id) REFERENCES posts(post_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 翻訳ログを保存するテーブル
-- シート名: TRANSLATION_LOG ('翻訳ログ')
CREATE TABLE translation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- ログID (自動採番)
    timestamp TEXT NOT NULL,              -- ログ日時
    user_id TEXT,                         -- ユーザーID
    language TEXT,                        -- 検出された言語 ('ja', 'pl', 'en' 等)
    original_message TEXT,                -- 元のメッセージ
    translation TEXT,                     -- 翻訳結果
    prompt TEXT,                          -- Gemini APIへのプロンプト
    history_count INTEGER                 -- コンテキスト履歴の数
);

-- デバッグログを保存するテーブル
-- シート名: DEBUG ('デバッグ')
CREATE TABLE debug_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- ログID (自動採番)
    timestamp TEXT NOT NULL,              -- ログ日時
    message TEXT,                         -- エラーメッセージ等
    stack TEXT                            -- スタックトレース
);

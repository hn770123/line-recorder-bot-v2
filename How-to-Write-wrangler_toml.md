# wrangler.toml の書き方 (バージョンと日付設定ガイド)

このドキュメントは、Cloudflare Workers の設定ファイルである `wrangler.toml` における `compatibility_date`（互換性の日付）や `compatibility_flags`（互換性フラグ）の適切な設定方法についてまとめたものです。

Cloudflare の公式ドキュメントに基づき、適切なバージョン管理を行うための指針を記します。

## 1. compatibility_date (互換性の日付)

Workers ランタイムは定期的に更新されています。バグ修正や仕様変更の中には、既存のコードの動作を変えてしまう（互換性のない）変更が含まれる場合があります。
`compatibility_date` を指定することで、指定した日付時点でのランタイムの挙動を固定し、勝手に動作が変わることを防ぐことができます。

### 設定の推奨事項
*   **新規作成時**: プロジェクトを開始する**「今日の日付」**を指定することを強く推奨します。これにより、最新の機能とバグ修正が適用された状態で開発を始められます。
*   **更新時**: 定期的にこの日付を更新することをお勧めします。ただし、更新する際は必ずテストを行い、変更によってコードが壊れないか確認してください。
*   **形式**: `YYYY-MM-DD` (例: `"2025-01-29"`)

```toml
# 設定例
compatibility_date = "2025-01-29"
```

> **注意**: 日付を更新しない限り、Cloudflare は古い挙動を維持し続けます。しかし、新しい機能を使うには日付を更新する必要がある場合があります。

## 2. compatibility_flags (互換性フラグ)

`compatibility_date` を変更せずに特定の機能だけを有効化したい場合や、逆に特定の日付以降の変更を無効化したい場合に使用します。
また、将来的にデフォルトになる予定の実験的な機能を先行して有効にするためにも使われます。

### よく使われるフラグの例

*   **`nodejs_compat`**:
    Node.js のコアモジュール（`AsyncLocalStorage`, `Buffer`, `Events` など）の互換機能を提供します。Hono などのフレームワークや、Node.js 依存のライブラリを使用する場合によく使用されます。

### 設定例

```toml
# nodejs_compat を有効にする場合
compatibility_flags = ["nodejs_compat"]
```

## 3. 設定ファイルの記述例

以下は、推奨される `wrangler.toml` の設定スニペットです。

```toml
name = "my-worker"
main = "src/index.ts"

# 互換性の日付: デプロイまたは開発開始時点の日付を設定
compatibility_date = "2025-01-29"

# 必要に応じてフラグを追加 (例: Node.js互換モード)
compatibility_flags = ["nodejs_compat"]
```

## 4. 参考リンク (公式ドキュメント)

最新の情報や、利用可能なすべてのフラグについては、以下の公式ドキュメントを参照してください。

*   **Compatibility dates (互換性の日付について)**
    *   https://developers.cloudflare.com/workers/configuration/compatibility-dates/
*   **Compatibility flags (互換性フラグ一覧)**
    *   https://developers.cloudflare.com/workers/configuration/compatibility-flags/

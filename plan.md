# Implementation Plan for LINE Bot on Cloudflare Workers

## 考察: AIエージェントによる実装フェーズの最適化

AIエージェントが実装を行う際、コンテキスト長（トークン制限）の制約を考慮し、正確性と整合性を維持するために以下の戦略を採用します。

1.  **水平分割 (Layered Architecture):**
    データベース層、外部API層、ビジネスロジック層、インターフェース層を明確に分離し、一度に編集・参照するファイル数を限定します。これにより、AIは特定の層の実装に集中でき、他の層の詳細をコンテキストに含める必要がなくなります。
2.  **垂直分割 (Feature Slicing):**
    「翻訳機能」と「アンケート機能」を分け、ベースとなるインフラ構築後に一つずつ機能を追加します。機能ごとに完結した実装を行うことで、複雑さを管理可能な範囲に留めます。
3.  **ボトムアップ実装:**
    型定義とデータアクセス層から実装を開始し、土台を固めてから上位ロジックを実装します。これにより、上位層の実装時に下位層のインターフェースが確定しているため、手戻りを防げます。

---

## Implementation Phases

### Phase 1: Project Initialization & Infrastructure (プロジェクト初期化とインフラ)
*   **Goal:** Create a deployable Cloudflare Worker with Hono and D1 binding.
*   **Steps:**
    1.  Initialize `package.json` with dependencies (`hono`, `@cloudflare/workers-types`, `@google/generative-ai` or similar).
    2.  Create `tsconfig.json` and `wrangler.toml` (configuring D1 binding as `DB` and secrets).
    3.  Set up directory structure: `src/{types,db,services,handlers,utils}`.
    4.  Create entry point `src/index.tsx` with a basic Hono app and logging middleware.

### Phase 2: Database Layer (データアクセス層)
*   **Goal:** Establish type-safe interaction with Cloudflare D1.
*   **Steps:**
    1.  Define TypeScript interfaces based on `schema.sql` in `src/types/db.ts`.
    2.  Implement Repository classes/functions in `src/db/` to handle CRUD operations:
        *   `UserRepository` (users table)
        *   `RoomRepository` (rooms table)
        *   `PostRepository` (posts table)
        *   `AnswerRepository` (answers table)
        *   `LogRepository` (translation_logs, debug_logs)
    3.  Ensure strict typing and Japanese comments (as per `AGENTS.md`).

### Phase 3: External Services Integration (外部サービス連携)
*   **Goal:** Wrap external APIs to isolate dependencies.
*   **Steps:**
    1.  Implement `LineClient` (`src/services/line.ts`) for Messaging API:
        *   Reply Message
        *   Push Message
        *   Get Profile/Group Member Profile
        *   Signature Validation
    2.  Implement `GeminiClient` (`src/services/gemini.ts`) for Google Generative AI:
        *   Text generation with context
        *   Error handling and retry logic (for 429/503 errors).

### Phase 4: Core Logic - Webhook & Translation (基本ロジック - 翻訳)
*   **Goal:** Enable the main translation feature.
*   **Steps:**
    1.  Implement Webhook handler (`src/handlers/webhook.ts`) to parse LINE events.
    2.  Implement signature verification middleware.
    3.  Implement `TranslationService` (`src/services/translator.ts`):
        *   Language detection logic.
        *   Context retrieval (fetch last 2 messages from `PostRepository`).
        *   Prompt construction (Roleplay as Teacher/Parent).
        *   Call `GeminiClient`.
        *   Save logs to `translation_logs`.
    4.  Wire everything up in `src/index.tsx`.

### Phase 5: Feature - Polling/Survey (機能実装 - アンケート)
*   **Goal:** Enable the polling functionality (`[check]` command).
*   **Steps:**
    1.  Implement Poll logic in `src/services/poll.ts`:
        *   Detect `[check]` keyword.
        *   Parse the question.
    2.  Create Flex Message builder for the poll interface (OK/NG/NA buttons).
    3.  Handle `postback` events in the Webhook handler to store votes in `answers`.
    4.  Implement Web View for results using Hono JSX (`src/handlers/poll-result.tsx`) at `GET /poll/:id`.

### Phase 6: Testing & Quality Assurance (テストと品質保証)
*   **Goal:** Ensure reliability and compliance.
*   **Steps:**
    1.  Install and configure `vitest`.
    2.  Write unit tests for Services and Repositories.
    3.  Verify `AGENTS.md` compliance (Japanese comments in code).
    4.  Review against `specs-on-cloudflareworker.md` to ensure all features are covered.

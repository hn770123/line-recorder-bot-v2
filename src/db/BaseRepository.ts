/**
 * @file BaseRepository
 * @description Cloudflare D1データベース操作のための基底リポジトリクラス。
 *              共通のクエリ実行ロジックを提供します。
 */

/**
 * 環境変数 `DB` は、Cloudflare WorkersのD1バインディングによって提供される`D1Database`インスタンスです。
 * `Env`インターフェースは、`wrangler.toml`で定義される環境変数の型付けに使用されます。
 * 現時点では、`wrangler.toml`には`DB`の型定義は含まれていませんが、
 * Cloudflare Workersの型定義ファイル`@cloudflare/workers-types`に含まれる`D1Database`がこれに該当します。
 *
 * `Env`インターフェースを拡張して、`DB: D1Database`を含めることで、
 * TypeScriptが環境変数の型を正しく推論できるようになります。
 * これは`src/index.tsx`などでワーカー全体で使用される`Env`インターフェースに含めるのが適切です。
 */
export interface Env {
  DB: D1Database;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_CHANNEL_SECRET: string;
  GEMINI_API_KEY: string;
  BYPASS_LINE_VALIDATION: string;
}

export class BaseRepository {
  protected db: D1Database;

  constructor(env: Env) {
    this.db = env.DB;
  }

  /**
   * @method execute
   * @description SQLクエリを実行し、結果を返します。
   * @param {string} query SQLクエリ文字列
   * @param {any[]} params クエリにバインドするパラメータ
   * @returns {Promise<D1Result<any>>} D1の実行結果
   */
  protected async execute<T = any>(query: string, params: any[] = []): Promise<D1Result<T>> {
    try {
      return await this.db.prepare(query).bind(...params).all<T>();
    } catch (error) {
      console.error('Database query failed:', query, params, error);
      throw error;
    }
  }

  /**
   * @method queryOne
   * @description 単一のレコードをフェッチします。
   * @param {string} query SQLクエリ文字列
   * @param {any[]} params クエリにバインドするパラメータ
   * @returns {Promise<T | null>} 結果のレコード、または見つからない場合はnull
   */
  protected async queryOne<T = any>(query: string, params: any[] = []): Promise<T | null> {
    const result = await this.execute<T>(query, params);
    return result.results && result.results.length > 0 ? result.results[0] : null;
  }

  /**
   * @method queryAll
   * @description 複数のレコードをフェッチします。
   * @param {string} query SQLクエリ文字列
   * @param {any[]} params クエリにバインドするパラメータ
   * @returns {Promise<T[]>} 結果のレコードの配列
   */
  protected async queryAll<T = any>(query: string, params: any[] = []): Promise<T[]> {
    const result = await this.execute<T>(query, params);
    return result.results || [];
  }
}

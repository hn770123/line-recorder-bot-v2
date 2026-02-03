/**
 * @file mockD1.ts
 * @description VitestでCloudflare D1データベースをモックするためのユーティリティ。
 *              D1Databaseのメソッドをシミュレートし、テスト中に実際のデータベースアクセスを行わないようにします。
 */

import { vi } from 'vitest';

/**
 * D1Databaseのモックを作成します。
 * クエリとその結果を事前に定義することで、テストの予測可能性を高めます。
 */
export const createMockD1Database = () => {
  const mockD1 = {
    prepare: vi.fn(() => mockD1),
    bind: vi.fn(() => mockD1),
    all: vi.fn(async () => ({ results: [], success: true, meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 } })),
    run: vi.fn(async () => ({ success: true, meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 } })),
    // add more D1 methods as needed for testing
  } as unknown as D1Database; // `as unknown as D1Database` で型アサーション

  return mockD1;
};

/**
 * 特定のクエリに対するモック結果を設定するためのヘルパー関数
 * @param mockD1 - createMockD1Databaseで作成されたモックD1Database
 * @param query - 期待されるSQLクエリ（部分一致でも可）
 * @param results - そのクエリが返すD1Resultのresultsプロパティ
 * @param type - 'all'または'run'
 */
export const setMockD1Results = (
  mockD1: D1Database,
  query: string,
  results: any[],
  type: 'all' | 'run' = 'all'
) => {
  const originalPrepare = mockD1.prepare;
  (mockD1.prepare as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
    const preparedStatement = originalPrepare(sql);
    if (sql.includes(query)) {
      if (type === 'all') {
        (preparedStatement.all as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          results,
          success: true,
          meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 },
        });
      } else if (type === 'run') {
        (preparedStatement.run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          success: true,
          meta: { duration: 0, served_by: 'mock', changes: 0, last_row_id: 0 },
        });
      }
    }
    return preparedStatement;
  });
};

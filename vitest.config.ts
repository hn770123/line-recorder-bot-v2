import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // VitestをCloudflare Workers環境で動作させるための設定
    // `happy-dom`や`jsdom`のようなブラウザエミュレーション環境は通常不要
    // Node.js環境で実行されるように設定
    environment: 'node',
    globals: true, // describe, it, expectなどをグローバルで利用可能にする
    coverage: {
      provider: 'v8', // v8またはistanbul
      reporter: ['text', 'json', 'html'], // レポート形式
      exclude: [
        'node_modules/',
        'dist/',
        'build/',
        'src/index.tsx', // エントリーポイントはテスト対象外とすることが多い
        'src/types/',     // 型定義ファイルはテスト対象外
      ],
    },
    // Vitestの実行中にTypeScriptのトランスパイルを行うための設定
    // `tsconfig.json` の `jsx` 設定が `react-jsx` のため、ここでは特に明示的な設定は不要なことが多い
    // 必要に応じて `alias` なども追加
  },
});

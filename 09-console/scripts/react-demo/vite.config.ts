// 管理画面の web/vite.config.ts と同じく、React のための部品（JSX の変換・その場の書き換え）を入れる。
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
});

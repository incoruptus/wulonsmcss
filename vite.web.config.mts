import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

/**
 * 纯静态 Web 构建（GitHub Pages 用）
 * - 能力来自本机 agent，页面本身不含任何 Node/Electron 依赖
 * - base 用相对路径，方便挂在任意子目录（如 /mcss/）
 * - 路由是 Hash，静态托管不需要重写规则
 */
export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  // .env.local 在仓库根目录；不显式指定时 Vite 会去 src/renderer 下找，本地构建就拿不到仓库地址
  envDir: resolve(__dirname),
  base: "./",
  build: {
    outDir: resolve(__dirname, "dist-web"),
    emptyOutDir: true,
    target: "es2022",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/renderer"),
    },
  },
  plugins: [react(), tailwindcss()],
});

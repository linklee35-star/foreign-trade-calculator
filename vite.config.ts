import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 相对路径：可部署到任意静态托管（GitHub Pages / Vercel / 对象存储）
  base: "./",
});

import { defineConfig } from "vitest/config";

// vitest 单独配置：不加载 @tailwindcss/vite（该插件与 vitest 的 config 加载不兼容）
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

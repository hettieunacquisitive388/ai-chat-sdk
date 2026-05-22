import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
    },
    format: ["esm"],
    dts: false,
    splitting: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    external: ["@anter/ai-chat-sdk"],
  },
]);

import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// 빌드 결과를 dist/index.html 한 파일로 만든다 (버셀에 그대로 올라가고, 파일 하나로 옮기기도 쉬움).
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { target: "es2020" },
});

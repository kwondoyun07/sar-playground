#!/usr/bin/env node
// 터미널용 실행기. Node 22.18 이상(타입 스트리핑 내장)에서 동작한다.
//   npm run cli -- 파일.gg
//   npm run cli -- -c "어머니 저 똥꼬에서 김치가 나옵니다; 싹싹김치'안녕'"
import fs from "node:fs";
import { run } from "../src/interpreter.ts";

const argv = process.argv.slice(2);
let source;
if (argv[0] === "-c" && argv.length >= 2) source = argv[1];
else if (argv.length === 1) source = fs.readFileSync(argv[0], "utf8");
else {
  process.stderr.write("사용법: npm run cli -- 파일.gg  |  npm run cli -- -c '한 줄 프로그램'\n");
  process.exit(2);
}

let input = "";
if (!process.stdin.isTTY) {
  try { input = fs.readFileSync(0, "utf8"); } catch { input = ""; }   // 파이프가 없으면 입력 없음
}
const lines = input.length ? input.split(/\r?\n/) : [];
if (input.endsWith("\n")) lines.pop();
let i = 0;
const { code } = run(source, {
  readLine: () => (i < lines.length ? lines[i++] : null),
  stdout: t => process.stdout.write(t),
  stderr: t => process.stderr.write(t),
});
process.exit(code);

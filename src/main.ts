import { run, type IO } from "./interpreter";
import { EXAMPLES } from "./examples";
import { CHEATSHEET } from "./cheatsheet";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const code = $<HTMLTextAreaElement>("code");
const gutter = $<HTMLPreElement>("gutter");
const stdin = $<HTMLTextAreaElement>("stdin");
const output = $<HTMLDivElement>("output");
const status = $<HTMLSpanElement>("status");
const cursorPos = $<HTMLSpanElement>("cursor-pos");
const examples = $<HTMLSelectElement>("examples");
const runBtn = $<HTMLButtonElement>("run");
const shareBtn = $<HTMLButtonElement>("share");
const cheat = $<HTMLElement>("cheat");
const cheatToggle = $<HTMLButtonElement>("cheat-toggle");
const cheatClose = $<HTMLButtonElement>("cheat-close");
const cheatBody = $<HTMLDivElement>("cheat-body");

const MAX_STEPS = 5_000_000;
const DRAFT_KEY = "gglang.draft";
const STDIN_KEY = "gglang.stdin";

// ---------- 저장/공유 (실패해도 조용히 넘어간다)
function loadDraft(): string | null {
  try { return localStorage.getItem(DRAFT_KEY); } catch { return null; }
}
function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, code.value);
    localStorage.setItem(STDIN_KEY, stdin.value);
  } catch { /* 저장 못 해도 실행에는 지장 없음 */ }
}

function encodeShare(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeShare(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch { return null; }
}

function codeFromHash(): string | null {
  const m = /[#&]code=([^&]+)/.exec(location.hash);
  return m ? decodeShare(m[1]) : null;
}

// ---------- 편집창
function updateGutter() {
  const n = code.value.split("\n").length;
  let s = "";
  for (let i = 1; i <= n; i++) s += (i === 1 ? "" : "\n") + i;
  gutter.textContent = s;
  gutter.scrollTop = code.scrollTop;
}

function updateCursor() {
  const before = code.value.slice(0, code.selectionStart);
  const line = before.split("\n").length;
  cursorPos.textContent = `${line}번째 줄`;
}

code.addEventListener("input", () => { updateGutter(); updateCursor(); saveDraft(); });
code.addEventListener("scroll", () => { gutter.scrollTop = code.scrollTop; });
code.addEventListener("keyup", updateCursor);
code.addEventListener("click", updateCursor);
stdin.addEventListener("input", saveDraft);

code.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b } = code;
    code.setRangeText("    ", a, b, "end");
    updateGutter();
    saveDraft();
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); execute(); }
});

// ---------- 출력 렌더링: 김치는 줄, 오류는 도네 알림
function appendOut(text: string) {
  if (!text) return;
  const last = output.lastElementChild;
  if (last && last.tagName === "PRE") {
    last.textContent += text;
  } else {
    const pre = document.createElement("pre");
    pre.textContent = text;
    output.appendChild(pre);
  }
}

function appendErr(text: string) {
  for (const line of text.split("\n")) {
    if (line === "") continue;
    const m = /^(밤티 코드입니다|박위상태|난리도아냐)(.*)$/.exec(line);
    if (m) {
      const div = document.createElement("div");
      div.className = "alert";
      const b = document.createElement("b");
      b.textContent = m[1];
      div.appendChild(b);
      div.appendChild(document.createTextNode(m[2].replace(/^\s*[:：]?\s*/, "")));
      output.appendChild(div);
    } else {
      const p = document.createElement("p");
      p.className = "debug";
      p.textContent = line;
      output.appendChild(p);
    }
  }
}

function setStatus(codeNum: number, ms: number) {
  status.textContent = codeNum === 0 ? `줴줴이야 · 종료 코드 0 · ${ms}ms` : `종료 코드 ${codeNum} · ${ms}ms`;
  status.className = "status " + (codeNum === 0 ? "ok" : "bad");
}

function execute() {
  output.textContent = "";
  status.textContent = "";
  status.className = "status";
  const lines = stdin.value.length ? stdin.value.split(/\r?\n/) : [];
  if (stdin.value.endsWith("\n")) lines.pop();
  let i = 0;
  const io: IO = {
    readLine: () => (i < lines.length ? lines[i++] : null),
    stdout: appendOut,
    stderr: appendErr,
  };
  const t0 = performance.now();
  let exit = 1;
  try {
    exit = run(code.value, io, { maxSteps: MAX_STEPS }).code;
  } catch (e) {
    appendErr(`박위상태: 인터프리터 안에서 처리 못 한 문제 (${(e as Error).message})`);
  }
  setStatus(exit, Math.round(performance.now() - t0));
  if (!output.hasChildNodes()) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "출력 없음.";
    output.appendChild(p);
  }
  output.scrollTop = 0;
}

runBtn.addEventListener("click", execute);

// ---------- 예제
EXAMPLES.forEach((ex, idx) => {
  const opt = document.createElement("option");
  opt.value = String(idx);
  opt.textContent = ex.title;
  examples.appendChild(opt);
});
examples.addEventListener("change", () => {
  const ex = EXAMPLES[Number(examples.value)];
  if (!ex) return;
  code.value = ex.code;
  stdin.value = ex.input ?? "";
  updateGutter();
  updateCursor();
  saveDraft();
  examples.value = "";
  execute();
});

// ---------- 링크 복사
shareBtn.addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}#code=${encodeShare(code.value)}`;
  try {
    await navigator.clipboard.writeText(url);
    shareBtn.textContent = "복사됨";
  } catch {
    history.replaceState(null, "", url);
    shareBtn.textContent = "주소창에 넣음";
  }
  setTimeout(() => { shareBtn.textContent = "링크 복사"; }, 1600);
});

// ---------- 치트시트
for (const [title, items] of CHEATSHEET) {
  const h = document.createElement("h3");
  h.textContent = title;
  cheatBody.appendChild(h);
  const ul = document.createElement("ul");
  for (const it of items) {
    const li = document.createElement("li");
    li.textContent = it;
    ul.appendChild(li);
  }
  cheatBody.appendChild(ul);
}
function setCheat(open: boolean) {
  cheat.hidden = !open;
  cheatToggle.setAttribute("aria-expanded", String(open));
  if (open) cheatClose.focus();
}
cheatToggle.addEventListener("click", () => setCheat(cheat.hasAttribute("hidden")));
cheatClose.addEventListener("click", () => { setCheat(false); cheatToggle.focus(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !cheat.hasAttribute("hidden")) setCheat(false); });

// ---------- 시작 상태: 공유 링크 > 저장된 초안 > 예제 1
const shared = codeFromHash();
code.value = shared ?? loadDraft() ?? EXAMPLES[0].code;
try { stdin.value = shared ? "" : (localStorage.getItem(STDIN_KEY) ?? ""); } catch { stdin.value = ""; }
updateGutter();
updateCursor();

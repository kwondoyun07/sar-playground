/**
 * 엄랭 v2 (가칭) 인터프리터 — TypeScript 포팅.
 * 레퍼런스 구현 gg.py와 같은 문법·동작을 따른다.
 */

export const HEADER = "어머니 저 똥꼬에서 김치가 나옵니다";
const COMMENT_MARKERS = ["아자스", "에또"];
const MAX_DEPTH = 1000;

export type Value = bigint | string | Value[];

// ---------------------------------------------------------------- 오류/신호

export class BamtiError extends Error {
  line: number; msg: string;
  constructor(line: number, msg: string) {
    super(`밤티 코드입니다 (${line}번째 줄): ${msg}`);
    this.line = line; this.msg = msg;
  }
}

export class BakwiError extends Error {
  line: number; msg: string;
  constructor(line: number, msg: string) {
    super(`박위상태 (${line}번째 줄): ${msg}`);
    this.line = line; this.msg = msg;
  }
}

export class KingError extends Error {
  msg: string;
  constructor(msg: string) {
    super(msg === "" ? "난리도아냐" : `난리도아냐: ${msg}`);
    this.msg = msg;
  }
}

class BreakSignal { }
class ContinueSignal { }
class ReturnSignal { value: Value; constructor(value: Value) { this.value = value; } }
class ExitSignal { code: number; constructor(code: number) { this.code = code; } }
class StepLimit { }

// ---------------------------------------------------------------- 어휘 분석

function stripComment(text: string): string {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else {
      for (const m of COMMENT_MARKERS) {
        if (text.startsWith(m, i)) return text.slice(0, i);
      }
    }
  }
  return text;
}

function splitStatements(text: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      buf += c;
      if (c === "\\" && i + 1 < text.length) { buf += text[i + 1]; i++; continue; }
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c; buf += c;
    } else if (c === ";") {
      parts.push(buf); buf = "";
    } else {
      buf += c;
    }
  }
  parts.push(buf);
  return parts;
}

function lexLines(source: string): Array<[number, string]> {
  const out: Array<[number, string]> = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    for (const part of splitStatements(stripComment(raw))) {
      const t = part.trim();
      if (t) out.push([idx + 1, t]);
    }
  });
  return out;
}

// ---------------------------------------------------------------- 식 AST

export type Expr =
  | { k: "int"; v: bigint }
  | { k: "str"; v: string }
  | { k: "list"; items: Expr[] }
  | { k: "var"; n: number }
  | { k: "dvar"; idx: Expr }
  | { k: "not"; e: Expr }
  | { k: "add"; atoms: Expr[] }
  | { k: "mul"; terms: Expr[] }
  | { k: "call"; name: string; args: Expr[] }
  | { k: "fcall"; name: string; args: Expr[] };

type VarRef = { k: "var"; n: number } | { k: "dvar"; idx: Expr };

const ONE_ARG = ["밤티", "개야르", "몇", "크크루삥뽕", "말해주세요", "긁", "사꾸"];
const TWO_ARG = ["판별법", "박위", "너도"];
const BUILTIN_NAMES = [...ONE_ARG, ...TWO_ARG, "섹시푸드", "집합", "오이데", "감다살", "감다뒤", "아뇨"]
  .sort((a, b) => b.length - a.length);
const ATOM_START = /[.,'"어엌6~]/;

class ExprParser {
  pos = 0;
  s: string; line: number;
  constructor(s: string, line: number) { this.s = s; this.line = line; }

  peek(n = 1): string { return this.s.slice(this.pos, this.pos + n); }
  atEnd(): boolean { return this.pos >= this.s.length; }
  error(msg: string): never { throw new BamtiError(this.line, msg); }

  expect(ch: string, what: string): void {
    if (this.peek() !== ch) {
      this.error(`${what} 자리에 '${ch}'가 있어야 하는데 '${this.peek() || "줄 끝"}'이(가) 있음`);
    }
    this.pos++;
  }

  startsAtom(): boolean {
    const c = this.peek();
    if (!c) return false;
    if (ATOM_START.test(c)) return true;
    return BUILTIN_NAMES.some(k => this.s.startsWith(k, this.pos));
  }

  parseFull(): Expr {
    if (this.s.trim() === "") return { k: "int", v: 0n };
    const node = this.parseExpr(new Set());
    if (!this.atEnd()) this.error(`읽을 수 없는 글자 '${this.peek()}'`);
    return node;
  }

  parseExpr(stop: Set<string>): Expr {
    const terms: Expr[] = [];
    for (;;) {
      terms.push(this.parseTerm(stop));
      if (this.peek() === " ") {
        while (this.peek() === " ") this.pos++;
        if (this.atEnd() || stop.has(this.peek())) break;
        continue;
      }
      break;
    }
    return { k: "mul", terms };
  }

  parseTerm(stop: Set<string>): Expr {
    const atoms: Expr[] = [];
    for (;;) {
      const c = this.peek();
      if (c === "~" && atoms.length === 0) {       // 항 맨 앞: 괄호 열기
        this.pos++;
        const inner = this.parseExpr(new Set(["~"]));
        this.expect("~", "괄호 닫기");
        atoms.push(inner);
        continue;
      }
      if (!c || c === " " || stop.has(c)) break;
      if (c === "~") this.error("괄호 '~'는 항의 맨 앞에서만 열 수 있음");
      atoms.push(this.parseAtom());
    }
    if (atoms.length === 0) {
      this.error(!this.peek() ? "식이 있어야 할 자리가 비어 있음"
        : `식이 있어야 할 자리에 '${this.peek()}'이(가) 있음`);
    }
    return { k: "add", atoms };
  }

  parseAtom(): Expr {
    const c = this.peek();
    if (c === "." || c === ",") {
      const m = /^[.,]+/.exec(this.s.slice(this.pos))!;
      this.pos += m[0].length;
      let v = 0n;
      for (const ch of m[0]) v += ch === "." ? 1n : -1n;
      return { k: "int", v };
    }
    if (c >= "0" && c <= "9") {
      if (this.peek(2) === "67") { this.pos += 2; return { k: "int", v: 67n }; }
      this.error("이 언어에서 쓸 수 있는 숫자는 67뿐");
    }
    if (c === "'" || c === '"') return { k: "str", v: this.parseString() };
    if (c === "어") {
      const m = /^어+/.exec(this.s.slice(this.pos))!;
      this.pos += m[0].length;
      return { k: "var", n: m[0].length };
    }
    if (c === "엌") {
      this.pos++;
      const idx = this.parseExpr(new Set(["ㅋ"]));
      this.expect("ㅋ", "엌 인덱스 닫기");
      return { k: "dvar", idx };
    }
    if (c === "~") {
      this.pos++;
      const inner = this.parseExpr(new Set(["~"]));
      this.expect("~", "괄호 닫기");
      return inner;
    }
    for (const name of BUILTIN_NAMES) {
      if (this.s.startsWith(name, this.pos)) {
        this.pos += name.length;
        return this.parseBuiltin(name);
      }
    }
    this.error(`읽을 수 없는 글자 '${c}'`);
  }

  parseString(): string {
    const quote = this.peek();
    this.pos++;
    let out = "";
    for (;;) {
      if (this.atEnd()) this.error("문자열이 닫히지 않음");
      const c = this.peek();
      if (c === quote) { this.pos++; return out; }
      if (c === "\\") {
        this.pos++;
        const e = this.peek();
        if (e === "") this.error("문자열이 닫히지 않음");
        this.pos++;
        if (e === "n") out += "\n";
        else if (e === "t") out += "\t";
        else if (e === "u") {
          const hexs = this.s.slice(this.pos, this.pos + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hexs)) this.error("\\u 뒤에는 16진수 4자리");
          this.pos += 4;
          out += String.fromCodePoint(parseInt(hexs, 16));
        } else if (e === "\\" || e === "'" || e === '"') out += e;
        else out += "\\" + e;
        continue;
      }
      out += c;
      this.pos++;
    }
  }

  parseArgs(closer: string): Expr[] {
    const args: Expr[] = [];
    if (this.peek() === closer) { this.pos++; return args; }
    for (;;) {
      args.push(this.parseExpr(new Set(["?", closer])));
      const c = this.peek();
      if (c === "?") { this.pos++; continue; }
      if (c === closer) { this.pos++; return args; }
      this.error(`인자 뒤에 '?'나 '${closer}'가 있어야 함`);
    }
  }

  parseBuiltin(name: string): Expr {
    if (name === "감다살") return { k: "int", v: 1n };
    if (name === "감다뒤") return { k: "int", v: 0n };
    if (name === "아뇨") {
      if (this.peek() === "~") {
        this.pos++;
        const inner = this.parseExpr(new Set(["~"]));
        this.expect("~", "괄호 닫기");
        return { k: "not", e: inner };
      }
      if (!this.startsAtom()) this.error("아뇨 뒤에 원자가 있어야 함");
      return { k: "not", e: this.parseAtom() };
    }
    if (name === "오이데") {
      if (!/^['"]/.test(this.peek())) this.error("오이데 뒤에는 함수 이름(문자열)이 와야 함");
      const fname = this.parseString();
      return { k: "fcall", name: fname, args: this.parseArgs("ㅋ") };
    }
    if (name === "집합") return { k: "list", items: this.parseArgs("ㅋ") };
    const args = this.parseArgs("ㅋ");
    if (ONE_ARG.includes(name)) {
      if (args.length !== 1) this.error(`${name}는 인자가 하나`);
      return { k: "call", name, args };
    }
    if (TWO_ARG.includes(name)) {
      if (args.length !== 2) this.error(`${name}는 인자가 둘`);
      return { k: "call", name, args };
    }
    if (name === "섹시푸드") {
      if (args.length !== 2 && args.length !== 3) this.error("섹시푸드는 인자가 둘 또는 셋");
      return { k: "call", name, args };
    }
    this.error(`모르는 내장 함수 ${name}`);
  }
}

function parseExprText(text: string, line: number): Expr {
  return new ExprParser(text, line).parseFull();
}

function parseVarRef(p: ExprParser): VarRef {
  const c = p.peek();
  if (c === "어") {
    const m = /^어+/.exec(p.s.slice(p.pos))!;
    p.pos += m[0].length;
    return { k: "var", n: m[0].length };
  }
  if (c === "엌") {
    p.pos++;
    const idx = p.parseExpr(new Set(["ㅋ"]));
    p.expect("ㅋ", "엌 인덱스 닫기");
    return { k: "dvar", idx };
  }
  p.error("변수(어… 또는 엌…ㅋ)가 와야 함");
}

// ---------------------------------------------------------------- 문장 AST

type Stmt =
  | { kind: "assign"; line: number; target: VarRef; value: Expr | { k: "input_int" } | { k: "input_str" } }
  | { kind: "listset"; line: number; target: VarRef; idx: Expr; value: Expr }
  | { kind: "print"; line: number; expr: Expr | null; mode: "raw" | "char" | "line" | "newline" }
  | { kind: "debug"; line: number; expr: Expr | null }
  | { kind: "if"; line: number; branches: Array<[Expr, Stmt[]]>; else: Stmt[] | null }
  | { kind: "while"; line: number; cond: Expr; body: Stmt[] }
  | { kind: "repeat"; line: number; count: Expr; body: Stmt[] }
  | { kind: "def"; line: number; name: string; body: Stmt[] }
  | { kind: "call"; line: number; name: string; args: Expr[] }
  | { kind: "return"; line: number; expr: Expr }
  | { kind: "break"; line: number }
  | { kind: "continue"; line: number }
  | { kind: "exit"; line: number; expr: Expr }
  | { kind: "abort"; line: number; expr: Expr | null }
  | { kind: "throw"; line: number; expr: Expr | null }
  | { kind: "assert"; line: number; expr: Expr | null }
  | { kind: "swap"; line: number; a: VarRef; b: VarRef }
  | { kind: "try"; line: number; body: Stmt[]; catchTarget: VarRef | null; catchBody: Stmt[] | null; finallyBody: Stmt[] | null };

type Frame =
  | { kind: "if"; line: number; node: Extract<Stmt, { kind: "if" }>; parent: Stmt[] }
  | { kind: "while" | "repeat"; line: number; body: Stmt[]; node: Stmt; parent: Stmt[] }
  | { kind: "def"; line: number; body: Stmt[]; node: Extract<Stmt, { kind: "def" }>; name: string }
  | { kind: "try"; line: number; node: Extract<Stmt, { kind: "try" }>; section: Stmt[]; parent: Stmt[] };

const EXIT_RE = /^(?:아\s*)?줴줴이야(.*?)~*$/;
const ELSE_RE = /^(?:아뇨)+\?$/;

export interface Program { top: Stmt[]; functions: Map<string, Extract<Stmt, { kind: "def" }>>; }

export function parseProgram(source: string): Program {
  const stmts = lexLines(source);
  if (stmts.length === 0) throw new BamtiError(1, `첫 줄은 '${HEADER}'여야 함`);
  const [line0, first] = stmts[0];
  if (first !== HEADER) throw new BamtiError(line0, `첫 줄은 '${HEADER}'여야 함`);

  const functions = new Map<string, Extract<Stmt, { kind: "def" }>>();
  const top: Stmt[] = [];
  const stack: Frame[] = [];

  const currentBody = (): Stmt[] => {
    if (stack.length === 0) return top;
    const fr = stack[stack.length - 1];
    if (fr.kind === "if") return fr.node.else ?? fr.node.branches[fr.node.branches.length - 1][1];
    if (fr.kind === "try") return fr.section;
    return fr.body;
  };
  const inLoop = (): boolean => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const k = stack[i].kind;
      if (k === "while" || k === "repeat") return true;
      if (k === "def") break;
    }
    return false;
  };
  const inDef = (): boolean => stack.some(f => f.kind === "def");
  const tail = (text: string, line: number, marker: string, what: string): string => {
    if (!text.endsWith(marker)) throw new BamtiError(line, `${what}은 '${marker}'로 끝나야 함`);
    return text.slice(0, -1);
  };

  for (const [line, s] of stmts.slice(1)) {
    if (s === HEADER) throw new BamtiError(line, "첫 줄 문장은 한 번만 쓸 수 있음");

    // ----- 블록 닫기
    if (s === "그러시구나" || s === "검은흑곰") {
      if (stack.length === 0) throw new BamtiError(line, `닫을 블록이 없는데 '${s}'가 있음`);
      const fr = stack.pop()!;
      const loop = fr.kind === "while" || fr.kind === "repeat";
      if (loop !== (s === "검은흑곰")) {
        throw new BamtiError(line, "반복 블록은 검은흑곰, 나머지 블록은 그러시구나로 닫아야 함");
      }
      if (fr.kind === "def") functions.set(fr.name, fr.node);
      else if (fr.kind === "try") {
        if (fr.node.catchBody === null && fr.node.finallyBody === null) {
          throw new BamtiError(line, "야르? 블록에는 야르렁이나 야를레이히가 하나는 있어야 함");
        }
        fr.parent.push(fr.node);
      } else fr.parent.push(fr.node);
      continue;
    }

    // ----- 가지 전환
    if (s.startsWith("아뇨")) {
      const fr = stack[stack.length - 1];
      if (!fr || fr.kind !== "if") throw new BamtiError(line, "아뇨…?는 예…? 블록 안에서만 쓸 수 있음");
      if (fr.node.else !== null) throw new BamtiError(line, "아뇨? 뒤에는 가지를 더 만들 수 없음");
      if (ELSE_RE.test(s)) fr.node.else = [];
      else {
        const body = tail(s, line, "?", "아뇨 가지").slice("아뇨".length);
        fr.node.branches.push([parseExprText(body, line), []]);
      }
      continue;
    }
    if (s.startsWith("야를레이히")) {
      if (s !== "야를레이히?") throw new BamtiError(line, "야를레이히 뒤에는 ?만 옴");
      const fr = stack[stack.length - 1];
      if (!fr || fr.kind !== "try") throw new BamtiError(line, "야를레이히?는 야르? 블록 안에서만 쓸 수 있음");
      if (fr.node.finallyBody !== null) throw new BamtiError(line, "야를레이히?는 한 번만");
      fr.node.finallyBody = fr.section = [];
      continue;
    }
    if (s.startsWith("야르렁")) {
      const fr = stack[stack.length - 1];
      if (!fr || fr.kind !== "try") throw new BamtiError(line, "야르렁은 야르? 블록 안에서만 쓸 수 있음");
      if (fr.node.catchBody !== null || fr.node.finallyBody !== null) {
        throw new BamtiError(line, "야르렁은 야를레이히보다 먼저, 한 번만");
      }
      const body = tail(s, line, "?", "야르렁").slice("야르렁".length);
      let target: VarRef | null = null;
      if (body) {
        const p = new ExprParser(body, line);
        target = parseVarRef(p);
        if (!p.atEnd()) p.error(`읽을 수 없는 글자 '${p.peek()}'`);
      }
      fr.node.catchTarget = target;
      fr.node.catchBody = fr.section = [];
      continue;
    }

    // ----- 블록 머리
    if (s === "야르?") {
      const node: Extract<Stmt, { kind: "try" }> = { kind: "try", line, body: [], catchTarget: null, catchBody: null, finallyBody: null };
      stack.push({ kind: "try", line, node, section: node.body, parent: currentBody() });
      continue;
    }
    if (s.startsWith("누가 돌아왔게")) {
      const cond = parseExprText(tail(s, line, "?", "누가 돌아왔게").slice("누가 돌아왔게".length), line);
      const node: Stmt = { kind: "while", line, cond, body: [] };
      stack.push({ kind: "while", line, body: node.body, node, parent: currentBody() });
      continue;
    }
    if (s.startsWith("파라파라")) {
      const count = parseExprText(tail(s, line, "?", "파라파라").slice("파라파라".length), line);
      const node: Stmt = { kind: "repeat", line, count, body: [] };
      stack.push({ kind: "repeat", line, body: node.body, node, parent: currentBody() });
      continue;
    }
    if (s.startsWith("맛떼루요")) {
      if (stack.length) throw new BamtiError(line, "맛떼루요 함수 정의는 블록 밖(최상위)에만 둘 수 있음");
      const body = tail(s, line, "?", "맛떼루요").slice("맛떼루요".length);
      const p = new ExprParser(body, line);
      if (!/^['"]/.test(p.peek())) p.error("맛떼루요 뒤에는 함수 이름(문자열)이 와야 함");
      const name = p.parseString();
      if (!p.atEnd()) p.error(`읽을 수 없는 글자 '${p.peek()}'`);
      if (functions.has(name)) throw new BamtiError(line, `함수 '${name}'가 두 번 정의됨`);
      const node: Extract<Stmt, { kind: "def" }> = { kind: "def", line, name, body: [] };
      stack.push({ kind: "def", line, body: node.body, node, name });
      continue;
    }
    if (s.startsWith("예")) {
      const cond = parseExprText(tail(s, line, "?", "예 조건").slice("예".length), line);
      const node: Extract<Stmt, { kind: "if" }> = { kind: "if", line, branches: [[cond, []]], else: null };
      stack.push({ kind: "if", line, node, parent: currentBody() });
      continue;
    }

    const body = currentBody();

    // ----- 단순 문장
    if (s === "어쩔티비" || s === "저쩔티비") {
      if (!inLoop()) throw new BamtiError(line, `${s}는 반복 블록 안에서만 쓸 수 있음`);
      body.push({ kind: s === "어쩔티비" ? "break" : "continue", line });
      continue;
    }
    if (s.startsWith("오이쉬에") || s.startsWith("오이시")) {
      if (!inDef()) throw new BamtiError(line, "오이시는 함수 안에서만 쓸 수 있음");
      const rest = s.startsWith("오이쉬에") ? s.slice("오이쉬에".length) : s.slice("오이시".length);
      body.push({ kind: "return", line, expr: parseExprText(rest, line) });
      continue;
    }
    if (s.startsWith("오이데")) {
      const p = new ExprParser(s.slice("오이데".length), line);
      if (!/^['"]/.test(p.peek())) p.error("오이데 뒤에는 함수 이름(문자열)이 와야 함");
      const name = p.parseString();
      const args: Expr[] = [];
      if (!p.atEnd()) {
        for (;;) {
          args.push(p.parseExpr(new Set(["?"])));
          if (p.atEnd()) break;
          p.expect("?", "인자 구분");
        }
      }
      body.push({ kind: "call", line, name, args });
      continue;
    }
    const m = EXIT_RE.exec(s);
    if (m) { body.push({ kind: "exit", line, expr: parseExprText(m[1], line) }); continue; }
    if (s.startsWith("홍명보 나가")) {
      const rest = s.slice("홍명보 나가".length).trim();
      body.push({ kind: "abort", line, expr: rest ? parseExprText(rest, line) : null });
      continue;
    }
    if (s.startsWith("킹받네")) {
      const rest = s.slice("킹받네".length);
      body.push({ kind: "throw", line, expr: rest.trim() ? parseExprText(rest, line) : null });
      continue;
    }
    if (s.startsWith("전장연 도와줘")) {
      const rest = s.slice("전장연 도와줘".length).trim();
      body.push({ kind: "assert", line, expr: rest ? parseExprText(rest, line) : null });
      continue;
    }
    if (s.startsWith("할렐야루")) {
      const p = new ExprParser(s.slice("할렐야루".length), line);
      const a = parseVarRef(p);
      p.expect("?", "할렐야루 구분");
      const b = parseVarRef(p);
      if (!p.atEnd()) p.error(`읽을 수 없는 글자 '${p.peek()}'`);
      body.push({ kind: "swap", line, a, b });
      continue;
    }
    if (s.startsWith("거제 야호")) {
      const rest = s.slice("거제 야호".length).trim();
      body.push({ kind: "debug", line, expr: rest ? parseExprText(rest, line) : null });
      continue;
    }
    if (s === "김치ㅋ") { body.push({ kind: "print", line, expr: null, mode: "newline" }); continue; }
    if (s.startsWith("싹싹김치")) {
      body.push({ kind: "print", line, expr: parseExprText(s.slice("싹싹김치".length), line), mode: "line" });
      continue;
    }
    if (s.startsWith("김치")) {
      if (s.endsWith("!")) body.push({ kind: "print", line, expr: parseExprText(s.slice(2, -1), line), mode: "raw" });
      else if (s.endsWith("ㅋ")) body.push({ kind: "print", line, expr: parseExprText(s.slice(2, -1), line), mode: "char" });
      else throw new BamtiError(line, "김치 문장은 !나 ㅋ로 끝나야 함");
      continue;
    }
    if (s.startsWith("집합")) {
      const p = new ExprParser(s.slice("집합".length), line);
      const target = parseVarRef(p);
      p.expect("?", "집합 구분");
      const idx = p.parseExpr(new Set(["?"]));
      p.expect("?", "집합 구분");
      const value = p.parseExpr(new Set());
      if (!p.atEnd()) p.error(`읽을 수 없는 글자 '${p.peek()}'`);
      body.push({ kind: "listset", line, target, idx, value });
      continue;
    }
    const am = /^(어*)엄/.exec(s);
    if (s.startsWith("엌") || am) {
      let target: VarRef;
      let rest: string;
      if (am) {
        target = { k: "var", n: am[1].length + 1 };
        rest = s.slice(am[0].length);
      } else {
        const p = new ExprParser(s.slice(1), line);
        const idx = p.parseExpr(new Set(["ㅋ"]));
        p.expect("ㅋ", "엌 인덱스 닫기");
        target = { k: "dvar", idx };
        rest = p.s.slice(p.pos);
      }
      const value = rest === "긁?" ? { k: "input_int" as const }
        : rest === "긁ㅋ" ? { k: "input_str" as const }
        : parseExprText(rest, line);
      body.push({ kind: "assign", line, target, value });
      continue;
    }
    throw new BamtiError(line, `읽을 수 없는 문장 '${s}'`);
  }

  if (stack.length) throw new BamtiError(stack[stack.length - 1].line, "블록이 닫히지 않음");
  return { top, functions };
}

// ---------------------------------------------------------------- 실행기

export interface IO {
  readLine(): string | null;         // null = EOF
  stdout(text: string): void;
  stderr(text: string): void;
}

export interface RunOptions {
  /** 실행할 문장 수 상한. 브라우저가 멈추지 않도록 막는 안전장치. 0이면 무제한. */
  maxSteps?: number;
}

function typeName(v: Value): string {
  return typeof v === "bigint" ? "정수" : typeof v === "string" ? "문자열" : "리스트";
}

function pyRepr(v: Value): string {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string") {
    const q = v.includes("'") && !v.includes('"') ? '"' : "'";
    let out = q;
    for (const ch of v) {
      if (ch === "\\") out += "\\\\";
      else if (ch === "\n") out += "\\n";
      else if (ch === "\t") out += "\\t";
      else if (ch === "\r") out += "\\r";
      else if (ch === q) out += "\\" + q;
      else out += ch;
    }
    return out + q;
  }
  return "[" + v.map(pyRepr).join(", ") + "]";
}

export function toText(v: Value): string {
  return typeof v === "string" ? v : pyRepr(v);
}

function truthy(v: Value): boolean {
  return typeof v === "bigint" ? v !== 0n : v.length > 0;
}

function valuesEqual(a: Value, b: Value): boolean {
  if (typeof a !== typeof b) return false;
  if (typeof a === "bigint" || typeof a === "string") return a === b;
  const bl = b as Value[];
  return a.length === bl.length && a.every((x, i) => valuesEqual(x, bl[i]));
}

function pyIndex(len: number, i: bigint): number {
  const n = Number(i);
  const j = n < 0 ? len + n : n;
  if (j < 0 || j >= len) return -1;
  return j;
}

function pySlice<T extends string | Value[]>(seq: T, a: bigint, b: bigint): T {
  const len = seq.length;
  const norm = (x: bigint) => {
    let n = Number(x);
    if (n < 0) n += len;
    return Math.min(Math.max(n, 0), len);
  };
  return seq.slice(norm(a), norm(b)) as T;
}

function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q;
}

function pyMod(a: bigint, b: bigint): bigint {
  const r = a % b;
  return (r !== 0n && (r < 0n) !== (b < 0n)) ? r + b : r;
}

function repeat<T extends string | Value[]>(seq: T, n: bigint): T {
  if (n <= 0n) return seq.slice(0, 0) as T;
  const times = Number(n);
  if (typeof seq === "string") return seq.repeat(times) as T;
  const out: Value[] = [];
  for (let i = 0; i < times; i++) out.push(...seq);
  return out as T;
}

export class Interpreter {
  vars = new Map<number, Value>();
  depth = 0;
  steps = 0;
  maxSteps: number;

  functions: Program["functions"];
  io: IO;

  constructor(functions: Program["functions"], io: IO, opts: RunOptions = {}) {
    this.functions = functions;
    this.io = io;
    this.maxSteps = opts.maxSteps ?? 0;
  }

  // --- 변수
  getVar(n: number, line: number): Value {
    if (n < 1) throw new BakwiError(line, `변수 번호는 1 이상이어야 함 (${n})`);
    return this.vars.get(n) ?? 0n;
  }

  resolve(ref: VarRef, line: number): number {
    if (ref.k === "var") return ref.n;
    const idx = this.eval(ref.idx, line);
    if (typeof idx !== "bigint") throw new BakwiError(line, "엌 인덱스는 정수여야 함");
    if (idx < 1n) throw new BakwiError(line, `변수 번호는 1 이상이어야 함 (${idx})`);
    return Number(idx);
  }

  // --- 산술
  add(a: Value, b: Value, line: number): Value {
    if (typeof a === "bigint" && typeof b === "bigint") return a + b;
    if (typeof a === "string" && typeof b === "string") return a + b;
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    throw new BakwiError(line, `${typeName(a)}과(와) ${typeName(b)}은(는) 더할 수 없음`);
  }

  mul(a: Value, b: Value, line: number): Value {
    if (typeof a === "bigint" && typeof b === "bigint") return a * b;
    if (typeof a === "bigint" && typeof b !== "bigint") [a, b] = [b, a];
    if (typeof a !== "bigint" && typeof b === "bigint") return repeat(a, b);
    throw new BakwiError(line, `${typeName(a)}과(와) ${typeName(b)}은(는) 곱할 수 없음`);
  }

  // --- 식
  eval(node: Expr, line: number): Value {
    switch (node.k) {
      case "int": return node.v;
      case "str": return node.v;
      case "var": return this.getVar(node.n, line);
      case "dvar": return this.getVar(this.resolve(node, line), line);
      case "list": return node.items.map(e => this.eval(e, line));
      case "not": return truthy(this.eval(node.e, line)) ? 0n : 1n;
      case "add": {
        let v = this.eval(node.atoms[0], line);
        for (const e of node.atoms.slice(1)) v = this.add(v, this.eval(e, line), line);
        return v;
      }
      case "mul": {
        let v = this.eval(node.terms[0], line);
        for (const e of node.terms.slice(1)) v = this.mul(v, this.eval(e, line), line);
        return v;
      }
      case "call": return this.builtin(node.name, node.args.map(e => this.eval(e, line)), line);
      case "fcall": return this.callFunction(node.name, node.args.map(e => this.eval(e, line)), line);
    }
  }

  builtin(name: string, args: Value[], line: number): Value {
    const a = args[0];
    const b = args[1];
    switch (name) {
      case "밤티":
        return typeof a === "bigint" ? (a < 0n ? 1n : 0n) : (a.length === 0 ? 1n : 0n);
      case "개야르":
        return typeof a === "bigint" ? (a > 0n ? 1n : 0n) : (a.length > 0 ? 1n : 0n);
      case "몇":
        return typeof a === "bigint" ? BigInt((a < 0n ? -a : a).toString().length) : BigInt([...a].length);
      case "크크루삥뽕": {
        if (typeof a !== "bigint") throw new BakwiError(line, "크크루삥뽕은 정수만 받음");
        if (a < 1n) throw new BakwiError(line, "크크루삥뽕의 인자는 1 이상이어야 함");
        return BigInt(Math.floor(Math.random() * Number(a)));
      }
      case "말해주세요":
        return typeof a === "string" ? a : pyRepr(a);
      case "긁": {
        if (typeof a === "bigint") return a;
        if (typeof a === "string") {
          if (/^\s*[+-]?\d+\s*$/.test(a)) return BigInt(a.trim());
          throw new BakwiError(line, `정수로 읽을 수 없는 문자열 ${pyRepr(a)}`);
        }
        throw new BakwiError(line, "긁은 리스트를 받지 않음");
      }
      case "사꾸": {
        if (typeof a === "bigint") {
          if (a < 0n || a > 0x10FFFFn) throw new BakwiError(line, `코드포인트 범위 밖 (${a})`);
          return String.fromCodePoint(Number(a));
        }
        if (typeof a === "string") {
          const cps = [...a];
          if (cps.length !== 1) throw new BakwiError(line, "사꾸에 넣는 문자열은 한 글자여야 함");
          return BigInt(cps[0].codePointAt(0)!);
        }
        throw new BakwiError(line, "사꾸는 리스트를 받지 않음");
      }
      case "판별법":
        return valuesEqual(a, b) ? 1n : 0n;
      case "박위": {
        if (typeof a === "bigint" && typeof b === "bigint") {
          if (b === 0n) throw new BakwiError(line, "0으로 나눔");
          return pyMod(a, b);
        }
        throw new BakwiError(line, "박위는 정수만 받음");
      }
      case "너도": {
        if (typeof a === "string" && typeof b === "string") {
          const idx = a.indexOf(b);            // 파이썬 find, 코드포인트 단위 위치
          return idx < 0 ? -1n : BigInt([...a.slice(0, idx)].length);
        }
        if (Array.isArray(a)) {
          const i = a.findIndex(x => valuesEqual(x, b));
          return BigInt(i);
        }
        throw new BakwiError(line, "너도는 (문자열, 문자열)이나 (리스트, 값)만 받음");
      }
      case "섹시푸드": {
        if (args.length === 3) {
          const c = args[2];
          if (typeof a !== "bigint" && typeof b === "bigint" && typeof c === "bigint") {
            if (typeof a === "string") {
              const cps = [...a];
              return pySlice(cps, b, c).join("");
            }
            return pySlice(a, b, c);
          }
          throw new BakwiError(line, "슬라이스는 (문자열이나 리스트, 정수, 정수)만 받음");
        }
        if (typeof a === "bigint" && typeof b === "bigint") {
          if (b === 0n) throw new BakwiError(line, "0으로 나눔");
          return floorDiv(a, b);
        }
        if (typeof a !== "bigint" && typeof b === "bigint") {
          const seq = typeof a === "string" ? [...a] : a;
          const j = pyIndex(seq.length, b);
          if (j < 0) throw new BakwiError(line, `인덱스 범위 밖 (${b})`);
          return seq[j];
        }
        throw new BakwiError(line, "섹시푸드는 (정수, 정수)나 (문자열이나 리스트, 정수)만 받음");
      }
    }
    throw new BakwiError(line, `모르는 내장 함수 ${name}`);
  }

  // --- 함수
  callFunction(name: string, args: Value[], line: number): Value {
    const fn = this.functions.get(name);
    if (!fn) throw new BakwiError(line, `'${name}'라는 함수가 없음`);
    if (this.depth >= MAX_DEPTH) throw new BakwiError(line, "재귀가 너무 깊음");
    const saved: Array<[number, Value | undefined]> = [];
    for (let i = 1; i <= args.length; i++) saved.push([i, this.vars.get(i)]);
    args.forEach((v, i) => this.vars.set(i + 1, v));
    this.depth++;
    try {
      this.execBlock(fn.body);
      return 0n;
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    } finally {
      this.depth--;
      for (const [i, old] of saved) {
        if (old === undefined) this.vars.delete(i);
        else this.vars.set(i, old);
      }
    }
  }

  // --- 문장
  execBlock(stmts: Stmt[]): void {
    for (const st of stmts) this.execStmt(st);
  }

  execStmt(st: Stmt): void {
    if (this.maxSteps > 0 && ++this.steps > this.maxSteps) throw new StepLimit();
    const line = st.line;
    switch (st.kind) {
      case "assign": {
        const value: Value = st.value.k === "input_int" ? this.readInt(line)
          : st.value.k === "input_str" ? this.readStr()
          : this.eval(st.value, line);
        this.vars.set(this.resolve(st.target, line), value);
        return;
      }
      case "listset": {
        const n = this.resolve(st.target, line);
        const lst = this.getVar(n, line);
        const idx = this.eval(st.idx, line);
        if (!Array.isArray(lst) || typeof idx !== "bigint") {
          throw new BakwiError(line, "집합 원소 대입은 (리스트 변수, 정수 인덱스)만 됨");
        }
        const j = pyIndex(lst.length, idx);
        if (j < 0) throw new BakwiError(line, `인덱스 범위 밖 (${idx})`);
        lst[j] = this.eval(st.value, line);
        return;
      }
      case "print":
        this.doPrint(st.expr, st.mode, line);
        return;
      case "debug": {
        const msg = st.expr === null ? "거제 야호" : toText(this.eval(st.expr, line));
        this.io.stderr(msg + "\n");
        return;
      }
      case "if": {
        for (const [cond, body] of st.branches) {
          if (truthy(this.eval(cond, line))) { this.execBlock(body); return; }
        }
        if (st.else !== null) this.execBlock(st.else);
        return;
      }
      case "while": {
        while (truthy(this.eval(st.cond, line))) {
          try { this.execBlock(st.body); }
          catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      }
      case "repeat": {
        const n = this.eval(st.count, line);
        if (typeof n !== "bigint") throw new BakwiError(line, "파라파라 횟수는 정수여야 함");
        for (let i = 0n; i < n; i++) {
          try { this.execBlock(st.body); }
          catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      }
      case "def":
        return;
      case "call":
        this.callFunction(st.name, st.args.map(e => this.eval(e, line)), line);
        return;
      case "return":
        throw new ReturnSignal(this.eval(st.expr, line));
      case "break":
        throw new BreakSignal();
      case "continue":
        throw new ContinueSignal();
      case "exit": {
        const code = this.eval(st.expr, line);
        if (typeof code !== "bigint") throw new BakwiError(line, "종료 코드는 정수여야 함");
        throw new ExitSignal(Number(code));
      }
      case "abort": {
        const code = st.expr === null ? 1n : this.eval(st.expr, line);
        if (typeof code !== "bigint") throw new BakwiError(line, "종료 코드는 정수여야 함");
        throw new ExitSignal(Number(code));
      }
      case "throw":
        throw new KingError(st.expr === null ? "" : toText(this.eval(st.expr, line)));
      case "assert": {
        const ok = st.expr === null ? false : truthy(this.eval(st.expr, line));
        if (!ok) throw new KingError(`전장연 도와줘 (${line}번째 줄)`);
        return;
      }
      case "swap": {
        const n1 = this.resolve(st.a, line), n2 = this.resolve(st.b, line);
        const v1 = this.getVar(n1, line), v2 = this.getVar(n2, line);
        this.vars.set(n1, v2); this.vars.set(n2, v1);
        return;
      }
      case "try": {
        try {
          try { this.execBlock(st.body); }
          catch (e) {
            if (!(e instanceof BakwiError || e instanceof KingError) || st.catchBody === null) throw e;
            if (st.catchTarget !== null) this.vars.set(this.resolve(st.catchTarget, line), e.message);
            this.execBlock(st.catchBody);
          }
        } finally {
          if (st.finallyBody !== null) this.execBlock(st.finallyBody);
        }
        return;
      }
    }
  }

  // --- 입출력
  doPrint(node: Expr | null, mode: "raw" | "char" | "line" | "newline", line: number): void {
    if (mode === "newline") { this.io.stdout("\n"); return; }
    const v = this.eval(node!, line);
    if (mode === "raw") this.io.stdout(toText(v));
    else if (mode === "line") this.io.stdout(toText(v) + "\n");
    else {
      if (typeof v === "bigint") {
        if (v < 0n || v > 0x10FFFFn) throw new BakwiError(line, `코드포인트 범위 밖 (${v})`);
        this.io.stdout(String.fromCodePoint(Number(v)));
      } else if (typeof v === "string") this.io.stdout(v);
      else throw new BakwiError(line, "김치…ㅋ는 리스트를 찍을 수 없음");
    }
  }

  readStr(): string {
    const s = this.io.readLine();
    return s === null ? "" : s;
  }

  readInt(line: number): bigint {
    const s = this.io.readLine();
    if (s === null) return 0n;
    const t = s.trim();
    if (/^[+-]?\d+$/.test(t)) return BigInt(t);
    throw new BakwiError(line, `정수가 아닌 입력 ${pyRepr(t)}`);
  }
}

// ---------------------------------------------------------------- 진입점

export interface RunResult { code: number; }

/** 소스를 실행하고 종료 코드를 돌려준다. 오류 메시지는 io.stderr로. */
export function run(source: string, io: IO, opts: RunOptions = {}): RunResult {
  let program: Program;
  try {
    program = parseProgram(source);
  } catch (e) {
    if (e instanceof BamtiError) { io.stderr(e.message + "\n"); return { code: 1 }; }
    throw e;
  }
  const it = new Interpreter(program.functions, io, opts);
  try {
    it.execBlock(program.top);
  } catch (e) {
    if (e instanceof ExitSignal) return { code: e.code };
    if (e instanceof BakwiError || e instanceof KingError) { io.stderr(e.message + "\n"); return { code: 1 }; }
    if (e instanceof StepLimit) {
      io.stderr(`박위상태: 실행이 너무 길어서 멈춤 (${opts.maxSteps}문장 초과)\n`);
      return { code: 1 };
    }
    if (e instanceof RangeError) { io.stderr("박위상태: 재귀가 너무 깊음\n"); return { code: 1 }; }
    throw e;
  }
  return { code: 0 };
}

/** 문자열 입력을 줄 단위로 주는 간단한 IO. 결과는 out/err에 쌓인다. */
export function createBufferIO(input: string): IO & { out: string; err: string } {
  const lines = input.length ? input.split(/\r?\n/) : [];
  if (input.endsWith("\n")) lines.pop();
  let i = 0;
  const io = {
    out: "",
    err: "",
    readLine(): string | null { return i < lines.length ? lines[i++] : null; },
    stdout(t: string) { io.out += t; },
    stderr(t: string) { io.err += t; },
  };
  return io;
}

import { describe, expect, it } from "vitest";
import { createBufferIO, run } from "../src/interpreter";
import { EXAMPLES } from "../src/examples";

function exec(code: string, input = "") {
  const io = createBufferIO(input);
  const { code: exit } = run(code, io);
  return { out: io.out, err: io.err, exit };
}

const H = "어머니 저 똥꼬에서 김치가 나옵니다";

describe("명세 예제", () => {
  for (const ex of EXAMPLES) {
    it(ex.title, () => {
      const r = exec(ex.code, ex.input ?? "");
      expect(r.out).toBe(ex.expected);
      expect(r.exit).toBe(0);
    });
  }
});

describe("종료와 예외", () => {
  it("줴줴이야 종료 코드", () => expect(exec(`${H}; 아 줴줴이야...~`).exit).toBe(3));
  it("홍명보 나가", () => expect(exec(`${H}; 홍명보 나가`).exit).toBe(1));
  it("킹받네", () => {
    const r = exec(`${H}; 킹받네'매출이 이게 뭐야'`);
    expect(r.err).toBe("난리도아냐: 매출이 이게 뭐야\n");
    expect(r.exit).toBe(1);
  });
  it("전장연 도와줘 잡기", () => {
    const r = exec(`${H}; 야르?; 전장연 도와줘감다뒤; 야르렁어?; 싹싹김치어; 그러시구나`);
    expect(r.out).toBe("난리도아냐: 전장연 도와줘 (1번째 줄)\n");
    expect(r.exit).toBe(0);
  });
  it("야를레이히는 줴줴이야에도 실행", () => {
    const r = exec(`${H}; 야르?; 줴줴이야..; 야를레이히?; 싹싹김치'bye'; 그러시구나`);
    expect(r.out).toBe("bye\n");
    expect(r.exit).toBe(2);
  });
  it("자료형 오류", () => expect(exec(`${H}; 싹싹김치'a'..`).err).toMatch(/^박위상태 \(1번째 줄\)/));
  it("무한 반복 안전장치", () => {
    const io = createBufferIO("");
    expect(run(`${H}; 누가 돌아왔게감다살?; 엄어.; 검은흑곰`, io, { maxSteps: 1000 }).code).toBe(1);
    expect(io.err).toMatch(/실행이 너무 길어서/);
  });
});

describe("문법 오류", () => {
  const bad = (src: string, re: RegExp) => expect(exec(src).err).toMatch(re);
  it("첫 줄 누락", () => bad(`싹싹김치'x'`, /첫 줄은/));
  it("첫 줄 두 번", () => bad(`${H}; ${H}`, /한 번만/));
  it("숫자", () => bad(`${H}; 싹싹김치76`, /67뿐/));
  it("괄호 위치", () => bad(`${H}; 싹싹김치어.,~어어 ,~`, /항의 맨 앞/));
  it("블록 닫기 종류", () => bad(`${H}; 예감다살?; 싹싹김치'x'; 검은흑곰`, /검은흑곰/));
  it("닫히지 않은 블록", () => bad(`${H}; 예감다살?; 싹싹김치'x'`, /닫히지 않음/));
  it("반복 밖 어쩔티비", () => bad(`${H}; 어쩔티비`, /반복 블록 안/));
  it("함수 밖 오이시", () => bad(`${H}; 오이시`, /함수 안/));
});

describe("식", () => {
  const val = (e: string) => exec(`${H}; 엄..; 어엄.....; 싹싹김치${e}`).out.trim();
  it("우선순위", () => { expect(val("어. ...")).toBe("9"); expect(val("어.,어어")).toBe("7"); });
  it("괄호", () => { expect(val("~어 어어~.")).toBe("11"); expect(val("~어어 ,~어")).toBe("-3"); expect(val("~~어어.~ ..~.")).toBe("13"); });
  it("67", () => { expect(val("67,,")).toBe("65"); expect(val("사꾸67,,ㅋ")).toBe("A"); });
  it("문자열", () => { expect(val("'김치' ...")).toBe("김치김치김치"); expect(val("'어머니'\" \"'김치'")).toBe("어머니 김치"); });
  it("리스트", () => { expect(val("집합.?..ㅋ집합...ㅋ")).toBe("[1, 2, 3]"); expect(val("집합감다뒤ㅋ ...")).toBe("[0, 0, 0]"); });
  it("나눗셈과 나머지는 파이썬 규칙", () => {
    expect(val("섹시푸드,,,,,,,?..ㅋ")).toBe("-4");
    expect(val("박위,,,,,,,?...ㅋ")).toBe("2");
  });
  it("찾기·슬라이스", () => {
    expect(val("너도'김치찌개'?'찌개'ㅋ")).toBe("2");
    expect(val("너도'abc'?'z'ㅋ")).toBe("-1");
    expect(val("섹시푸드'김치찌개'?감다뒤?..ㅋ")).toBe("김치");
  });
  it("아뇨", () => { expect(val("아뇨어")).toBe("0"); expect(val("아뇨~어어 ,~.")).toBe("1"); });
  it("큰 정수", () => expect(val("67 67 67 67 67 67 67 67 67 67 67 67")).toBe("8182718904632857144561"));
});

describe("함수", () => {
  it("매개변수와 복원", () => {
    const r = exec(`${H}; 맛떼루요'팩'?; 예아뇨어?; 오이시감다살; 그러시구나; 오이시어 오이데'팩'어,ㅋ; 그러시구나; 엄'전역'; 싹싹김치오이데'팩'.....ㅋ; 싹싹김치어`);
    expect(r.out).toBe("120\n전역\n");
  });
  it("교환·디버그", () => {
    const r = exec(`${H}; 엄'a'; 어엄'b'; 할렐야루어?어어; 싹싹김치어''어어; 거제 야호어`);
    expect(r.out).toBe("ba\n");
    expect(r.err).toBe("b\n");
  });
});

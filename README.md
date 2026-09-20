# SAR 플레이그라운드

2026년 밈으로 만든 난해한 프로그래밍 언어 **SAR** 의 TypeScript 인터프리터와 브라우저 플레이그라운드입니다.
서버 없이 브라우저 안에서만 실행되며, 빌드 결과는 `dist/index.html` 파일 하나입니다.

- 언어 명세: 「SAR 언어 명세」 문서
- 레퍼런스 구현: `gg.py` (파이썬). 이 저장소의 `src/interpreter.ts`는 같은 문법·동작을 따르고, 예제 8개와 오류 케이스를 테스트로 대조합니다.

## 로컬에서 돌리기

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: 명세 예제 8개 + 오류·식·함수 테스트
npm run build      # dist/index.html 한 파일로 빌드
npm run preview    # 빌드 결과 미리 보기
```

터미널에서 바로 실행 (Node 22.18 이상):

```bash
npm run cli -- examples/ex8.gg
npm run cli -- -c "어머니 저 똥꼬에서 김치가 나옵니다; 싹싹김치'안녕'"
```

## 버셀 배포 (GitHub 연동)

- 저장소: https://github.com/kwondoyun07/sar-playground
- 배포 주소: https://sar-playground.vercel.app

1. 이 폴더를 GitHub 저장소로 올립니다.
   ```bash
   git init && git add -A && git commit -m "SAR 플레이그라운드"
   git branch -M main
   git remote add origin https://github.com/<계정>/<저장소>.git
   git push -u origin main
   ```
2. [vercel.com](https://vercel.com) → **Add New… → Project** → 방금 올린 GitHub 저장소를 **Import**.
3. 프레임워크가 **Vite**로 자동 감지됩니다(`vercel.json`에도 적혀 있음). 빌드 명령 `npm run build`, 출력 폴더 `dist` 그대로 두고 **Deploy**.
4. 이후 `main`에 푸시할 때마다 자동으로 다시 배포되고, PR마다 미리 보기 주소가 생깁니다.

## 폴더 구조

```
index.html            페이지 뼈대
src/interpreter.ts    인터프리터 (어휘 분석 → 문장 파서 → 실행기)
src/main.ts           플레이그라운드 UI (편집창, 실행, 예제, 치트시트, 링크 복사)
src/examples.ts       명세 예제 8개 (UI 메뉴와 테스트가 공유)
src/cheatsheet.ts     치트시트 데이터
src/style.css         스타일 (라이트/다크 자동)
tests/                vitest 테스트
scripts/cli.mjs       터미널 실행기
examples/             예제 .gg 파일
```

## 플레이그라운드 사용법

- **실행**: 버튼 또는 `Ctrl+Enter` (Mac은 `Cmd+Enter`)
- **입력**: `긁?`·`긁ㅋ`는 입력창을 한 줄씩 읽습니다
- **예제 불러오기**: 명세 예제 8개를 골라 바로 실행
- **링크 복사**: 코드를 URL에 담아 공유 (`#code=…`)
- 편집 중인 코드는 브라우저에 저장되어 다시 열어도 남습니다
- 무한 반복을 막기 위해 한 번에 500만 문장까지만 실행합니다

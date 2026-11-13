# 저장소 테스트의 CommonJS import 린트 오류

## 기본 정보

- 기능: 최초 설정과 로컬 저장 / Issue #1
- 발생일: 2026-11-13 / 상태: 해결
- 환경: Node.js 24, 프로젝트 ESLint 설정

## 재현과 결과

1. SQLite 저장소의 실패·재실행 테스트를 CommonJS 파일로 작성한다.
2. `npm run test:storage`는 통과하지만 `npm run lint`가 `@typescript-eslint/no-require-imports` 오류를 반환한다.

## 원인과 해결

- 원인: 현재 ESLint 설정은 테스트 파일에서도 `require()` import를 허용하지 않는다.
- 해결: 테스트를 ES module 형식으로 바꾸고 Node의 내장 모듈과 TypeScript를 `import`로 불러온다.
- 변경 파일: `tests/storage.test.mjs`, `package.json`.

## 확인

- 수정 후 저장소 테스트 3개와 린트가 통과했다.

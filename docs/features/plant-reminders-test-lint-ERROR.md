# 알림 서비스 JavaScript 테스트 반환 타입 린트 오류

- 상태: 수정·재검증 완료 / 관련: [알림 PLAN](plant-reminders-PLAN.md)

## 현상과 원인

알림 서비스의 모의 객체와 비동기 처리를 검증하는 `.mjs` 테스트를 추가한 뒤 `npm run lint`에서 TypeScript 함수 반환 타입을 명시하라는 오류가 발생했다. JavaScript 파일에는 TypeScript의 반환 타입 문법을 쓸 수 없는데 공통 규칙이 테스트 보조 함수에도 적용됐다.

## 수정

해당 JavaScript 테스트 파일에만 반환 타입 규칙 예외를 명시했다. 실제 TypeScript 앱 코드의 타입 검사와 다른 린트 규칙은 그대로 유지한다. `npm run lint`와 알림 테스트를 재실행해 통과했다.

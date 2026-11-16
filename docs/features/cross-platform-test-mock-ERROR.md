# OS 기준 분리 후 정원 창 테스트 모듈 오류

- 상태: 수정·재검증 완료 / 관련: [Windows·Linux 지원 결과](cross-platform-REPORT.md)

## 현상과 원인

정원 창의 클릭 통과 조건을 `src/shared/platform.ts`로 옮긴 뒤 `npm run test:update`의 "macOS 업데이트 종료 이벤트" 테스트가 `Cannot find module '../../shared/platform'`으로 실패했다. 이 테스트는 `gardenWindow.ts`만 임시 변환하고 의존 모듈은 가짜 객체로 바꾸는데, 새 모듈이 가짜 목록에 없어 TypeScript 파일을 그대로 불러오려 했다.

## 수정

테스트의 가짜 모듈 목록에 `../../shared/platform`을 추가했다. 이 테스트는 종료 이벤트만 확인하므로 실제 지원 판단은 필요 없다. 업데이트 테스트 9개가 다시 통과했다.

# macOS 패키지 검사 스크립트 린트 오류

- 발생일: 2026-11-13 / 상태: 해결 / 관련: [패키지 충돌](initial-setup-packaged-qa-timeout-ERROR.md)

새 JavaScript 검사 스크립트의 화살표 함수에 대해 프로젝트 TypeScript 린트 규칙이 반환 타입 누락을 보고했다. JavaScript에는 타입 문법을 추가할 수 없으므로 작은 함수 호출을 직접 작성해 오류를 해결했다. 이후 린트와 실제 패키지 검사를 다시 실행했다. 앱 런타임 오류는 아니었다.

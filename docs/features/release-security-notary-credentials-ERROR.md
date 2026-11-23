# 보안 패치 후보의 로컬 공증 인증 오류

- 2026-11-23 · 정식 배포 전 검증.

Electron 44.11.5 앱을 학교 Developer ID로 서명한 뒤, 기존 `hanzanhae-notary` 키체인 프로필로 Apple에 제출했을 때 `HTTP 401 Invalid credentials`가 나왔다. 같은 프로필로 직접 공증 이력을 조회해도 같은 오류가 재현됐다.

로컬 서명과 패키지 구성은 공증을 제외한 빌드에서 검증한다. 로컬 공증을 다시 실행하려면 유효한 Apple 앱 암호로 기존 키체인 프로필을 갱신한다. GitHub Actions는 `macos-release` 환경에 등록한 앱 암호를 별도로 사용한다.

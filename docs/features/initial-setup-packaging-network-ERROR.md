# macOS 패키징 중 Electron 다운로드 실패

## 기본 정보

- 기능: 최초 설정과 로컬 저장 / Issue #1
- 발생일: 2026-11-13 / 상태: 해결
- 환경: macOS arm64, electron-builder, 제한된 네트워크 환경

## 재현과 결과

1. `npm run build:unpack`으로 macOS 앱 묶음을 만든다.
2. electron-builder가 Electron 배포 파일을 내려받는 단계에서 `getaddrinfo ENOTFOUND github.com` 오류가 발생한다.

## 원인과 해결

- 원인: 실행 환경의 네트워크 제한으로 GitHub 다운로드에 접근할 수 없었다.
- 해결: 네트워크 접근이 가능한 실행으로 동일한 패키징 명령을 다시 실행했다. 코드 서명은 이번 로컬 검증에서 비활성화했다.
- 변경 파일: 없음.

## 확인

- 네트워크 접근으로 arm64 macOS 앱 묶음 생성은 가능했다. 다만 서명을 생략한 해당 묶음은 이후 서명 무결성 검사에 실패해 앱을 실행하지 않는다.
- `npm run build:unpack:mac:local`에 해당하는 ad-hoc 서명 옵션으로 새 앱 묶음을 만들었고 서명 무결성 검사를 통과했다. 실제 앱 실행은 아직 미확인이다.
- 코드 서명·공증과 DMG 설치 검증은 이 결과에 포함되지 않는다.

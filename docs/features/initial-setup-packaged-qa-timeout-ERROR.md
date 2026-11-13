# macOS 패키지 앱 실행 충돌

## 기본 정보

- 기능: 최초 설정과 로컬 저장 / Issue #1
- 발생·조사일: 2026-11-13 / 상태: 로컬 수정·검증 완료
- 환경: macOS 26.6.1 arm64, Electron 44.11.1, electron-builder 26.18.0

## 증상

개발 Electron은 실행되지만 패키지 앱은 시작 중 `EXC_BREAKPOINT` / `SIGTRAP`으로 종료됐고, macOS 충돌 창이 표시됐다. 서명하지 않은 패키지와 ad-hoc 서명을 적용한 패키지 모두에서 발생했다. 따라서 서명 유무만이 원인은 아니었다.

## 원인과 근거

- electron-builder 26에서 한글 제품명의 `CFBundleName`은 조합형(NFC), 디스크의 보조 앱 이름은 분해형(NFD)으로 생성됐다. 두 이름은 화면에서는 같지만 바이트 단위로 달랐다.
- Electron은 앱 이름을 기준으로 Renderer·GPU 등의 보조 앱을 찾는다. 동일한 원리와 수정은 [electron-builder 수정 PR #9962](https://github.com/electron-userland/electron-builder/pull/9962)에 설명되어 있다.
- 기존 패키지에서 이름의 바이트 불일치를 직접 확인했다. 임시 복사본에서 `CFBundleName`만 보조 앱 이름과 일치시키고 다시 ad-hoc 서명하자 프로세스가 유지되고 격리된 데이터 폴더에 SQLite 파일이 생성됐다.
- 빌드 설정에 같은 조치를 적용해 새 패키지를 만들었다. 이름 일치와 서명 무결성을 확인했고 최초 설정·두 창 표시·SQLite 저장·종료 후 재실행 복원에 성공했다. 이 대조 실험은 이름 불일치가 충돌 원인이라는 강한 근거다.
- 이전 충돌 기록에 표시된 SQLite 등 함수명은 매우 큰 오프셋이 붙은 심볼이어서 실제 호출 위치로 단정하지 않는다.

## 수정

- `electron-builder.yml`의 macOS `extendInfo.CFBundleName`을 분해형 한글로 지정해 보조 앱 이름과 일치시켰다. `CFBundleDisplayName`은 `한잔해`로 유지된다.
- `scripts/check-mac-bundle.mjs`는 앱 이름과 네 보조 앱의 실제 이름·실행 파일·서명 무결성을 확인한다. `npm run check:mac:bundle -- "dist/mac-arm64/한잔해.app"`으로 실행할 수 있다.
- 임시 우회이므로 제품명을 바꾸거나 electron-builder를 업데이트할 때 이 설정과 검사 결과를 함께 재검토한다. upstream 수정은 메이저 버전 변경을 포함하므로 무작정 업그레이드하지 않았다.

## 검증과 남은 범위

- 수정 전 패키지는 이름 검사에서 실패했고 수정 후 패키지는 검사와 `codesign --verify --deep --strict`를 통과했다.
- 기존 사용자 데이터 대신 별도의 임시 폴더로 패키지 앱을 실행해 목표 1,600ml·한 잔 200ml 설정, 대시보드와 정원 갱신, 종료 후 재실행 복원을 확인했다.
- `npm run build`, `npm run test:storage` 7개와 린트를 확인했다. 테스트 중 패키지 앱에서 `NODE_OPTIONS --require` 자동 종료 훅은 지원되지 않아 사용하지 않았고, 최초 실험은 타임아웃 후 종료했다. 최종 테스트는 해당 옵션 없이 실행했다.
- 격리 환경에서 Electron 다운로드가 막혀 새 패키지는 현재 설치된 `node_modules/electron/dist`를 `electronDist`로 지정해 만들었다. 최초 다운로드가 필요한 환경에서는 네트워크가 필요하다.
- 로컬 ad-hoc 서명 검증이다. Developer ID 서명·공증, DMG 설치 및 다른 Mac 칩은 아직 검증하지 않았다.

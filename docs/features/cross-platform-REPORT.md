# Windows·Linux 지원 결과

## 무엇을 바꿨나

- `src/shared/platform.ts`에 기능별 지원 OS(로그인 항목·자동 업데이트·정원 클릭 통과·화면 잠금 감지)와 OS별 문구(Dock/작업 표시줄, 알림·카메라 설정 위치)를 모았다. main 프로세스와 화면이 같은 기준을 쓴다.
- 로그인 시 자동 실행: macOS·Windows 설치 앱에서 사용한다. Linux는 설정 화면에 "Linux에서는 지원하지 않아요"를 표시한다.
- 자동 업데이트: macOS만 유지한다. Windows·Linux에서 업데이트 확인을 누르면 미지원과 직접 설치를 안내한다.
- 트레이: Windows·Linux는 macOS 단색 템플릿 아이콘 대신 앱 아이콘을 쓴다(어두운 작업 표시줄에서 검은 아이콘이 안 보이므로). Windows는 왼쪽 클릭으로 대시보드를 연다.
- 정원 창: Linux는 클릭 통과(forward)를 지원하지 않아 설정 화면에 안내한다. 화면 잠금 이벤트가 오지 않는 Linux도 "잠금 중에도 생기가 평소 속도로 줄어요"를 안내한다.
- 화면 문구: 알림·카메라 권한 안내, "Dock 위", "이 Mac에서만"을 OS에 맞게 바꿨다. Windows·Linux는 기본 제목 표시줄을 쓰므로 대시보드 사이드바의 macOS 창 버튼 자리를 숨긴다.
- preload가 `window.hanzanhae.platform`(process.platform)을 공개한다.
- `electron-builder.yml`: Windows `nsis`, Linux `AppImage`·`deb`(snap 제거, 실행 파일 이름 `hanzanhae`, maintainer 정리). `package.json`: `build:win`·`build:linux`에 `--x64 --publish never`, `build:unpack:win`·`build:unpack:linux`, `test:platform` 추가.

## 점검했지만 바꾸지 않은 것

- 경로: DB·백업·CSV 경로는 모두 `path.join`과 `app.getPath`를 쓰고 파일 이름에 `:` 같은 Windows 금지 문자가 없다.
- 줄바꿈: CSV는 BOM + LF다. Windows Excel도 읽을 수 있어 그대로 둔다(저장소 파일 `database.ts`는 다른 작업과 겹쳐 손대지 않았다).
- 폰트: 페이퍼로지를 앱에 포함해 OS 글꼴에 의존하지 않는다.
- 전역 단축키는 이미 OS별 표시(⌘/Ctrl)와 등록 실패 안내가 있다.
- SQLite는 Electron 내장 `node:sqlite`라 OS별 네이티브 모듈 빌드가 필요 없다.

## 검증 결과

- `npm run typecheck`, `npm run lint`(기존 `tests/storage.test.mjs` 포맷 경고 2개 외 문제 없음) 통과.
- 테스트: storage 49, camera 30, position 4, reminders 12, update 9, platform 2 모두 통과.
- `electron-vite build` 통과.
- 이 Mac에서 `electron-builder --win --x64`로 `hanzanhae-1.0.0-setup.exe`, `--linux --x64`로 AppImage·deb 생성까지 확인했다(서명 없음).

## 확인 불가

- Windows·Linux에서의 실제 설치·실행 전부. 투명 정원 창(Linux는 컴포지터 필요), 항상 위 표시, 트레이 표시·클릭, 알림의 표시·클릭 이벤트, 카메라 권한, Windows 로그인 항목의 실제 실행, Linux Wayland의 전역 단축키·창 위치 지정.
- Windows의 클릭 통과는 Electron이 지원하는 기능이지만 이 앱에서 동작하는지는 확인하지 못했다.

## 화면 확인(가짜 API)

- 빌드한 화면을 브라우저에서 가짜 API로 열어 확인했다(Electron 미실행). `linux`: "작업 표시줄 위", 로그인 항목 "Linux에서는 지원하지 않아요", 위젯 동작의 미지원 안내, "이 컴퓨터에서만", 테스트 알림의 미지원 안내, 사이드바 창 버튼 자리 숨김. `darwin`: "Dock 위", 미지원 안내 없음, 창 버튼 자리 유지.

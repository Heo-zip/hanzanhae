# 현재 작업 상태

> 진행: [#47](https://github.com/Heo-zip/hanzanhae/issues/47) 카메라 감지를 오늘 마신 횟수에 자동 기록하고 사이드바에서 되돌리기를 제공한다. 가짜 API 화면으로 기록·되돌리기·실패 안내를 확인했고 실제 카메라 확인이 남았다.

> 완료: [#45](https://github.com/Heo-zip/hanzanhae/issues/45) 패키지 보안·성능 정리. Electron fuses(RunAsNode·NODE_OPTIONS·--inspect 차단, asar 무결성 검사·asar 전용 실행) 적용, 불필요한 macOS 권한 2개 제거, MediaPipe 중복 포함 제거(app.asar 54.8MB → 31.9MB), 카메라를 켠 동안만 대시보드 백그라운드 제한 해제, SQL 문 재사용. 로컬 ad-hoc 패키지 실행은 확인했고 서명 앱의 카메라 동작은 미확인이다.

> 완료: [#41](https://github.com/Heo-zip/hanzanhae/issues/41) 로그인 시 자동 실행 설정을 연결했다. 브라우저 화면(가짜 API)으로 켜기·끄기·실패 복구를 확인했고, 패키징 앱의 실제 로그인 실행은 수동 확인이 남았다. develop에 병합했다.

> 완료: [#40](https://github.com/Heo-zip/hanzanhae/issues/40) 목표 멈추기 확인을 브라우저 기본 창에서 앱 모달로 바꿨다. 브라우저 화면(가짜 API)으로 열기·목표 바꾸기 이동·멈추기 저장을 확인했다. [PR #42](https://github.com/Heo-zip/hanzanhae/pull/42)로 develop에 병합했다.

> 완료: [#38](https://github.com/Heo-zip/hanzanhae/issues/38) 전체 레이아웃 다듬기. 설정 화면 2열 배치(카메라·알림은 전체 폭), 사이드바 폭 208px, 텀블러 비우기 호버를 테두리만 진하게. 히어로는 시도 후 사용자 요청으로 기존 디자인을 유지했다. 첫 실행 2~4단계가 위로 쏠린 원인(언덕 장식 넘침 + 입력칸 자동 포커스 스크롤)을 `overflow: clip`으로 고쳤다. 사용자 확인 후 병합했다.

> 완료: [#36](https://github.com/Heo-zip/hanzanhae/issues/36) 카메라 물 마시기 감지(고개·손목 단계)는 [PR #37](https://github.com/Heo-zip/hanzanhae/pull/37)로 develop에 병합했다. 감지 횟수는 저장하지 않으며 정확도 측정과 실제 기록 연결이 후속이다.

> 완료: [#34](https://github.com/Heo-zip/hanzanhae/issues/34) 하루 횟수 목표와 텀블러 기록 분리는 [PR #35](https://github.com/Heo-zip/hanzanhae/pull/35)로 develop에 병합했다.

> 2026-11-14 기준 코드와 이번 대화의 검증 기록을 바탕으로 정리했다. 작업 후 변경된 내용과 검증 범위를 갱신한다.

## 서비스와 실행 환경

- 로그인·서버 없이 Mac에서 물 마시기와 식물 성장을 돕는 앱을 목표로 한다.
- Electron, React, TypeScript, electron-vite와 npm을 사용한다. 실행은 `npm run dev`다.
- 제품 기능·저장 규칙은 [기능 명세](features.md), UI는 `design/garden.html`과 `design/dashboard.html`을 기준으로 한다. 사용자 요청으로 변경한 부분은 최신 요청을 따른다.

## 구현된 기능과 미리보기

- 첫 실행에서 목표 횟수와 텀블러 용량을 입력한다. 대시보드는 횟수와 용량을 별도로 추가·취소하며, 물의 양만 식물 성장에 반영한다. 기존 ml 기록과 성장은 보존하고 횟수로 환산하지 않는다.
- 160×220 투명 정원 창에 화분을 표시하고, 물뿌리개로 텀블러 용량을 기록한다. 저장 성공 후 물방울 연출이 나온다.
- 정원 빈 영역의 클릭 통과, 우클릭 숨기기, 메뉴 막대의 표시·숨김과 대시보드 열기, Dock 재열기, `⌘ + ⌥ + ⇧ + H` 전역 단축키를 연결했다. 등록 실패는 메뉴 막대에서 안내한다.
- 정원은 일반 창 위·Dock 아래에 표시하고 전체 화면을 포함한 작업 공간에 보이도록 macOS 패널로 설정한다. 사용자가 전체 화면 문제의 수정 후 동작을 확인했다. 직접 끌어 옮긴 위치와 항상 위 여부를 저장하며 화면 밖 위치를 복구한다. 설정에서 Dock 위·화면 바닥을 선택할 수 있다.
- 식물 상태 기반 알림의 설정·저장·시간 조건과 시스템 알림 요청을 구현했다. 기본은 꺼짐이며 사용자가 알림 표시와 클릭 후 대시보드 열기를 확인했다. 간격 경과 후 자동 알림은 [권한 오류 기록](features/plant-reminders-macos-permission-ERROR.md)을 참고해 확인한다.
- 알림 간격 화살표를 정렬하고 시작·종료 시간에 24시간·1분 단위 선택창을 적용했다. 별도 데이터의 macOS Electron에서 화면, 키보드 조작, 저장과 재실행 복원을 확인했다.
- macOS 개발 실행에서 서명된 별도 Electron을 사용하도록 바꿨다. 사용자가 macOS의 개발 앱 알림을 허용한 뒤 정상 작동을 확인했다. 장시간 후 자동 발송은 추가 확인이 필요하다. [오류 기록](features/plant-reminders-development-signature-ERROR.md)
- 화분 커서 문제에 클릭 통과 해제 후 커서 재계산과 화분 호버 표시를 적용했다. 실제 macOS 커서와 클릭·드래그 회귀는 확인이 남았다. [오류 기록](features/garden-cursor-feedback-ERROR.md)
- macOS 앱의 업데이트 확인·선택적 다운로드·재시작과 스키마 이전 전 로컬 DB 백업을 구현하고 격리 테스트했다. 배포 전용 공개 저장소는 생성했지만 실제 릴리스와 Developer ID 서명 앱 간 업데이트 검증은 아직 없다. [결과](features/auto-update-REPORT.md)

## 아직 구현하지 않은 기능

- 생기와 성장에 사용한 수치는 사용하며 조정할 임시값이다.
- Dock 자동 숨김·확대에 맞춘 실시간 위치 추적. [향후 실험](features.md#정원과-창)으로 남아 있다.
- 완전히 종료된 앱의 알림은 지원하지 않는다. 카메라 감지는 오늘 마신 횟수에 자동 기록하지만(#47) 오감지·놓침 측정은 남았다.

## 검증과 제한

- [Issue #27](https://github.com/Heo-zip/hanzanhae/issues/27)에서 임시 데이터의 실제 Electron으로 최초 설정·물 기록·목표 달성·최근 취소·전체 취소·재실행과 정원에서 대시보드로의 기록 동기화를 확인했다. 저장소 34개·정원 위치 3개·알림 12개 테스트와 린트·빌드를 통과했다. [통합 검증 결과](features/mvp-integration-REPORT.md)

- Issue #15에서 저장소 테스트 31개·좌표 테스트 3개, 실제 Electron의 테스트 입력 드래그·실패·숨기기·재실행과 로컬 macOS arm64 ad-hoc 패키지를 확인했다. 물리 마우스와 실제 다중 모니터 QA는 남았다.

- Issue #13에서 저장소 테스트 28개, 실제 Electron의 날짜별 차트·물컵·기록·취소·목표 변경·실패 재시도, macOS arm64 로컬 ad-hoc 패키지의 차트·취소·재실행을 확인했다. 사용자 직접 QA는 남았다.

- Issue #7에서 저장소 테스트 25개, 실제 Electron의 성장 단계·두 창 갱신·전체 취소, 로컬 macOS arm64 ad-hoc 패키지의 성장·취소·복원을 확인했다. 사용자 QA는 남았다.

- Issue #5에서 저장소 테스트 18개, 개발 Electron의 최근·전체 취소와 정원 되돌리기·실패 재시도·재실행을 확인했다. 로컬 macOS arm64 ad-hoc 패키지에서도 정원 최근 취소·전체 취소·재실행을 확인했다. 사용자가 기존 취소 기능 QA를 통과했으며, 이후 수정한 전체 취소 모달은 시안 비교와 실제 Electron의 상태별 자동 검사로 확인했다.

- Issue #2에서 저장소 자동 테스트 11개, 개발 Electron의 정원·대시보드 기록·중복 클릭·실패·재시도·재실행을 확인했다. macOS arm64 로컬 ad-hoc 패키지에서도 물 기록·두 창 갱신·재실행을 확인했다.

- Issue #1에서 저장소 자동 테스트 7개, 타입 검사·린트·빌드를 통과했다. 임시 데이터의 실제 개발 Electron에서 빈 입력 차단·저장 실패 시 롤백과 입력 유지·재시도·정원 갱신·재실행 복원·DB 열기 실패 안내를 확인했다. 새 화면의 최초 설정, 목표 변경·중단·재생성, 총량 조정, 한 잔 용량 변경과 재실행 복원도 별도 임시 데이터로 확인했다.
- macOS arm64 패키지의 `SIGTRAP`은 앱과 보조 앱 이름의 한글 정규화 불일치로 확인됐다. 빌드 설정 수정 후 로컬 ad-hoc 패키지에서 첫 설정·두 창·저장·재실행 복원이 통과했다. Developer ID 서명·공증·DMG 설치와 다른 칩은 미검증이며 [오류 기록](features/initial-setup-packaged-qa-timeout-ERROR.md)을 따른다.
- 물뿌리개 방향 변경 후 빌드와 타입 검사는 통과했다. 변경된 방향의 실제 macOS 창 시각 확인은 이 기록만으로 확인되지 않는다.
- Dock 자동 숨김·확대와 실제 다중 모니터에서의 공존은 별도 수동 확인이 필요하다.

## 작업 공간

- #1 [PR #3](https://github.com/Heo-zip/hanzanhae/pull/3)과 #2 [PR #4](https://github.com/Heo-zip/hanzanhae/pull/4)는 `develop`에 병합됐다. #5는 최근 한 잔과 전체 취소를 구현하고 검증했다. 현재 브랜치와 병합 상태는 Git과 PR에서 확인한다.
- `design/`은 로컬에만 두고 Git 추적에서 제외했다. 새 클론에는 시안이 없다.
- 현재 계획은 [다음 작업](NEXT_TASK.md), 영속적인 결정은 [결정 기록](DECISION_RECORD.md)에서 확인한다. 브랜치와 변경 상태는 작업 시작 때 다시 확인한다.

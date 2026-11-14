# 다음 작업

> 이 문서는 현재 진행 상태와 바로 이어갈 일을 관리한다. 전체 순서는 [MVP 개발 순서](roadmap.md)를 따른다.

## 완료한 작업: 정원 위치와 창 설정

- [Issue #15](https://github.com/Heo-zip/hanzanhae/issues/15)에서 위치 이동·저장·화면 밖 복구와 위치 프리셋·항상 위 설정을 연결했고 사용자가 확인했다.
- 실제 다중 모니터와 Dock 반응은 사용자 환경 확인 또는 별도 실험이 필요하다.
- 전체 화면에서 정원이 보이지 않는 현상에 패널을 적용했고 사용자가 수정 후 문제가 없다고 확인했다. [오류 기록](features/garden-position-fullscreen-ERROR.md)

## 구현한 작업: 대시보드 통계

- [Issue #13](https://github.com/Heo-zip/hanzanhae/issues/13)에서 7일 그래프·물컵, 평균·달성 횟수·최다일·전체 연속 달성을 연결했다. 자동 검사와 패키지 검증을 마쳤다. 사용자 직접 QA 결과는 아직 확인되지 않았다.
- 목표가 없는 날·오늘 진행 중 처리 등 첫 구현 기준은 [통계 계획](features/water-statistics-PLAN.md)에 정리했다.

## 구현한 작업: 식물 생기와 성장

- [Issue #7](https://github.com/Heo-zip/hanzanhae/issues/7)에서 성장·생기를 임시 기준으로 연결하고 자동 검증했다. 사용자 직접 QA 결과는 아직 확인되지 않았다.
- `design/`은 로컬에 남기고 Git에서 제외했다. 첫 실행 화면의 콘텐츠는 창 중앙에 정렬했다.

## 완료한 작업: 물 기록 취소

- [Issue #5](https://github.com/Heo-zip/hanzanhae/issues/5)의 최근 한 잔과 오늘 현재 목표 기록 전체 취소를 구현했다. 정원 되돌리기와 대시보드 취소, 전체 취소 확인과 두 창 갱신을 연결했다.
- 저장소 테스트 18개, 개발 Electron과 로컬 macOS arm64 ad-hoc 패키지의 취소·재실행을 확인했다. 사용자의 취소 기능 QA 이후 모달 시안을 반영하고 자동·시각 검증했다.
- #1 [PR #3](https://github.com/Heo-zip/hanzanhae/pull/3)과 #2 [PR #4](https://github.com/Heo-zip/hanzanhae/pull/4)는 develop에 병합됐다.
- Developer ID 서명·공증과 DMG 설치, 다른 칩의 패키지 동작은 별도 확인한다.

## 그다음 작업

1. 첫 설정부터 물 기록·취소·성장·통계·재실행까지 MVP 전체 흐름을 직접 사용하며 점검한다.
2. Dock 위치 반응 실험, 실제 Mac 환경 검증과 패키징은 관련 준비 상태에 따라 진행한다.

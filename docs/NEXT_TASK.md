# 다음 작업

> 이 문서는 현재 진행 상태와 바로 이어갈 일을 관리한다. 전체 순서는 [MVP 개발 순서](roadmap.md)를 따른다.

## 완료한 작업: 물 기록 취소

- [Issue #5](https://github.com/Heo-zip/hanzanhae/issues/5)의 최근 한 잔과 오늘 현재 목표 기록 전체 취소를 구현했다. 정원 되돌리기와 대시보드 취소, 전체 취소 확인과 두 창 갱신을 연결했다.
- 저장소 테스트 18개, 개발 Electron과 로컬 macOS arm64 ad-hoc 패키지의 취소·재실행을 확인했다. 사용자의 취소 기능 QA 이후 모달 시안을 반영하고 자동·시각 검증했다.
- #1 [PR #3](https://github.com/Heo-zip/hanzanhae/pull/3)과 #2 [PR #4](https://github.com/Heo-zip/hanzanhae/pull/4)는 develop에 병합됐다.
- Developer ID 서명·공증과 DMG 설치, 다른 칩의 패키지 동작은 별도 확인한다.

## 그다음 작업

1. 생기·성장과 통계 연결. 미정인 수치는 사용하며 결정한다. 성장 구현 시 취소 트랜잭션에도 연관 성장을 함께 반영한다.
2. Dock 위치 반응 실험, 실제 Mac 환경 검증과 패키징은 관련 준비 상태에 따라 진행한다.

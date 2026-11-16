# 기능별 문서

새 기능의 계획은 개발 전에 작성하고, 실제 오류와 기능 완료 결과는 발생 시점에 기록한다. 생성 조건과 전체 흐름은 [문서 작성 규칙](../DOCUMENTATION_RULES.md)과 [작업 흐름](../WORKFLOW.md)을 따른다.

```text
initial-setup-PLAN.md
initial-setup-db-open-ERROR.md  # 해당 오류가 실제 발생한 경우에만
initial-setup-REPORT.md        # 기능 구현과 검증을 마친 뒤
```

- 기능명·오류명은 소문자 kebab-case다. PLAN·REPORT는 기능별, ERROR는 실제 오류별이다.
- 실제 오류가 없으면 ERROR를 만들지 않는다. 단순 버그 수정에는 기능 REPORT를 강제하지 않는다.
- 템플릿: [PLAN](../templates/FEATURE_PLAN_TEMPLATE.md), [ERROR](../templates/DEVELOPMENT_ERROR_TEMPLATE.md), [REPORT](../templates/RESULT_REPORT_TEMPLATE.md).

## 기능 목록

| 기능                  | 계획                                  | 결과                                      | 관련 오류 기록                                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 최초 설정과 로컬 저장 | [PLAN](initial-setup-PLAN.md)         | [REPORT](initial-setup-REPORT.md)         | [초기 조회 린트](initial-setup-react-effect-lint-ERROR.md), [테스트 import](initial-setup-test-require-lint-ERROR.md), [패키징 네트워크](initial-setup-packaging-network-ERROR.md), [패키지 실행 충돌](initial-setup-packaged-qa-timeout-ERROR.md) |
| 최초 설정·설정 화면   | [PLAN](setup-settings-design-PLAN.md) | [REPORT](setup-settings-design-REPORT.md) | [CSS](setup-settings-design-css-ERROR.md), [검증 데이터](setup-settings-design-test-clone-ERROR.md), [검증 타이밍](setup-settings-design-test-timing-ERROR.md)                                                                                     |
| 물 한 잔 기록         | [PLAN](water-record-PLAN.md)          | [REPORT](water-record-REPORT.md)          | [테스트 계약](water-record-test-contract-ERROR.md)                                                                                                                                                                                                 |
| 물 기록 취소          | [PLAN](water-cancel-PLAN.md)          | [REPORT](water-cancel-REPORT.md)          | [이전 테스트](water-cancel-test-migration-ERROR.md)                                                                                                                                                                                                |
| 식물 생기와 성장      | [PLAN](plant-growth-PLAN.md)          | [REPORT](plant-growth-REPORT.md)          | [테스트 데이터](plant-growth-test-fixture-ERROR.md), [화면 빌드](plant-growth-ui-build-ERROR.md)                                                                                                                                                   |
| 생기 개편과 정원 감지 알림 | 결정 020 | [REPORT](plant-vitality-REPORT.md) | [테스트 이전](plant-vitality-test-migration-ERROR.md) |
| 물 섭취 통계          | [PLAN](water-statistics-PLAN.md)      | [REPORT](water-statistics-REPORT.md)      | [린트](water-statistics-lint-ERROR.md), [차트 툴팁](water-statistics-tooltip-ERROR.md)                                                                                                                                                             |
| 정원 위치와 창 설정   | [PLAN](garden-position-PLAN.md)       | [REPORT](garden-position-REPORT.md)       | [전체 화면](garden-position-fullscreen-ERROR.md), [위치 복원](garden-position-restore-ERROR.md), [검증 입력](garden-position-test-input-ERROR.md), [린트](garden-position-lint-ERROR.md)                                                           |

- 식물 알림: [PLAN](plant-reminders-PLAN.md), [REPORT](plant-reminders-REPORT.md), [macOS 알림 거부](plant-reminders-macos-permission-ERROR.md), [테스트 모듈](plant-reminders-test-import-ERROR.md), [테스트 린트](plant-reminders-test-lint-ERROR.md). 실제 표시·클릭을 사용자가 확인했고 간격 경과 후 자동 알림 검증은 남아 있다.
- 개발 앱 알림 실패: [개발용 Electron 서명 오류](plant-reminders-development-signature-ERROR.md), [격리 검증 인자](plant-reminders-dev-test-arguments-ERROR.md), [개발 스크립트 린트](plant-reminders-dev-script-lint-ERROR.md).
- MVP 통합 검증: [PLAN](mvp-integration-PLAN.md), [REPORT](mvp-integration-REPORT.md).
- 앱 업데이트: [PLAN](auto-update-PLAN.md), [REPORT](auto-update-REPORT.md), [패키징 네트워크 오류](auto-update-packaging-network-ERROR.md), [테스트 린트 오류](auto-update-test-lint-ERROR.md).
- 정원 커서: [오류 기록](garden-cursor-feedback-ERROR.md). 실제 macOS 마우스 확인은 남아 있다.
- 공통 패키지 검사: [패키지 검사 린트 오류](packaged-bundle-check-lint-ERROR.md).
- 계획과 결과는 해당 작업 시점의 기록이다. 이후 달라진 현재 동작·검증 범위는 [현재 상태](../CONTEXT.md)에서 확인한다.

- 횟수 목표와 텀블러 기록 분리: [PLAN](drink-count-goal-PLAN.md), [REPORT](drink-count-goal-REPORT.md), [이전 테스트 오류](drink-count-goal-test-migration-ERROR.md). 카메라 자동 감지는 후속 작업이다.

- 카메라 자동 감지 (고개 방식 실험 중): [PLAN](camera-drink-detection-PLAN.md), [REPORT](camera-drink-detection-REPORT.md), [현재 기술 구현 기록](camera-drink-detection-TECH.md), [로컬 모델 로딩 오류](camera-drink-detection-local-wasm-ERROR.md), [텀블러 감지 누락](camera-drink-detection-recognition-ERROR.md), [미리보기 ref 린트](camera-drink-detection-preview-lint-ERROR.md).

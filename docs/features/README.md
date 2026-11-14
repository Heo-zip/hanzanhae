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
| 물 섭취 통계          | [PLAN](water-statistics-PLAN.md)      | [REPORT](water-statistics-REPORT.md)      | [린트](water-statistics-lint-ERROR.md), [차트 툴팁](water-statistics-tooltip-ERROR.md)                                                                                                                                                             |
| 정원 위치와 창 설정   | [PLAN](garden-position-PLAN.md)       | [REPORT](garden-position-REPORT.md)       | [전체 화면](garden-position-fullscreen-ERROR.md), [위치 복원](garden-position-restore-ERROR.md), [검증 입력](garden-position-test-input-ERROR.md), [린트](garden-position-lint-ERROR.md)                                                           |

- 공통 패키지 검사: [패키지 검사 린트 오류](packaged-bundle-check-lint-ERROR.md).
- 계획과 결과는 해당 작업 시점의 기록이다. 이후 달라진 현재 동작·검증 범위는 [현재 상태](../CONTEXT.md)에서 확인한다.

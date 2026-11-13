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

- [최초 설정과 로컬 저장 PLAN](initial-setup-PLAN.md): Issue #1, 구현 및 개발 실행 검증. 패키지 앱 검증은 진행 중이다.
- 최초 설정 오류: [React 초기 조회 린트](initial-setup-react-effect-lint-ERROR.md), [테스트 import 린트](initial-setup-test-require-lint-ERROR.md), [패키징 네트워크](initial-setup-packaging-network-ERROR.md), [패키지 자동 검증 시간 초과](initial-setup-packaged-qa-timeout-ERROR.md).

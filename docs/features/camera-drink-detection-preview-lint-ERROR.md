# 개발 중 오류 보고서: 카메라 미리보기 ref 린트

## 기본 정보

- 기능: 카메라 물 마시기 행동 감지
- 발생일: 2026-11-15
- 심각도: 낮음 / 상태: 해결
- 관련: [PLAN](camera-drink-detection-PLAN.md), [Issue #36](https://github.com/Heo-zip/hanzanhae/issues/36)

## 환경과 재현

설정 화면에서 카메라 상태 객체의 콜백을 canvas의 `ref`에 직접 전달한 뒤 같은 객체의 상태를 JSX에서 읽자 `react-hooks/refs` 검사가 실패했다.

## 원인과 해결

린트가 ref 콜백을 사용한 객체의 다른 필드까지 렌더 중 ref 접근으로 판단했다. canvas와 ref 콜백을 작은 컴포넌트로 분리해 상태 렌더링과 DOM ref 연결을 구분했다.

## 검증

분리 후 `npm run lint`를 통과했다. 미리보기에서 실제 카메라 영상의 가독성과 감지 결과는 사용자 확인이 필요하다.

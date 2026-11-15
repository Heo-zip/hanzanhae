# 기능 결과 리포트: 카메라 물 마시기 감지 (고개·손목 단계)

> 판정 방식 개선과 설정 화면 개편까지의 결과다. 자동 기록은 연결하지 않았고 정확도 수치는 측정하지 않았다. 실행하지 않은 검증은 통과로 쓰지 않는다.

## 기본 정보

- 기능명: `camera-drink-detection`
- 작성일: 2026-11-16
- 관련: [PLAN](camera-drink-detection-PLAN.md), [TECH](camera-drink-detection-TECH.md), [인식 오류·트러블슈팅](camera-drink-detection-recognition-ERROR.md), [로컬 모델 로딩 오류](camera-drink-detection-local-wasm-ERROR.md), [미리보기 ref 린트](camera-drink-detection-preview-lint-ERROR.md)
- Issue·브랜치: [#36](https://github.com/Heo-zip/hanzanhae/issues/36), `feature/camera-drink-detection` (미커밋)

## 구현 결과

- 판정: 용기를 잡은 손이 입으로 온 뒤, 평소보다 고개를 젖힌 상태가 유지되다가 손을 내리면 마신 동작 1회로 센다. 얼굴을 놓치면 자세 모델의 코·귀·어깨로 대신 보고, 용기를 든 손이 얼굴을 가리면 마시는 자세로 본다. 버전별 방법과 모든 설정값은 [오류 보고서](camera-drink-detection-recognition-ERROR.md)에 있다.
- 모델: EfficientDet-Lite0(용기), Face Landmarker, Pose Landmarker Lite. 프레임당 3개, 앱 포함 모델 16,790,681B.
- 제거: 입·용기 거리 판정, 손 모델, 상자 비율 기울임, 텀블러 영상 등록과 관련 모델 3개. 제거한 코드는 보존하지 않고 문서로만 남겼다.
- 설정 화면: "카메라 감지" 스위치와 개인정보 한 줄. 켜면 영상(얼굴·컵·손·입 표시)과 3단계 진행, `마신 동작 n회`를 바로 보여준다. 실험 설명·상태 칩·미리보기 열기 버튼은 없앴다.
- PLAN과 달라진 점: PLAN은 "기준선 측정 후 한 가지씩 변경"을 제안했지만, 사용자 요청으로 측정 없이 새 방식을 붙여 같은 프레임에서 비교하고 사용자 체감으로 선택했다.
- 후속 범위: 실제 물 기록 연결(확인 후 기록 또는 자동), 배포용 문구·권한 안내, 정확도·성능 측정.

## 변경 파일

| 경로 | 변경 내용 |
| --- | --- |
| `src/renderer/src/features/camera/drinkDetection.ts` | 고개 각도·자세 대체·가림·용기 잡음과 단계 판정 (`SipDetector` 등) |
| `src/renderer/src/features/camera/useCameraDetection.ts` | 모델 3개 실행, 판정 연결, 미리보기 그리기, 마신 동작 횟수 |
| `src/main/camera/security.ts` | 앱 내부 모델 허용 목록을 현재 3개 모델로 제한 |
| `src/renderer/src/assets/models/` | Face·Pose 모델 추가, BlazeFace·Hand·MobileNet 삭제, 출처·해시 갱신 |
| `src/renderer/src/features/dashboard/Dashboard.tsx`, `dashboard.css` | 카메라 설정 화면 개편 (`CameraView`) |
| `tests/camera-detection.test.mjs`, `tests/camera-security.test.mjs`, `package.json` | 새 판정 테스트, 허용·차단 모델 테스트, 등록 테스트 제거 |

## 검증 결과

| 시나리오·명령 | 환경 | 결과 | 근거·제한 |
| --- | --- | --- | --- |
| `npm run test:camera` | Node.js 24.14.1 | 통과 | 16개. 단계 전이, 쿨다운, 끊김·가림, 자세 대체, 모델 허용·차단 |
| `npm run test:storage` | Node.js 24.14.1 | 통과 | 43개. 카메라 변경과 무관한 회귀 확인 |
| 타입 검사·린트·빌드 | `npm run typecheck`, `npx eslint .`, `npx electron-vite build` | 통과 | 빌드 결과에 모델 3개만 포함 확인 |
| 실제 마시기 인식 | 사용자 Mac 카메라, 개발 실행 | 통과(정성) | 사용자가 v2.1을 "제일 좋음"으로 확인. 놓침·오감지 횟수 미측정 |
| 앱 나머지 기능 QA | 사용자 Mac, 개발 실행 | 통과 | 사용자가 "나머지 QA는 다 잘 작동"으로 확인 (2026-11-16) |
| 개편한 설정 화면 | 정적 목업 1280×800 | 통과(모양) | 배치·색·단계 강조 확인. 실제 카메라와 함께 본 화면은 미확인 |
| 앱 종료·재실행, 카메라 해제 | — | 미실행 | 이번 변경에서 정리 로직은 유지. 재확인 필요 |
| CPU·메모리·배터리 | — | 미측정 | 모델 5개 → 3개로 줄었지만 수치 없음 |
| 패키징 앱·카메라 권한 | — | 미실행 | macOS 카메라 권한 안내와 서명 앱은 별도 확인 |

환경: macOS 26.6.1, Apple Silicon arm64, Node.js 24.14.1, Electron 44.11.1, `@mediapipe/tasks-vision` 0.10.21.

## 오류와 제한사항

- [인식 오류](camera-drink-detection-recognition-ERROR.md): 개선됨 · 수치 검증 전.
- [미리보기 ref 린트](camera-drink-detection-preview-lint-ERROR.md): 화면 개편 중 같은 규칙(`react-hooks/refs`)에 다시 걸려, 이전 해결과 같이 캔버스 ref 콜백과 렌더링 값을 별도 props로 넘겨 해결했다.
- 미확인: 빨대·고개를 거의 안 젖히는 음용, 용기를 든 채 하품·얼굴 가리기 오감지, 어깨가 화면 밖일 때, 여러 사람·조명·용기, 실제 기록 연결 시 중복 방지.

## 배운 내용과 유지보수

- **신호 선택**: 마시는 순간 가려지는 신호(병·손·얼굴)에 의존하면 가장 중요한 순간에 판정이 끊긴다. 그 순간 오히려 뚜렷해지는 신호(고개 젖힘)와 가림 자체를 근거로 삼았다.
- **얼굴 변환 행렬**: Face Landmarker의 4×4 열 우선 행렬에서 3열(`data[8..10]`)이 얼굴 정면 방향이고, `data[9]`(y 성분)의 `asin`이 위아래 각도다.
- **개인 기준선**: 카메라 높이·자세가 사람마다 달라 절댓값 대신 "손이 입 근처가 아닐 때의 중앙값"과의 차이를 쓴다. 중앙값은 순간 튀는 값에 덜 흔들린다.
- **단계 상태 기계**: 한 프레임 대신 들기 → 입 → 젖힘 유지 → 내림의 순서를 요구해 오감지를 줄이고, 판단 불가(`null`)는 상태를 바꾸지 않는다.
- 지킬 제약: 정확도 검증 전에는 SQLite 기록을 연결하지 않는다. 영상·좌표를 저장하거나 IPC로 보내지 않는다. 임계값을 바꾸면 TECH에 새 해시와 함께 남긴다.
- 다음 작업: 동작별 `n/N` 측정 → 확인 후 기록 방식 설계 → 배포용 권한·문구 정리.

## 문서 갱신

- [x] CONTEXT·NEXT_TASK를 실제 상태에 맞게 갱신했다.
- [x] PLAN 상태와 TECH 6-1~6-3, ERROR를 갱신했다.
- [ ] DECISION_RECORD: 판정 방식 전환을 결정으로 남길지 사용자 확인 필요.

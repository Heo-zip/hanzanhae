# 개발 중 오류 보고서: 패키지의 MediaPipe 실행 파일 로딩

## 기본 정보

- 기능: 카메라 물 마시기 행동 감지
- 발생일: 2026-11-15
- 심각도: 보통 / 상태: 해결
- 관련: [PLAN](camera-drink-detection-PLAN.md), [Issue #36](https://github.com/Heo-zip/hanzanhae/issues/36)

## 환경과 재현

macOS arm64의 격리된 Electron 앱에서 자동 감지를 켰다. 카메라 권한을 요청하기 전 MediaPipe WASM 초기화가 실패했다. 개발 서버와 달리 패키지 렌더러는 `file:` URL을 사용한다.

```text
failed to asynchronously prepare wasm: both async and sync fetching of the wasm failed
```

## 원인과 해결

렌더러의 `fetch`는 패키지의 `file:` WASM과 모델을 그대로 불러오지 못했다. Electron 메인에 로컬 자산 전용 프로토콜을 등록하고, 빌드된 특정 모델·WASM 파일만 허용 목록으로 제공했다. 경로 이탈과 그 밖의 파일은 거절한다. 외부 모델 서버 요청이나 영상 전송은 없다.

## 검증과 제한

수정 후 동일 격리 앱에서 두 MediaPipe 모델이 초기화되고 카메라가 켜지는 것을 확인했다. 카메라를 끄면 사용 중 표시가 사라지는 것도 확인했다. 실제 컵 감지 정확도는 별도로 측정해야 한다.

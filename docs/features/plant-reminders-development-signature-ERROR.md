# 개발 실행에서 macOS 알림 요청이 거부되는 현상

- 관련 이슈: [#25](https://github.com/Heo-zip/hanzanhae/issues/25)
- 환경: macOS arm64, Electron 44.11.1, `npm run dev`

## 현상과 확인

사용자가 개발 앱의 테스트 알림에서 실패 안내가 계속 나온다고 제보했다. 기존 Electron으로 분리된 진단을 실행하니 `Notification.isSupported()`는 `true`였지만 `failed` 이벤트에 `UNErrorDomain 오류 1`이 반환됐다. 이 값만으로 사용자가 직접 알림을 거부했다고 단정할 수는 없다.

설치된 개발용 Electron의 실행 파일은 linker ad-hoc 서명 상태였으나 앱 묶음의 `codesign --verify --deep --strict` 검증은 통과하지 못했다. [Electron 공식 문서](https://www.electronjs.org/docs/latest/api/notification)는 macOS 알림에 코드 서명이 필요하다고 안내한다.

## 대응

macOS의 `npm run dev`는 Electron 원본을 수정하지 않고 개발 전용 복사본을 준비한다. 이 복사본은 `com.heozip.hanzanhae.dev` 식별자와 `한잔해 개발` 이름을 사용하고 로컬 ad-hoc 서명 후 무결성을 확인한다. Electron 버전과 CPU 아키텍처별로 `node_modules/.cache`에 보관하며, 설치 앱의 식별자와 구분한다. 최초 개발 알림에서는 Mac의 알림 권한을 따로 허용해야 할 수 있다.

서명과 앱 식별자를 동시에 바꿨으므로 둘 중 어느 하나가 단독 원인이었는지는 확정하지 않는다. 개발 앱에서 실패할 경우 시스템 설정의 `한잔해 개발` 알림을 확인하도록 안내한다. 실제 권한이나 macOS 설정은 사용자가 관리한다.

## 검증

- 서명된 개발 앱 진단에서 `show` 이벤트가 발생했다. 이는 OS가 요청을 수락한 확인이며 실제 배너 표시의 독립적인 증거는 아니다.
- 별도 사용자 데이터로 `npm run dev`를 실행하고 설정의 테스트 알림에서 성공 응답을 확인했다. 알림 켜기와 저장도 성공했다.
- 이전 개발 Electron과 서명된 개발 Electron의 기본 앱 이름과 사용자 데이터 경로가 같음을 각각 확인했다. 격리 데이터에서 시작 시간 11:01을 저장하고 재실행해 같은 값과 알림 설정이 복원됐다.
- 시스템 배너가 사용자에게 실제로 표시되는지, 다른 Mac의 권한 상태와 장시간 경과 후 자동 알림은 추가 확인이 필요하다.

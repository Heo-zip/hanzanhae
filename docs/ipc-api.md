# 내부 API 설계

> 상태: 최초 설정·상태 조회·목표 변경·한 잔 용량 변경과 물 한 잔 기록과 취소를 구현했다. 생기·성장은 기존 상태 조회와 기록·취소 API에 포함되며 통계는 `getStatistics`로 조회한다.

현재 preload는 정원 창의 클릭 통과·드래그 시작/이동/종료/취소와 드래그 취소 알림, `hanzanhae.getState`, `hanzanhae.getStatistics`, `hanzanhae.getGardenSettings`, `hanzanhae.updateGardenSettings`, `hanzanhae.onGardenSettingsChanged`, `hanzanhae.completeSetup`, `hanzanhae.updateSettings`, `hanzanhae.recordCup`, `hanzanhae.cancelWater`, `hanzanhae.onStateChanged`, `hanzanhae.onWaterRecorded`를 공개한다. 메인은 정해진 앱 화면과 메인 프레임을 검증하며, 최초 설정과 설정 변경 쓰기는 대시보드에서만 허용한다. 상태는 최초 설정 전·활성 목표·목표 없음으로 나누고 실패는 `VALIDATION_ERROR`·`ALREADY_CONFIGURED`·`STALE_STATE`·`STORAGE_ERROR`로 반환한다. 최초 설정의 같은 요청은 최초 성공 결과를, 설정 변경의 같은 요청은 현재 상태를 반환한다. 호출자는 현재 상태를 다시 조회한다. 설정 변경 API의 `kind`는 `cup`, `stop`, `goal`이며, 목표 변경은 화면에 표시한 목표 ID·한국 날짜·기존 총량이 현재와 일치할 때만 처리한다.

정원 위치 설정 조회·변경은 대시보드 메인 프레임에만 허용한다. 드래그 요청은 정원 메인 프레임에서만 허용하고 좌표를 검증한다. 변경 완료 시에만 저장하며 실패하면 이전 창 위치·항상 위 상태로 복구한다.

정원 창은 `setMousePassthrough`로 투명 영역의 클릭 통과를 전환한다. 메인이 통과를 해제하면 `onMouseCaptureReady`로 정원 렌더러에 알려 커서 스타일을 다시 계산한다. 이 알림은 물 기록이나 창 위치를 변경하지 않는다. 실제 macOS에서 커서와 클릭 통과 확인은 남아 있다.

알림 설정은 `getReminderSettings`, `updateReminderSettings`로 조회·저장하고 `testReminder`로 테스트한다. 모두 대시보드 메인 프레임만 호출할 수 있다. 설정은 사용 여부·1~8시간 간격·한국 시간 시작과 종료를 검증하며 `VALIDATION_ERROR` 또는 `STORAGE_ERROR`를 반환한다. 알림을 처음 켰을 때는 확인 알림을 요청하고, 저장 성공과 별도로 표시 성공·실패를 응답에 포함한다. 테스트 알림은 `UNSUPPORTED`·`NOTIFICATION_ERROR`를 추가로 반환하며 발송 간격 기록을 바꾸지 않는다. macOS 개발 앱의 요청 실패는 `DEV_NOTIFICATION_ERROR`, 설정 활성화 시에는 `development-failed`로 구분해 개발 앱의 알림 설정을 안내한다. 이는 오류가 권한 때문이라고 확정하는 코드는 아니다. 사용자가 패키지 앱의 macOS 알림 표시·클릭을 확인했고 간격 경과 후 자동 알림은 추가 확인한다.

## 원칙

React는 preload가 공개한 기능만 호출한다. 메인은 화면의 입력을 다시 검증하고 데이터 저장을 책임진다. 내부 IPC이므로 HTTP 주소나 HTTP 상태 코드를 사용하지 않는다. 원시 `ipcRenderer`나 임의 SQL 호출은 노출하지 않는다.

구현한 응답은 `AppResult`의 `{ ok: true, state }` 또는 `{ ok: false, code }`다. 후속 기능의 응답 형식 제안:

```ts
type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
```

대시보드에는 한국 날짜, 활성 목표 또는 없음, 오늘 총량, 남은 양, 달성 여부, 최근 취소 가능한 기록과 식물 상태를 포함한다. 목표가 없을 때 달성 여부와 남은 양의 표시 방식은 화면에서 구분한다.

## 후속 설계와 구현 기능 대응

아래 표는 기능 단위 설계다. `getStatistics`는 대시보드 메인 프레임에만 허용하며 최근 7일 날짜별 총량·목표·달성, 평균·달성 횟수·최다일·전체 연속 달성을 반환한다. 실패 시 `VALIDATION_ERROR` 또는 `STORAGE_ERROR`를 반환한다. 현재 목표 중단·재생성은 `updateSettings`의 `stop`·`goal`로 처리한다. 물 기록은 `recordCup`, 취소는 `cancelWater`의 `latest`·`today`로 구현했다. 상태에는 식물 단계·생기·성장점이 포함되고 물 기록 취소 시 해당 성장도 합계에서 제외된다.

## 메서드 초안

| 메서드                               | 주요 입력                                            | 처리와 결과                                           |
| ------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------- |
| `getDashboard`                       | 없음                                                 | 오늘 총량, 목표, 식물, 최근 기록 조회                 |
| `completeOnboarding`                 | `requestId`, 목표량, 한 잔 용량                      | 최초 설정·초기 식물·대시보드를 함께 저장              |
| `stopGoal`                           | `requestId`, 목표 ID                                 | 현재 목표 중단. 기존 기록·성장 유지                   |
| `createGoal`                         | `requestId`, 목표량, 입력 총량, 기준 날짜, 기존 총량 | 새 목표 생성과 총량 차이 조정을 함께 저장             |
| `recordCup`                          | `requestId`, 목표 ID, 기준 날짜                      | 설정된 용량으로 한 잔 기록, 성장·생기와 대시보드 반환 |
| `cancelLatestRecord`                 | `requestId`, 목표 ID, 기록 ID, 기준 날짜             | 현재 목표의 오늘 최신 유효 기록과 관련 성장 취소      |
| `cancelTodayGoalRecords`             | `requestId`, 목표 ID, 기준 날짜                      | 오늘 현재 목표의 기록·관련 성장만 취소, 건수 반환     |
| `getSettings`                        | 없음                                                 | 한 잔 용량, 창 고정·위치, 자동 실행 설정 조회         |
| `updateSettings`                     | `requestId`, 변경할 설정                             | 허용된 설정만 검증·저장. 목표 변경은 별도 흐름        |
| `showGarden` / `hideGarden` / `quit` | 각 동작에 필요한 입력                                | 창 표시·숨김 또는 상태 저장 후 앱 종료                |

`createGoal`의 기존 총량은 화면에 표시했던 기준값이다. 처리 시 실제 총량과 다르면 최신 상태를 다시 보여준다. 이미 목표 이상인 총량으로 새 목표를 만들 때 보상은 미정이다.

- `createGoal` 입력 필드 초안은 `requestId`, `targetMl`, `todayTotalMl`, `expectedDateKst`, `expectedCurrentTotalMl`이다. 목표량은 양수 정수이고 입력 총량은 0 이상의 정수다.
- `recordCup`은 `requestId`, `expectedGoalId`, `day`를 받는다. 정원·대시보드의 메인 프레임만 호출할 수 있으며 화면에서 임의의 양을 받지 않고 메인에 저장된 한 잔 용량을 사용한다. 새로운 기록이 커밋된 경우에만 `onWaterRecorded`로 물주기 연출을 알린다. 같은 요청의 재전송은 현재 상태와 `created: false`를 반환한다.
- `cancelWater`의 `latest`는 목표 ID·날짜·최신 기록 ID를, `today`는 목표 ID·날짜·확인한 기록 ID 목록을 받는다. 정원은 `latest`만 호출할 수 있다. 확인한 대상이나 날짜가 달라지면 `STALE_STATE`, 대상이 없으면 `NO_RECORDS`, 조정을 포함한 취소 후 총량이 음수면 `TOTAL_BELOW_ZERO`를 반환한다. 같은 요청의 재전송은 다시 취소하지 않고 현재 상태를 반환한다.

## 쓰기 요청과 날짜

- 쓰기 요청의 `requestId`는 한 번의 사용자 작업을 식별한다. 읽기에는 필요 없다.
- 같은 ID와 같은 입력의 재요청은 다시 저장하지 않는다. 최초 설정은 최초 성공 결과를 반환하며 물 기록·취소·설정 변경은 현재 상태를 반환한다. 같은 ID에 다른 입력을 쓰면 `VALIDATION_ERROR`다.
- 앱 재시작 후 미완료 요청의 자동 재시도는 MVP에 포함하지 않는다. 화면은 현재 상태를 다시 읽고 사용자가 판단한다.
- 기록·취소·목표 재생성 요청은 화면이 본 한국 날짜 `day`를 보낸다. 메인은 현재 한국 날짜를 직접 계산해 다르면 `STALE_STATE`로 거절한다. 입력된 날짜를 저장 시각의 기준으로 신뢰하지 않는다.
- 물 기록·요청 ID와 취소 시각·취소 요청 결과는 각각 같은 트랜잭션으로 저장한다. 연관 성장·생기 변경도 같은 트랜잭션으로 처리한다.

## 대시보드와 창 사이 동기화

- 최근 7일 날짜별 총량·해당 날짜의 마지막 목표·달성 여부와 요약 통계는 `getStatistics`로 조회한다. 계산 기준은 [데이터 설계](database.md#대시보드-통계와-성장-단계)를 따른다.
- 오늘 잔 수는 유효한 물 기록 개수이며 기섭취량 조정은 잔 수에 포함하지 않는다. 식물의 외형은 누적 성장량을 기준으로 한다.
- 통계는 별도 조회 함수로 제공한다. 한쪽 창에서 물 기록·취소나 설정을 변경하면 대시보드가 통계를 다시 읽는다.
- 변경 알림이 필요하면 허용된 구독 함수만 preload에서 제공한다. 원시 IPC를 화면에 노출하지 않는다.

## 오류와 화면 처리 초안

| 코드                                     | 의미                               | 화면 처리                                |
| ---------------------------------------- | ---------------------------------- | ---------------------------------------- |
| `VALIDATION_ERROR`                       | 입력 형식 또는 범위 오류           | 입력값 수정 안내                         |
| `NO_ACTIVE_GOAL` / `GOAL_ALREADY_ACTIVE` | 활성 목표 없음 / 이미 존재         | 목표 설정 또는 중단 안내                 |
| `STALE_STATE` / `DAY_CHANGED`            | 목표·기록 상태 또는 한국 날짜 변경 | 최신 상태 조회 후 재확인                 |
| `NOT_FOUND` / `NO_RECORDS`               | 대상 또는 취소할 기록 없음         | 현재 상태와 안내 표시                    |
| `TOTAL_BELOW_ZERO`                       | 취소 후 조정 포함 총량이 음수      | 변경 차단과 조정 확인 안내               |
| `DUPLICATE_REQUEST_CONFLICT`             | 같은 요청 ID에 다른 입력           | 재전송 중단과 오류 안내                  |
| `STORAGE_ERROR` / `UNEXPECTED_ERROR`     | 저장 또는 예상하지 못한 오류       | 성공 확정 없이 오류 안내, 필요 시 재조회 |

출처: [노션 API 명세서 · Electron IPC](https://app.notion.com/p/e0a0b6e5e64c8246935001c1d9b111c6)

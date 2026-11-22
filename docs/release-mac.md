# macOS 배포

macOS(Apple Silicon) 앱은 GitHub Actions가 서명·공증해 공개 배포 저장소 [hanzanhae-releases](https://github.com/Heo-zip/hanzanhae-releases)에 올린다. 워크플로는 [`.github/workflows/release-mac.yml`](../.github/workflows/release-mac.yml)이다.

## 올라가는 파일

| 파일                             | 용도                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `hanzanhae-mac-arm64.dmg`        | 설치 파일. 버전을 이름에 넣지 않아 랜딩의 `releases/latest/download/hanzanhae-mac-arm64.dmg`가 항상 최신 버전을 가리킨다 |
| `hanzanhae-<버전>-mac-arm64.zip` | 자동 업데이트가 내려받는 파일                                                                                            |
| `latest-mac.yml`, `*.blockmap`   | 자동 업데이트가 새 버전과 파일 무결성을 확인하는 정보                                                                    |

## 처음 한 번: 저장소 Secrets 등록

소스 저장소 `Heo-zip/hanzanhae`의 Settings → Secrets and variables → Actions에 아래 값을 직접 등록한다. 값은 문서나 코드에 적지 않는다.

| 이름                          | 값                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `MAC_CERTIFICATE_P12_BASE64`  | 키체인 접근에서 Developer ID Application 인증서를 개인 키와 함께 `.p12`로 내보낸 뒤 `base64 -i 인증서.p12`로 바꾼 값 |
| `MAC_CERTIFICATE_PASSWORD`    | `.p12`를 내보낼 때 정한 암호                                                                                         |
| `APPLE_ID`                    | 학교 Apple Developer 팀에 연결된 Apple 계정 이메일                                                                   |
| `APPLE_APP_SPECIFIC_PASSWORD` | 위 계정의 앱 암호                                                                                                    |
| `APPLE_TEAM_ID`               | 학교 팀 ID(10자리)                                                                                                   |
| `RELEASES_TOKEN`              | `hanzanhae-releases`에만 Contents 읽기·쓰기 권한을 준 fine-grained 개인 액세스 토큰                                  |

## 배포하기

1. `package.json`의 `version`을 올리고 develop을 거쳐 배포할 커밋을 정한다.
2. 같은 버전의 태그를 올린다. 예: `git tag v1.0.0 && git push origin v1.0.0`
3. Actions가 버전 확인 → 린트·타입 검사·빌드 → 테스트 → 서명·공증 빌드 → 서명·공증 검사 → 정식 릴리스 생성 순서로 진행한다. 중간에 실패하면 릴리스를 만들지 않는다.

태그와 `package.json` 버전이 다르면 바로 멈춘다. 같은 태그로 다시 올리려면 배포 저장소의 해당 릴리스와 태그를 먼저 지운다.

## 이 Mac에서 직접 만들기

키체인에 Developer ID 인증서와 공증 프로필(`hanzanhae-notary`)이 있으면 Actions 없이도 같은 결과물을 만들 수 있다. 업로드는 하지 않는다.

```bash
APPLE_KEYCHAIN_PROFILE=hanzanhae-notary npm run build:mac -- --arm64
```

공증 관련 환경 변수가 없으면 서명만 하고 공증은 건너뛴다.

## 비용과 제한

- 소스 저장소가 비공개라 macOS 실행기는 Actions 사용 시간을 10배로 차감한다. 무료 계정 기준 한 달 2,000분, macOS로는 약 200분이다.
- Apple Silicon용만 만든다. Intel Mac·Windows·Linux 설치 파일은 이 워크플로에 포함하지 않는다.

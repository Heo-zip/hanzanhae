# macOS 배포

macOS(Apple Silicon) 앱은 GitHub Actions가 서명·공증해 공개 배포 저장소 [hanzanhae-releases](https://github.com/Heo-zip/hanzanhae-releases)에 올린다. 워크플로는 [`.github/workflows/release-mac.yml`](../.github/workflows/release-mac.yml)이다.

## 올라가는 파일

| 파일                             | 용도                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `hanzanhae-mac-arm64.dmg`        | 설치 파일. 버전을 이름에 넣지 않아 랜딩의 `releases/latest/download/hanzanhae-mac-arm64.dmg`가 항상 최신 버전을 가리킨다 |
| `hanzanhae-<버전>-mac-arm64.zip` | 자동 업데이트가 내려받는 파일                                                                                            |
| `latest-mac.yml`, `*.zip.blockmap` | 자동 업데이트가 새 ZIP의 버전과 무결성을 확인하는 정보 |
| `hanzanhae-mac-arm64.dmg.sha256` | 공증 티켓을 부착한 최종 DMG의 SHA-256 해시 |

## 처음 한 번: 배포 환경 Secrets 등록

소스 저장소 `Heo-zip/hanzanhae`의 **Settings → Environments → macos-release → Environment secrets**에 아래 값을 등록한다. 환경은 `v*` 태그에서만 사용할 수 있다. 환경의 6개 값으로 배포를 검증한 뒤 이전 Repository secrets의 중복 항목을 제거한다. 값을 문서나 코드에 적지 않는다.

| 이름                          | 값                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `MAC_CERTIFICATE_P12_BASE64`  | 키체인 접근에서 Developer ID Application 인증서를 개인 키와 함께 `.p12`로 내보낸 뒤 `base64 -i 인증서.p12`로 바꾼 값 |
| `MAC_CERTIFICATE_PASSWORD`    | `.p12`를 내보낼 때 정한 암호                                                                                         |
| `APPLE_ID`                    | 학교 Apple Developer 팀에 연결된 Apple 계정 이메일                                                                   |
| `APPLE_APP_SPECIFIC_PASSWORD` | 위 계정의 앱 암호                                                                                                    |
| `APPLE_TEAM_ID`               | 학교 팀 ID(10자리)                                                                                                   |
| `RELEASES_TOKEN`              | `hanzanhae-releases`에만 Contents 읽기·쓰기 권한을 준 fine-grained 개인 액세스 토큰                                  |

## 배포하기

1. `package.json`과 잠금 파일의 버전을 올리고 `develop`을 거쳐 배포 PR을 `main`에 병합한다.
2. 배포 담당자는 `main`에 포함된 커밋에 같은 버전의 태그를 푸시한다.
3. Actions는 빌드·테스트 → 앱 서명·공증 → DMG 서명·공증 티켓 부착 → 최종 해시 확인 → 공개 릴리스 순서로 실행한다.

태그가 `main`에 포함되지 않거나 앱 버전과 다르면 멈춘다. 배포 중 일시 오류가 나면 같은 Actions 실행을 재시도한다. 코드 수정이 필요하면 다음 버전 태그를 사용한다. 공개한 태그와 업로드한 파일은 교체하지 않는다.

## 이 Mac에서 직접 만들기

키체인에 Developer ID 인증서와 공증 프로필(`hanzanhae-notary`)이 있으면 Actions 없이도 같은 결과물을 만들 수 있다. 업로드는 하지 않는다.

```bash
APPLE_KEYCHAIN_PROFILE=hanzanhae-notary npm run build:mac -- --arm64
```

로컬 빌드는 서명된 DMG를 만들고 앱 내부 공증을 수행한다. 최종 DMG까지 공증하려면 별도로 아래를 실행한다.

```bash
cd dist
xcrun notarytool submit hanzanhae-mac-arm64.dmg --keychain-profile hanzanhae-notary --wait
xcrun stapler staple hanzanhae-mac-arm64.dmg
xcrun stapler validate hanzanhae-mac-arm64.dmg
shasum -a 256 hanzanhae-mac-arm64.dmg > hanzanhae-mac-arm64.dmg.sha256
```

## 비용과 제한

- Apple Silicon용만 만든다. Intel Mac·Windows·Linux 설치 파일은 이 워크플로에 포함하지 않는다.

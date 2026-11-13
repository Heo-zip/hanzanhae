# 한잔해

**물을 마시는 작은 습관으로 나만의 화분을 키우는 macOS 앱**

화면 한쪽의 작은 화분을 보며 물 마실 시간을 떠올립니다. 물을 마신 뒤 한 잔을 기록하면 화분이 생기를 되찾고, 하루 목표를 달성하면 조금씩 성장합니다.

## 주요 기능

- **물 마시기 기록** — 하루 목표와 한 잔 용량을 설정하고 간편하게 기록합니다.
- **나만의 화분** — 물을 마시면 생기를 되찾고, 목표 달성과 초과 기록에 따라 성장합니다.
- **작은 정원과 대시보드** — 화면 한쪽의 화분에서 물을 주고 대시보드에서 오늘의 기록을 확인합니다.
- **로그인 없는 로컬 저장** — 목표와 물 기록, 식물 상태를 사용 중인 Mac에 저장합니다.

## 기술 스택

Electron · React · TypeScript · SQLite

## 시작하기

macOS와 Node.js 환경에서 실행합니다. Node.js 24에서 확인했습니다.

```bash
git clone https://github.com/Heo-zip/hanzanhae.git
cd hanzanhae
npm install
npm run dev
```

개발 서버와 Electron 앱이 함께 실행됩니다.

## 폴더 구조

```text
src/
├── main/        # 창 관리, 데이터 저장 및 앱 기능
├── preload/     # 화면과 메인 프로세스 간 안전한 연결
├── renderer/    # React 화면과 에셋
└── shared/      # 프로세스 간 공통 타입

docs/            # 기획 및 개발 문서
tests/           # 저장소 테스트
```

## 문서

- [기획 문서](https://app.notion.com/p/4140b6e5e64c809a9ad6c91dc16def22)
- [프로젝트 문서](docs/README.md)

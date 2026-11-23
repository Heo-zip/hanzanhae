# 첫 macOS 배포 실행기 배정 실패

- 2026-11-23 · [배포 PR #69](https://github.com/Heo-zip/hanzanhae/pull/69) · [첫 실행](https://github.com/Heo-zip/hanzanhae/actions/runs/45128972995)

## 현상과 원인

`v1.0.0` 태그 푸시로 워크플로가 시작됐지만 `The configuration 'macos-14-arm64-us-xl' is not supported` 오류로 실행기 배정 전에 취소됐다. GitHub는 2026년 11월 2일에 `macos-14` 실행기 지원을 종료했다. [GitHub 지원 종료 공지](https://github.blog/changelog/2026-10-01-github-actions-macos-14-runner-image-retirement/)

## 수정과 검증

Apple Silicon을 지원하는 `macos-15`로 실행기 라벨을 변경한다. 기존 실행을 재실행하면 최초 커밋을 사용하므로, 수정된 커밋에서 배포를 새로 시작해야 한다. 새 실행에서 빌드·서명·공증·릴리스 업로드를 확인한다. [GitHub 재실행 문서](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)

import { useRef } from 'react'

/** 모든 기록을 지우기 전에 지워지는 것과 남는 사본을 보여준다. */
function ResetDataDialog({
  busy,
  onDismiss,
  onConfirm
}: {
  busy: boolean
  onDismiss: () => void
  onConfirm: () => Promise<void>
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  function close(): void {
    if (busy) return
    dialogRef.current?.close()
  }

  return (
    <dialog
      className="confirm"
      aria-labelledby="reset-title"
      aria-describedby="reset-description"
      ref={(dialog) => {
        dialogRef.current = dialog
        if (dialog && !dialog.open) dialog.showModal()
      }}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onClose={onDismiss}
    >
      <div className="cf-body">
        <h3 id="reset-title">모든 기록을 지울까요?</h3>
        <p className="lead" id="reset-description">
          처음 설치한 것처럼
          <br />
          목표 설정부터 다시 시작해요.
        </p>
        <ul className="cf-keep gone">
          <li className="cf-keep-h">지워져요</li>
          <li>목표와 마신 횟수·텀블러 기록</li>
          <li>자란 화분과 생기</li>
          <li>정원 위치와 알림 설정</li>
        </ul>
        <p className="cf-alt">
          지우기 전 사본을 앱 데이터의 backups 폴더에 남겨요. 필요하면 먼저 기록을 내보내 주세요.
        </p>
      </div>
      <div className="cf-btns">
        <button type="button" className="btn" autoFocus disabled={busy} onClick={close}>
          그대로 둘게요
        </button>
        <button
          type="button"
          className="btn solid-danger"
          disabled={busy}
          onClick={() => void onConfirm()}
        >
          {busy ? '지우고 있어요' : '모두 지우기'}
        </button>
      </div>
    </dialog>
  )
}

export default ResetDataDialog

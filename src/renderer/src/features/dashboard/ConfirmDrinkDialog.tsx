import { useEffect, useId, useRef } from 'react'
import type { DrinkConfirmation } from '../../../../shared/appState'

export default function ConfirmDrinkDialog({
  reason,
  busy,
  error,
  onDismiss,
  onConfirm
}: {
  reason: DrinkConfirmation['reason']
  busy: boolean
  error: string
  onDismiss: () => void
  onConfirm: () => Promise<boolean>
}): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  async function confirm(): Promise<void> {
    if (await onConfirm()) ref.current?.close()
  }

  return (
    <dialog
      className="confirm drink-confirm"
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        if (busy) event.preventDefault()
      }}
      onClose={(event) => {
        if (!event.currentTarget.open) onDismiss()
      }}
    >
      <div className="cf-body">
        <h3 id={titleId}>방금 또 마셨나요?</h3>
        <p id={descriptionId} className="lead">
          {reason === 'camera'
            ? '카메라가 방금 1회를 기록했어요. 한 번 더 추가할까요?'
            : '짧은 시간에 여러 번 눌렀어요. 이번에도 1회 추가할까요?'}
        </p>
        {error && (
          <p className="water-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <form method="dialog" className="cf-btns">
        <button type="submit" className="btn" autoFocus disabled={busy}>
          돌아가기
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? '추가하고 있어요' : '1회 추가'}
        </button>
      </form>
    </dialog>
  )
}

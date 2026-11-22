import { useRef } from 'react'
import type { CancelWaterResult, PlantStage } from '../../../../shared/appState'
import { plants, plantIndex } from '../plant/plantVisual'

export type ClearTodaySnapshot = {
  goalId: number
  goalCount: number
  day: string
  drinkCount: number
  latestDrinkId: number | null
  todayMl: number
  adjustmentMl: number
  records: { id: number; amountMl: number }[]
}

type ErrorCode = Exclude<CancelWaterResult, { ok: true }>['code'] | null
const format = (value: number): string => value.toLocaleString('ko-KR')
const minus = (value: number): string => (value > 0 ? `−${format(value)}` : '0')

function ClearTodayDialog({
  snapshot,
  plantStage,
  currentTodayMl,
  busy,
  error,
  errorCode,
  retryable,
  attempted,
  onDismiss,
  onConfirm,
  onRetry,
  onSettings
}: {
  snapshot: ClearTodaySnapshot
  plantStage: PlantStage
  currentTodayMl: number
  busy: boolean
  error: string
  errorCode: ErrorCode
  retryable: boolean
  attempted: boolean
  onDismiss: () => void
  onConfirm: () => Promise<boolean>
  onRetry: () => Promise<boolean>
  onSettings: () => void
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const count = snapshot.records.length
  const removed = snapshot.records.reduce((sum, record) => sum + record.amountMl, 0)
  const serverBlocked = attempted && errorCode === 'TOTAL_BELOW_ZERO'
  const total = serverBlocked ? currentTodayMl : snapshot.todayMl
  const after = total - removed
  const blocked = after < 0 || serverBlocked
  const requiresReopen = attempted && !retryable && errorCode !== null && !blocked

  function close(): void {
    if (busy) return
    // 닫힘 처리는 dialog의 close 이벤트(onClose) 한 곳에서만 한다.
    dialogRef.current?.close()
  }

  async function submit(): Promise<void> {
    if (await (retryable ? onRetry() : onConfirm())) close()
  }

  return (
    <dialog
      className="confirm clear-today"
      aria-labelledby="clear-title"
      aria-describedby="clear-description"
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
        <div className="cf-art">
          <img src={plants[plantIndex(plantStage)].image} alt="" />
        </div>
        <h3 id="clear-title">
          {blocked ? '지금은 전체 취소할 수 없어요' : '오늘 기록을 모두 취소할까요?'}
        </h3>
        <p className="lead" id="clear-description">
          {blocked ? (
            <>
              취소하면 오늘 마신 양이 0ml보다 적어져요.
              <br />
              목표 바꾸기에서 오늘 마신 양을 먼저 확인해 주세요.
            </>
          ) : (
            '오늘 기록과 그만큼 오른 생기·성장을 함께 되돌려요.'
          )}
        </p>
        <div className="cf-sum">
          <div>
            <span>마신 횟수</span>
            <b className="num">{minus(snapshot.drinkCount)}회</b>
          </div>
          <div>
            <span>텀블러</span>
            <b className="num">
              {minus(count)}잔 · {format(removed)}ml
            </b>
          </div>
          <div className="cf-total">
            <span>오늘 마신 양</span>
            <b className="num">
              {format(total)}ml → {format(after)}ml
            </b>
          </div>
        </div>
        {!blocked && (
          <p className="cf-note">
            하루 목표 {format(snapshot.goalCount)}회와 다른 목표·어제까지의 기록, 화분은 그대로
            남아요.
            {snapshot.adjustmentMl !== 0 &&
              ` 목표를 바꿀 때 적은 양(${snapshot.adjustmentMl > 0 ? '+' : ''}${format(snapshot.adjustmentMl)}ml)도 유지돼요.`}
          </p>
        )}
        {attempted && error && !blocked && (
          <p className="cf-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="cf-btns">
        <button type="button" className="btn" autoFocus disabled={busy} onClick={close}>
          그대로 둘게요
        </button>
        {blocked ? (
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => {
              close()
              onSettings()
            }}
          >
            설정으로 가기
          </button>
        ) : (
          <button
            type="button"
            className="btn solid-danger"
            disabled={busy || requiresReopen}
            onClick={() => void submit()}
          >
            {busy ? '취소하고 있어요' : retryable ? '다시 시도' : '전체 취소'}
          </button>
        )}
      </div>
    </dialog>
  )
}

export default ClearTodayDialog

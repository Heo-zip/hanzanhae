import { useRef } from 'react'
import type { PlantStage } from '../../../../shared/appState'
import { plants, plantIndex } from '../plant/plantVisual'

const format = (value: number): string => value.toLocaleString('ko-KR')

/** 목표를 멈추기 전에 멈춘 뒤의 변화와 그대로 남는 항목을 보여준다. */
function StopGoalDialog({
  goalCount,
  todayCount,
  plantStage,
  busy,
  onDismiss,
  onConfirm,
  onChangeGoal
}: {
  goalCount: number
  todayCount: number
  plantStage: PlantStage
  busy: boolean
  onDismiss: () => void
  onConfirm: () => Promise<void>
  onChangeGoal: () => void
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  function close(): void {
    if (busy) return
    // 닫힘 처리는 dialog의 close 이벤트(onClose) 한 곳에서만 한다.
    dialogRef.current?.close()
  }

  return (
    <dialog
      className="confirm"
      aria-labelledby="stop-title"
      aria-describedby="stop-description"
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
        <h3 id="stop-title">지금 목표를 멈출까요?</h3>
        <p className="lead" id="stop-description">
          멈추면 새 목표를 만들 때까지
          <br />
          물을 기록할 수 없어요.
        </p>
        <div className="cf-sum">
          <div>
            <span>멈출 목표</span>
            <b className="num">하루 {format(goalCount)}회</b>
          </div>
          <div>
            <span>오늘 마신 횟수</span>
            <b className="num">{format(todayCount)}회</b>
          </div>
        </div>
        <ul className="cf-keep">
          <li className="cf-keep-h">그대로 남아요</li>
          <li>지금까지의 기록과 오늘 마신 횟수</li>
          <li>지금까지 자란 화분</li>
        </ul>
        <p className="cf-alt">
          목표 횟수만 바꾸려면{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              close()
              onChangeGoal()
            }}
          >
            목표 바꾸기
          </button>
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
          // 저장이 끝나면 부모가 이 모달을 닫는다(렌더링에서 뺀다).
          onClick={() => void onConfirm()}
        >
          {busy ? '멈추고 있어요' : '멈추기'}
        </button>
      </div>
    </dialog>
  )
}

export default StopGoalDialog

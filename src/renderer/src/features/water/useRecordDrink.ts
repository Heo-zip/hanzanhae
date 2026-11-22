import { useRef, useState } from 'react'
import type { AppState, DrinkActionInput, DrinkConfirmation } from '../../../../shared/appState'

type DrinkKind = DrinkActionInput['kind']

export function useRecordDrink(
  state: Extract<AppState, { status: 'ready' }>,
  refresh: () => Promise<void>
): {
  change: (kind: DrinkKind, confirmedLatestDrinkId?: number) => Promise<boolean>
  dismissConfirmation: () => void
  confirmation: DrinkConfirmation | null
  busy: boolean
  error: string
  pendingKind: DrinkKind | null
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingKind, setPendingKind] = useState<DrinkKind | null>(null)
  const [confirmation, setConfirmation] = useState<DrinkConfirmation | null>(null)
  const running = useRef(false)
  const pending = useRef<DrinkActionInput | null>(null)

  function clearPending(): void {
    pending.current = null
    setPendingKind(null)
  }

  function dismissConfirmation(): void {
    if (running.current) return
    setConfirmation(null)
    // 승인 요청의 응답이 유실됐으면 같은 ID로 결과를 확인할 수 있게 남긴다.
    if (pending.current?.confirmedLatestDrinkId === undefined) clearPending()
  }

  async function change(kind: DrinkKind, confirmedLatestDrinkId?: number): Promise<boolean> {
    if (
      running.current ||
      (confirmation !== null && confirmedLatestDrinkId === undefined) ||
      (kind === 'undo' && state.latestDrinkId === null && !pending.current)
    )
      return false
    if (pending.current && pending.current.kind !== kind) {
      setError('이전 요청의 결과를 확인하도록 같은 버튼을 다시 눌러 주세요.')
      return false
    }

    const input: DrinkActionInput = pending.current ?? {
      requestId: crypto.randomUUID(),
      expectedGoalId: state.goalId,
      day: state.day,
      kind,
      ...(kind === 'undo' ? { recordId: state.latestDrinkId! } : {})
    }
    const request =
      confirmedLatestDrinkId === undefined ? input : { ...input, confirmedLatestDrinkId }
    running.current = true
    pending.current = request
    setBusy(true)
    setError('')
    setPendingKind(kind)
    try {
      const response = await window.hanzanhae.recordDrinkAction(request)
      if (!response.ok && response.code === 'CONFIRM_DRINK') {
        setConfirmation(response.confirmation)
      } else if (
        response.ok ||
        response.code === 'STALE_STATE' ||
        response.code === 'VALIDATION_ERROR'
      ) {
        clearPending()
        await refresh()
        if (!response.ok) setError('날짜, 목표 또는 최근 기록이 바뀌었어요. 다시 확인해 주세요.')
        return true
      } else {
        setError('횟수를 저장하지 못했어요. 다시 시도해 주세요.')
      }
    } catch {
      setError('저장 결과를 확인하지 못했어요. 다시 시도해 주세요.')
    } finally {
      running.current = false
      setBusy(false)
    }
    return false
  }

  return { change, dismissConfirmation, confirmation, busy, error, pendingKind }
}

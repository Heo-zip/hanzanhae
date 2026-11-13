import { useRef, useState } from 'react'
import type { AppState, RecordCupInput } from '../../../../shared/appState'

type ConfiguredState = Exclude<AppState, { status: 'setup-required' }>

export function useRecordCup(
  state: ConfiguredState,
  refresh: () => Promise<void>
): {
  record: () => Promise<void>
  busy: boolean
  error: string
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const running = useRef(false)
  // 응답이 유실된 경우 같은 요청 ID로 재시도해 두 번 기록하지 않는다.
  const pending = useRef<RecordCupInput | null>(null)

  async function record(): Promise<void> {
    if (running.current || state.status !== 'ready') return
    running.current = true
    setBusy(true)
    setError('')
    const input = pending.current ?? {
      requestId: crypto.randomUUID(),
      expectedGoalId: state.goalId,
      day: state.day
    }
    pending.current = input
    try {
      const result = await window.hanzanhae.recordCup(input)
      if (result.ok) {
        pending.current = null
        await refresh()
      } else if (result.code === 'STALE_STATE') {
        pending.current = null
        await refresh()
        setError('목표나 날짜가 바뀌었어요. 확인한 뒤 다시 눌러 주세요.')
      } else {
        if (result.code === 'VALIDATION_ERROR') pending.current = null
        setError('기록하지 못했어요. 다시 시도해 주세요.')
      }
    } catch {
      setError('저장 결과를 확인하지 못했어요. 다시 시도해 주세요.')
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return { record, busy, error }
}

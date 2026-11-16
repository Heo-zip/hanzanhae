import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState, DrinkActionInput } from '../../../../shared/appState'

export type CameraRecordNotice =
  { kind: 'recorded'; recordId: number } | { kind: 'undone' } | { kind: 'error'; message: string }

export type CameraRecord = {
  notice: CameraRecordNotice | null
  busy: boolean
  /** 카메라가 마시는 동작을 감지했을 때 오늘 마신 횟수에 1회를 저장한다. */
  record: () => Promise<void>
  /** 방금 카메라가 저장한 1회를 되돌린다. 그 뒤에 다른 횟수 기록이 있으면 되돌리지 않는다. */
  undo: () => Promise<void>
}

const NOTICE_MS = 8000

/** 카메라 감지를 기존 횟수 기록(recordDrinkAction) 흐름에 연결한다. 영상 정보는 보내지 않는다. */
export function useCameraRecord(state: AppState, refresh: () => Promise<void>): CameraRecord {
  const [notice, setNotice] = useState<CameraRecordNotice | null>(null)
  const [busy, setBusy] = useState(false)
  // 감지 타이머가 오래된 렌더링의 상태로 저장하지 않도록 최신 상태를 따로 둔다.
  const latest = useRef({ state, refresh })
  useEffect(() => {
    latest.current = { state, refresh }
  }, [state, refresh])

  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((next: CameraRecordNotice): void => {
    window.clearTimeout(timer.current)
    setNotice(next)
    timer.current = window.setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const send = useCallback(
    async (input: DrinkActionInput): Promise<AppState | 'stale' | 'failed'> => {
      try {
        const response = await window.hanzanhae.recordDrinkAction(input)
        if (response.ok) return response.state
        return response.code === 'STALE_STATE' || response.code === 'VALIDATION_ERROR'
          ? 'stale'
          : 'failed'
      } catch {
        return 'failed'
      } finally {
        await latest.current.refresh().catch(() => undefined)
      }
    },
    []
  )

  const record = useCallback(async (): Promise<void> => {
    const current = latest.current.state
    if (current.status !== 'ready') return
    setBusy(true)
    const result = await send({
      requestId: crypto.randomUUID(),
      expectedGoalId: current.goalId,
      day: current.day,
      kind: 'add'
    })
    setBusy(false)
    if (typeof result === 'object' && result.status === 'ready' && result.latestDrinkId !== null)
      show({ kind: 'recorded', recordId: result.latestDrinkId })
    else
      show({
        kind: 'error',
        message:
          result === 'stale'
            ? '목표나 날짜가 바뀌어 이번 감지는 저장하지 않았어요.'
            : '저장 중 문제가 생겼어요. 필요하면 직접 추가해 주세요.'
      })
  }, [send, show])

  const undo = useCallback(async (): Promise<void> => {
    const current = latest.current.state
    if (notice?.kind !== 'recorded' || current.status !== 'ready') return
    if (current.latestDrinkId !== notice.recordId) {
      show({
        kind: 'error',
        message: '그 뒤에 다른 기록이 있어요. 오늘 화면에서 최근 횟수를 취소해 주세요.'
      })
      return
    }
    setBusy(true)
    const result = await send({
      requestId: crypto.randomUUID(),
      expectedGoalId: current.goalId,
      day: current.day,
      kind: 'undo',
      recordId: notice.recordId
    })
    setBusy(false)
    if (typeof result === 'object') show({ kind: 'undone' })
    else
      show({
        kind: 'error',
        message:
          result === 'stale'
            ? '기록이 바뀌어 되돌리지 않았어요. 오늘 화면에서 확인해 주세요.'
            : '되돌리지 못했어요. 오늘 화면에서 최근 횟수를 취소해 주세요.'
      })
  }, [notice, send, show])

  return { notice, busy, record, undo }
}

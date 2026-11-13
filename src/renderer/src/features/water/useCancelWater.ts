import { useRef, useState } from 'react'
import type { CancelWaterInput, CancelWaterResult } from '../../../../shared/appState'

type CancelAction =
  | Omit<Extract<CancelWaterInput, { kind: 'latest' }>, 'requestId'>
  | Omit<Extract<CancelWaterInput, { kind: 'today' }>, 'requestId'>

export function useCancelWater(refresh: () => Promise<void>): {
  cancel: (action: CancelAction) => Promise<boolean>
  retry: () => Promise<boolean>
  busy: boolean
  error: string
  retryable: boolean
  errorCode: Exclude<CancelWaterResult, { ok: true }>['code'] | null
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retryable, setRetryable] = useState(false)
  const [errorCode, setErrorCode] = useState<
    Exclude<CancelWaterResult, { ok: true }>['code'] | null
  >(null)
  const running = useRef(false)
  const pending = useRef<CancelWaterInput | null>(null)

  async function submit(input: CancelWaterInput): Promise<boolean> {
    if (running.current) return false
    running.current = true
    setBusy(true)
    setError('')
    setErrorCode(null)
    try {
      const result = await window.hanzanhae.cancelWater(input)
      if (result.ok) {
        pending.current = null
        setRetryable(false)
        await refresh()
        return true
      }
      if (result.code === 'STORAGE_ERROR') {
        setErrorCode(result.code)
        setRetryable(true)
        setError('취소하지 못했어요. 다시 시도해 주세요.')
      } else {
        setErrorCode(result.code)
        pending.current = null
        setRetryable(false)
        await refresh()
        setError(
          result.code === 'TOTAL_BELOW_ZERO'
            ? '취소하면 오늘 총량이 0ml보다 적어져요. 설정에서 오늘 마신 양을 확인해 주세요.'
            : result.code === 'STALE_STATE'
              ? '목표나 기록이 바뀌었어요. 확인한 뒤 다시 시도해 주세요.'
              : result.code === 'NO_RECORDS'
                ? '취소할 기록이 없어요.'
                : '취소 요청을 확인하지 못했어요. 다시 시도해 주세요.'
        )
      }
    } catch {
      setErrorCode('STORAGE_ERROR')
      setRetryable(true)
      setError('취소 결과를 확인하지 못했어요. 다시 시도해 주세요.')
    } finally {
      running.current = false
      setBusy(false)
    }
    return false
  }

  async function cancel(action: CancelAction): Promise<boolean> {
    if (running.current) return false
    if (pending.current) {
      setError('이전 취소 요청을 먼저 다시 확인해 주세요.')
      setRetryable(true)
      return false
    }
    const input = { ...action, requestId: crypto.randomUUID() }
    pending.current = input
    return submit(input)
  }

  async function retry(): Promise<boolean> {
    return pending.current ? submit(pending.current) : false
  }

  return { cancel, retry, busy, error, retryable, errorCode }
}

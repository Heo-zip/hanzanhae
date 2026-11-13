import { useCallback, useEffect, useRef, useState } from 'react'
import type { WaterStatistics } from '../../../../shared/appState'

export function useWaterStatistics(): {
  statistics: WaterStatistics | null
  error: boolean
  refresh: () => void
} {
  const [statistics, setStatistics] = useState<WaterStatistics | null>(null)
  const [error, setError] = useState(false)
  const request = useRef(0)
  const refresh = useCallback((): void => {
    const current = ++request.current
    void window.hanzanhae
      .getStatistics()
      .then((result) => {
        if (current !== request.current) return
        if (result.ok) {
          setStatistics(result.statistics)
          setError(false)
        } else {
          setStatistics(null)
          setError(true)
        }
      })
      .catch(() => {
        if (current !== request.current) return
        setStatistics(null)
        setError(true)
      })
  }, [])
  useEffect(() => {
    const requestRef = request
    refresh()
    const unsubscribe = window.hanzanhae.onStateChanged(refresh)
    const timer = window.setInterval(refresh, 60_000)
    return () => {
      requestRef.current++
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [refresh])
  return { statistics, error, refresh }
}

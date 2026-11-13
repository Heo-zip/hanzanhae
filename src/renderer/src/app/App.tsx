import { useCallback, useEffect, useState } from 'react'
import type { AppResult } from '../../../shared/appState'
import Garden from '../features/garden/Garden'
import Onboarding from '../features/onboarding/Onboarding'
import Dashboard from '../features/dashboard/Dashboard'
import '../features/onboarding/onboarding.css'

function App(): React.JSX.Element | null {
  const [result, setResult] = useState<AppResult | null>(null)
  const isGarden = new URLSearchParams(window.location.search).get('view') === 'garden'
  const refresh = useCallback(async (): Promise<void> => {
    try {
      setResult(await window.hanzanhae.getState())
    } catch {
      setResult({ ok: false, code: 'STORAGE_ERROR' })
    }
  }, [])
  useEffect(() => {
    void Promise.resolve().then(refresh)
    // 한국 날짜가 바뀌면 열려 있는 창의 오늘 총량도 새로 불러온다.
    const timer = window.setInterval(() => void refresh(), 60_000)
    const unsubscribe = window.hanzanhae?.onStateChanged(() => {
      void refresh()
    })
    return () => {
      window.clearInterval(timer)
      unsubscribe?.()
    }
  }, [refresh])

  if (isGarden) return result?.ok && result.state.status !== 'setup-required' ? <Garden /> : null
  if (!result)
    return (
      <main className="setup-screen">
        <p role="status">설정을 불러오고 있어요.</p>
      </main>
    )
  if (!result.ok)
    return (
      <main className="setup-screen">
        <div className="setup-card">
          <h1>설정을 불러오지 못했어요</h1>
          <p>저장된 기록을 확인할 수 없어요. 다시 시도해 주세요.</p>
          <button type="button" onClick={() => void refresh()}>
            다시 시도
          </button>
        </div>
      </main>
    )
  if (result.state.status === 'setup-required') return <Onboarding onComplete={refresh} />
  return <Dashboard state={result.state} refresh={refresh} />
}

export default App

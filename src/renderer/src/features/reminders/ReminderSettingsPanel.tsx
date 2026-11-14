import { useEffect, useRef, useState } from 'react'
import type { ReminderSettings } from '../../../../shared/appState'
import './reminders.css'

export default function ReminderSettingsPanel(): React.JSX.Element {
  const [draft, setDraft] = useState<ReminderSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const running = useRef(false)

  async function load(): Promise<void> {
    setError('')
    try {
      const result = await window.hanzanhae.getReminderSettings()
      if (result.ok) setDraft(result.settings)
      else setError('알림 설정을 불러오지 못했어요.')
    } catch {
      setError('알림 설정을 불러오지 못했어요.')
    }
  }

  useEffect(() => {
    let active = true
    void window.hanzanhae
      .getReminderSettings()
      .then((result) => {
        if (!active) return
        if (result.ok) setDraft(result.settings)
        else setError('알림 설정을 불러오지 못했어요.')
      })
      .catch(() => {
        if (active) setError('알림 설정을 불러오지 못했어요.')
      })
    return () => {
      active = false
    }
  }, [])

  async function save(): Promise<void> {
    if (!draft || running.current) return
    if (!draft.startTime || !draft.endTime || draft.startTime === draft.endTime) {
      setError('시작과 종료 시간을 다르게 입력해 주세요.')
      return
    }
    running.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await window.hanzanhae.updateReminderSettings(draft)
      if (result.ok) {
        setDraft(result.settings)
        if (result.activation === 'failed' || result.activation === 'unsupported') {
          setError(
            '설정은 저장했지만 알림을 표시하지 못했어요. Mac 알림 권한을 확인한 뒤 테스트 알림을 다시 눌러 주세요.'
          )
        } else if (result.activation === 'pending') {
          setMessage('설정을 저장했어요. 알림을 확인 중이니 잠시 후 테스트해 주세요.')
        } else setMessage('알림 설정을 저장했어요.')
      } else setError('알림 설정을 저장하지 못했어요. 다시 확인해 주세요.')
    } catch {
      setError('알림 설정을 저장하지 못했어요. 다시 시도해 주세요.')
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  async function testReminder(): Promise<void> {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await window.hanzanhae.testReminder()
      if (result.ok)
        setMessage('테스트 알림을 보냈어요. 보이지 않으면 Mac의 알림 설정을 확인해 주세요.')
      else setError('알림을 표시하지 못했어요. Mac의 시스템 설정에서 한잔해 알림을 확인해 주세요.')
    } catch {
      setError('알림을 표시하지 못했어요. 다시 시도해 주세요.')
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  return (
    <section className="sset">
      <div className="sset-head">
        <h2>물 마시기 알림</h2>
        <p>물을 오래 기록하지 않으면 화분이 조용히 알려줘요. 앱을 켜둔 동안에만 보내요.</p>
      </div>
      <div className="reminder-settings">
        {draft && (
          <>
            <div className="group">
              <div className="set">
                <div>
                  <b>알림 받기</b>
                  <small>변경 후 저장하면 적용돼요</small>
                </div>
                <button
                  className="switch"
                  role="switch"
                  aria-checked={draft.enabled}
                  aria-label="물 마시기 알림 받기"
                  disabled={busy}
                  onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
                />
              </div>
              <div className="set">
                <div>
                  <b>알림 간격</b>
                  <small>마지막 기록 이후 기다리는 시간이에요</small>
                </div>
                <select
                  aria-label="알림 간격"
                  value={draft.intervalMinutes}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, intervalMinutes: Number(event.target.value) })
                  }
                >
                  {Array.from({ length: 8 }, (_, i) => (i + 1) * 60).map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes / 60}시간
                    </option>
                  ))}
                </select>
              </div>
              <div className="set reminder-times">
                <div>
                  <b>알림 시간</b>
                  <small>한국 시간 기준이에요</small>
                </div>
                <div className="reminder-time-fields">
                  <input
                    type="time"
                    aria-label="알림 시작 시간"
                    value={draft.startTime}
                    disabled={busy}
                    onChange={(event) => setDraft({ ...draft, startTime: event.target.value })}
                  />
                  <span>~</span>
                  <input
                    type="time"
                    aria-label="알림 종료 시간"
                    value={draft.endTime}
                    disabled={busy}
                    onChange={(event) => setDraft({ ...draft, endTime: event.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="row-btns reminder-actions">
              <button className="btn line" disabled={busy} onClick={() => void testReminder()}>
                테스트 알림
              </button>
              <button className="btn primary" disabled={busy} onClick={() => void save()}>
                저장
              </button>
            </div>
          </>
        )}
        {error && (
          <p className="water-error" role="alert">
            {error}{' '}
            {!draft && (
              <button className="cancel-retry" onClick={() => void load()}>
                다시 시도
              </button>
            )}
          </p>
        )}
        {message && (
          <p className="settings-saved" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  )
}

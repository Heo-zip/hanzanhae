import { useState } from 'react'
import { useWaterStatistics } from '../statistics/useWaterStatistics'
import { useCameraDetection } from '../camera/useCameraDetection'
import { useCameraRecord } from '../camera/useCameraRecord'
import wordmark from '../../assets/icons/wordmark.webp'
import navToday from '../../assets/icons/nav-today.webp'
import navHistory from '../../assets/icons/nav-history.webp'
import navSettings from '../../assets/icons/nav-settings.webp'
import drop from '../../assets/icons/drop.webp'
import type { ConfiguredState } from './dashboardFormat'
import Today from './TodayView'
import History from './HistoryView'
import Settings from './SettingsView'
import './dashboard.css'

// 대시보드에서 선택할 수 있는 화면을 세 가지로 제한한다.
type View = 'today' | 'history' | 'settings'

const navItems: { view: View; label: string; icon: string }[] = [
  { view: 'today', label: '오늘', icon: navToday },
  { view: 'history', label: '기록', icon: navHistory },
  { view: 'settings', label: '설정', icon: navSettings }
]

function Dashboard({
  state,
  refresh
}: {
  state: ConfiguredState
  refresh: () => Promise<void>
}): React.JSX.Element {
  // 별도의 페이지 이동 없이 선택한 메뉴에 맞는 화면만 렌더링한다.
  const [view, setView] = useState<View>('today')
  const { statistics, error: statisticsError, refresh: refreshStatistics } = useWaterStatistics()
  const cameraRecord = useCameraRecord(state, refresh)
  const camera = useCameraDetection(state.status === 'ready', cameraRecord.record)
  const cameraNotice = cameraRecord.notice

  return (
    <div className="window">
      <aside className="side">
        <div className="lights" aria-hidden="true" />
        <button className="brand" onClick={() => setView('today')} aria-label="오늘로 이동">
          <img className="mark" src={wordmark} alt="한잔해" />
        </button>
        <nav aria-label="대시보드 메뉴" className="navigation">
          {navItems.map((item) => (
            <button
              key={item.view}
              className={`nav ${view === item.view ? 'on' : ''}`}
              onClick={() => setView(item.view)}
              aria-current={view === item.view ? 'page' : undefined}
            >
              <img src={item.icon} alt="" />
              {item.label}
            </button>
          ))}
        </nav>
        {camera.status !== 'off' && (
          <button className="camera-active" onClick={camera.stop}>
            <span aria-hidden="true" />
            {camera.status === 'starting' ? '카메라 준비 중 · 취소' : '카메라 사용 중 · 끄기'}
          </button>
        )}
      </aside>
      {cameraNotice && (
        // 키(key)를 바꿔 새 알림마다 등장 효과와 남은 시간 막대를 다시 시작한다.
        <div
          key={cameraNotice.kind === 'recorded' ? cameraNotice.recordId : cameraNotice.kind}
          className={`camera-toast ${cameraNotice.kind}`}
          role={cameraNotice.kind === 'error' ? 'alert' : 'status'}
        >
          <img className="camera-toast-icon" src={drop} alt="" />
          <div className="camera-toast-text">
            <b>
              {cameraNotice.kind === 'recorded'
                ? '물 마신 걸 기록했어요'
                : cameraNotice.kind === 'undone'
                  ? '카메라 기록을 되돌렸어요'
                  : '기록하지 못했어요'}
            </b>
            <span>
              {cameraNotice.kind === 'error'
                ? cameraNotice.message
                : state.status === 'ready'
                  ? `오늘 ${state.todayCount}회 · 목표 ${state.goalCount}회`
                  : ''}
            </span>
          </div>
          {cameraNotice.kind === 'recorded' && (
            <button
              type="button"
              className="camera-toast-undo"
              disabled={cameraRecord.busy}
              onClick={() => void cameraRecord.undo()}
            >
              되돌리기
            </button>
          )}
          <i className="camera-toast-timer" aria-hidden="true" />
        </div>
      )}
      <main>
        {view === 'today' &&
          (state.status === 'ready' ? (
            <Today
              onSettings={() => setView('settings')}
              state={state}
              refresh={refresh}
              statistics={statistics}
              statisticsError={statisticsError}
              refreshStatistics={refreshStatistics}
            />
          ) : (
            <section className="view on">
              <div className="head">
                <h1>물 마시기 횟수 목표를 설정해 주세요</h1>
              </div>
              <p>기존 기록과 화분은 그대로 남아 있어요.</p>
              <button className="btn line" onClick={() => setView('settings')}>
                새 목표 설정하기
              </button>
            </section>
          ))}
        {view === 'history' && (
          <History
            state={state}
            statistics={statistics}
            statisticsError={statisticsError}
            refreshStatistics={refreshStatistics}
          />
        )}
        {view === 'settings' && <Settings state={state} refresh={refresh} camera={camera} />}
      </main>
    </div>
  )
}

export default Dashboard

import type { WaterStatistics } from '../../../../shared/appState'
import { WeekCups } from '../statistics/WaterStatistics'
import { dayLabel } from '../statistics/dateLabels'
import statLeft from '../../assets/icons/stat-left.webp'
import statCups from '../../assets/icons/stat-cups.webp'
import statStreak from '../../assets/icons/stat-streak.webp'
import { plantIndex, plants as stages } from '../plant/plantVisual'
import { type ConfiguredState, format } from './dashboardFormat'
import { Metric } from './parts'

export function StatisticsStatus({
  error,
  retry
}: {
  error: boolean
  retry: () => void
}): React.JSX.Element {
  return error ? (
    <p role="alert">
      통계를 불러오지 못했어요.{' '}
      <button className="cancel-retry" onClick={retry}>
        다시 시도
      </button>
    </p>
  ) : (
    <p role="status">통계를 불러오고 있어요.</p>
  )
}

export default function History({
  state,
  statistics,
  statisticsError,
  refreshStatistics
}: {
  state: ConfiguredState
  statistics: WaterStatistics | null
  statisticsError: boolean
  refreshStatistics: () => void
}): React.JSX.Element {
  const current = plantIndex(state.plantStage)
  return (
    <section className="view on" aria-label="기록">
      <div className="head">
        <h1>기록</h1>
        <span>내 화분이 자라온 길</span>
      </div>
      <div className="hist-grid">
        <div className="card journey">
          <h2>
            성장 여정 <small>누적 성장량에 따라 자라요</small>
          </h2>
          <div className="stages">
            {stages.map((stage, index) => (
              <div
                key={stage.name}
                className={`stage ${index < current ? 'done' : index === current ? 'done now' : 'todo'}`}
              >
                <img src={stage.image} alt={`${stage.name} 화분`} />
                <b>{stage.name}</b>
                <span>{index === 0 ? '시작' : index <= current ? '도달했어요' : '성장 단계'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card plain week-cups">
          <h2>
            최근 7일 물컵 <small>컵이 가득 차면 그날 목표 달성</small>
          </h2>
          {statistics ? (
            <>
              <WeekCups days={statistics.days} />
              <p className="stats-note">평균과 달성 횟수는 목표가 있던 날을 기준으로 해요.</p>
            </>
          ) : (
            <StatisticsStatus error={statisticsError} retry={refreshStatistics} />
          )}
        </div>
        <div className="col summary">
          <Metric
            icon={statCups}
            label="하루 평균"
            value={statistics?.averageCount != null ? format(statistics.averageCount) : '—'}
            unit={statistics?.averageCount != null ? '회' : ''}
          />
          <Metric
            icon={statStreak}
            label="목표 달성"
            value={statistics ? statistics.achievedDays : '—'}
            unit={statistics ? `/ ${statistics.trackedDays}일` : ''}
          />
          <Metric
            icon={statLeft}
            label="가장 많이 마신 날"
            value={
              statistics?.bestDay
                ? dayLabel(
                    statistics.bestDay.day,
                    statistics.bestDay.day === statistics.days[6].day
                  )
                : '—'
            }
            unit={statistics?.bestDay ? `${format(statistics.bestDay.drinkCount)}회` : ''}
          />
        </div>
      </div>
    </section>
  )
}

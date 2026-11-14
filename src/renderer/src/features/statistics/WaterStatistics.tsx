import { useState } from 'react'
import type { DailyStatistics } from '../../../../shared/appState'
import leaf from '../../assets/icons/stat-vit.webp'

const format = (value: number): string => value.toLocaleString('ko-KR')
import { dayLabel } from './dateLabels'

function dayDescription(day: DailyStatistics): string {
  const date = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  }).format(new Date(`${day.day}T12:00:00Z`))
  const goal =
    day.goalCount === null
      ? day.goalMl === null
        ? '목표 없음'
        : '이전 용량 목표'
      : day.achieved
        ? '목표 달성'
        : `목표까지 ${format(day.goalCount - day.drinkCount)}회 남음`
  const count = day.goalCount === null ? '횟수 기록 없음' : `${format(day.drinkCount)}회`
  return `${date}, ${count}, ${format(day.totalMl)}ml, ${goal}`
}

export function WeekChart({ days }: { days: DailyStatistics[] }): React.JSX.Element {
  const [selected, setSelected] = useState<number | null>(null)
  const width = 520,
    height = 180,
    left = 38,
    top = 14,
    bottom = height - 26
  const step = (width - left) / 7,
    barWidth = Math.min(26, step * 0.42)
  const max = Math.max(1, ...days.flatMap((day) => [day.drinkCount, (day.goalCount ?? 0) * 1.3]))
  const roughStep = max / 4
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const unit = Math.max(
    1,
    ([1, 2, 5, 10].find((step) => step * magnitude >= roughStep) ?? 10) * magnitude
  )
  const ticks = Array.from({ length: Math.floor(max / unit) + 1 }, (_, index) => index * unit)
  const y = (value: number): number => top + (bottom - top) * (1 - value / max)
  const chosen = selected === null ? null : days[selected]
  return (
    <div className="chart">
      <svg
        role="group"
        aria-label="최근 7일 물 마신 횟수와 날짜별 목표"
        viewBox={`0 0 ${width} ${height}`}
      >
        {ticks.map((value, index) => {
          return (
            <g key={index}>
              <line x1={left} x2={width} y1={y(value)} y2={y(value)} stroke="var(--line)" />
              <text
                x={left - 8}
                y={y(value) + 4}
                textAnchor="end"
                fontSize="10"
                fill="var(--text-muted)"
              >
                {format(Math.round(value))}
              </text>
            </g>
          )
        })}
        {days.map((day, index) => {
          const x = left + step * index + (step - barWidth) / 2
          return (
            <g
              key={day.day}
              tabIndex={0}
              role="img"
              aria-label={dayDescription(day)}
              onMouseEnter={() => setSelected(index)}
              onMouseLeave={() => setSelected(null)}
              onFocus={() => setSelected(index)}
              onBlur={() => setSelected(null)}
            >
              <rect
                x={left + step * index}
                y={top}
                width={step}
                height={bottom - top}
                fill="transparent"
              />
              <rect
                x={x}
                y={y(day.drinkCount)}
                width={barWidth}
                height={bottom - y(day.drinkCount)}
                rx="4"
                fill={index === 6 ? 'var(--brand)' : 'var(--brand-mid)'}
              />
              {day.goalCount !== null && (
                <line
                  x1={left + step * index}
                  x2={left + step * (index + 1)}
                  y1={y(day.goalCount)}
                  y2={y(day.goalCount)}
                  stroke="var(--text-sub)"
                  strokeWidth="1.2"
                  strokeDasharray="4 4"
                />
              )}
              <text
                x={x + barWidth / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize="11"
                fill={index === 6 ? 'var(--text)' : 'var(--text-sub)'}
                fontWeight={index === 6 ? 700 : 400}
              >
                {dayLabel(day.day, index === 6)}
              </text>
            </g>
          )
        })}
      </svg>
      {chosen && selected !== null && (
        <div
          className="tip show"
          aria-hidden="true"
          style={{
            left:
              selected <= 1
                ? 0
                : selected >= 5
                  ? undefined
                  : `${((left + step * (selected + 0.5)) / width) * 100}%`,
            right: selected >= 5 ? 0 : undefined,
            transform:
              selected <= 1 || selected >= 5 ? 'translateY(-100%)' : 'translate(-50%, -100%)',
            top: `${Math.max(15, (y(chosen.drinkCount) / height) * 100)}%`
          }}
        >
          <strong>{dayDescription(chosen).split(', ')[0]}</strong>
          <br />
          {dayDescription(chosen).split(', ').slice(1).join(' · ')}
        </div>
      )}
    </div>
  )
}

export function WeekCups({ days }: { days: DailyStatistics[] }): React.JSX.Element {
  return (
    <div className="cups">
      {days.map((day, index) => (
        <div
          className={`cupday ${index === 6 ? 'today' : ''}`}
          key={day.day}
          aria-label={dayDescription(day)}
        >
          <span className="ml num">
            {day.goalCount === null ? '—' : `${format(day.drinkCount)}회`}
          </span>
          <span style={{ position: 'relative' }}>
            <span className="glass" aria-hidden="true">
              <i
                style={{
                  height: `${day.goalCount ? Math.min(100, (day.drinkCount / day.goalCount) * 100) : 0}%`
                }}
              />
            </span>
            {day.achieved && (
              <img
                className="leaf"
                src={leaf}
                alt=""
                style={{ position: 'absolute', top: -10, right: -12, width: 28 }}
              />
            )}
          </span>
          <span className="day">{dayLabel(day.day, index === 6)}</span>
        </div>
      ))}
    </div>
  )
}

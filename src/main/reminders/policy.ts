import type { ReminderSettings } from '../../shared/appState'

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const seoulTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

export function validReminderSettings(value: unknown): value is ReminderSettings {
  if (!value || typeof value !== 'object') return false
  const settings = value as ReminderSettings
  return (
    typeof settings.enabled === 'boolean' &&
    Number.isInteger(settings.intervalMinutes) &&
    settings.intervalMinutes >= 60 &&
    settings.intervalMinutes <= 480 &&
    settings.intervalMinutes % 60 === 0 &&
    typeof settings.startTime === 'string' &&
    typeof settings.endTime === 'string' &&
    timePattern.test(settings.startTime) &&
    timePattern.test(settings.endTime) &&
    settings.startTime !== settings.endTime
  )
}

export function shouldRemind(input: {
  settings: ReminderSettings
  now: Date
  goalStartedAt: string | null
  latestRecordAt: string | null
  lastNotifiedAt: string | null
  todayCount: number
  goalCount: number | null
}): boolean {
  const { settings, now, goalStartedAt, latestRecordAt, lastNotifiedAt, todayCount, goalCount } =
    input
  const timestamp = now.getTime()
  if (
    !validReminderSettings(settings) ||
    !settings.enabled ||
    !Number.isFinite(timestamp) ||
    !goalStartedAt ||
    !Number.isFinite(todayCount) ||
    goalCount === null ||
    !Number.isFinite(goalCount) ||
    goalCount <= 0 ||
    todayCount >= goalCount
  )
    return false
  const time = seoulTime.format(now)
  const inWindow =
    settings.startTime < settings.endTime
      ? time >= settings.startTime && time < settings.endTime
      : time >= settings.startTime || time < settings.endTime
  if (!inWindow) return false
  const start = Date.parse(goalStartedAt)
  const latest = latestRecordAt === null ? start : Date.parse(latestRecordAt)
  const lastNotice = lastNotifiedAt === null ? start : Date.parse(lastNotifiedAt)
  if (![start, latest, lastNotice].every(Number.isFinite)) return false
  const interval = settings.intervalMinutes * 60_000
  return timestamp - Math.max(start, latest, lastNotice) >= interval
}

export function reminderBody(vitality: number): string {
  return vitality < 45
    ? '저 곧 말라비틀어질 것 같아요… 물 한 잔 어때요?'
    : '물 마신 지 꽤 지났어요. 저도 조금 목이 말라요.'
}

export function dayLabel(day: string, current: boolean): string {
  return current
    ? '오늘'
    : new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(
        new Date(`${day}T12:00:00Z`)
      )
}

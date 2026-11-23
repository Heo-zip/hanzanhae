import type { AppState } from '../../../../shared/appState'

export type ConfiguredState = Exclude<AppState, { status: 'setup-required' }>

export const format = (value: number): string => value.toLocaleString('ko-KR')

// 앱의 하루 기준인 한국 시간으로 날짜와 기록 시각을 표시한다.
export const dayFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  weekday: 'short'
})
export const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

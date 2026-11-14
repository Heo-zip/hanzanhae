import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

type Props = { label: string; value: string; disabled: boolean; onChange: (value: string) => void }
type Part = 'hour' | 'minute'
const pad = (value: number): string => String(value).padStart(2, '0')

export default function TimeSelect({ label, value, disabled, onChange }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const hourList = useRef<HTMLDivElement>(null)
  const minuteList = useRef<HTMLDivElement>(null)
  const id = useId()
  const [hour, minute] = value.split(':').map(Number)

  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const width = 240
      const height = 250
      const below = window.innerHeight - rect.bottom
      const top = below >= height + 8 || below >= rect.top ? rect.bottom + 6 : rect.top - height - 6
      setPosition({
        top: Math.max(6, Math.min(top, window.innerHeight - height - 6)),
        left: Math.max(6, Math.min(rect.left, window.innerWidth - width - 6))
      })
    }
    const outside = (event: MouseEvent): void => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      )
        setOpen(false)
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('mousedown', outside)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      document.removeEventListener('mousedown', outside)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    for (const list of [hourList.current, minuteList.current]) {
      const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]')
      if (list && selected)
        list.scrollTop = Math.max(
          0,
          selected.offsetTop - list.clientHeight / 2 + selected.clientHeight / 2
        )
    }
    hourList.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.focus({ preventScroll: true })
  }, [open])

  function choose(part: Part, next: number): void {
    onChange(part === 'hour' ? `${pad(next)}:${pad(minute)}` : `${pad(hour)}:${pad(next)}`)
  }

  function navigate(event: KeyboardEvent<HTMLDivElement>, part: Part, current: number): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus()
      return
    }
    if (
      (event.key === 'ArrowRight' && part === 'hour') ||
      (event.key === 'ArrowLeft' && part === 'minute')
    ) {
      event.preventDefault()
      const targetPart = part === 'hour' ? 'minute' : 'hour'
      const targetValue = part === 'hour' ? minute : hour
      document.getElementById(`${id}-${targetPart}-${targetValue}`)?.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const last = part === 'hour' ? 23 : 59
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : Math.max(0, Math.min(last, current + (event.key === 'ArrowDown' ? 1 : -1)))
    choose(part, next)
    requestAnimationFrame(() => document.getElementById(`${id}-${part}-${next}`)?.focus())
  }

  function list(part: Part, current: number, count: number): React.JSX.Element {
    return (
      <div
        ref={part === 'hour' ? hourList : minuteList}
        className="reminder-time-list"
        role="listbox"
        aria-label={`${label} ${part === 'hour' ? '시' : '분'}`}
        onKeyDown={(event) => navigate(event, part, current)}
      >
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            id={`${id}-${part}-${index}`}
            role="option"
            aria-selected={current === index}
            tabIndex={current === index ? 0 : -1}
            className="reminder-time-option"
            onClick={() => choose(part, index)}
          >
            {pad(index)}
            <span className="reminder-time-unit">{part === 'hour' ? '시' : '분'}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="reminder-time-trigger"
        aria-label={`${label} ${value}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value}</span>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M10 6v4l2.5 1.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            id={id}
            role="dialog"
            aria-label={label}
            aria-describedby={`${id}-instructions`}
            className="reminder-time-popup"
            style={position}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(event.relatedTarget as Node) &&
                event.relatedTarget !== trigger.current
              )
                setOpen(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setOpen(false)
                trigger.current?.focus()
              }
            }}
          >
            <span id={`${id}-instructions`} className="reminder-visually-hidden">
              위아래 방향키로 값을 바꾸고 좌우 방향키로 시와 분을 이동해요.
            </span>
            <div className="reminder-time-popup-head">
              <b>{label}</b>
              <span>{value}</span>
            </div>
            <div className="reminder-time-columns">
              {list('hour', hour, 24)}
              {list('minute', minute, 60)}
            </div>
            <button
              type="button"
              className="reminder-time-done"
              onClick={() => {
                setOpen(false)
                trigger.current?.focus()
              }}
            >
              완료
            </button>
          </div>,
          document.body
        )}
    </>
  )
}

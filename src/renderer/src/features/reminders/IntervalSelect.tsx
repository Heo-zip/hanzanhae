import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

type Props = { value: number; disabled: boolean; onChange: (value: number) => void }

export default function IntervalSelect({ value, disabled, onChange }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(value)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 0 })
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const place = (): void => {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const below = window.innerHeight - rect.bottom - 12
      const above = rect.top - 12
      const height = Math.min(240, Math.max(below, above))
      setPosition({
        top: below >= 240 || below >= above ? rect.bottom + 6 : Math.max(6, rect.top - height - 6),
        left: Math.max(6, Math.min(rect.left, window.innerWidth - Math.max(140, rect.width) - 6)),
        width: Math.max(140, rect.width),
        maxHeight: Math.max(0, height - 6)
      })
    }
    const outside = (event: MouseEvent): void => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !list.current?.contains(event.target as Node)
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
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, id, open])

  function choose(minutes: number): void {
    onChange(minutes)
    setOpen(false)
    trigger.current?.focus()
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    } else if (event.key === 'Tab') {
      setOpen(false)
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      if (!open) {
        setActive(value)
        setOpen(true)
      } else {
        setActive((current) =>
          event.key === 'Home'
            ? 60
            : event.key === 'End'
              ? 480
              : Math.max(60, Math.min(480, current + (event.key === 'ArrowDown' ? 60 : -60)))
        )
      }
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault()
      choose(active)
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="reminder-interval-trigger"
        role="combobox"
        aria-label="알림 간격"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        aria-haspopup="listbox"
        disabled={disabled}
        onKeyDown={keyDown}
        onClick={() => {
          setActive(value)
          setOpen((current) => !current)
        }}
      >
        {value / 60}시간 <span aria-hidden="true">⌄</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-label="알림 간격"
            className="reminder-interval-list"
            style={position}
          >
            {Array.from({ length: 8 }, (_, index) => (index + 1) * 60).map((minutes) => (
              <div
                key={minutes}
                id={`${id}-${minutes}`}
                role="option"
                aria-selected={minutes === value}
                className={`reminder-interval-option ${minutes === active ? 'is-active' : ''}`}
                onMouseMove={() => setActive(minutes)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(minutes)}
              >
                {minutes / 60}시간 {minutes === value && <span aria-hidden="true">✓</span>}
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}

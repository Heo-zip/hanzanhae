import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const path = fileURLToPath(new URL('../src/main/reminders/policy.ts', import.meta.url))
const source = ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const moduleUnderTest = new Module(path)
moduleUnderTest.filename = path
moduleUnderTest._compile(source, path)
const { validReminderSettings, shouldRemind, reminderBody } = moduleUnderTest.exports

const settings = { enabled: true, intervalMinutes: 120, startTime: '09:00', endTime: '21:00' }
const sample = {
  settings,
  goalStartedAt: '2026-11-13T00:00:00.000Z',
  latestRecordAt: null,
  lastNotifiedAt: null,
  todayMl: 0,
  goalMl: 1500,
  now: new Date('2026-11-13T02:00:00.000Z')
}

test('활성 목표의 시작이나 유효한 물 기록과 마지막 알림 이후 간격을 지킨다', () => {
  assert.equal(shouldRemind(sample), true)
  assert.equal(shouldRemind({ ...sample, now: new Date('2026-11-13T01:59:59.999Z') }), false)
  assert.equal(shouldRemind({ ...sample, latestRecordAt: '2026-11-13T01:00:00.000Z' }), false)
  assert.equal(shouldRemind({ ...sample, lastNotifiedAt: '2026-11-13T01:59:00.000Z' }), false)
  assert.equal(shouldRemind({ ...sample, lastNotifiedAt: '2026-11-13T03:00:00.000Z' }), false)
})

test('꺼진 알림, 목표 없음, 목표 달성 상태에서는 알리지 않는다', () => {
  assert.equal(shouldRemind({ ...sample, settings: { ...settings, enabled: false } }), false)
  assert.equal(shouldRemind({ ...sample, goalMl: null }), false)
  assert.equal(shouldRemind({ ...sample, todayMl: 1500 }), false)
  assert.equal(shouldRemind({ ...sample, goalStartedAt: null }), false)
  assert.equal(shouldRemind({ ...sample, latestRecordAt: '잘못된 시각' }), false)
})

test('한국 시간의 시작은 포함하고 끝은 제외하며 자정을 넘기는 시간대도 처리한다', () => {
  assert.equal(
    shouldRemind({
      ...sample,
      goalStartedAt: '2026-11-12T00:00:00Z',
      now: new Date('2026-11-13T00:00:00Z')
    }),
    true
  )
  assert.equal(shouldRemind({ ...sample, now: new Date('2026-11-13T12:00:00Z') }), false)
  const night = { ...settings, startTime: '22:00', endTime: '02:00' }
  assert.equal(
    shouldRemind({ ...sample, settings: night, now: new Date('2026-11-13T14:00:00Z') }),
    true
  )
  assert.equal(
    shouldRemind({ ...sample, settings: night, now: new Date('2026-11-13T17:00:00Z') }),
    false
  )
})

test('시간·간격 설정을 검사하고 식물 생기에 따라 문구를 선택한다', () => {
  assert.equal(validReminderSettings(settings), true)
  for (const bad of [
    { ...settings, enabled: 1 },
    { ...settings, intervalMinutes: 59 },
    { ...settings, intervalMinutes: 481 },
    { ...settings, intervalMinutes: 90 },
    { ...settings, startTime: '24:00' },
    { ...settings, endTime: '09:00' }
  ])
    assert.equal(validReminderSettings(bad), false)
  assert.match(reminderBody(44), /말라/)
  assert.match(reminderBody(45), /목이 말라/)
})

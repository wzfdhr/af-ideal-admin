import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { test } from 'node:test'
import calendar from '../../services/reference-api/dist/report-schedule-calendar.js'

const {
  nextReportScheduleOccurrence: next,
  reportScheduleDateRange: window,
  localReportScheduleDate: localDate,
} = calendar
const daily = (timeZone = 'Asia/Shanghai', time = '09:00') => ({
  frequency: 'daily',
  timeZone,
  time,
})
const weekly = (weekday, timeZone = 'UTC', time = '09:00') => ({
  frequency: 'weekly',
  weekday,
  timeZone,
  time,
})
const monthly = (dayOfMonth, timeZone = 'UTC', time = '09:00') => ({
  frequency: 'monthly',
  dayOfMonth,
  timeZone,
  time,
})
const occurrence = (timing, after) =>
  next(timing, new Date(after)).toISOString()
const invalid = (callback, code) =>
  assert.throws(
    callback,
    (error) =>
      error.name === 'DomainError' &&
      error.status === 422 &&
      (!code || error.businessCode === code)
  )

test('Shanghai next slots are strictly after the input instant and preserve their arguments', () => {
  const timing = daily()
  const after = new Date('2026-10-13T00:59:59.999Z')
  assert.equal(next(timing, after).toISOString(), '2026-10-13T01:00:00.000Z')
  assert.equal(after.toISOString(), '2026-10-13T00:59:59.999Z')
  assert.deepEqual(timing, daily())
  assert.equal(
    occurrence(timing, '2026-10-13T01:00:00Z'),
    '2026-10-14T01:00:00.000Z'
  )
  assert.equal(
    occurrence(timing, '2026-10-13T01:00:00.001Z'),
    '2026-10-14T01:00:00.000Z'
  )
  assert.equal(
    occurrence(daily('Asia/Shanghai', '00:00'), '2026-10-13T15:59:59Z'),
    '2026-10-13T16:00:00.000Z'
  )
  assert.equal(
    localDate('Asia/Shanghai', new Date('2026-10-13T16:00:00Z')),
    '2026-10-14'
  )
})

test('New York spring gaps skip the local date instead of shifting a requested time', () => {
  assert.equal(
    occurrence(daily('America/New_York', '02:30'), '2024-03-09T08:00:00Z'),
    '2024-03-11T06:30:00.000Z'
  )
  assert.equal(
    occurrence(weekly(7, 'America/New_York', '02:30'), '2024-03-09T08:00:00Z'),
    '2024-03-17T06:30:00.000Z'
  )
  assert.equal(
    occurrence(
      monthly(10, 'America/New_York', '02:30'),
      '2024-03-09T08:00:00Z'
    ),
    '2024-04-10T06:30:00.000Z'
  )
})

test('New York fall folds select only the first UTC instant even when the cursor is between folds', () => {
  const timing = daily('America/New_York', '01:30')
  assert.equal(
    occurrence(timing, '2024-11-03T05:29:59.999Z'),
    '2024-11-03T05:30:00.000Z'
  )
  ;[
    '2024-11-03T05:30:00Z',
    '2024-11-03T05:30:00.001Z',
    '2024-11-03T05:45:00Z',
    '2024-11-03T06:15:00Z',
    '2024-11-03T06:30:00Z',
  ].forEach((after) =>
    assert.equal(occurrence(timing, after), '2024-11-04T06:30:00.000Z')
  )
  assert.equal(
    occurrence(weekly(7, 'America/New_York', '01:30'), '2024-11-03T06:15:00Z'),
    '2024-11-10T06:30:00.000Z'
  )
  assert.equal(
    occurrence(monthly(3, 'America/New_York', '01:30'), '2024-11-03T06:15:00Z'),
    '2024-12-03T06:30:00.000Z'
  )
  const instants = []
  let cursor = new Date('2024-11-01T00:00:00Z')
  Array.from({ length: 5 }).forEach(() => {
    cursor = next(timing, cursor)
    instants.push(cursor.toISOString())
  })
  assert.deepEqual(instants, [
    '2024-11-01T05:30:00.000Z',
    '2024-11-02T05:30:00.000Z',
    '2024-11-03T05:30:00.000Z',
    '2024-11-04T06:30:00.000Z',
    '2024-11-05T06:30:00.000Z',
  ])
  assert.equal(
    new Set(
      instants.map((instant) => localDate(timing.timeZone, new Date(instant)))
    ).size,
    5
  )
})

test('Lord Howe half-hour DST changes skip gaps and reject the second fold', () => {
  assert.equal(
    occurrence(daily('Australia/Lord_Howe', '02:15'), '2024-10-05T03:00:00Z'),
    '2024-10-06T15:15:00.000Z'
  )
  const timing = daily('Australia/Lord_Howe', '01:45')
  assert.equal(
    occurrence(timing, '2024-04-06T14:44:59Z'),
    '2024-04-06T14:45:00.000Z'
  )
  assert.equal(
    occurrence(timing, '2024-04-06T14:45:00Z'),
    '2024-04-07T15:15:00.000Z'
  )
  assert.equal(
    occurrence(timing, '2024-04-06T15:05:00Z'),
    '2024-04-07T15:15:00.000Z'
  )
})

test('Apia whole-day gap skips December30 without losing the local slot identity', () => {
  const timing = daily('Pacific/Apia', '09:00')
  const instant = next(timing, new Date('2011-12-29T20:00:00Z'))
  assert.equal(instant.toISOString(), '2011-12-30T19:00:00.000Z')
  assert.equal(localDate(timing.timeZone, instant), '2011-12-31')
  assert.equal(
    occurrence(weekly(5, 'Pacific/Apia', '09:00'), '2011-12-29T20:00:00Z'),
    '2012-01-05T19:00:00.000Z'
  )
  assert.deepEqual(
    window(timing, 'previous-period', instant),
    { from: '2011-12-30', to: '2011-12-30' },
    'A missing physical day still has an explicit civil previous-day window'
  )
})

test('historical second-based offsets are retained instead of rounded to a minute', () => {
  assert.equal(
    occurrence(daily('Europe/Paris', '12:00'), '1900-01-01T00:00:00Z'),
    '1900-01-01T11:50:39.000Z'
  )
  assert.equal(
    occurrence(daily('Asia/Kathmandu', '12:00'), '1900-01-01T00:00:00Z'),
    '1900-01-01T06:18:44.000Z'
  )
})

test('monthly Gregorian dates skip missing month days and handle leap-century rules', () => {
  assert.equal(
    occurrence(monthly(31), '2024-01-31T09:00:00Z'),
    '2024-03-31T09:00:00.000Z'
  )
  assert.equal(
    occurrence(monthly(31), '2024-03-31T09:00:00Z'),
    '2024-05-31T09:00:00.000Z'
  )
  assert.equal(
    occurrence(monthly(31), '2024-07-31T09:00:00Z'),
    '2024-08-31T09:00:00.000Z'
  )
  assert.equal(
    occurrence(monthly(29), '2024-02-01T00:00:00Z'),
    '2024-02-29T09:00:00.000Z'
  )
  assert.equal(
    occurrence(monthly(29), '2023-02-01T00:00:00Z'),
    '2023-03-29T09:00:00.000Z'
  )
  assert.equal(
    occurrence(monthly(29), '1900-02-01T00:00:00Z'),
    '1900-03-29T09:00:00.000Z'
  )
  assert.equal(
    occurrence(monthly(29), '2000-02-01T00:00:00Z'),
    '2000-02-29T09:00:00.000Z'
  )
  assert.equal(
    occurrence(monthly(29), '2100-02-01T00:00:00Z'),
    '2100-03-29T09:00:00.000Z'
  )
})

test('weekly ISO weekdays and natural windows cross a year boundary correctly', () => {
  assert.equal(
    occurrence(weekly(1, 'UTC', '00:00'), '2020-12-31T00:00:00Z'),
    '2021-01-04T00:00:00.000Z'
  )
  const friday = new Date('2021-01-01T09:00:00Z')
  assert.deepEqual(window(weekly(5), 'current-period', friday), {
    from: '2020-12-28',
    to: '2021-01-01',
  })
  assert.deepEqual(window(weekly(5), 'previous-period', friday), {
    from: '2020-12-21',
    to: '2020-12-27',
  })
  const monday = new Date('2021-01-04T00:00:00Z')
  assert.deepEqual(
    window(weekly(1, 'UTC', '00:00'), 'previous-period', monday),
    { from: '2020-12-28', to: '2021-01-03' }
  )
})

test('period windows use the rule local date and never the UTC date or a rolling duration', () => {
  const shanghaiSlot = new Date('2026-10-12T16:05:00Z')
  assert.deepEqual(
    window(daily('Asia/Shanghai', '00:05'), 'current-period', shanghaiSlot),
    { from: '2026-10-13', to: '2026-10-13' }
  )
  assert.deepEqual(
    window(daily('Asia/Shanghai', '00:05'), 'previous-period', shanghaiSlot),
    { from: '2026-10-12', to: '2026-10-12' }
  )
  const newYorkSlot = new Date('2026-10-13T00:05:00Z')
  assert.equal(localDate('America/New_York', newYorkSlot), '2026-10-12')
  assert.deepEqual(
    window(daily('America/New_York', '20:05'), 'current-period', newYorkSlot),
    { from: '2026-10-12', to: '2026-10-12' }
  )
  assert.deepEqual(
    window(
      daily('America/New_York', '02:30'),
      'previous-period',
      new Date('2024-03-11T06:30:00Z')
    ),
    { from: '2024-03-10', to: '2024-03-10' }
  )
  assert.deepEqual(
    window(
      monthly(1, 'Asia/Shanghai', '00:05'),
      'previous-period',
      new Date('2024-02-29T16:05:00Z')
    ),
    { from: '2024-02-01', to: '2024-02-29' }
  )
  assert.deepEqual(
    window(monthly(15), 'current-period', new Date('2024-03-15T09:00:00Z')),
    { from: '2024-03-01', to: '2024-03-15' }
  )
  assert.deepEqual(
    window(
      monthly(1, 'Pacific/Kiritimati', '02:05'),
      'current-period',
      new Date('2026-12-31T12:05:00Z')
    ),
    { from: '2027-01-01', to: '2027-01-01' }
  )
})

test('closed timing rejects invalid clocks, zones, frequencies and mismatched day selectors', () => {
  const after = new Date('2026-10-13T00:00:00Z')
  ;[
    '0:00',
    '00:0',
    '24:00',
    '23:60',
    '09:00:00',
    ' 09:00',
    '09:00 ',
    '９:００',
    '* * * * *',
    '',
  ].forEach((time) =>
    invalid(
      () => next(daily('UTC', time), after),
      'REPORT_SCHEDULE_TIME_INVALID'
    )
  )
  ;['EST', '+08:00', 'GMT', 'AsiaShanghai', 'Unknown/Nowhere'].forEach((zone) =>
    invalid(() => next(daily(zone), after))
  )
  ;[0, 8, 1.5, '1', undefined].forEach((weekday) =>
    invalid(
      () => next(weekly(weekday), after),
      'REPORT_SCHEDULE_TIMING_INVALID'
    )
  )
  ;[0, 32, 1.5, '1', undefined].forEach((day) =>
    invalid(() => next(monthly(day), after), 'REPORT_SCHEDULE_TIMING_INVALID')
  )
  ;[
    { ...daily(), weekday: 1 },
    { ...daily(), weekday: undefined },
    { ...daily(), dayOfMonth: 1 },
    { ...weekly(1), dayOfMonth: 1 },
    { ...monthly(1), weekday: 1 },
    { ...daily(), frequency: 'hourly' },
    { ...daily(), cron: '0 9 * * *' },
    null,
    [],
    Object.create({ frequency: 'daily', timeZone: 'UTC', time: '09:00' }),
  ].forEach((timing) =>
    invalid(() => next(timing, after), 'REPORT_SCHEDULE_TIMING_INVALID')
  )
  invalid(
    () => next(daily(), new Date('invalid')),
    'REPORT_SCHEDULE_INSTANT_INVALID'
  )
  invalid(
    () => localDate('UTC', '2026-10-13'),
    'REPORT_SCHEDULE_INSTANT_INVALID'
  )
  invalid(
    () => window(daily(), 'next-period', after),
    'REPORT_SCHEDULE_WINDOW_INVALID'
  )
})

test('1900–2200 bounds cover local dates and window endpoints without silently clamping', () => {
  invalid(
    () => localDate('UTC', new Date('-002026-01-01T00:00:00Z')),
    'REPORT_SCHEDULE_DATE_OUT_OF_RANGE'
  )
  assert.equal(
    occurrence(daily('UTC', '00:00'), '1900-01-01T00:00:00Z'),
    '1900-01-02T00:00:00.000Z'
  )
  assert.equal(
    occurrence(daily('UTC', '12:00'), '2200-12-31T11:59:59Z'),
    '2200-12-31T12:00:00.000Z'
  )
  invalid(
    () => next(daily('UTC', '12:00'), new Date('2200-12-31T12:00:00Z')),
    'REPORT_SCHEDULE_CALENDAR_EXHAUSTED'
  )
  invalid(
    () => next(daily('UTC'), new Date('1899-12-31T23:59:59Z')),
    'REPORT_SCHEDULE_DATE_OUT_OF_RANGE'
  )
  invalid(
    () => localDate('Pacific/Kiritimati', new Date('2200-12-31T12:00:00Z')),
    'REPORT_SCHEDULE_DATE_OUT_OF_RANGE'
  )
  invalid(
    () =>
      window(
        daily('UTC', '00:00'),
        'previous-period',
        new Date('1900-01-01T00:00:00Z')
      ),
    'REPORT_SCHEDULE_DATE_OUT_OF_RANGE'
  )
  invalid(
    () =>
      window(monthly(1), 'previous-period', new Date('1900-01-01T09:00:00Z')),
    'REPORT_SCHEDULE_DATE_OUT_OF_RANGE'
  )
})

test('calendar uses a finite400-day search and bounded offset probes rather than scanning minutes', (context) => {
  const original = Intl.DateTimeFormat.prototype.formatToParts
  let calls = 0
  const spy = context.mock.method(
    Intl.DateTimeFormat.prototype,
    'formatToParts',
    function (...args) {
      calls++
      return original.apply(this, args)
    }
  )
  const started = performance.now()
  let cursor = new Date('2024-03-01T00:00:00Z')
  const timing = daily('America/New_York', '02:30')
  Array.from({ length: 100 }).forEach(() => {
    cursor = next(timing, cursor)
  })
  assert.ok(
    performance.now() - started < 3000,
    '100 real-zone schedules complete within a generous CPU budget'
  )
  assert.ok(
    calls < 4000,
    `Only bounded offset probes were used, observed ${calls} format calls`
  )
  spy.mock.restore()
  calls = 0
  const noSlot = context.mock.method(
    Intl.DateTimeFormat.prototype,
    'formatToParts',
    function (...args) {
      calls++
      return original
        .apply(this, args)
        .map((part) =>
          part.type === 'second' ? { ...part, value: '01' } : part
        )
    }
  )
  invalid(
    () => next(daily('UTC', '00:00'), new Date('2026-01-01T00:00:00Z')),
    'REPORT_SCHEDULE_CALENDAR_EXHAUSTED'
  )
  assert.equal(
    calls,
    5601,
    '400 candidate dates each use13 offset probes plus1 candidate validation, after the initial local-date read'
  )
  noSlot.mock.restore()
})

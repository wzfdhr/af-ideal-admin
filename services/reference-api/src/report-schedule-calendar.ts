import { DomainError, parseReportingTimeZone } from '@af-admin/contracts'

interface CalendarTimingBase {
  timeZone: string
  time: string
}

export type CalendarTiming = CalendarTimingBase &
  (
    | { frequency: 'daily'; weekday?: never; dayOfMonth?: never }
    | { frequency: 'weekly'; weekday: number; dayOfMonth?: never }
    | { frequency: 'monthly'; dayOfMonth: number; weekday?: never }
  )

interface LocalComponents {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const DAY = 86400000
const HOUR = 3600000
const MIN_YEAR = 1900
const MAX_YEAR = 2200
const SEARCH_DAYS = 400
const OFFSET_PROBES = Array.from(
  { length: 13 },
  (_, index) => (index - 6) * 6 * HOUR
)
const formatters = new Map<string, Intl.DateTimeFormat>()

const invalidCalendar = (code: string, message: string): never => {
  throw new DomainError(422, code, message)
}

const validInstant = (instant: Date): number => {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime()))
    invalidCalendar(
      'REPORT_SCHEDULE_INSTANT_INVALID',
      '定时报表时刻必须为有效Date'
    )
  // Intl's Gregorian year part omits the era by default. Reject distant UTC years
  // before formatting so a BCE year cannot masquerade as an allowed AD year.
  const year = instant.getUTCFullYear()
  if (year < MIN_YEAR - 1 || year > MAX_YEAR + 1)
    invalidCalendar(
      'REPORT_SCHEDULE_DATE_OUT_OF_RANGE',
      '定时报表本地日期必须在1900至2200年之间'
    )
  return instant.getTime()
}

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  const zone = parseReportingTimeZone(timeZone)
  const cached = formatters.get(zone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const resolved = formatter.resolvedOptions()
  if (
    resolved.calendar !== 'gregory' ||
    resolved.numberingSystem !== 'latn' ||
    resolved.hourCycle !== 'h23'
  )
    invalidCalendar(
      'REPORT_SCHEDULE_INTL_UNSUPPORTED',
      '当前Intl运行时不支持明确的Gregorian/latn/h23日历'
    )
  formatters.set(zone, formatter)
  return formatter
}

const localComponents = (
  formatter: Intl.DateTimeFormat,
  instant: number
): LocalComponents => {
  const parts = new Map(
    formatter.formatToParts(instant).map((part) => [part.type, part.value])
  )
  const part = (key: Intl.DateTimeFormatPartTypes): number => {
    const value = Number(parts.get(key))
    if (!Number.isInteger(value))
      invalidCalendar(
        'REPORT_SCHEDULE_INTL_UNSUPPORTED',
        'Intl未返回完整的Gregorian日期时间分量'
      )
    return value
  }
  const result = {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  }
  if (
    result.month < 1 ||
    result.month > 12 ||
    result.day < 1 ||
    result.day > 31 ||
    result.hour < 0 ||
    result.hour > 23 ||
    result.minute < 0 ||
    result.minute > 59 ||
    result.second < 0 ||
    result.second > 59
  )
    invalidCalendar(
      'REPORT_SCHEDULE_INTL_UNSUPPORTED',
      'Intl返回了不受支持的日期时间分量'
    )
  return result
}

const boundedYear = (year: number): void => {
  if (year < MIN_YEAR || year > MAX_YEAR)
    invalidCalendar(
      'REPORT_SCHEDULE_DATE_OUT_OF_RANGE',
      '定时报表本地日期必须在1900至2200年之间'
    )
}

const dateText = (date: Date): string => {
  boundedYear(date.getUTCFullYear())
  return date.toISOString().slice(0, 10)
}

const civilDate = (parts: LocalComponents): Date => {
  boundedYear(parts.year)
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

const asUtcComponents = (parts: LocalComponents): number =>
  Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )

const validateTiming = (timing: CalendarTiming): void => {
  if (
    !timing ||
    typeof timing !== 'object' ||
    Array.isArray(timing) ||
    (Object.getPrototypeOf(timing) !== Object.prototype &&
      Object.getPrototypeOf(timing) !== null)
  )
    invalidCalendar(
      'REPORT_SCHEDULE_TIMING_INVALID',
      '定时规则必须是明确的数据对象'
    )
  if (
    timing.frequency !== 'daily' &&
    timing.frequency !== 'weekly' &&
    timing.frequency !== 'monthly'
  )
    invalidCalendar(
      'REPORT_SCHEDULE_TIMING_INVALID',
      '定时频率仅支持每日、每周或每月'
    )
  const allowed = ['frequency', 'timeZone', 'time']
  if (timing.frequency === 'weekly') allowed.push('weekday')
  if (timing.frequency === 'monthly') allowed.push('dayOfMonth')
  if (Object.keys(timing).some((key) => !allowed.includes(key)))
    invalidCalendar(
      'REPORT_SCHEDULE_TIMING_INVALID',
      '定时规则包含当前频率不允许的字段'
    )
  if (
    typeof timing.time !== 'string' ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timing.time)
  )
    invalidCalendar(
      'REPORT_SCHEDULE_TIME_INVALID',
      '定时时间必须为有效且精确的HH:mm格式'
    )
  if (
    timing.frequency === 'weekly' &&
    (!Number.isInteger(timing.weekday) ||
      timing.weekday < 1 ||
      timing.weekday > 7)
  )
    invalidCalendar(
      'REPORT_SCHEDULE_TIMING_INVALID',
      '每周定时必须指定ISO星期1至7'
    )
  if (
    timing.frequency === 'monthly' &&
    (!Number.isInteger(timing.dayOfMonth) ||
      timing.dayOfMonth < 1 ||
      timing.dayOfMonth > 31)
  )
    invalidCalendar(
      'REPORT_SCHEDULE_TIMING_INVALID',
      '每月定时必须指定日期1至31'
    )
  formatterFor(timing.timeZone)
}

const dayMatches = (timing: CalendarTiming, date: Date): boolean => {
  if (timing.frequency === 'weekly')
    return (date.getUTCDay() || 7) === timing.weekday
  if (timing.frequency === 'monthly')
    return date.getUTCDate() === timing.dayOfMonth
  return true
}

/** Resolve a civil minute from actual Intl offsets; never normalize a gap forward. */
const firstLocalInstant = (
  formatter: Intl.DateTimeFormat,
  date: Date,
  hour: number,
  minute: number
): number | undefined => {
  const target: LocalComponents = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour,
    minute,
    second: 0,
  }
  const naive = asUtcComponents(target)
  // Seconds are retained in the derived offsets (e.g. Paris1900 +00:09:21).
  const offsets = new Set(
    OFFSET_PROBES.map((probe) => {
      const sample = naive + probe
      return asUtcComponents(localComponents(formatter, sample)) - sample
    })
  )
  const candidates = Array.from(offsets)
    .map((offset) => naive - offset)
    .filter((instant) => {
      const actual = localComponents(formatter, instant)
      return (
        actual.year === target.year &&
        actual.month === target.month &&
        actual.day === target.day &&
        actual.hour === hour &&
        actual.minute === minute &&
        actual.second === 0
      )
    })
    .sort((left, right) => left - right)
  return candidates[0]
}

/** A fold's earliest instant is selected before strict-after filtering: no second fold run. */
export const nextReportScheduleOccurrence = (
  timing: CalendarTiming,
  after: Date
): Date => {
  validateTiming(timing)
  const threshold = validInstant(after)
  const formatter = formatterFor(timing.timeZone)
  const start = civilDate(localComponents(formatter, threshold)).getTime()
  const [hour, minute] = timing.time.split(':').map(Number)
  for (let offset = 0; offset < SEARCH_DAYS; offset++) {
    const date = new Date(start + offset * DAY)
    if (date.getUTCFullYear() > MAX_YEAR) break
    if (dayMatches(timing, date)) {
      const candidate = firstLocalInstant(formatter, date, hour, minute)
      if (candidate !== undefined && candidate > threshold)
        return new Date(candidate)
    }
  }
  return invalidCalendar(
    'REPORT_SCHEDULE_CALENDAR_EXHAUSTED',
    '未来400个本地日期内没有可执行时刻，或已超出1900至2200年范围'
  )
}

export const localReportScheduleDate = (
  timeZone: string,
  instant: Date
): string =>
  dateText(
    civilDate(localComponents(formatterFor(timeZone), validInstant(instant)))
  )

export const reportScheduleDateRange = (
  timing: CalendarTiming,
  mode: 'previous-period' | 'current-period',
  occurrence: Date
): { from: string; to: string } => {
  validateTiming(timing)
  if (mode !== 'previous-period' && mode !== 'current-period')
    invalidCalendar(
      'REPORT_SCHEDULE_WINDOW_INVALID',
      '定时报表仅支持前一周期或当前周期数据窗'
    )
  const day = civilDate(
    localComponents(formatterFor(timing.timeZone), validInstant(occurrence))
  )
  let from = day
  let to = day
  if (timing.frequency === 'daily') {
    if (mode === 'previous-period') {
      from = new Date(day.getTime() - DAY)
      to = from
    }
  } else if (timing.frequency === 'weekly') {
    from = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY)
    if (mode === 'previous-period') {
      to = new Date(from.getTime() - DAY)
      from = new Date(from.getTime() - 7 * DAY)
    }
  } else {
    from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1))
    if (mode === 'previous-period') {
      to = new Date(from.getTime() - DAY)
      from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 1, 1))
    }
  }
  return { from: dateText(from), to: dateText(to) }
}

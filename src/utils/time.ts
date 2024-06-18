import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import cn from 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale(cn)

type TimeType = string | number | Date

// how many time left till deadline
export const toNow = (time: TimeType) => dayjs(time).toNow()
// how many time passed after the given point
export const fromNow = (time: TimeType) => dayjs(time).fromNow()

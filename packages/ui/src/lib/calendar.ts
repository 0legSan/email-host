export function formatCalendarDate(date: Date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (year < 1) return null
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  return formatCalendarDate(date) === value ? date : null
}

export function shiftCalendarMonth(date: Date, amount: number) {
  const result = new Date(date)
  result.setDate(1)
  result.setMonth(result.getMonth() + amount)
  const lastDay = new Date(result)
  lastDay.setMonth(lastDay.getMonth() + 1, 0)
  result.setDate(Math.min(date.getDate(), lastDay.getDate()))
  return result
}

export function calendarDays(month: Date, weekStartsOn: 0 | 1) {
  const start = new Date(month)
  start.setDate(1)
  start.setDate(1 - ((start.getDay() - weekStartsOn + 7) % 7))
  return Array.from({ length: 42 }, (_, offset) => {
    const date = new Date(start)
    date.setDate(start.getDate() + offset)
    return date
  })
}

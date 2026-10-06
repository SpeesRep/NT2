import { INTERVAL_UNITS, t } from './i18n';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Compact Dutch interval for rating buttons: "10 min", "2 u", "3 d", "3 wk", "4 mnd", "1 jr". */
export function formatInterval(ms: number): string {
  const u = INTERVAL_UNITS;
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MIN))} ${u.minute}`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} ${u.hour}`;
  const days = ms / DAY;
  if (days < 7) return `${Math.round(days)} ${u.day}`;
  if (days < 30) return `${Math.round(days / 7)} ${u.week}`;
  if (days < 365) return `${Math.max(1, Math.round(days / 30.44))} ${u.month}`;
  const years = days / 365.25;
  const shown = years < 10 ? Math.round(years * 10) / 10 : Math.round(years);
  return `${String(shown).replace('.', ',')} ${u.year}`;
}

/** Dutch relative time: "zojuist", "5 minuten geleden", "2 dagen geleden". */
export function timeAgo(then: Date | number, now: Date | number = Date.now()): string {
  const diff = Math.max(0, +now - +then);
  if (diff < MIN) return t('time.justNow');
  if (diff < HOUR) {
    const n = Math.floor(diff / MIN);
    return n === 1 ? t('time.minuteAgo') : t('time.minutesAgo', { n });
  }
  if (diff < DAY) {
    const n = Math.floor(diff / HOUR);
    return n === 1 ? t('time.hourAgo') : t('time.hoursAgo', { n });
  }
  const days = Math.floor(diff / DAY);
  if (days < 14) return days === 1 ? t('time.dayAgo') : t('time.daysAgo', { n: days });
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? t('time.weekAgo') : t('time.weeksAgo', { n: weeks });
}

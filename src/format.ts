/**
 * Label and date formatting, kept in one place so the tables, the picker
 * options and the stats all render a given value the same way.
 */

export function formatClock(value: unknown, locale: 'en' | 'it' = 'en'): string {
  return value instanceof Date ? value.toLocaleTimeString(locale === 'it' ? 'it-IT' : 'en-GB') : '—';
}

/** Formatted in UTC so a date-only value never slips a day near midnight. */
export function formatDay(value: unknown, locale: 'en' | 'it' = 'en'): string {
  if (typeof value !== 'string' || value === '') {
    return '—';
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
}

export function personLabel(person: { name: string; surname: string }): string {
  return `${person.name} ${person.surname}`.trim();
}

export function openDayLabel(day: { name: string; date: string }, locale: 'en' | 'it' = 'en'): string {
  return `${day.name} (${formatDay(day.date, locale)})`;
}

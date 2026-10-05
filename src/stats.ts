import type { OpenDay, Participation, Person, SchoolCourse } from './db.js';
import { openDayLabel } from './format.js';

export interface OpenDayStat {
  id: string;
  label: string;
  count: number;
  /** 0–100, scaled against the busiest open day, so the busiest bar is full. */
  bar: number;
}

export interface CourseStat {
  id: string;
  name: string;
  count: number;
  /** 0–100, scaled against the most wanted course. */
  bar: number;
}

export interface PreviousSchoolStat {
  name: string;
  count: number;
  /** 0–100, scaled against the most common previous school. */
  bar: number;
}

export interface Stats {
  totalPeople: number;
  totalOpenDays: number;
  totalCourses: number;
  totalParticipations: number;
  /** People who have not signed up for any open day yet. */
  unregistered: number;
  openDays: OpenDayStat[];
  courses: CourseStat[];
  previousSchools: PreviousSchoolStat[];
}

export interface StatsInput {
  people: Person[];
  openDays: OpenDay[];
  courses: SchoolCourse[];
  participations: Participation[];
}

function scale(count: number, max: number): number {
  return max === 0 ? 0 : Math.round((count / max) * 100);
}

function groupPreviousSchools(people: Pick<Person, 'previousSchool'>[]): Map<string, { name: string; count: number }> {
  const names = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const person of people) {
    const name = person.previousSchool.trim().replace(/\s+/g, ' ');
    if (name) {
      const key = name.toLocaleLowerCase('en');
      if (!names.has(key)) names.set(key, name);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return new Map([...names].map(([key, name]) => [key, { name, count: counts.get(key) ?? 0 }]));
}

/** Distinct saved school names for autocomplete, matched case-insensitively. */
export function distinctPreviousSchools(people: Pick<Person, 'previousSchool'>[]): string[] {
  return [...groupPreviousSchools(people).values()].map(({ name }) => name).sort((a, b) => a.localeCompare(b));
}

/**
 * Counts the numbers the operator actually acts on: how full each open day is,
 * and how many people want each school course, which is what decides how many
 * staff to put on each course stand.
 *
 * Built from the records already loaded for the page, so it costs no extra
 * round trips.
 */
export function buildStats({ people, openDays, courses, participations }: StatsInput, locale: 'en' | 'it' = 'en'): Stats {
  const perDay = new Map<string, number>();
  const registered = new Set<string>();
  for (const row of participations) {
    perDay.set(row.openDayId, (perDay.get(row.openDayId) ?? 0) + 1);
    registered.add(row.personId);
  }

  // Chronological, so the next open day to staff is at the top.
  const orderedDays = [...openDays].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
  );
  const dayCounts = orderedDays.map((day) => ({ id: day.id, label: openDayLabel(day, locale), count: perDay.get(day.id) ?? 0 }));
  const busiestDay = Math.max(0, ...dayCounts.map((day) => day.count));

  // A duplicated id in one person's list must not count as two people.
  const perCourse = new Map<string, number>();
  for (const person of people) {
    for (const id of new Set(person.courseIds)) {
      perCourse.set(id, (perCourse.get(id) ?? 0) + 1);
    }
  }
  const courseCounts = courses.map((course) => ({ id: course.id, name: course.name, count: perCourse.get(course.id) ?? 0 }));
  const topCourse = Math.max(0, ...courseCounts.map((course) => course.count));
  const schoolCounts = [...groupPreviousSchools(people).values()];
  const mostCommonSchool = Math.max(0, ...schoolCounts.map((school) => school.count));

  return {
    totalPeople: people.length,
    totalOpenDays: openDays.length,
    totalCourses: courses.length,
    totalParticipations: participations.length,
    unregistered: people.filter((person) => !registered.has(person.id)).length,
    openDays: dayCounts.map((day) => ({ ...day, bar: scale(day.count, busiestDay) })),
    // Busiest first, which is the order that helps when choosing where to staff.
    courses: courseCounts
      .map((course) => ({ ...course, bar: scale(course.count, topCourse) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    previousSchools: schoolCounts
      .map((school) => ({ ...school, bar: scale(school.count, mostCommonSchool) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}

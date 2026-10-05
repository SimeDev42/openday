import { randomUUID } from 'node:crypto';
import {
  OPEN_DAYS,
  PARTICIPATIONS,
  PEOPLE,
  SCHOOL_COURSES,
  runBulk,
  type BulkWrite,
  type OpenDay,
  type Participation,
  type Person,
  type SchoolCourse,
} from './db.js';
import { courseFields, openDayFields, personFields, validate, type Field } from './fields.js';

export const EXPORT_FORMAT = 'openday-export';
export const EXPORT_VERSION = 1;

/**
 * Caps what a single import may write. The file arrives as one form field, so
 * this is the only thing between a hand-edited or hostile document and an
 * unbounded batch of writes.
 */
const MAX_PER_COLLECTION = 5000;

/** Enough problems to act on, without pasting a wall of text into the page. */
const MAX_PROBLEMS = 20;

export interface ExportCourse {
  name: string;
  description: string;
}

export interface ExportOpenDay {
  name: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface ExportPerson {
  name: string;
  surname: string;
  age: number;
  previousSchool: string;
  /** Courses by name, never by id, so the file stays readable elsewhere. */
  courses: string[];
}

/** Referenced by content rather than by id, so a file can cross databases. */
export interface PersonKey {
  name: string;
  surname: string;
  age: number;
  previousSchool: string;
}

export interface DayKey {
  name: string;
  date: string;
}

export interface ExportParticipation {
  person: PersonKey;
  openDay: DayKey;
}

export interface ExportFile {
  schoolCourses: ExportCourse[];
  openDays: ExportOpenDay[];
  people: ExportPerson[];
  participations: ExportParticipation[];
}

export type CollectionKey = keyof ExportFile;

export const COLLECTION_LABELS: Record<CollectionKey, string> = {
  schoolCourses: 'School courses',
  openDays: 'Open days',
  people: 'People',
  participations: 'Participations',
};

/* Parsing and validating the uploaded document */

export type ParseResult = { ok: true; file: ExportFile } | { ok: false; error: string; problems: string[] };

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asEntries(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The scalar fields of a record, which is all the file stores. */
function scalarFields(fields: Field[]): Field[] {
  return fields.filter((field) => field.type !== 'checks' && !field.createOnly);
}

/** Collects problems, keeping the first few but counting them all. */
class Problems {
  readonly shown: string[] = [];
  total = 0;

  add(message: string): void {
    this.total += 1;
    if (this.shown.length < MAX_PROBLEMS) {
      this.shown.push(message);
    }
  }

  addAll(messages: string[]): void {
    for (const message of messages) this.add(message);
  }
}

/**
 * Runs one record through the same rules as the form, so an import cannot
 * write something the UI would have refused.
 */
function checkRecord(label: string, fields: Field[], record: Record<string, unknown>): string[] {
  const { errors } = validate(fields, record);
  return Object.entries(errors).map(([field, message]) => `${label}: ${message} (${field})`);
}

export function parseExport(raw: string): ParseResult {
  if (raw.trim() === '') {
    return { ok: false, error: 'Paste an export, or drop the file onto the box.', problems: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'That is not valid JSON.', problems: [] };
  }

  const root = asObject(parsed);
  if (!root) {
    return { ok: false, error: 'The top level of an export must be a JSON object.', problems: [] };
  }

  if (root.format !== EXPORT_FORMAT) {
    return { ok: false, error: 'That file was not made by this app.', problems: [] };
  }

  if (root.version !== EXPORT_VERSION) {
    const version = typeof root.version === 'number' ? root.version : 0;
    return {
      ok: false,
      error:
        version > EXPORT_VERSION
          ? `This export was written by a newer version of the app (format ${version}). Update the app before importing it.`
          : `This export uses format ${version || 'unknown'}, but this app reads format ${EXPORT_VERSION}.`,
      problems: [],
    };
  }

  const data = asObject(root.data);
  if (!data) {
    return { ok: false, error: 'The export has no "data" section.', problems: [] };
  }

  const problems = new Problems();

  /** Reads one collection, refusing anything larger than the cap. */
  const read = (key: CollectionKey): unknown[] => {
    const entries = asEntries(data[key]);
    if (entries === null) {
      if (data[key] !== undefined) problems.add(`${COLLECTION_LABELS[key]}: expected a list`);
      return [];
    }
    if (entries.length > MAX_PER_COLLECTION) {
      problems.add(
        `${COLLECTION_LABELS[key]}: ${entries.length} records, more than the ${MAX_PER_COLLECTION} allowed in one import`,
      );
      return [];
    }
    return entries;
  };

  const schoolCourses: ExportCourse[] = [];
  read('schoolCourses').forEach((entry, index) => {
    const label = `School course ${index + 1}`;
    const record = asObject(entry);
    if (!record) {
      problems.add(`${label}: expected an object`);
      return;
    }
    problems.addAll(checkRecord(label, scalarFields(courseFields), record));
    const name = asText(record.name);
    if (name === '') problems.add(`${label}: Name is required`);
    schoolCourses.push({ name, description: asText(record.description) });
  });

  const openDays: ExportOpenDay[] = [];
  read('openDays').forEach((entry, index) => {
    const label = `Open day ${index + 1}`;
    const record = asObject(entry);
    if (!record) {
      problems.add(`${label}: expected an object`);
      return;
    }
    problems.addAll(checkRecord(label, scalarFields(openDayFields), record));
    const day = {
      name: asText(record.name),
      location: asText(record.location),
      date: asText(record.date),
      startTime: asText(record.startTime),
      endTime: asText(record.endTime),
    };
    if (day.name === '') problems.add(`${label}: Name is required`);
    // The form's date and time inputs cannot produce anything else, so a value
    // that is not one of their shapes did not come from this app.
    if (!ISO_DATE.test(day.date)) problems.add(`${label}: Date must be written as YYYY-MM-DD`);
    if (!CLOCK_TIME.test(day.startTime)) problems.add(`${label}: Start time must be written as HH:MM`);
    if (!CLOCK_TIME.test(day.endTime)) problems.add(`${label}: End time must be written as HH:MM`);
    if (CLOCK_TIME.test(day.startTime) && CLOCK_TIME.test(day.endTime) && day.endTime < day.startTime) {
      problems.add(`${label}: End time is before the start time`);
    }
    openDays.push(day);
  });

  const people: ExportPerson[] = [];
  read('people').forEach((entry, index) => {
    const label = `Person ${index + 1}`;
    const record = asObject(entry);
    if (!record) {
      problems.add(`${label}: expected an object`);
      return;
    }
    // The course list is checked below, because the file stores course names
    // while the checkbox group validates ids against the real courses.
    problems.addAll(checkRecord(label, scalarFields(personFields), record));
    // A file that kept the old shape, with course ids, is still readable.
    const courses = asEntries(record.courses ?? record.courseIds);
    if (record.courses !== undefined && courses === null) {
      problems.add(`${label}: courses must be a list of course names`);
    }
    const age = Number(record.age);
    people.push({
      name: asText(record.name),
      surname: asText(record.surname),
      age: Number.isFinite(age) ? age : 0,
      previousSchool: asText(record.previousSchool),
      courses: (courses ?? []).map(asText).filter((name) => name !== ''),
    });
  });

  const participations: ExportParticipation[] = [];
  read('participations').forEach((entry, index) => {
    const label = `Participation ${index + 1}`;
    const record = asObject(entry);
    if (!record) {
      problems.add(`${label}: expected an object`);
      return;
    }
    // A hand-written file may point at the person and day with flat fields.
    const person = asObject(record.person) ?? {
      name: asText(record.personName),
      surname: asText(record.personSurname),
      age: Number(record.personAge),
      previousSchool: asText(record.personSchool),
    };
    const day = asObject(record.openDay) ?? {
      name: asText(record.openDayName),
      date: asText(record.openDayDate),
    };
    problems.addAll(checkRecord(`${label} person`, scalarFields(personFields), person));
    if (!ISO_DATE.test(asText(day.date))) {
      problems.add(`${label}: open day date must be written as YYYY-MM-DD`);
    }
    if (asText(day.name) === '') problems.add(`${label}: open day name is required`);
    participations.push({
      person: {
        name: asText(person.name),
        surname: asText(person.surname),
        age: Number(person.age),
        previousSchool: asText(person.previousSchool),
      },
      openDay: { name: asText(day.name), date: asText(day.date) },
    });
  });

  if (problems.total > 0) {
    const more = problems.total > problems.shown.length ? ` Showing the first ${problems.shown.length}.` : '';
    return {
      ok: false,
      error: `The export has ${problems.total} problem${problems.total === 1 ? '' : 's'}, so nothing was imported.${more}`,
      problems: problems.shown,
    };
  }

  return { ok: true, file: { schoolCourses, openDays, people, participations } };
}

/* Resolving the file against what is already in the database */

export interface Snapshot {
  people: Person[];
  openDays: OpenDay[];
  courses: SchoolCourse[];
  participations: Participation[];
}

export interface PlanRow {
  total: number;
  created: number;
  reused: number;
  skipped: number;
}

export interface ImportSummary {
  rows: Record<CollectionKey, PlanRow>;
  warnings: string[];
  totals: { created: number; reused: number; skipped: number };
}

/**
 * The natural key for a record, used to recognise one that is already here.
 * Case and repeated whitespace are ignored, so "  informatica " and
 * "Informatica" are the same course and importing the same file twice does not
 * double it up.
 */
function norm(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function courseKey(name: string): string {
  return norm(name);
}

function dayKey(day: { name: string; date: string }): string {
  return `${norm(day.name)}|${day.date}`;
}

function personKey(person: PersonKey): string {
  return [norm(person.name), norm(person.surname), String(person.age), norm(person.previousSchool)].join('|');
}

/** Where a reference in the file points: already here, about to be created, or nowhere. */
type Ref = { state: 'existing'; id: string } | { state: 'new' } | { state: 'missing' };

function resolveRef(key: string, existing: Map<string, string>, pending: Set<string>): Ref {
  const id = existing.get(key);
  if (id !== undefined) return { state: 'existing', id };
  if (pending.has(key)) return { state: 'new' };
  return { state: 'missing' };
}

interface PendingParticipation {
  personKey: string;
  dayKey: string;
  person: Ref;
  day: Ref;
  /** Already in the database, so the import has nothing to write. */
  exists: boolean;
}

interface Resolution {
  summary: ImportSummary;
  pendingCourses: { key: string; data: ExportCourse }[];
  existingCourseIds: Map<string, string>;
  pendingDays: { key: string; data: ExportOpenDay }[];
  existingDayIds: Map<string, string>;
  pendingPeople: { key: string; data: ExportPerson }[];
  existingPersonIds: Map<string, string>;
  /** Reused people whose course list grows, with the names left unresolved. */
  courseUnions: { id: string; base: string[]; names: string[] }[];
  participations: PendingParticipation[];
}

/**
 * Works out, for every record in the file, whether it is already in the
 * database or has to be created. The preview and the import both run this, so
 * what the operator is shown and what is written cannot disagree.
 */
function resolve(file: ExportFile, snapshot: Snapshot): Resolution {
  const warnings: string[] = [];

  const existingCourseIds = new Map<string, string>();
  for (const course of snapshot.courses) {
    const key = courseKey(course.name);
    if (existingCourseIds.has(key)) {
      warnings.push(`Two school courses in this database are both called "${course.name}", so they were treated as one.`);
      continue;
    }
    existingCourseIds.set(key, course.id);
  }

  const existingDayIds = new Map<string, string>();
  for (const day of snapshot.openDays) {
    existingDayIds.set(dayKey(day), day.id);
  }

  const existingPersonIds = new Map<string, string>();
  const personById = new Map<string, Person>();
  for (const person of snapshot.people) {
    personById.set(person.id, person);
    const key = personKey(person);
    if (!existingPersonIds.has(key)) existingPersonIds.set(key, person.id);
  }

  const pendingCourses: { key: string; data: ExportCourse }[] = [];
  const seenCourses = new Set<string>();
  for (const course of file.schoolCourses) {
    const key = courseKey(course.name);
    if (existingCourseIds.has(key) || seenCourses.has(key)) continue;
    seenCourses.add(key);
    pendingCourses.push({ key, data: course });
  }

  const pendingDays: { key: string; data: ExportOpenDay }[] = [];
  const seenDays = new Set<string>();
  for (const day of file.openDays) {
    const key = dayKey(day);
    if (existingDayIds.has(key) || seenDays.has(key)) continue;
    seenDays.add(key);
    pendingDays.push({ key, data: day });
  }

  const pendingPeople: { key: string; data: ExportPerson }[] = [];
  const seenPeople = new Set<string>();
  for (const person of file.people) {
    const key = personKey(person);
    if (existingPersonIds.has(key) || seenPeople.has(key)) continue;
    seenPeople.add(key);
    pendingPeople.push({ key, data: person });
  }
  const pendingCourseKeys = new Set(pendingCourses.map((entry) => entry.key));
  const pendingDayKeys = new Set(pendingDays.map((entry) => entry.key));
  const pendingPersonKeys = new Set(pendingPeople.map((entry) => entry.key));

  // A course the file mentions and that will exist once this import runs, either
  // because it is already here or because it is about to be created.
  const addsCourse = (key: string, current: string[]): boolean => {
    if (pendingCourseKeys.has(key)) return true;
    const id = existingCourseIds.get(key);
    return id !== undefined && !current.includes(id);
  };

  // A reused person's courses are added to what they already have and never
  // taken away: an import must not quietly drop a preference someone recorded.
  // The names are kept unresolved, because a course being created has no id yet;
  // applyImport resolves them once the ids exist.
  const courseUnions: { id: string; base: string[]; names: string[] }[] = [];
  for (const person of file.people) {
    const id = existingPersonIds.get(personKey(person));
    if (id === undefined) continue;
    const current = personById.get(id)?.courseIds ?? [];
    const resolvable = person.courses.filter((name) => {
      const key = courseKey(name);
      return existingCourseIds.has(key) || pendingCourseKeys.has(key);
    });
    if (resolvable.length === 0 || !resolvable.some((name) => addsCourse(courseKey(name), current))) {
      continue;
    }
    courseUnions.push({ id, base: current, names: resolvable });
  }

  // Deduplicated here, so a file listing the same signup twice creates it once.
  const seenPairs = new Set<string>();
  const pendingParticipations: PendingParticipation[] = [];
  const existingPairs = new Set(snapshot.participations.map((row) => `${row.personId}|${row.openDayId}`));

  for (const row of file.participations) {
    const person = personKey(row.person);
    const day = dayKey(row.openDay);
    const pair = `${person}||${day}`;
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);

    const personRef = resolveRef(person, existingPersonIds, pendingPersonKeys);
    const dayRef = resolveRef(day, existingDayIds, pendingDayKeys);
    const exists =
      personRef.state === 'existing' && dayRef.state === 'existing'
        ? existingPairs.has(`${personRef.id}|${dayRef.id}`)
        : false;
    pendingParticipations.push({ personKey: person, dayKey: day, person: personRef, day: dayRef, exists });
  }

  const createdParticipations = pendingParticipations.filter((row) => !row.exists && row.person.state !== 'missing' && row.day.state !== 'missing');
  const skippedParticipations = pendingParticipations.filter((row) => row.person.state === 'missing' || row.day.state === 'missing');
  const reusedParticipations = pendingParticipations.filter((row) => row.exists);

  const rows: Record<CollectionKey, PlanRow> = {
    schoolCourses: {
      total: file.schoolCourses.length,
      created: pendingCourses.length,
      reused: file.schoolCourses.length - pendingCourses.length,
      skipped: 0,
    },
    openDays: {
      total: file.openDays.length,
      created: pendingDays.length,
      reused: file.openDays.length - pendingDays.length,
      skipped: 0,
    },
    people: {
      total: file.people.length,
      created: pendingPeople.length,
      reused: file.people.length - pendingPeople.length,
      skipped: 0,
    },
    participations: {
      total: file.participations.length,
      created: createdParticipations.length,
      reused: reusedParticipations.length,
      skipped: skippedParticipations.length,
    },
  };

  return {
    summary: { rows, warnings, totals: sumRows(rows) },
    pendingCourses,
    existingCourseIds,
    pendingDays,
    existingDayIds,
    pendingPeople,
    existingPersonIds,
    courseUnions,
    participations: pendingParticipations,
  };
}

function sumRows(rows: Record<CollectionKey, PlanRow>): ImportSummary['totals'] {
  const all = Object.values(rows);
  return {
    created: all.reduce((sum, row) => sum + row.created, 0),
    reused: all.reduce((sum, row) => sum + row.reused, 0),
    skipped: all.reduce((sum, row) => sum + row.skipped, 0),
  };
}

/* Applying the plan */

/** The person document, without the course names, which become ids. */
function personFieldsOf(person: ExportPerson): Omit<ExportPerson, 'courses'> {
  return { name: person.name, surname: person.surname, age: person.age, previousSchool: person.previousSchool };
}

/**
 * Writes the plan. Courses and open days go first, then people, then the
 * participations that point at them, so a reference is never written before the
 * record it points at has an id.
 *
 * The plan is recomputed here rather than reused from the preview, so a change
 * made in between is taken into account rather than written around.
 */
export async function applyImport(file: ExportFile, snapshot: Snapshot): Promise<ImportSummary> {
  const plan = resolve(file, snapshot);
  const warnings = [...plan.summary.warnings];

  const courseIds = new Map(plan.existingCourseIds);
  const createdCourseIds = await runBulk(
    plan.pendingCourses.map((entry) => ({
      collection: SCHOOL_COURSES,
      op: 'create' as const,
      data: { ...entry.data },
    })),
  );
  plan.pendingCourses.forEach((entry, index) => {
    // Left out of the map if the id is somehow missing, so the name is reported
    // as unresolvable rather than written out as a reference to nothing.
    const id = createdCourseIds[index];
    if (id !== undefined) courseIds.set(entry.key, id);
  });

  const dayIds = new Map(plan.existingDayIds);
  const createdDayIds = await runBulk(
    plan.pendingDays.map((entry) => ({
      collection: OPEN_DAYS,
      op: 'create' as const,
      data: { ...entry.data },
    })),
  );
  plan.pendingDays.forEach((entry, index) => {
    const id = createdDayIds[index];
    if (id !== undefined) dayIds.set(entry.key, id);
  });

  // A course named in a person's list but present neither in the file's course
  // list nor in this database cannot be linked to, so it is reported rather
  // than guessed at.
  const unknownCourses = new Set<string>();
  const courseIdsFor = (names: string[]): string[] => {
    const ids: string[] = [];
    for (const name of names) {
      const id = courseIds.get(courseKey(name));
      if (id === undefined) {
        unknownCourses.add(name);
        continue;
      }
      ids.push(id);
    }
    return [...new Set(ids)];
  };

  const personIds = new Map(plan.existingPersonIds);
  const personWrites: BulkWrite[] = plan.pendingPeople.map((entry) => ({
    collection: PEOPLE,
    op: 'create',
    data: { ...personFieldsOf(entry.data), courseIds: courseIdsFor(entry.data.courses) },
  }));
  for (const union of plan.courseUnions) {
    // Now that the courses exist, the names become the ids they stand for.
    const added = courseIdsFor(union.names);
    personWrites.push({
      collection: PEOPLE,
      op: 'update',
      id: union.id,
      data: { courseIds: [...new Set([...union.base, ...added])] },
    });
  }
  const createdPersonIds = await runBulk(personWrites);
  plan.pendingPeople.forEach((entry, index) => {
    const id = createdPersonIds[index];
    if (id !== undefined) personIds.set(entry.key, id);
  });

  if (unknownCourses.size > 0) {
    const names = [...unknownCourses];
    const shown = names.slice(0, 5).join(', ');
    warnings.push(
      `${names.length} course${names.length === 1 ? '' : 's'} in the file matched nothing here and ${
        names.length === 1 ? 'was' : 'were'
      } left off: ${shown}${names.length > 5 ? ', …' : ''}.`,
    );
  }

  const participationWrites: BulkWrite[] = [];
  const written = new Set<string>();
  for (const row of plan.participations) {
    if (row.exists || row.person.state === 'missing' || row.day.state === 'missing') continue;
    const personId = personIds.get(row.personKey);
    const openDayId = dayIds.get(row.dayKey);
    if (personId === undefined || openDayId === undefined) continue;
    const pair = `${personId}|${openDayId}`;
    if (written.has(pair)) continue;
    written.add(pair);
    participationWrites.push({ collection: PARTICIPATIONS, op: 'create', data: { personId, openDayId } });
  }
  await runBulk(participationWrites);

  if (plan.courseUnions.length > 0) {
    warnings.push(
      `${plan.courseUnions.length} existing ${
        plan.courseUnions.length === 1 ? 'person' : 'people'
      } gained a course preference from the file. Nothing was taken away.`,
    );
  }

  const missingPeople = plan.participations.filter((row) => row.person.state === 'missing').length;
  const missingDays = plan.participations.filter((row) => row.day.state === 'missing').length;
  // A participation missing both is one skipped row, not two.
  const skipped = plan.participations.filter(
    (row) => row.person.state === 'missing' || row.day.state === 'missing',
  ).length;
  if (skipped > 0) {
    const parts: string[] = [];
    if (missingPeople > 0) parts.push(`${missingPeople} named a person that is in neither this database nor the file`);
    if (missingDays > 0) parts.push(`${missingDays} named an open day that is in neither this database nor the file`);
    warnings.push(`Skipped ${skipped} participations: ${parts.join('; ')}.`);
  }

  // The report counts what was actually written, which is resolve's prediction
  // unless the database changed in between.
  const rows: Record<CollectionKey, PlanRow> = {
    ...plan.summary.rows,
    participations: {
      total: plan.summary.rows.participations.total,
      created: participationWrites.length,
      reused: plan.summary.rows.participations.reused,
      skipped,
    },
  };

  return { rows, warnings, totals: sumRows(rows) };
}

/* Reading the database into a portable file */

/**
 * Builds the export. Records reference each other by content rather than by
 * id, so the file can be imported into a different database where the ids are
 * different: the importer recognises "Informatica" by name and "Open Day" by
 * name and date, and reuses whatever already exists.
 *
 * The createdAt timestamps are left out on purpose. They record when a row was
 * first typed in locally, and re-importing recreates every row with a fresh
 * timestamp anyway, so carrying them would be noise that suggests a fidelity
 * the import does not have.
 */
export function buildExport(snapshot: Snapshot, exportedAt: string): ExportFile {
  const courseNames = new Map(snapshot.courses.map((course) => [course.id, course.name]));
  const peopleById = new Map(snapshot.people.map((person) => [person.id, person]));
  const daysById = new Map(snapshot.openDays.map((day) => [day.id, day]));

  const participations: ExportParticipation[] = [];
  for (const row of snapshot.participations) {
    const person = peopleById.get(row.personId);
    const day = daysById.get(row.openDayId);
    if (!person || !day) {
      // Only reachable if a reference was broken outside the app, which the
      // delete cascades are meant to prevent.
      console.warn('[export] skipping participation', row.id, 'with an unresolvable reference');
      continue;
    }
    participations.push({
      person: {
        name: person.name,
        surname: person.surname,
        age: person.age,
        previousSchool: person.previousSchool,
      },
      openDay: { name: day.name, date: day.date },
    });
  }

  return {
    schoolCourses: snapshot.courses.map((course) => ({ name: course.name, description: course.description })),
    openDays: snapshot.openDays.map((day) => ({
      name: day.name,
      location: day.location,
      date: day.date,
      startTime: day.startTime,
      endTime: day.endTime,
    })),
    people: snapshot.people.map((person) => ({
      name: person.name,
      surname: person.surname,
      age: person.age,
      previousSchool: person.previousSchool,
      // An id with no course behind it cannot be named, so it is left out
      // rather than exported as an empty string.
      courses: person.courseIds.map((id) => courseNames.get(id)).filter((name): name is string => name !== undefined),
    })),
    participations,
  };
}

/** The preview: what an import would do, without writing anything. */
export function planImport(file: ExportFile, snapshot: Snapshot): ImportSummary {
  return resolve(file, snapshot).summary;
}

/* Carrying a file and a report across requests */

interface Staged {
  file: ExportFile;
  at: number;
}

/**
 * The file is held in memory between the preview and the confirmation, so the
 * confirmation does not have to post the whole document back as a form field and
 * a tampered hidden field cannot change what gets written. Anything left
 * unconfirmed is dropped after a while, because it is dead weight.
 *
 * The report of a finished import is staged the same way, so the result reaches
 * the page that is rendered after the redirect without the counts having to
 * travel through the URL or a hidden field.
 */
const STAGE_TTL_MS = 15 * 60 * 1000;
const STAGE_LIMIT = 8;
const staged = new Map<string, Staged>();
const reports = new Map<string, { summary: ImportSummary; at: number }>();

function prune(now: number): void {
  for (const [token, entry] of staged) {
    if (now - entry.at > STAGE_TTL_MS) staged.delete(token);
  }
  for (const [token, entry] of reports) {
    if (now - entry.at > STAGE_TTL_MS) reports.delete(token);
  }
  // The oldest token goes first, whichever map it is in, so a repeated preview
  // cannot grow either one without bound.
  while (staged.size + reports.size >= STAGE_LIMIT) {
    const oldestStaged = [...staged.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    const oldestReport = [...reports.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    const candidate = !oldestStaged ? oldestReport : !oldestReport ? oldestStaged : oldestStaged[1].at <= oldestReport[1].at ? oldestStaged : oldestReport;
    if (!candidate) break;
    staged.delete(candidate[0]);
    reports.delete(candidate[0]);
  }
}

export function stageFile(file: ExportFile): string {
  const now = Date.now();
  prune(now);
  const token = randomUUID();
  staged.set(token, { file, at: now });
  return token;
}

export function readStaged(token: string): ExportFile | null {
  const entry = staged.get(token);
  return entry && Date.now() - entry.at <= STAGE_TTL_MS ? entry.file : null;
}

export function dropStaged(token: string): void {
  staged.delete(token);
}

export function stageReport(summary: ImportSummary): string {
  const now = Date.now();
  prune(now);
  const token = randomUUID();
  reports.set(token, { summary, at: now });
  return token;
}

export function readReport(token: string): ImportSummary | null {
  const entry = reports.get(token);
  return entry && Date.now() - entry.at <= STAGE_TTL_MS ? entry.summary : null;
}

export function dropReport(token: string): void {
  reports.delete(token);
}

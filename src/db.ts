import { applicationDefault, initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';

const db = getFirestore(initializeApp({ credential: applicationDefault() }));

/** Collection names, exported so the importer writes to the same places. */
export const OPEN_DAYS = 'openDays';
export const SCHOOL_COURSES = 'schoolCourses';
export const PEOPLE = 'people';
export const PARTICIPATIONS = 'participations';
export const AUTHORIZED_EMAILS = 'authorizedEmails';

export interface AuthorizedEmail {
  email: string;
  createdAt: Date | null;
}

export async function listAuthorizedEmails(): Promise<AuthorizedEmail[]> {
  const snapshot = await db.collection(AUTHORIZED_EMAILS).orderBy('email').get();
  return snapshot.docs.map((doc) => ({ email: text(doc.data(), 'email'), createdAt: readCreatedAt(doc.data()) }));
}

export async function isEmailAuthorized(email: string): Promise<boolean> {
  const doc = await db.collection(AUTHORIZED_EMAILS).doc(email).get();
  return doc.exists;
}

export async function addAuthorizedEmail(email: string): Promise<void> {
  await db.collection(AUTHORIZED_EMAILS).doc(email).set({ email, createdAt: FieldValue.serverTimestamp() });
}

export async function removeAuthorizedEmail(email: string): Promise<void> {
  await db.collection(AUTHORIZED_EMAILS).doc(email).delete();
}

export interface Person {
  id: string;
  name: string;
  surname: string;
  age: number;
  previousSchool: string;
  /** The school courses this person is interested in, as references. */
  courseIds: string[];
  createdAt: Date | null;
}

export interface OpenDay {
  id: string;
  name: string;
  location: string;
  /** Kept as a YYYY-MM-DD string so it round-trips through a date input
   *  unchanged and never shifts a day across a timezone boundary. */
  date: string;
  startTime: string;
  endTime: string;
  createdAt: Date | null;
}

export interface SchoolCourse {
  id: string;
  name: string;
  description: string;
  createdAt: Date | null;
}

/** A person signed up for an open day. Both ids are references, not copies. */
export interface Participation {
  id: string;
  personId: string;
  openDayId: string;
  createdAt: Date | null;
}

type Row = Record<string, unknown>;

/** A document written before a field existed must not take the page down. */
function readCreatedAt(data: DocumentData): Date | null {
  const value = data.createdAt;
  if (!value || typeof value.toDate !== 'function') {
    return null;
  }
  const asDate = value.toDate();
  return asDate instanceof Date && !Number.isNaN(asDate.getTime()) ? asDate : null;
}

function text(data: DocumentData, key: string): string {
  const value = data[key];
  return value === undefined || value === null ? '' : String(value);
}

function number(data: DocumentData, key: string): number {
  const value = Number(data[key]);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Reads a list of ids out of a document. Anything that is not an array of
 * non-empty strings is treated as an empty list, so a record written before
 * this field existed, or edited by hand in the console, cannot break the page.
 */
function strings(data: DocumentData, key: string): string[] {
  const value = data[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry)).filter((entry) => entry !== '');
}

/**
 * Reads a whole collection, a page at a time. A single get() stops at one page
 * of results, which would quietly drop records past that point: the page would
 * look fine, and an import resolving against it would treat the missing people
 * as new and duplicate them.
 */
async function listAll<T>(collection: string, toEntity: (id: string, data: DocumentData) => T): Promise<T[]> {
  const rows: T[] = [];
  await eachPage(db.collection(collection), async (docs) => {
    for (const doc of docs) {
      rows.push(toEntity(doc.id, doc.data()));
    }
  });
  return rows;
}

async function create(collection: string, payload: Row): Promise<string> {
  const ref = await db.collection(collection).add({ ...payload, createdAt: FieldValue.serverTimestamp() });
  return ref.id;
}

async function update(collection: string, id: string, payload: Row): Promise<void> {
  const ref = db.collection(collection).doc(id);
  const existing = await ref.get();
  if (!existing.exists) {
    return;
  }
  await ref.update({ ...payload, updatedAt: FieldValue.serverTimestamp() });
}

async function remove(collection: string, id: string): Promise<void> {
  await db.collection(collection).doc(id).delete();
}

/**
 * Streams a query one page at a time, handing each page to `write`. Firestore
 * has no foreign keys, so a cascade has to find its own dependents, and a single
 * get() would stop at one page of results and leave rows behind.
 */
async function eachPage(query: Query, write: (docs: QueryDocumentSnapshot[]) => Promise<void>): Promise<void> {
  const PAGE = 300;
  let cursor: QueryDocumentSnapshot | undefined;

  for (;;) {
    const snapshot = await (cursor ? query.startAfter(cursor) : query).limit(PAGE).get();
    if (snapshot.empty) {
      return;
    }
    await write(snapshot.docs);
    if (snapshot.size < PAGE) {
      return;
    }
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
}

/** A write an import needs that the single-record helpers cannot express. */
export interface BulkWrite {
  collection: string;
  op: 'create' | 'update';
  /** Required for an update, ignored for a create. */
  id?: string;
  data: Row;
}

/** Firestore accepts 500 writes per batch, so a longer list is chunked. */
const BULK_CHUNK = 300;

/**
 * Commits a list of creates and updates, and returns the ids of the records it
 * created in the order they were given. The caller needs those ids to point
 * later writes at the new records, so they come back in step with the input
 * instead of being read back from the database.
 */
export async function runBulk(writes: BulkWrite[]): Promise<string[]> {
  const created: string[] = [];

  for (let i = 0; i < writes.length; i += BULK_CHUNK) {
    const batch = db.batch();
    for (const write of writes.slice(i, i + BULK_CHUNK)) {
      if (write.op === 'create') {
        const ref = db.collection(write.collection).doc();
        batch.set(ref, { ...write.data, createdAt: FieldValue.serverTimestamp() });
        created.push(ref.id);
      } else if (write.id) {
        batch.update(db.collection(write.collection).doc(write.id), {
          ...write.data,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    await batch.commit();
  }

  return created;
}

/**
 * Drops the participations pointing at a record that is about to be deleted.
 * Firestore has no foreign keys, so without this the table would keep showing
 * signups for a person or an open day that no longer exists.
 */
async function removeParticipationsWhere(field: 'personId' | 'openDayId', value: string): Promise<void> {
  await eachPage(db.collection(PARTICIPATIONS).where(field, '==', value), async (docs) => {
    // A batch is capped at 500 writes, so a heavily attended open day is chunked.
    const batch = db.batch();
    for (const doc of docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  });
}

/* People */

export const listPeople = () =>
  listAll(PEOPLE, (id, data) => ({
    id,
    name: text(data, 'name'),
    surname: text(data, 'surname'),
    age: number(data, 'age'),
    previousSchool: text(data, 'previousSchool'),
    courseIds: strings(data, 'courseIds'),
    createdAt: readCreatedAt(data),
  }));

export const addPeople = (payload: Row) => create(PEOPLE, payload);
export const updatePeople = (id: string, payload: Row) => update(PEOPLE, id, payload);

export async function removePeople(id: string): Promise<void> {
  await removeParticipationsWhere('personId', id);
  await remove(PEOPLE, id);
}

/* Open days */

export const listOpenDays = () =>
  listAll(OPEN_DAYS, (id, data) => ({
    id,
    name: text(data, 'name'),
    location: text(data, 'location'),
    date: text(data, 'date'),
    startTime: text(data, 'startTime'),
    endTime: text(data, 'endTime'),
    createdAt: readCreatedAt(data),
  }));

export const addOpenDay = (payload: Row) => create(OPEN_DAYS, payload);
export const updateOpenDay = (id: string, payload: Row) => update(OPEN_DAYS, id, payload);

export async function removeOpenDay(id: string): Promise<void> {
  await removeParticipationsWhere('openDayId', id);
  await remove(OPEN_DAYS, id);
}

/* School courses */

export const listCourses = () =>
  listAll(SCHOOL_COURSES, (id, data) => ({
    id,
    name: text(data, 'name'),
    description: text(data, 'description'),
    createdAt: readCreatedAt(data),
  }));

export const addCourse = (payload: Row) => create(SCHOOL_COURSES, payload);
export const updateCourse = (id: string, payload: Row) => update(SCHOOL_COURSES, id, payload);
/**
 * Unlists the course from anyone who had it as a preference, so nobody is left
 * holding an id for a course that no longer exists. array-contains is served by
 * a single-field index, so this needs no composite index.
 */
async function removeCourseFromPeople(courseId: string): Promise<void> {
  await eachPage(db.collection(PEOPLE).where('courseIds', 'array-contains', courseId), async (docs) => {
    const batch = db.batch();
    for (const doc of docs) {
      const remaining = strings(doc.data(), 'courseIds').filter((id) => id !== courseId);
      batch.update(doc.ref, { courseIds: remaining });
    }
    await batch.commit();
  });
}

export async function removeCourse(id: string): Promise<void> {
  await removeCourseFromPeople(id);
  await remove(SCHOOL_COURSES, id);
}

/* Participations */

export const listParticipations = () =>
  listAll(PARTICIPATIONS, (id, data) => ({
    id,
    personId: text(data, 'personId'),
    openDayId: text(data, 'openDayId'),
    createdAt: readCreatedAt(data),
  }));

export const addParticipation = (payload: Row) => create(PARTICIPATIONS, payload);
export const updateParticipation = (id: string, payload: Row) => update(PARTICIPATIONS, id, payload);
export const removeParticipation = (id: string) => remove(PARTICIPATIONS, id);

/**
 * Finds an existing signup for the same person and open day, ignoring the
 * record being edited so re-saving an unchanged row is not a false clash.
 * Two equality filters on one collection are served by the single-field
 * indexes, so this needs no composite index.
 */
export async function findParticipation(
  personId: string,
  openDayId: string,
  excludeId: string | null,
): Promise<string | null> {
  const snapshot = await db
    .collection(PARTICIPATIONS)
    .where('personId', '==', personId)
    .where('openDayId', '==', openDayId)
    .get();
  const clash = snapshot.docs.find((doc) => doc.id !== excludeId);
  return clash ? clash.id : null;
}

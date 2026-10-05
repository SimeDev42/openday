import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { fileURLToPath } from 'node:url';
import {
  addCourse,
  addAuthorizedEmail,
  addOpenDay,
  addParticipation,
  addPeople,
  findParticipation,
  listCourses,
  listAuthorizedEmails,
  isEmailAuthorized,
  listOpenDays,
  listParticipations,
  listPeople,
  removeCourse,
  removeAuthorizedEmail,
  removeOpenDay,
  removeParticipation,
  removePeople,
  updateCourse,
  updateOpenDay,
  updateParticipation,
  updatePeople,
} from './db.js';
import { formatClock, formatDay, openDayLabel, personLabel } from './format.js';
import { buildStats, type Stats } from './stats.js';
import { resolveLocale, translate } from './i18n.js';
import {
  applyImport,
  buildExport,
  COLLECTION_LABELS,
  dropReport,
  dropStaged,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  parseExport,
  planImport,
  readReport,
  readStaged,
  stageFile,
  stageReport,
  type ImportSummary,
  type Snapshot,
} from './import.js';
import {
  blankValues,
  courseFields,
  extraAttributes,
  openDayFields,
  participationFields,
  personFields,
  toPayload,
  validate,
  type Errors,
  type Field,
  type OptionContext,
  type Values,
} from './fields.js';

const assets = (path: string) => fileURLToPath(new URL(path, import.meta.url));

type TabKey = 'people' | 'opendays' | 'courses' | 'participations';

/**
 * The read-only tabs. They are not entities, because they have no form and
 * nothing to add, edit or remove, so they are kept out of the CRUD definitions
 * and listed here instead.
 */
type SectionKey = TabKey | 'stats' | 'data' | 'team';

const READ_ONLY_SECTIONS: { tab: SectionKey; label: string }[] = [
  { tab: 'stats', label: 'Stats' },
  { tab: 'data', label: 'Data' },
];

interface Column {
  key: string;
  label: string;
  className?: string;
  /** Receives the cell's value, not the whole row. */
  format?: (value: unknown, locale?: 'en' | 'it') => string;
}

interface DuplicateFailure {
  field: string;
  message: string;
}

interface Entity {
  tab: TabKey;
  label: string;
  path: string;
  fields: Field[];
  columns: Column[];
  emptyText: string;
  create: (payload: Record<string, unknown>) => Promise<unknown>;
  update: (id: string, payload: Record<string, unknown>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Rejects a save that would collide with an existing record. */
  checkDuplicate?: (payload: Record<string, unknown>, id: string | null) => Promise<DuplicateFailure | null>;
  /** Runs after a successful create, with the new record's id. */
  afterCreate?: (id: string, values: Values) => Promise<void>;
  /** Overrides the text in the remove confirmation. */
  confirmLabel?: (row: Record<string, unknown>) => string;
  /** Row fields the list's search box matches against. Omit for no search box. */
  search?: { keys: string[]; placeholder: string };
}

const TIME_CLASS = 'col-time';
const AGE_CLASS = 'col-age';

const entities: Record<TabKey, Entity> = {
  people: {
    tab: 'people',
    label: 'People',
    path: '/people',
    fields: personFields,
    columns: [
      { key: 'createdAt', label: 'Added', className: TIME_CLASS, format: formatClock },
      { key: 'name', label: 'Name', className: 'col-name' },
      { key: 'surname', label: 'Surname' },
      { key: 'age', label: 'Age', className: AGE_CLASS },
      { key: 'previousSchool', label: 'Previous school' },
      { key: 'courseLabels', label: 'Course preferences', className: 'col-courses' },
    ],
    search: {
      keys: ['name', 'surname', 'previousSchool', 'courseLabels'],
      placeholder: 'Search by name, surname, school or course…',
    },
    emptyText: 'No people yet.',
    create: addPeople,
    update: updatePeople,
    remove: removePeople,
    // The optional open day on the add form is not part of the person
    // document, so the participation is written as its own record.
    afterCreate: async (personId, values) => {
      const openDayId = values.openDayId;
      // Narrowed because form values are also used for the checkbox groups,
      // which hold arrays.
      if (typeof openDayId === 'string' && openDayId) {
        await addParticipation({ personId, openDayId });
      }
    },
  },
  opendays: {
    tab: 'opendays',
    label: 'Open days',
    path: '/opendays',
    fields: openDayFields,
    columns: [
      { key: 'date', label: 'Date', className: TIME_CLASS, format: formatDay },
      { key: 'name', label: 'Name', className: 'col-name' },
      { key: 'location', label: 'Location' },
      { key: 'startTime', label: 'Start' },
      { key: 'endTime', label: 'End' },
    ],
    emptyText: 'No open days yet.',
    create: addOpenDay,
    update: updateOpenDay,
    remove: removeOpenDay,
  },
  courses: {
    tab: 'courses',
    label: 'School courses',
    path: '/courses',
    fields: courseFields,
    columns: [
      { key: 'name', label: 'Name', className: 'col-name' },
      { key: 'description', label: 'Description' },
    ],
    emptyText: 'No school courses yet.',
    create: addCourse,
    update: updateCourse,
    remove: removeCourse,
  },
  participations: {
    tab: 'participations',
    label: 'Participations',
    path: '/participations',
    fields: participationFields,
    columns: [
      { key: 'personLabel', label: 'Person', className: 'col-name' },
      { key: 'openDayLabel', label: 'Open day' },
      { key: 'createdAt', label: 'Added', className: TIME_CLASS, format: formatClock },
    ],
    emptyText: 'No participations yet.',
    create: addParticipation,
    update: updateParticipation,
    remove: removeParticipation,
    confirmLabel: (row) => String(row.personLabel ?? ''),
    checkDuplicate: async (payload, id) => {
      const clash = await findParticipation(String(payload.personId ?? ''), String(payload.openDayId ?? ''), id);
      return clash ? { field: 'personId', message: 'This person is already registered for that open day' } : null;
    },
  },
};

const TAB_KEYS = Object.keys(entities) as TabKey[];
const SECTION_KEYS: SectionKey[] = [...TAB_KEYS, ...READ_ONLY_SECTIONS.map((section) => section.tab), 'team'];
const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;
const GMAIL_ADDRESS = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/;

/** Fixed copy keyed by a query string, so no message text is user controlled. */
const NOTICES: Record<string, string> = {
  added: 'Added to today’s open day.',
  already: 'That person is already on today’s open day.',
  'no-open-day': 'There is no open day scheduled for today, so there was nothing to add them to.',
  'unknown-person': 'Could not find that person.',
  'import-expired': 'That import preview expired before it was confirmed. Paste the file again to see the plan.',
  'created-people': 'Person added.', 'updated-people': 'Person updated.', 'removed-people': 'Person removed.',
  'created-opendays': 'Open day added.', 'updated-opendays': 'Open day updated.', 'removed-opendays': 'Open day removed.',
  'created-courses': 'School course added.', 'updated-courses': 'School course updated.', 'removed-courses': 'School course removed.',
  'created-participations': 'Participation added.', 'updated-participations': 'Participation updated.', 'removed-participations': 'Participation removed.',
};

function resolveNotice(value: unknown): string | null {
  return typeof value === 'string' ? (NOTICES[value] ?? null) : null;
}

function resolveTab(value: unknown, allowTeam: boolean): SectionKey {
  return typeof value === 'string' && (SECTION_KEYS as string[]).includes(value) && (value !== 'team' || allowTeam) ? (value as SectionKey) : 'people';
}

function isEntityTab(tab: SectionKey): tab is TabKey {
  return (TAB_KEYS as string[]).includes(tab);
}

function resolveId(value: unknown): string | null {
  return typeof value === 'string' && DOC_ID.test(value) ? value : null;
}

/** Reads a record's fields back into form strings, so an edit form can prefill. */
function recordToValues(fields: Field[], row: Record<string, unknown>): Values {
  const values: Values = {};
  for (const field of fields) {
    const raw = row[field.name];
    if (field.type === 'checks') {
      // A checkbox group prefills from the stored array, not a joined string.
      values[field.name] = Array.isArray(raw) ? raw.map((entry) => String(entry)) : [];
    } else {
      values[field.name] = raw === undefined || raw === null ? '' : String(raw);
    }
  }
  return values;
}

interface PageState {
  tab: SectionKey;
  values: Record<TabKey, Values>;
  errors: Record<TabKey, Errors>;
  editing: Record<TabKey, string | null>;
}

/** A table row as the templates see it: loose, because each tab differs. */
type TabRow = { id: string } & Record<string, unknown>;

/** An existing person, offered as a match while the operator types. */
interface PersonHint {
  id: string;
  name: string;
  surname: string;
  age: number;
  previousSchool: string;
  /** Already signed up for today's open day, so there is nothing to add. */
  registered: boolean;
}

interface PageData {
  rowsByTab: Record<TabKey, TabRow[]>;
  optionsContext: OptionContext;
  defaultOpenDayId: string | null;
  personHints: PersonHint[];
  stats: Stats;
}

/** Everything the Data tab shows about an import, in whichever state it is in. */
interface ImportView {
  error: string | null;
  problems: string[];
  /** What was typed, kept after a failed import so it is not lost. */
  pasted: string;
  preview: { token: string; summary: ImportSummary } | null;
  report: ImportSummary | null;
}

function emptyImport(): ImportView {
  return { error: null, problems: [], pasted: '', preview: null, report: null };
}

function emptyState(): PageState {
  const values = {} as Record<TabKey, Values>;
  const errors = {} as Record<TabKey, Errors>;
  const editing = {} as Record<TabKey, string | null>;
  for (const entity of Object.values(entities)) {
    values[entity.tab] = blankValues(entity.fields);
    errors[entity.tab] = {};
    editing[entity.tab] = null;
  }
  return { tab: 'people', values, errors, editing };
}

/** The four collections as they are stored, for the stats and the import. */
async function loadSnapshot(): Promise<Snapshot> {
  const [people, openDays, courses, participations] = await Promise.all([
    listPeople(),
    listOpenDays(),
    listCourses(),
    listParticipations(),
  ]);
  return { people, openDays, courses, participations };
}

/**
 * Today as a YYYY-MM-DD string in the server's own timezone. Built from the
 * date parts rather than toISOString, which would report the UTC day and pick
 * the wrong open day for anyone signing people up in the evening.
 */
function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

async function loadPage(locale: 'en' | 'it' = 'en'): Promise<PageData> {
  // Everything loads up front so switching tabs is instant, with no round trip
  // and no client-side data fetching.
  const [people, openDays, courses, participations] = await Promise.all([
    listPeople(),
    listOpenDays(),
    listCourses(),
    listParticipations(),
  ]);

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const daysById = new Map(openDays.map((day) => [day.id, day]));
  const coursesById = new Map(courses.map((course) => [course.id, course]));

  // People hold course ids, so the names are resolved here for the table and
  // for the search text. An id with no matching course is skipped rather than
  // shown, which can only happen if a course was deleted outside the app.
  const decoratedPeople = people.map((person) => ({
    ...person,
    courseLabels: person.courseIds
      .map((id) => coursesById.get(id)?.name ?? '')
      .filter((name) => name !== '')
      .join(', '),
  }));

  // The earliest open day running today. Resolved once and reused for both the
  // add-person preselection and the "add them to today's open day" action.
  const todayId =
    openDays
      .filter((day) => day.date === todayKey())
      .sort((a, b) => a.startTime.localeCompare(b.startTime))[0]?.id ?? null;

  const todayParticipants = new Set(
    participations.filter((row) => row.openDayId === todayId).map((row) => row.personId),
  );

  // A participation stores ids, so the names are resolved here, where the
  // formatting helpers already live. The fallbacks cover a record that was
  // written before its reference existed.
  const decorated = participations.map((row) => {
    const person = peopleById.get(row.personId);
    const day = daysById.get(row.openDayId);
    return {
      ...row,
      personLabel: person ? personLabel(person) : locale === 'it' ? 'Persona sconosciuta' : 'Unknown person',
      openDayLabel: day ? openDayLabel(day, locale) : locale === 'it' ? 'Open day sconosciuto' : 'Unknown open day',
    };
  });

  return {
    rowsByTab: {
      people: decoratedPeople as unknown as TabRow[],
      opendays: openDays as unknown as TabRow[],
      courses: courses as unknown as TabRow[],
      participations: decorated as unknown as TabRow[],
    },
    optionsContext: {
      people: [...people]
        .sort((a, b) => `${a.surname} ${a.name}`.localeCompare(`${b.surname} ${b.name}`))
        .map((person) => ({ id: person.id, label: personLabel(person) })),
      openDays: [...openDays]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((day) => ({ id: day.id, label: openDayLabel(day, locale) })),
      schoolCourses: [...courses]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((course) => ({ id: course.id, label: course.name })),
    },
    // The earliest open day running today, so the add-person form can preselect
    // it. Null when nothing is on today, leaving the choice to the operator.
    defaultOpenDayId: todayId,
    personHints: people.map((person) => ({
      id: person.id,
      name: person.name,
      surname: person.surname,
      age: person.age,
      previousSchool: person.previousSchool,
      registered: todayParticipants.has(person.id),
    })),
    // Counted from the same records the page was built from, so the numbers
    // cannot disagree with the tables beside them.
    stats: buildStats({ people, openDays, courses, participations }, locale),
  };
}

export function createApp(): Express {
  const app = express();
  const auth = getAuth();

  app.set('view engine', 'ejs');
  app.set('views', assets('./views'));

  // An import carries a whole export as one form field, which the CRUD forms do
  // not: their 50kb cap is what keeps a runaway or tampered post bounded, and
  // raising it for every route would give that away. Registered before the
  // general parser, which then leaves an already-parsed body alone.
  const importParser = express.urlencoded({ extended: false, limit: '5mb' });
  app.use((req, res, next) => {
    if (req.path.startsWith('/import')) {
      importParser(req, res, next);
      return;
    }
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(express.json({ limit: '12kb' }));
  app.use(express.static(assets('../public')));

  const localeCookie = 'openday_locale';
  app.use((req, res, next) => {
    const locale = resolveLocale(parseCookie(req.get('cookie') ?? '', localeCookie));
    res.locals.locale = locale;
    res.locals.t = (value: string) => translate(locale, value);
    next();
  });

  app.post('/locale', (req, res) => {
    if (!isSameOrigin(req)) return res.sendStatus(403);
    const locale = resolveLocale(req.body.locale);
    res.cookie(localeCookie, locale, {
      httpOnly: true,
      secure: req.secure || req.get('x-forwarded-proto') === 'https',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.redirect(303, safeReturnPath(req.body.returnTo));
  });

  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY ?? '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.FIREBASE_PROJECT_ID ?? '',
    appId: process.env.FIREBASE_APP_ID ?? '',
  };
  const sessionCookie = '__session';
  const sessionLifetime = 5 * 24 * 60 * 60 * 1000;
  const bootstrapAdminEmail = normalizeEmail(process.env.FIREBASE_ADMIN_EMAIL ?? '');

  // Firebase ID tokens are exchanged once for a short lived, httpOnly session.
  // SameSite cookies plus an Origin check protect the two session endpoints.
  app.get('/login', (req, res) => {
    res.render('login', { firebaseConfig, next: safeReturnPath(req.query.next), denied: req.query.denied === '1' });
  });
  app.post('/session/login', async (req, res) => {
    if (!isSameOrigin(req)) return res.sendStatus(403);
    const idToken = typeof req.body.idToken === 'string' ? req.body.idToken : '';
    if (!idToken || idToken.length > 10_000) return res.sendStatus(401);
    try {
      const decoded = await auth.verifyIdToken(idToken, true);
      if (Date.now() / 1000 - decoded.auth_time > 5 * 60) return res.status(401).json({ error: 'Sign in again to continue.' });
      const email = normalizeEmail(decoded.email ?? '');
      if (!decoded.email_verified || !GMAIL_ADDRESS.test(email) || !(email === bootstrapAdminEmail || await isEmailAuthorized(email))) {
        return res.status(403).json({ code: 'not_authorized' });
      }
      const cookie = await auth.createSessionCookie(idToken, { expiresIn: sessionLifetime });
      res.cookie(sessionCookie, cookie, {
        httpOnly: true,
        secure: req.secure || req.get('x-forwarded-proto') === 'https',
        sameSite: 'lax',
        maxAge: sessionLifetime,
        path: '/',
      });
      res.json({ redirect: safeReturnPath(req.body.next), user: { name: decoded.name ?? '', email } });
    } catch {
      res.sendStatus(401);
    }
  });
  app.post('/session/logout', (req, res) => {
    if (!isSameOrigin(req)) return res.sendStatus(403);
    res.clearCookie(sessionCookie, { httpOnly: true, sameSite: 'lax', path: '/' });
    res.redirect(303, '/login');
  });
  app.use(async (req, res, next) => {
    if (req.path === '/login' || req.path === '/session/login' || req.path === '/session/logout') return next();
    const cookie = parseCookie(req.get('cookie') ?? '', sessionCookie);
    if (cookie) {
      try {
        const claims = await auth.verifySessionCookie(cookie, true);
        const email = normalizeEmail(claims.email ?? '');
        if (!claims.email_verified || !GMAIL_ADDRESS.test(email) || !(email === bootstrapAdminEmail || await isEmailAuthorized(email))) {
          res.clearCookie(sessionCookie, { httpOnly: true, sameSite: 'lax', path: '/' });
          if (req.path.startsWith('/api/')) return res.sendStatus(403);
          return res.redirect(303, '/login?denied=1');
        }
        res.locals.user = { ...claims, email, isAdmin: email === bootstrapAdminEmail };
        return next();
      } catch {
        res.clearCookie(sessionCookie, { httpOnly: true, sameSite: 'lax', path: '/' });
      }
    }
    if (req.path.startsWith('/api/')) return res.sendStatus(401);
    res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl)}`);
  });

  // Helpers used by the partials. include() only forwards the render data, so
  // anything the templates call has to be reachable from here.
  app.locals.extraAttributes = extraAttributes;
  app.locals.defaultConfirmLabel = (row: Record<string, unknown>) => String(row.name ?? '');
  app.locals.collectionLabels = COLLECTION_LABELS;

  app.get('/team', requireAdmin, (_req, res) => res.redirect(303, '/?tab=team#team'));
  app.post('/team', requireAdmin, async (req, res, next) => {
    const email = normalizeEmail(typeof req.body.email === 'string' ? req.body.email : '');
    if (!GMAIL_ADDRESS.test(email)) {
      try {
        const state = emptyState();
        state.tab = 'team';
        const data = await loadPage(res.locals.locale);
        res.status(400);
        await renderPage(res, state, data, 400, null, {
          teamEmails: await listAuthorizedEmails(),
          teamAdminEmail: bootstrapAdminEmail,
          teamError: 'Enter a valid @gmail.com address.',
          teamEmailValue: typeof req.body.email === 'string' ? req.body.email : '',
        });
      }
      catch (error) { next(error); }
      return;
    }
    try {
      if (email !== bootstrapAdminEmail) await addAuthorizedEmail(email);
      res.redirect(303, '/?tab=team&teamNotice=added#team');
    } catch (error) { next(error); }
  });
  app.post('/team/:email/delete', requireAdmin, async (req, res, next) => {
    const email = normalizeEmail(String(req.params.email));
    try {
      if (email !== bootstrapAdminEmail && GMAIL_ADDRESS.test(email)) await removeAuthorizedEmail(email);
      res.redirect(303, '/?tab=team&teamNotice=removed#team');
    } catch (error) { next(error); }
  });

  async function renderPage(
    res: Response,
    state: PageState,
    data: PageData,
    status = 200,
    notice: string | null = null,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    res.status(status).render('index', {
      entities,
      // The CRUD tabs, which are the only ones with a form and a table.
      entityTabs: Object.values(entities),
      // The tab bar covers those plus the two read-only tabs, so the
      // client-side tab script finds them all from one list.
      sections: [
        ...Object.values(entities).map((entity) => ({ tab: entity.tab, label: entity.label })),
        ...READ_ONLY_SECTIONS,
        ...(res.locals.user?.isAdmin ? [{ tab: 'team' as const, label: 'Team' }] : []),
      ],
      teamEmails: res.locals.user?.isAdmin ? await listAuthorizedEmails() : [],
      teamAdminEmail: bootstrapAdminEmail,
      teamError: null,
      teamEmailValue: '',
      teamNotice: null,
      tab: state.tab,
      values: state.values,
      errors: state.errors,
      editing: state.editing,
      notice,
      error: null,
      ...data,
      ...extra,
    });
  }

  function save(entity: Entity, req: Request, res: Response, next: NextFunction, id: string | null): void {
    void (async () => {
      // Only a select or a checkbox group needs the loaded records, to check the
      // submitted ids are ones of the offered ones. The other tabs skip the load
      // on a good save.
      let data: PageData | undefined;
      const page = async (): Promise<PageData> => (data ??= await loadPage(res.locals.locale));
      const hasOptions = entity.fields.some((field) => field.type === 'select' || field.type === 'checks');

      const { values, errors, ok } = validate(entity.fields, req.body, hasOptions ? (await page()).optionsContext : undefined);

      const fail = async (fieldErrors: Errors): Promise<void> => {
        const state = emptyState();
        state.tab = entity.tab;
        state.values[entity.tab] = values;
        state.errors[entity.tab] = fieldErrors;
        state.editing[entity.tab] = id;
        try {
          await renderPage(res, state, await page(), 400);
        } catch (error) {
          next(error);
        }
      };

      if (!ok) {
        await fail(errors);
        return;
      }

      const payload = toPayload(entity.fields, values);
      const clash = entity.checkDuplicate ? await entity.checkDuplicate(payload, id) : null;
      if (clash) {
        await fail({ [clash.field]: clash.message });
        return;
      }

      try {
        if (id === null) {
          const newId = await entity.create(payload);
          if (entity.afterCreate) {
            await entity.afterCreate(String(newId), values);
          }
        } else {
          await entity.update(id, payload);
        }
        const action = id === null ? 'created' : 'updated';
        res.redirect(303, `/?notice=${action}-${entity.tab}#${entity.tab}`);
      } catch (error) {
        next(error);
      }
    })();
  }

  app.get('/', async (req, res, next) => {
    try {
      const tab = resolveTab(req.query.tab, res.locals.user?.isAdmin === true);
      const state = emptyState();
      state.tab = tab;
      const data = await loadPage(res.locals.locale);
      // The edit prefill and the add-person preselect only mean something on a
      // tab that has a form.
      if (isEntityTab(tab)) {
        const editId = resolveId(req.query.edit);
        if (editId) {
          const row = data.rowsByTab[tab].find((candidate) => candidate.id === editId);
          if (row) {
            state.editing[tab] = editId;
            state.values[tab] = recordToValues(entities[tab].fields, row);
          }
        } else if (tab === 'people' && data.defaultOpenDayId) {
          // Fresh add form: offer today's open day so signing someone up does
          // not need a second trip to the participations tab.
          state.values.people.openDayId = data.defaultOpenDayId;
        }
      }

      const notice = resolveNotice(req.query.notice);
      // Both are shown once and then dropped, so a refresh does not resurrect a
      // report or leave a confirmable preview sitting in memory.
      const reportToken = resolveId(req.query.report);
      const report = reportToken ? readReport(reportToken) : null;
      if (reportToken) dropReport(reportToken);

      const previewToken = resolveId(req.query.preview);
      const previewFile = previewToken ? readStaged(previewToken) : null;
      const preview =
        previewToken && previewFile
          ? { token: previewToken, summary: planImport(previewFile, await loadSnapshot()) }
          : null;

      const teamNotice = req.query.teamNotice === 'added' ? 'Account added to the team.' : req.query.teamNotice === 'removed' ? 'Account removed from the team.' : null;
      await renderPage(res, state, data, 200, notice, { transfer: { ...emptyImport(), report, preview }, teamNotice });
    } catch (error) {
      next(error);
    }
  });

  /**
   * The export, as a file the browser downloads. The filename carries the
   * timestamp, so saving twice does not produce "export (1).json" in the folder.
   */
  app.get('/export', async (_req, res, next) => {
    try {
      const now = new Date();
      const file = buildExport(await loadSnapshot(), now.toISOString());
      const body = JSON.stringify(
        {
          format: EXPORT_FORMAT,
          version: EXPORT_VERSION,
          exportedAt: now.toISOString(),
          counts: {
            people: file.people.length,
            openDays: file.openDays.length,
            schoolCourses: file.schoolCourses.length,
            participations: file.participations.length,
          },
          data: file,
        },
        null,
        2,
      );
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="openday-${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json"`);
      res.send(body);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Reads a pasted export, checks it, and shows what importing it would do. The
   * file is kept server side under a token, so the confirmation cannot be
   * pointed at a different document from the one that was previewed.
   */
  app.post('/import/preview', async (req, res, next) => {
    try {
      const raw = typeof req.body.payload === 'string' ? req.body.payload : '';
      const parsed = parseExport(raw);

      if (parsed.ok) {
        res.redirect(303, `/?tab=data&preview=${stageFile(parsed.file)}#data`);
        return;
      }

      // Nothing was written, so the page comes back with what was typed still
      // in the box rather than making the operator paste it all again.
      const state = emptyState();
      state.tab = 'data';
      const view = { ...emptyImport(), error: parsed.error, problems: parsed.problems, pasted: raw };
      await renderPage(res, state, await loadPage(res.locals.locale), 400, null, { transfer: view });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Applies a previewed import. The plan is worked out again from the file
   * staged here, so a change made since the preview is taken into account
   * rather than written around.
   */
  app.post('/import/confirm', async (req, res, next) => {
    try {
      const token = resolveId(req.body.token);
      const file = token ? readStaged(token) : null;
      if (!token || !file) {
        res.redirect(303, '/?notice=import-expired#data');
        return;
      }

      const summary = await applyImport(file, await loadSnapshot());
      const reportToken = stageReport(summary);
      dropStaged(token);
      res.redirect(303, `/?tab=data&report=${reportToken}#data`);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Adds someone already on file to today's open day, from the match list on the
   * add-person form. Today is resolved here rather than posted, so the day
   * cannot be chosen or spoofed by the client.
   */
  app.post('/participations/today', async (req, res, next) => {
    try {
      const personId = resolveId(req.body.personId);
      const data = await loadPage(res.locals.locale);
      const known = data.personHints.some((hint) => hint.id === personId);

      if (personId === null || !known) {
        res.redirect(303, '/?notice=unknown-person#people');
        return;
      }
      if (data.defaultOpenDayId === null) {
        res.redirect(303, '/?notice=no-open-day#people');
        return;
      }
      if (await findParticipation(personId, data.defaultOpenDayId, null)) {
        res.redirect(303, '/?notice=already#people');
        return;
      }

      await addParticipation({ personId, openDayId: data.defaultOpenDayId });
      res.redirect(303, '/?notice=added#participations');
    } catch (error) {
      next(error);
    }
  });

  for (const entity of Object.values(entities)) {
    app.post(entity.path, (req, res, next) => save(entity, req, res, next, null));
    app.post(`${entity.path}/:id`, (req, res, next) => save(entity, req, res, next, String(req.params.id)));
    app.post(`${entity.path}/:id/delete`, async (req, res, next) => {
      try {
        const id = resolveId(req.params.id);
        if (id) {
          await entity.remove(id);
        }
        res.redirect(303, `/?notice=removed-${entity.tab}#${entity.tab}`);
      } catch (error) {
        next(error);
      }
    });
  }

  app.use((_req, res) => {
    res.status(404).render('error', { status: 404, title: 'Not found', message: 'The page you requested is not available.', locale: res.locals.locale });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Never surface the raw error: it tends to embed file paths and tokens.
    console.error('[error]', error);
    res.status(500).render('error', { status: 500, title: 'Something went wrong', message: 'We could not complete that request. Please try again.', locale: res.locals.locale });
  });

  return app;
}

function safeReturnPath(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/';
}

function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }

function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  if (res.locals.user?.isAdmin === true) return next();
  res.status(403).render('error', { status: 403, title: 'Forbidden', message: 'Your account does not have permission to manage team access.', locale: res.locals.locale });
}

function isSameOrigin(req: Request): boolean {
  const origin = req.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === req.get('host'); } catch { return false; }
}

function parseCookie(header: string, key: string): string | null {
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === key) {
      try { return decodeURIComponent(value.join('=')); } catch { return null; }
    }
  }
  return null;
}

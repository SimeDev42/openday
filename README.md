# Open day visitor log

A small app for signing visitors up at an open day, and for the school courses
they are interested in. It is a single Node process talking to Firestore through
the Admin SDK, with server-rendered pages and no build step.

## Running it

```bash
npm install
npm start        # http://localhost:3000
npm run dev      # same, restarting on change
npm run typecheck
```

## Setup

### Firebase

1. Create or open the Firebase project in the [Firebase Console](https://console.firebase.google.com/).
2. In Authentication -> Sign-in method, enable **Google**.
3. In Authentication -> Settings -> Authorized domains, add the app's hostname (and `localhost` for local development).
4. Project settings -> General -> Your apps -> Add app -> Web. Copy its `apiKey`, `authDomain`, `projectId`, and `appId` into `.env` as `FIREBASE_*` values.
5. Project settings -> Service accounts -> Generate new private key. Store the downloaded service account JSON outside this repo and set `GOOGLE_APPLICATION_CREDENTIALS` to its path. The Admin SDK uses it to verify Firebase users and issue server sessions.
6. Set `FIREBASE_ADMIN_EMAIL` to the first administrator's Gmail address. That Google account can sign in immediately and manage allowed accounts from **Team** in the main navigation. The admin adds other `@gmail.com` accounts there; changes take effect on their next request, including signing out accounts that were removed.

### Node.js

1. Install Node.js from [nodejs.org](https://nodejs.org/) (22 or newer).
2. Install dependencies: `npm install`.
3. Copy `.env.example` to `.env` and fill in the Firebase web app values and `GOOGLE_APPLICATION_CREDENTIALS`.

Google sign-in creates a five-day, httpOnly Firebase session cookie. Only verified
Gmail accounts on the allowlist can create a session, and access is checked again
on every page and form request. The `FIREBASE_ADMIN_EMAIL` account is the initial
administrator; other allowed accounts can use the visitor register but cannot
manage the allowlist. Sign-out clears the session. Firebase browser SDK settings
are public identifiers, while the service account key must stay private and
outside the repository.

The interface is available in English and Italian. Use the **EN / IT** switch on
the sign-in page or in the app header; the selected language is saved in a
same-site preference cookie.

The app uses the Admin SDK, which bypasses Firestore security rules. The rules in
`firestore.rules` deny everything, so there is no browser-side access to the
database at all: do not open the project in the Firebase console's data view
without adjusting them first.

## The tabs

**People** — everyone who has visited. Name, surname, age, previous school, and
any number of school course preferences. The search box filters as you type
across name, surname, school and course. Every table pages at 25 rows.

**Open days** — the events themselves: date, location and times. Deleting one
takes its signups with it.

**School courses** — the courses on offer. Deleting one unlists it from
everyone who had it as a preference, so nobody is left holding a reference to
something that no longer exists.

**Participations** — who signed up for which open day. A person cannot be
registered twice for the same day.

**Stats** — registrations per open day, and how many people want each school
course, which is the number that decides how many staff to put on each course
stand. Also counts the people who have not signed up for any open day yet.

**Data** — export and import, described below.

### Signing people up

The add-person form has an optional open day picker, so signing someone up does
not need a second trip to the participations tab. If somebody is already on file,
a list of possible matches appears as you type, with one click to add an existing
person to today's open day instead of creating a duplicate. Today is resolved on
the server, so the day cannot be chosen or spoofed by the client.

## Export and import

**Export** downloads everything as a single JSON file. The file references
records by name rather than by id, so it can be imported into a different
database where the ids are different.

**Import** takes that file back. It is a two-step process on purpose, because an
import writes a lot at once:

1. **Check the file** parses it, validates every record against the same rules the
   forms use, and shows exactly what would happen: how many records would be
   added, how many already exist, how many would be skipped. Nothing is written
   yet.
2. **Import it** applies that plan.

Records already in the database are matched by name, so nothing is duplicated:

| Collection | Matched on |
| --- | --- |
| School courses | name |
| Open days | name and date |
| People | name, surname, age and previous school |
| Participations | the person and open day it points at |

Consequences worth knowing:

- Importing the same file twice does nothing the second time.
- An existing record's own fields are **not** overwritten. Importing a file that
  describes "Open Day" at a different location leaves the location alone.
- A reused person **gains** any course preferences the file lists and keeps the
  ones they already had. Nothing is taken away.
- A course named in a person's list but present neither in the file nor in the
  database is left off and reported, rather than guessed at.
- A participation naming a person or open day that is in neither the file nor
  the database is skipped and reported.
- The file is held in server memory between the two steps, so the confirmation
  cannot be pointed at a different document from the one that was previewed. An
  abandoned preview is dropped after fifteen minutes.

`createdAt` timestamps are deliberately not exported. They record when a row was
first typed in locally, and re-importing recreates every row with a fresh
timestamp anyway, so carrying them would suggest a fidelity the import does not
have.

The export format is versioned. The file carries `format: "openday-export"` and a
`version`, and an import from a newer version is refused with an explanation
rather than half-read.

## How it is put together

| File | What it holds |
| --- | --- |
| `src/server.ts` | starts the HTTP server |
| `src/app.ts` | routes, the entity definitions that drive the CRUD tabs, and the export/import endpoints |
| `src/db.ts` | Firestore: the four collections, the delete cascades, and bulk writes |
| `src/fields.ts` | field definitions, validation, and turning form values into documents |
| `src/format.ts` | shared label and date formatting |
| `src/stats.ts` | the numbers on the stats tab |
| `src/import.ts` | the export/import file format, the merge, and the staging store |
| `src/views/` | EJS templates |
| `public/` | stylesheet and the client-side script |

The CRUD tabs are all driven by one `entities` record in `src/app.ts`: each entry
supplies the fields, columns, routes and duplicate check, and the templates and
the table script work off that. Adding a field or a column to an existing tab is
a one-line change. The two read-only tabs are deliberately kept out of that
record, because they have no form and nothing to add or remove.

Everything loads up front on page render, which is why switching tabs, searching
and paging cost no network round trips. Firestore has no foreign keys, so the
delete cascades and the import both find their own dependents and page through
them, rather than assuming a single read returned everything.

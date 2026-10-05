export type Locale = 'en' | 'it';

const italian: Record<string, string> = {
  'Open day': 'Open day', People: 'Persone', 'Open days': 'Open days', 'School courses': 'Corsi di studio',
  Participations: 'Partecipazioni', Stats: 'Statistiche', Data: 'Dati', Team: 'Team',
  Added: 'Aggiunto', Name: 'Nome', Surname: 'Cognome', Age: 'Età', 'Previous school': 'Scuola precedente',
  'Course preferences': 'Preferenze dei corsi', Date: 'Data', Location: 'Luogo', Start: 'Inizio', End: 'Fine',
  Person: 'Persona', Description: 'Descrizione', Actions: 'Azioni',
  'Search by name, surname, school or course…': 'Cerca per nome, cognome, scuola o corso…',
  'Search by name…': 'Cerca per nome…', 'No people yet.': 'Non ci sono ancora persone.',
  'No open days yet.': 'Non ci sono ancora Open days.', 'No school courses yet.': 'Non ci sono ancora corsi di studio.',
  'No participations yet.': 'Non ci sono ancora partecipazioni.', 'Add person': 'Aggiungi persona',
  'Add open day': 'Aggiungi Open day', 'Add school course': 'Aggiungi corso di studio',
  'Add participation': 'Aggiungi partecipazione', 'Save changes': 'Salva modifiche', Add: 'Aggiungi', 'Add people': 'Aggiungi persone',
  'Edit person': 'Modifica persona', 'Edit open day': 'Modifica Open day',
  'Edit school course': 'Modifica corso di studio', 'Edit participation': 'Modifica partecipazione',
  'Do not register for an open day': 'Non iscrivere a un Open day', 'Choose…': 'Scegli…',
  'Search…': 'Cerca…', Change: 'Modifica', Cancel: 'Annulla', Edit: 'Modifica', Remove: 'Rimuovi',
  'Already registered?': 'Già registrato?',
  'Keep typing to match someone already on file and add them to today’s open day.': 'Continua a digitare per trovare una persona già registrata e aggiungerla all’Open day di oggi.',
  'Keep typing to check whether someone is already on file. No open day is scheduled for today, so there is nothing to add them to.': 'Continua a digitare per verificare se la persona è già registrata. Per oggi non è previsto alcun Open day a cui aggiungerla.',
  'Already on today’s list': 'Già nell’elenco di oggi', 'Add to today’s open day': 'Aggiungi all’Open day di oggi',
  'Added to today’s open day.': 'Iscrizione all’Open day di oggi completata.',
  'That person is already on today’s open day.': 'Questa persona è già iscritta all’Open day di oggi.',
  'There is no open day scheduled for today, so there was nothing to add them to.': 'Oggi non è previsto alcun Open day, quindi non è stato possibile aggiungere la persona.',
  'Could not find that person.': 'Impossibile trovare la persona.',
  'That import preview expired before it was confirmed. Paste the file again to see the plan.': 'L’anteprima dell’importazione è scaduta. Incolla di nuovo il file per visualizzare il riepilogo.',
  'At a glance': 'Riepilogo', Registrations: 'Iscrizioni', 'Not signed up yet': 'Non ancora iscritti',
  'Everyone on file has signed up for at least one open day.': 'Tutte le persone registrate si sono iscritte ad almeno un Open day.',
  'Nobody has signed up for an open day yet.': 'Nessuno si è ancora iscritto a un Open day.',
  ' of ': ' su ', ' people have not signed up for any open day.': ' persone non si sono iscritte a nessun Open day.',
  'Registrations per open day': 'Iscrizioni per Open day',
  'No open days yet, so there is nothing to count. Add one on the Open days tab.': 'Non ci sono ancora Open days da conteggiare. Aggiungine uno nella scheda Open days.',
  'Course interest': 'Interesse per i corsi',
  'No school courses yet. Add one on the School courses tab and people’s preferences will show up here.': 'Non ci sono ancora corsi. Aggiungine uno nella scheda Corsi di studio per vedere qui le preferenze.',
  'Nobody is on file yet, so there is no interest to measure.': 'Non ci sono ancora persone registrate da cui rilevare le preferenze.',
  ' person ': ' persona ', ' people ': ' persone ', ' on file. The busiest first.': ' registrate. I più richiesti sono in cima.',
  'Import finished': 'Importazione completata', Collection: 'Raccolta', 'In the file': 'Nel file', 'Already here': 'Già presenti', Skipped: 'Ignorati', Total: 'Totale',
  'What this import would do': 'Riepilogo dell’importazione',
  'Nothing has been written yet. Records already in this database are matched by name, so they are reused rather than duplicated, and importing the same file twice changes nothing the second time.': 'Non è stato ancora salvato nulla. I record già presenti vengono riconosciuti per nome e riutilizzati senza creare duplicati; importare due volte lo stesso file non cambia il risultato.',
  'Would add': 'Da aggiungere', 'Would reuse': 'Da riutilizzare', 'Would skip': 'Da ignorare',
  'Some participations will be skipped, because they name a person or an open day that is in neither this database nor the file.': 'Alcune partecipazioni verranno ignorate perché fanno riferimento a una persona o a un Open day assente sia dal database sia dal file.',
  'Import it': 'Importa',
  'Import this file? It adds ': 'Importare questo file? Aggiungerà ',
  ' new records. Anything already here is matched by name and reused, never duplicated.': ' nuovi record. Quelli già presenti verranno riutilizzati, senza duplicati.',
  Export: 'Esporta',
  'Downloads everything as one JSON file. Records reference each other by name rather than by id, so the file can be imported into a different database.': 'Scarica tutti i dati in un unico file JSON. I record si riferiscono tra loro tramite il nome, così il file può essere importato in un altro database.',
  'Download export': 'Scarica esportazione', 'There is nothing to export yet.': 'Non ci sono ancora dati da esportare.', Import: 'Importa',
  'Paste an export, or drop the file onto the box. Nothing is written until you have seen the plan and confirmed it.': 'Incolla un’esportazione o trascina il file nell’area. I dati verranno salvati solo dopo aver controllato e confermato il riepilogo.',
  'Export file': 'File di esportazione', 'Check the file': 'Controlla il file',
  'What the import did': 'Riepilogo delle modifiche importate',
  'Allow an account': 'Autorizza un account', 'Only listed Gmail accounts can sign in and access the visitor register.': 'Solo gli account Gmail autorizzati possono accedere e gestire le visite.',
  'Gmail address': 'Indirizzo Gmail', 'Allow account': 'Autorizza account', 'Allowed accounts': 'Account autorizzati',
  'Admin · configured on server': 'Amministratore · configurato sul server', Admin: 'Amministratore',
  'Can use the visitor register': 'Può gestire le visite', 'Remove access': 'Revoca accesso',
  'No accounts have access.': 'Nessun account è autorizzato.',
  'Remove access for ': 'Revocare l’accesso a ', '? Their next request will be signed out.': '? Al prossimo accesso la sessione verrà chiusa.',
  'Account added to the team.': 'Account aggiunto al team.', 'Account removed from the team.': 'Account rimosso dal team.',
  'Enter a valid @gmail.com address.': 'Inserisci un indirizzo @gmail.com valido.',
  'Sign out': 'Esci', 'Search people': 'Cerca persone', 'Search open days': 'Cerca Open days',
  'Search school courses': 'Cerca corsi di studio', 'Search participations': 'Cerca partecipazioni',
  'No match for': 'Nessun risultato per', 'Showing': 'Visualizzati', matches: 'risultati', match: 'risultato',
  Previous: 'Precedente', Next: 'Successiva', 'No results for': 'Nessun risultato per',
  'That file could not be read.': 'Impossibile leggere il file.',
  'No school courses yet. Add one on the School courses tab first.': 'Non ci sono ancora corsi. Aggiungine uno nella scheda Corsi di studio.',
  'Paste an export, or drop the file onto the box.': 'Incolla un’esportazione o trascina il file nell’area.',
  'The export has no "data" section.': 'L’esportazione non contiene la sezione "data".',
  'That is not valid JSON.': 'Il file non contiene JSON valido.',
  'The top level of an export must be a JSON object.': 'Il livello principale dell’esportazione deve essere un oggetto JSON.',
  'That file was not made by this app.': 'Il file non è stato creato da questa applicazione.',
  'courses must be a list of course names': 'l’elenco dei corsi deve contenere nomi di corsi',
  'open day date must be written as YYYY-MM-DD': 'la data dell’Open day deve essere nel formato AAAA-MM-GG',
  'open day name is required': 'il nome dell’Open day è obbligatorio',
  courses: 'corsi', Participation: 'Partecipazione',
  'The export has ': 'L’esportazione contiene ', ' problem': ' problema', ' problems': ' problemi', ', so nothing was imported.': ', quindi non è stato importato nulla.',
  ' expected an object': ': era atteso un oggetto', ' expected a list': ': era atteso un elenco',
  'Name is required': 'Il nome è obbligatorio', 'Date must be written as YYYY-MM-DD': 'La data deve essere nel formato AAAA-MM-GG',
  'Start time must be written as HH:MM': 'L’ora di inizio deve essere nel formato OO:MM',
  'End time must be written as HH:MM': 'L’ora di fine deve essere nel formato OO:MM',
  'End time is before the start time': 'L’ora di fine precede quella di inizio',
  ' is required': ' è obbligatorio', ' must be a number': ' deve essere un numero',
  ' must be one of the listed options': ' deve essere una delle opzioni disponibili',
  ' must be chosen from the listed options': ' deve essere selezionato tra le opzioni disponibili',
  ' is already registered for that open day': ' è già iscritto a questo Open day',
  'This person is already registered for that open day': 'Questa persona è già iscritta a questo Open day',
  'unavailable': 'non disponibile', person: 'persona', people: 'persone',
  'Counted over': 'Calcolato su', Search: 'Cerca',
  Language: 'Lingua', 'Main navigation': 'Navigazione principale',
  'Sign in': 'Accedi', 'Visitor registration': 'Registrazione visitatori',
  'Suggestions use previously entered school names.': 'I suggerimenti si basano sui nomi delle scuole già inseriti.',
  'Saved school names will appear here as suggestions.': 'Qui compariranno come suggerimenti i nomi delle scuole già salvati.',
  'Students by previous school': 'Studenti per scuola di provenienza',
  'No previous school names on file yet.': 'Non ci sono ancora scuole di provenienza nel registro.',
  'Students counted per saved previous school name.': 'Conteggio degli studenti per scuola di provenienza registrata.',
  'Manage visitors, open days, course preferences, and participation records in one place.': 'Gestisci visitatori, Open days, preferenze dei corsi e iscrizioni in un unico spazio.',
  'Access is limited to invited Gmail accounts.': 'L’accesso è riservato agli account Gmail invitati.',
  'TEAM ACCESS': 'ACCESSO TEAM',
  'Continue with the Google account your administrator approved.': 'Continua con l’account Google autorizzato dall’amministratore.',
  'Only accounts on the team access list can sign in.': 'Possono accedere solo gli account presenti nell’elenco del team.',
  'Person added.': 'Persona aggiunta.', 'Person updated.': 'Persona aggiornata.', 'Person removed.': 'Persona rimossa.',
  'Open day added.': 'Open day aggiunto.', 'Open day updated.': 'Open day aggiornato.', 'Open day removed.': 'Open day rimosso.',
  'School course added.': 'Corso di studio aggiunto.', 'School course updated.': 'Corso di studio aggiornato.', 'School course removed.': 'Corso di studio rimosso.',
  'Participation added.': 'Partecipazione aggiunta.', 'Participation updated.': 'Partecipazione aggiornata.', 'Participation removed.': 'Partecipazione rimossa.',
  'Something went wrong': 'Si è verificato un errore',
  'We could not complete that request. Please try again.': 'Non è stato possibile completare la richiesta. Riprova.',
  'The page you requested is not available.': 'La pagina richiesta non è disponibile.',
  'Your account does not have permission to manage team access.': 'Il tuo account non è autorizzato a gestire gli accessi del team.',
  'Back to the register': 'Torna al registro',
  'A better start to every visit': 'Un’accoglienza migliore per ogni visita',
  'Make room for': 'Fai spazio a', 'what’s next.': 'ciò che verrà.',
  'A calm, clear place to welcome visitors, keep the day moving, and help every guest find their way.': 'Uno spazio semplice e accogliente per registrare i visitatori e accompagnarli durante la giornata.',
  'Welcome every visitor': 'Accogli ogni visitatore', 'Keep registrations simple and personal.': 'Rendi ogni registrazione semplice e personale.',
  'Keep your team in sync': 'Tieni il team aggiornato', 'See sign-ups and interests in one place.': 'Consulta iscrizioni e preferenze in un unico posto.',
  'Private access for your invited team': 'Accesso riservato al team invitato', 'TEAM PORTAL': 'PORTALE DEL TEAM',
  'Welcome back': 'Bentornato', 'Sign in to manage today’s visitors and help make their visit count.': 'Accedi per gestire i visitatori di oggi e rendere speciale la loro visita.',
  'This Google account is not authorized to sign in. Ask your administrator to add it to the team.': 'Questo account Google non è autorizzato. Chiedi all’amministratore di aggiungerlo al team.',
  'Continue with Google': 'Continua con Google', 'Sign-in is limited to invited Gmail accounts.': 'L’accesso è riservato agli account Gmail invitati.',
  'A thoughtful welcome makes': 'Un’accoglienza speciale lascia', 'a lasting first impression.': 'un ricordo che dura.',
  'Here for every next step': 'Qui, per ogni nuovo passo', 'Visitor welcome desk': 'Accoglienza visitatori',
  'This account no longer has access. Ask an administrator to allow it.': 'Questo account non è più autorizzato. Chiedi all’amministratore di riattivarlo.',
  'Google sign-in did not complete. Please try again.': 'Accesso Google non completato. Riprova.',
  'We couldn’t sign you in just now. Please try again.': 'Non è stato possibile accedere. Riprova.',
  'Could not reach the database. Check the server log.': 'Impossibile raggiungere il database. Controlla il log del server.',
  'Not found': 'Pagina non trovata', Forbidden: 'Accesso negato',
};

export function resolveLocale(value: unknown): Locale {
  return value === 'it' ? 'it' : 'en';
}

export function translate(locale: Locale, value: string): string {
  if (locale === 'en') return value;
  const exact = italian[value];
  if (exact) return exact;
  const importSummary = value.match(/^The export has (\d+) problem(s?), so nothing was imported\.(.*)$/);
  if (importSummary) {
    const more = importSummary[3]!.match(/^ Showing the first (\d+)\.$/);
    return `L’esportazione contiene ${importSummary[1]} ${Number(importSummary[1]) === 1 ? 'problema' : 'problemi'}, quindi non è stato importato nulla.${more ? ` Sono mostrati i primi ${more[1]}.` : ''}`;
  }
  const excess = value.match(/^(.+?): (\d+) records, more than the (\d+) allowed in one import$/);
  if (excess) return `${translate(locale, excess[1]!)}: ${excess[2]} record, più dei ${excess[3]} consentiti per importazione`;
  const noMatch = value.match(/^No match for [“"](.+)[”"]\.$/);
  if (noMatch) return `Nessun risultato per “${noMatch[1]}”.`;
  const expected = value.match(/^(.+?): (expected an object|expected a list)$/);
  if (expected) return `${italian[expected[1]!] ?? expected[1]}: ${expected[2] === 'expected an object' ? 'era atteso un oggetto' : 'era atteso un elenco'}`;
  const importField = value.match(/^(.+?): (.+)$/);
  if (importField) {
    const label = /^Participation (\d+)(.*)$/.exec(importField[1]!);
    const translatedLabel = label ? `Partecipazione ${label[1]}${label[2] ? ` ${translate(locale, label[2].trim())}` : ''}` : italian[importField[1]!] ?? importField[1];
    const translatedMessage = translate(locale, importField[2]!);
    if (translatedLabel !== importField[1] || translatedMessage !== importField[2]) return `${translatedLabel}: ${translatedMessage}`;
  }
  const required = value.match(/^(.+?) is required$/);
  if (required) return `${italian[required[1]!] ?? required[1]} è obbligatorio`;
  const tooLong = value.match(/^(.+?) must be (\d+) characters or fewer$/);
  if (tooLong) return `${italian[tooLong[1]!] ?? tooLong[1]} deve contenere al massimo ${tooLong[2]} caratteri`;
  const lowerBound = value.match(/^(.+?) must be (\d+) or more$/);
  if (lowerBound) return `${italian[lowerBound[1]!] ?? lowerBound[1]} deve essere almeno ${lowerBound[2]}`;
  const upperBound = value.match(/^(.+?) must be (\d+) or less$/);
  if (upperBound) return `${italian[upperBound[1]!] ?? upperBound[1]} deve essere al massimo ${upperBound[2]}`;
  const problem = value.match(/^(.+?): expected an object$/);
  if (problem) return `${italian[problem[1]!] ?? problem[1]}: era atteso un oggetto`;
  const list = value.match(/^(.+?): expected a list$/);
  if (list) return `${italian[list[1]!] ?? list[1]}: era atteso un elenco`;
  const badNumber = value.match(/^(.+?) must be a number$/);
  if (badNumber) return `${italian[badNumber[1]!] ?? badNumber[1]} deve essere un numero`;
  const badOption = value.match(/^(.+?) must be one of the listed options$/);
  if (badOption) return `${italian[badOption[1]!] ?? badOption[1]} deve essere una delle opzioni disponibili`;
  const badChoice = value.match(/^(.+?) must be chosen from the listed options$/);
  if (badChoice) return `${italian[badChoice[1]!] ?? badChoice[1]} deve essere selezionato tra le opzioni disponibili`;
  const fieldProblem = value.match(/^(.+?): (.+?) \((\w+)\)$/);
  if (fieldProblem) return `${translate(locale, fieldProblem[1]!)}: ${translate(locale, fieldProblem[2]!)} (${fieldProblem[3]})`;
  const newVersion = value.match(/^This export was written by a newer version of the app \(format (\d+)\)\. Update the app before importing it\.$/);
  if (newVersion) return `Questa esportazione è stata creata con una versione più recente dell’app (formato ${newVersion[1]}). Aggiorna l’app prima di importarla.`;
  const oldVersion = value.match(/^This export uses format (.+?), but this app reads format (\d+)\.$/);
  if (oldVersion) return `L’esportazione usa il formato ${oldVersion[1]}, ma questa app legge il formato ${oldVersion[2]}.`;
  return value;
}

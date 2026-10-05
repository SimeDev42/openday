export type FieldType = 'text' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'checks';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * What a select can point at. The caller builds these already sorted and
 * formatted, so this module never has to know how a date or a name renders.
 */
export interface OptionRecord {
  id: string;
  label: string;
}

export interface OptionContext {
  people: OptionRecord[];
  openDays: OptionRecord[];
  schoolCourses: OptionRecord[];
}

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** Guards against unbounded input reaching the database. */
  maxLength?: number;
  /** Span both columns of the form grid. */
  full?: boolean;
  /** Choices for a select, derived from the records loaded for the page. */
  options?: (context: OptionContext) => SelectOption[];
  /** Text for the select's empty option, so "nothing chosen" is explicit. */
  placeholder?: string;
  /** Renders a filtered list instead of a native select, for long option lists. */
  searchable?: boolean;
  /** A group of checkboxes storing several ids as an array, for many-to-many. */
  checks?: boolean;
  /** Shown only when creating, and never written to this entity's document. */
  createOnly?: boolean;
}

export const personFields: Field[] = [
  { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 200 },
  { name: 'surname', label: 'Surname', type: 'text', required: true, maxLength: 200 },
  { name: 'age', label: 'Age', type: 'number', required: true, min: 0, max: 120, step: 1 },
  { name: 'previousSchool', label: 'Previous school', type: 'text', required: true, maxLength: 200 },
  {
    // Opt-in extra: signing a new person up as they are added, instead of
    // making the operator fill in a second form afterwards.
    name: 'openDayId',
    label: 'Open day',
    type: 'select',
    createOnly: true,
    full: true,
    placeholder: 'Do not register for an open day',
    options: (context) => context.openDays.map((day) => ({ value: day.id, label: day.label })),
  },
  {
    // Many-to-many: the person document keeps an array of course ids rather
    // than one field per course, so courses can be added and removed freely.
    name: 'courseIds',
    label: 'Course preferences',
    type: 'checks',
    checks: true,
    full: true,
    options: (context) => context.schoolCourses.map((course) => ({ value: course.id, label: course.label })),
  },
];

export const openDayFields: Field[] = [
  { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 200 },
  { name: 'location', label: 'Location', type: 'text', required: true, maxLength: 200 },
  { name: 'date', label: 'Date', type: 'date', required: true },
  { name: 'startTime', label: 'Start time', type: 'time', required: true },
  { name: 'endTime', label: 'End time', type: 'time', required: true },
];

export const courseFields: Field[] = [
  { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 200 },
  { name: 'description', label: 'Description', type: 'textarea', required: true, maxLength: 2000, full: true },
];

export const participationFields: Field[] = [
  {
    name: 'personId',
    label: 'Person',
    type: 'select',
    required: true,
    full: true,
    // Hundreds of people in a native select is unusable, so this renders a
    // filtered list instead. The id still travels in a hidden field, and the
    // server revalidates it against the real ids.
    searchable: true,
    placeholder: 'Search by name…',
    options: (context) => context.people.map((person) => ({ value: person.id, label: person.label })),
  },
  {
    name: 'openDayId',
    label: 'Open day',
    type: 'select',
    required: true,
    full: true,
    options: (context) => context.openDays.map((day) => ({ value: day.id, label: day.label })),
  },
];

/**
 * Extra attributes for an input, built from the definitions above. Those are
 * static and trusted, and the values are numbers, so the partial can emit this
 * unescaped. User-supplied values are always escaped separately.
 */
export function extraAttributes(field: Field): string {
  const parts: string[] = [];
  if (field.min !== undefined) parts.push(`min="${field.min}"`);
  if (field.max !== undefined) parts.push(`max="${field.max}"`);
  if (field.step !== undefined) parts.push(`step="${field.step}"`);
  if (field.maxLength !== undefined) parts.push(`maxlength="${field.maxLength}"`);
  if (field.type === 'number') parts.push('inputmode="numeric"');
  return parts.join(' ');
}

export type Values = Record<string, string | string[]>;
export type Errors = Record<string, string>;

export interface ValidationResult {
  values: Values;
  errors: Errors;
  ok: boolean;
}

/**
 * Collects the ids a checkbox group submitted. The body parser hands back an
 * array when a name repeats, but a lone string when only one box is ticked and
 * nothing at all when none is, so all three shapes are normalised here.
 */
function chosenIds(source: Record<string, unknown>, name: string): string[] {
  const raw = source[name];
  const entries = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  return [...new Set(entries.map((entry) => String(entry).trim()).filter((entry) => entry !== ''))];
}

export function validate(fields: Field[], body: unknown, context?: OptionContext): ValidationResult {
  const source = (body ?? {}) as Record<string, unknown>;
  const values: Values = {};
  const errors: Errors = {};

  for (const field of fields) {
    if (field.type === 'checks') {
      // Handled before the shared string path below, because a group of
      // checkboxes is a list rather than one value.
      const chosen = chosenIds(source, field.name);
      const allowed = context && field.options ? field.options(context).map((option) => option.value) : [];
      if (chosen.some((id) => !allowed.includes(id))) {
        errors[field.name] = `${field.label} must be chosen from the listed options`;
      } else if (field.required && chosen.length === 0) {
        errors[field.name] = `${field.label} is required`;
      }
      values[field.name] = chosen;
      continue;
    }

    const raw = String(source[field.name] ?? '').trim();
    values[field.name] = raw;

    if (raw === '') {
      if (field.required) {
        errors[field.name] = `${field.label} is required`;
      }
      continue;
    }

    // A select stores an id, so anything outside the rendered options is
    // rejected rather than written: that would leave a dangling reference.
    if (field.type === 'select') {
      const allowed = context && field.options ? field.options(context) : [];
      if (!allowed.some((option) => option.value === raw)) {
        errors[field.name] = `${field.label} must be one of the listed options`;
      }
      continue;
    }

    if (field.maxLength !== undefined && raw.length > field.maxLength) {
      errors[field.name] = `${field.label} must be ${field.maxLength} characters or fewer`;
      continue;
    }

    if (field.type !== 'number') {
      continue;
    }

    const number = Number(raw);
    if (!Number.isFinite(number)) {
      errors[field.name] = `${field.label} must be a number`;
    } else if (field.min !== undefined && number < field.min) {
      errors[field.name] = `${field.label} must be ${field.min} or more`;
    } else if (field.max !== undefined && number > field.max) {
      errors[field.name] = `${field.label} must be ${field.max} or less`;
    }
  }

  return { values, errors, ok: Object.keys(errors).length === 0 };
}

/** Converts the validated strings into the types Firestore should store. */
export function toPayload(fields: Field[], values: Values): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    // createOnly fields steer the save rather than describing the record, so
    // writing them into the document would leave a stray foreign id behind.
    if (field.createOnly) {
      continue;
    }
    const raw = values[field.name] ?? '';
    if (field.type === 'checks') {
      // Stored as a real array, so a course can be added or dropped without
      // rewriting the document around it.
      payload[field.name] = Array.isArray(raw) ? raw : [];
      continue;
    }
    payload[field.name] = field.type === 'number' ? Number(raw) : raw;
  }
  return payload;
}

export function blankValues(fields: Field[]): Values {
  return Object.fromEntries(
    fields.map((field) => [field.name, field.type === 'checks' ? [] : '']),
  );
}

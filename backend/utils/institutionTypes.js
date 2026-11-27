// What kind of place this is, and what that means for the screens its staff see.
//
// A primary school has a nursery and no registrar. A university has programmes and transcripts and
// no nursery. A coaching academy has batches and courses and neither. They all take attendance,
// collect fees, keep books and send messages, so most of the product is shared and only the parts
// that genuinely differ are turned on and off here.
//
// This is the one place that knows. The server sends the resulting list of screens to the browser,
// so the menu and the API can never disagree about what a college has.

const TYPES = [
  {
    key: 'school',
    label: 'School',
    blurb: 'Primary, middle or high school. Classes and sections, a nursery, parents closely involved.',
    words: { learner: 'Student', learners: 'Students', group: 'Class', groups: 'Classes' },
    // the screens this kind of place does not use
    without: ['registrar'],
  },
  {
    key: 'college',
    label: 'College',
    blurb: 'Intermediate or degree college. Programmes and courses as well as classes.',
    words: { learner: 'Student', learners: 'Students', group: 'Class', groups: 'Classes' },
    without: ['earlyYears'],
  },
  {
    key: 'university',
    label: 'University',
    blurb: 'Degree programmes, semesters, credits and transcripts. Alumni and accreditation matter.',
    words: { learner: 'Student', learners: 'Students', group: 'Section', groups: 'Sections' },
    without: ['earlyYears', 'safetyDesk'],
  },
  {
    key: 'academy',
    label: 'Academy or coaching centre',
    blurb: 'Batches and courses rather than school years. No nursery, no transcripts.',
    words: { learner: 'Learner', learners: 'Learners', group: 'Batch', groups: 'Batches' },
    without: ['earlyYears', 'registrar', 'safetyDesk', 'advancement', 'migration'],
  },
  {
    key: 'institute',
    label: 'Training institute',
    blurb: 'Short courses and certificates for people who are not enrolled for a whole year.',
    words: { learner: 'Trainee', learners: 'Trainees', group: 'Course group', groups: 'Course groups' },
    without: ['earlyYears', 'registrar', 'safetyDesk', 'advancement', 'migration', 'timetablePlan', 'omr'],
  },
];

// Every screen that a type can turn off. Anything not named here is shared by all of them, which
// is most of the product: attendance, fees, books, messages, documents, staff, reports, settings.
const SWITCHABLE = ['earlyYears', 'registrar', 'training', 'advancement', 'safetyDesk', 'careDesk', 'omr', 'timetablePlan', 'migration', 'transport', 'library'];

const DEFAULT = 'school';
const byKey = new Map(TYPES.map((t) => [t.key, t]));
const get = (key) => byKey.get(String(key || '').toLowerCase()) || byKey.get(DEFAULT);
const keys = TYPES.map((t) => t.key);

// Does a place of this kind use this screen?
const uses = (typeKey, screen) => !get(typeKey).without.includes(screen);

// What the browser needs: the words to use and the screens to leave out.
const shapeFor = (typeKey) => {
  const t = get(typeKey);
  return { key: t.key, label: t.label, blurb: t.blurb, words: t.words, hide: [...t.without] };
};

const catalogue = () => TYPES.map((t) => ({ key: t.key, label: t.label, blurb: t.blurb, words: t.words, hide: [...t.without] }));

module.exports = { TYPES, SWITCHABLE, DEFAULT, keys, get, uses, shapeFor, catalogue };

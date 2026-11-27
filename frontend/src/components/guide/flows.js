// Every flow in the product, written down once.
//
// A screen can be learned by clicking around. A *flow* cannot: who starts it, who has to agree,
// what the system does on its own, and where it ends up. That is what people were missing, so it
// is set out here as data and drawn by one component, which means a new flow is a few lines
// rather than a new picture.
//
// Each step says who acts (`by`), what happens, and what kind of step it is:
//   person   somebody does something
//   system   Aulensia does it on its own
//   check    somebody else has to agree before it goes on — the maker-checker steps
//   wait     time passes, or something is waited for
//   done     the end, and what everyone can see afterwards
//
// Keep the words plain. A head teacher in Rawalpindi should recognise their own week in these.

export const ROLE_COLOR = {
  owner: '#7c5cff',
  director: '#2a5cac',
  admin: '#1f5e53',
  teacher: '#b4610f',
  student: '#0f766e',
  parent: '#9d174d',
  agent: '#5b6b7b',
  system: '#4f5f70',
  guard: '#8a5a00',
};

export const ROLE_LABEL = {
  owner: 'Platform owner',
  director: 'Group director',
  admin: 'School admin',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
  agent: 'Partner agent',
  system: 'Aulensia',
  guard: 'Guard or office staff',
};

export const KIND_LABEL = {
  person: 'Somebody does this',
  system: 'Aulensia does this on its own',
  check: 'Somebody else has to agree',
  wait: 'Time passes',
  done: 'Finished',
};

/* ─────────────────────────── who is who ───────────────────────────
   The whole product on one picture: who creates whom, and who can see what.      */

export const MAP = {
  title: 'Everyone, and who they answer to',
  blurb:
    'Aulensia holds many schools. The platform owner runs the platform; a group director runs a group of schools; '
    + 'each school runs itself. Nobody reads across the line: a group office sees totals, a school sees its own people, '
    + 'and a family sees its own children.',
  nodes: [
    { id: 'owner', role: 'owner', label: 'Platform owner', sub: 'Plans, groups, agents, invoices', x: 50, y: 8 },
    { id: 'agent', role: 'agent', label: 'Partner agent', sub: 'Brings schools in, earns commission', x: 14, y: 26 },
    { id: 'org', role: 'director', label: 'Group (organisation)', sub: 'Iqra, a trust, a chain', x: 50, y: 26 },
    { id: 'director', role: 'director', label: 'Group director', sub: 'Opens schools, appoints heads, sees the money', x: 50, y: 44 },
    { id: 'school', role: 'admin', label: 'A school', sub: 'School, college, university or academy', x: 50, y: 62 },
    { id: 'admin', role: 'admin', label: 'School admin', sub: 'Runs this one school', x: 18, y: 80 },
    { id: 'teacher', role: 'teacher', label: 'Teacher', sub: 'Attendance, homework, marks', x: 42, y: 80 },
    { id: 'student', role: 'student', label: 'Student', sub: 'Homework, marks, attendance', x: 66, y: 80 },
    { id: 'parent', role: 'parent', label: 'Parent', sub: 'Children, fees, messages', x: 88, y: 80 },
  ],
  edges: [
    { from: 'owner', to: 'agent', label: 'appoints' },
    { from: 'owner', to: 'org', label: 'creates' },
    { from: 'agent', to: 'school', label: 'refers', dashed: true },
    { from: 'org', to: 'director', label: 'has' },
    { from: 'director', to: 'school', label: 'opens' },
    { from: 'school', to: 'admin', label: 'is run by' },
    { from: 'admin', to: 'teacher', label: 'adds' },
    { from: 'admin', to: 'student', label: 'admits' },
    { from: 'student', to: 'parent', label: 'linked to', dashed: true },
  ],
  walls: [
    'A group director sees how many children a school has and what it collects. They never open a child’s record.',
    'A school never sees another school’s people or money, even inside the same group.',
    'A parent sees only their own children. A teacher sees only their own classes.',
    'One email can hold more than one account — a teacher who is also a parent switches between them from the top bar.',
  ],
};

/* ─────────────────────────── what each role does ─────────────────────────── */

export const ROLE_FLOWS = [
  {
    id: 'role-admin',
    group: 'Roles',
    forRoles: ['admin'],
    title: 'A school admin, from empty to running',
    blurb: 'The order to set a school up in. Each step needs the one before it.',
    steps: [
      { by: 'admin', kind: 'person', title: 'Set the school up', text: 'Settings → School Setup: name, logo, and what kind of place this is. The kind decides which screens appear.' },
      { by: 'admin', kind: 'person', title: 'Make the classes', text: 'Quick Creation → Class Setup. Standards and divisions, for example Std 5 division A.' },
      { by: 'admin', kind: 'person', title: 'Add the subjects', text: 'Academics → Subjects, with full marks and pass marks per class.' },
      { by: 'admin', kind: 'person', title: 'Add the teachers', text: 'User Management → Teachers. Each one gets a first-time password to hand over.' },
      { by: 'admin', kind: 'person', title: 'Give each teacher their classes', text: 'Academics → Teacher assignments. Name one teacher the head of each class; that is who marks its attendance.' },
      { by: 'admin', kind: 'person', title: 'Add the children', text: 'One at a time, or a whole file at once through Admissions & Records → Import from Excel.' },
      { by: 'system', kind: 'system', title: 'Families get their own sign-ins', text: 'A child added with a guardian email gets a parent account linked to them.' },
      { by: 'admin', kind: 'person', title: 'Set the fees', text: 'Fees & Finance → Fee setup: what each class pays a year and in how many instalments.' },
      { by: 'admin', kind: 'done', title: 'The school is running', text: 'Teachers mark attendance, families see it, fees are billed. From here the work is daily, not setting up.' },
    ],
  },
  {
    id: 'role-teacher',
    group: 'Roles',
    forRoles: ['teacher', 'admin'],
    title: 'A teacher’s day',
    blurb: 'What a teacher opens, in the order the day asks for it.',
    steps: [
      { by: 'teacher', kind: 'person', title: 'Open Today', text: 'The first screen shows this teacher’s lessons for today and what is waiting.' },
      { by: 'teacher', kind: 'person', title: 'Mark the register', text: 'The head teacher of a class marks it once a day: present, absent, or half day for a child leaving early.' },
      { by: 'system', kind: 'system', title: 'Families are told', text: 'An absence reaches the family in the app, inside the school’s quiet hours.' },
      { by: 'teacher', kind: 'person', title: 'Set homework, enter marks', text: 'Homework for a class; marks against an exam once the admin has created it.' },
      { by: 'teacher', kind: 'person', title: 'Ask for leave', text: 'From their own page. The office approves it — a teacher never approves their own.' },
      { by: 'system', kind: 'system', title: 'Cover is worked out', text: 'Approved leave creates one cover line for each lesson that teacher would have taught.' },
      { by: 'teacher', kind: 'done', title: 'The day is recorded', text: 'Attendance, homework and marks are in. Parents and students see their own part of it.' },
    ],
  },
  {
    id: 'role-parent',
    group: 'Roles',
    forRoles: ['parent', 'admin'],
    title: 'A parent, following their child',
    blurb: 'A family sees their own children and nothing else.',
    steps: [
      { by: 'admin', kind: 'person', title: 'The school links the family', text: 'A child added with a guardian email gets a parent account tied to that child.' },
      { by: 'parent', kind: 'person', title: 'Sign in', text: 'Email and password. A parent with children in two schools of one group switches between them from the top bar.' },
      { by: 'parent', kind: 'person', title: 'See the day', text: 'Attendance, homework, marks and notices, per child.' },
      { by: 'parent', kind: 'person', title: 'Pay the fee', text: 'The challan is in the app. Pay at the bank or the office, then send the reference as proof.' },
      { by: 'admin', kind: 'check', title: 'The office confirms it', text: 'A payment counts only once the office has confirmed the exact amount.' },
      { by: 'parent', kind: 'done', title: 'The receipt arrives', text: 'A receipt with a serial, and the balance updates.' },
    ],
  },
  {
    id: 'role-student',
    group: 'Roles',
    forRoles: ['student', 'admin'],
    title: 'A student’s week',
    blurb: 'What a learner sees, and what they can do themselves.',
    steps: [
      { by: 'student', kind: 'person', title: 'Sign in', text: 'Email and password, given by the school.' },
      { by: 'student', kind: 'person', title: 'See homework and the timetable', text: 'What is due, and where to be.' },
      { by: 'student', kind: 'person', title: 'Sit a quiz or an online exam', text: 'The clock runs on the server, so closing the tab does not stop it.' },
      { by: 'teacher', kind: 'person', title: 'The teacher marks it', text: 'Marks are entered, and checked before they are published.' },
      { by: 'student', kind: 'done', title: 'Results appear', text: 'Marks, attendance and the report card when the school publishes it.' },
    ],
  },
  {
    id: 'role-director',
    group: 'Roles',
    forRoles: ['director', 'owner', 'admin'],
    title: 'A group director',
    blurb: 'A head office that runs several schools under one name.',
    steps: [
      { by: 'owner', kind: 'person', title: 'The platform owner makes the group', text: 'And appoints its director, who gets a first-time password.' },
      { by: 'director', kind: 'person', title: 'Open a school', text: 'Name it, say what kind it is, and name the person who will run it. They get a password and the school code.' },
      { by: 'admin', kind: 'person', title: 'That person runs the school', text: 'They sign in at the school’s own door and set it up as any school does.' },
      { by: 'director', kind: 'person', title: 'Watch the group', text: 'How many children and teachers at each school, and who runs it.' },
      { by: 'director', kind: 'person', title: 'Watch the money', text: 'Billed, collected, owed, salaries and supplier bills — for the group and school by school.' },
      { by: 'system', kind: 'check', title: 'The wall holds', text: 'A director never opens a child’s record, a mark or one family’s fee. For that, the school gives them an account of its own.' },
      { by: 'director', kind: 'done', title: 'The group is run from one place', text: 'Schools opened, heads appointed, money watched, without reaching into any school’s records.' },
    ],
  },
  {
    id: 'role-owner',
    group: 'Roles',
    forRoles: ['owner'],
    title: 'The platform owner',
    blurb: 'Whoever owns Aulensia itself: plans, schools, groups, agents and invoices.',
    steps: [
      { by: 'owner', kind: 'person', title: 'Set the plans', text: 'What each plan costs and how many children and teachers it allows.' },
      { by: 'agent', kind: 'person', title: 'An agent brings a school in', text: 'A partner refers a school and earns a commission when it pays.' },
      { by: 'owner', kind: 'person', title: 'Quote, then invoice', text: 'A private link the buyer accepts; accepting it makes the invoice.' },
      { by: 'owner', kind: 'person', title: 'Create the school', text: 'Or make a group and let its director open the schools.' },
      { by: 'owner', kind: 'person', title: 'Record the payment', text: 'The plan, the expiry and the agent’s commission all follow from it.' },
      { by: 'owner', kind: 'done', title: 'The school is live', text: 'And the owner console shows what every school is using.' },
    ],
  },
];

/* ─────────────────────────── how each feature works ─────────────────────────── */

export const FEATURE_FLOWS = [
  {
    id: 'attendance',
    group: 'Every day',
    forRoles: ['admin', 'teacher'],
    title: 'Attendance — the children',
    blurb: 'Once a day, by the head teacher of the class.',
    steps: [
      { by: 'admin', kind: 'person', title: 'Name a head teacher for each class', text: 'Academics → Teacher assignments. Only that teacher marks that class.' },
      { by: 'teacher', kind: 'person', title: 'Mark the register', text: 'Present, absent, or half day. Once a day, not per lesson.' },
      { by: 'system', kind: 'system', title: 'Families are told', text: 'An absence goes to the family, held back until quiet hours end.' },
      { by: 'admin', kind: 'person', title: 'Fix a mistake', text: 'Attendance & Safety → Attendance desk. A correction is added, never written over — the old mark stays visible.' },
      { by: 'done', kind: 'done', title: 'The month adds up', text: 'Registers, percentages and the children who need chasing.' },
    ],
  },
  {
    id: 'staff-attendance',
    group: 'Every day',
    forRoles: ['admin'],
    title: 'Attendance — the teachers and staff',
    blurb: 'A different register from the children’s, and a different screen.',
    steps: [
      { by: 'admin', kind: 'person', title: 'Put staff on the system', text: 'User Management → Staff & payroll → People. A teacher added as a teacher already has a staff record.' },
      { by: 'admin', kind: 'person', title: 'Open the staff register', text: 'Attendance & Safety → Teacher & staff attendance. It opens on today.' },
      { by: 'admin', kind: 'person', title: 'Mark each person', text: 'Present, late, absent, on leave. Approved leave is already filled in.' },
      { by: 'system', kind: 'system', title: 'Payroll reads it', text: 'The month’s register is what the pay run works from, so an unmarked day is a question asked later.' },
      { by: 'done', kind: 'done', title: 'The month is ready to pay', text: 'With leave, overtime and advances already counted.' },
    ],
  },
  {
    id: 'fees',
    group: 'Money',
    forRoles: ['admin', 'parent'],
    title: 'Fees, from setting them to the receipt',
    blurb: 'What a class pays, how a family pays it, and what the family gets back.',
    steps: [
      { by: 'admin', kind: 'person', title: 'Set what each class pays', text: 'Fees & Finance → Fee setup: the yearly total and how many instalments.' },
      { by: 'system', kind: 'system', title: 'Challans are made', text: 'Each child gets an invoice for the period, with a due date.' },
      { by: 'parent', kind: 'person', title: 'The family pays', text: 'At the bank or the office, then sends the reference as proof.' },
      { by: 'admin', kind: 'check', title: 'The office confirms the exact amount', text: 'Only a confirmed payment counts. A reused reference needs a reason.' },
      { by: 'system', kind: 'system', title: 'The receipt is made', text: 'From the school’s own design if one is chosen, with a serial and a page to check it on.' },
      { by: 'admin', kind: 'wait', title: 'Late fees, if the school charges them', text: 'After the grace days the school set.' },
      { by: 'done', kind: 'done', title: 'The balance is right', text: 'And the group office sees the totals, not the names.' },
    ],
  },
  {
    id: 'documents',
    group: 'Every day',
    forRoles: ['admin'],
    title: 'Student cards, certificates and report cards',
    blurb: 'Draw a design once; hand them out from each person’s own record.',
    steps: [
      { by: 'admin', kind: 'person', title: 'Draw the design', text: 'Communication → Documents studio. Pick what it is — ID card, certificate, report card — and lay it out.' },
      { by: 'admin', kind: 'check', title: 'A second administrator approves it', text: 'Whoever drew it cannot approve it. This is what stops a school’s certificate being changed by one person.' },
      { by: 'admin', kind: 'person', title: 'Hand one out', text: 'Open the child or the teacher in User Management and press Documents. Everything approved for that kind of person is listed.' },
      { by: 'system', kind: 'system', title: 'It gets a serial', text: 'And a public page anyone can check it on, so a real one can be told from a copy.' },
      { by: 'done', kind: 'done', title: 'Printed, and on the record', text: 'What a person holds is listed on their own record for the next time.' },
    ],
  },
  {
    id: 'leave',
    group: 'Staff',
    forRoles: ['admin', 'teacher'],
    title: 'Leave, and who covers the lesson',
    blurb: 'Asking and deciding are two jobs, held by two people.',
    steps: [
      { by: 'teacher', kind: 'person', title: 'The teacher asks', text: 'From their own page. Or the office writes down a paper form for them.' },
      { by: 'admin', kind: 'check', title: 'Somebody else decides', text: 'Whoever recorded the request cannot approve it, and nobody approves their own. A school with one administrator is allowed, and it is written down as such.' },
      { by: 'system', kind: 'system', title: 'Cover lines appear', text: 'One for each lesson the teacher would have taught.' },
      { by: 'admin', kind: 'person', title: 'The desk fills them', text: 'Only teachers who are free, on duty and up to date on mandatory training are offered.' },
      { by: 'done', kind: 'done', title: 'The timetable still works', text: 'And the leave is counted against the balance.' },
    ],
  },
  {
    id: 'import',
    group: 'Setting up',
    forRoles: ['admin'],
    title: 'Bringing a whole school in from a sheet',
    blurb: 'Fourteen parts of the school can be filled from Excel.',
    steps: [
      { by: 'admin', kind: 'person', title: 'Download the template', text: 'Admissions & Records → Import from Excel. Each template explains every column on a second sheet.' },
      { by: 'admin', kind: 'person', title: 'Fill it in and upload it', text: 'Headings may be in any order; columns of your own are ignored.' },
      { by: 'system', kind: 'system', title: 'Every row is checked', text: 'You see what would be added, updated, left alone or needs fixing — before anything is written.' },
      { by: 'admin', kind: 'check', title: 'You decide', text: 'Nothing is written until you press the button. Rows that need fixing are left out.' },
      { by: 'system', kind: 'system', title: 'The file is dropped', text: 'It is read in memory and never saved on the server.' },
      { by: 'done', kind: 'done', title: 'And the passwords come back', text: 'First-time passwords for new students and teachers download as one file, shown once.' },
    ],
  },
  {
    id: 'exams',
    group: 'Academics',
    forRoles: ['admin', 'teacher'],
    title: 'Exams, marks and report cards',
    blurb: 'From making the exam to the card a family reads.',
    steps: [
      { by: 'admin', kind: 'person', title: 'Create the exam', text: 'Academics → Exams: which classes, which subjects, and the date.' },
      { by: 'teacher', kind: 'person', title: 'Teachers enter marks', text: 'Against their own subjects, checked against the subject’s full marks.' },
      { by: 'admin', kind: 'check', title: 'Marks are checked before anyone sees them', text: 'A result is published once, deliberately.' },
      { by: 'system', kind: 'system', title: 'Report cards are built', text: 'From the published marks and the school’s own design.' },
      { by: 'done', kind: 'done', title: 'Families read them', text: 'Each family sees only their own children’s.' },
    ],
  },
  {
    id: 'admissions',
    group: 'Setting up',
    forRoles: ['admin'],
    title: 'Admitting a new child',
    blurb: 'From the enquiry to a child sitting in a class.',
    steps: [
      { by: 'parent', kind: 'person', title: 'A family enquires', text: 'Or the office records a walk-in.' },
      { by: 'admin', kind: 'person', title: 'The school decides', text: 'Admissions & Records → Admissions: offer a place, or not.' },
      { by: 'admin', kind: 'person', title: 'The child is admitted to a class', text: 'With an admission number, which is how the system recognises them later.' },
      { by: 'system', kind: 'system', title: 'A fee account opens', text: 'If that class has a fee structure, the child is billed from it.' },
      { by: 'system', kind: 'system', title: 'The family gets a sign-in', text: 'When a guardian email was given.' },
      { by: 'done', kind: 'done', title: 'They appear on the register', text: 'From the next school day.' },
    ],
  },
  {
    id: 'branches',
    group: 'Setting up',
    forRoles: ['admin', 'director'],
    title: 'A school with more than one campus',
    blurb: 'Branches inside one school, and several schools in a group — two different things.',
    steps: [
      { by: 'admin', kind: 'person', title: 'Add a branch', text: 'Branches → Add a campus. Every school starts with one main branch.' },
      { by: 'admin', kind: 'person', title: 'Put classes in it', text: 'Move classes to the branch they are taught at.' },
      { by: 'admin', kind: 'person', title: 'Put staff in it', text: 'Teachers and staff belong to a branch. Children follow their class.' },
      { by: 'admin', kind: 'person', title: 'Limit an administrator to a branch', text: 'Access & permissions → Campuses. At least one administrator must stay school-wide.' },
      { by: 'director', kind: 'person', title: 'Several schools is a different thing', text: 'Separate schools with separate records belong to a group, run by a director — not to branches of one school.' },
      { by: 'done', kind: 'done', title: 'Each branch counts its own', text: 'Classes, children, teachers and staff.' },
    ],
  },
  {
    id: 'switch',
    group: 'Every day',
    forRoles: ['teacher', 'parent', 'admin', 'student'],
    title: 'One person, two roles',
    blurb: 'A teacher whose child studies at the same school.',
    steps: [
      { by: 'admin', kind: 'person', title: 'The school adds them twice', text: 'Once as a teacher, once as the parent of their child — with the same email address.' },
      { by: 'teacher', kind: 'person', title: 'They sign in once', text: 'Email and password. If the email holds more than one account, they pick which one to enter.' },
      { by: 'teacher', kind: 'person', title: 'Switch from the top bar', text: '"Switch account" moves between them without signing in again. The current one has a tick.' },
      { by: 'system', kind: 'check', title: 'The two stay separate', text: 'As a teacher they see their classes; as a parent only their own child. Switching only reaches accounts with the same email in the same school or group.' },
      { by: 'done', kind: 'done', title: 'One password, two jobs', text: 'And nothing from one side leaks into the other.' },
    ],
  },
  {
    id: 'kinds',
    group: 'Setting up',
    forRoles: ['admin', 'director'],
    title: 'What kind of institution this is',
    blurb: 'A school, a college, a university, an academy or a training institute.',
    steps: [
      { by: 'director', kind: 'person', title: 'Chosen when the school is opened', text: 'Or set later by an administrator in Settings → School Setup.' },
      { by: 'system', kind: 'system', title: 'The menu follows', text: 'A school keeps its nursery and has no registrar. A university has programmes and transcripts and no nursery. An academy has learners in batches.' },
      { by: 'system', kind: 'check', title: 'And so does the door', text: 'A screen a kind does not use is refused by the server too, not merely hidden.' },
      { by: 'done', kind: 'done', title: 'Everything shared stays shared', text: 'Attendance, fees, people, documents, messages and reports work the same whatever kind of place it is.' },
    ],
  },
  {
    id: 'money-group',
    group: 'Money',
    forRoles: ['director', 'owner'],
    title: 'Money across a group',
    blurb: 'What a head office can see, and what stays with the school.',
    steps: [
      { by: 'admin', kind: 'person', title: 'Each school bills and collects', text: 'Its own fees, its own pay runs, its own supplier bills.' },
      { by: 'system', kind: 'system', title: 'The group office adds it up', text: 'Billed, collected, still owed, overdue, salaries and supplier bills — per school and together.' },
      { by: 'director', kind: 'person', title: 'The director reads it', text: 'This month, the last twelve months, or everything. One school opens month by month.' },
      { by: 'system', kind: 'check', title: 'And stops there', text: 'No named child, no one family’s unpaid fee. The group office sees how much is owed, not who owes it.' },
      { by: 'done', kind: 'done', title: 'Budgets from facts', text: 'Staffing and spending decided from what the schools actually did.' },
    ],
  },
];

export const ALL_FLOWS = [...ROLE_FLOWS, ...FEATURE_FLOWS];

export const flowsFor = (role) => ALL_FLOWS.filter((f) => !f.forRoles || f.forRoles.includes(role));

export const groupsOf = (flows) => {
  const out = new Map();
  for (const f of flows) {
    if (!out.has(f.group)) out.set(f.group, []);
    out.get(f.group).push(f);
  }
  return [...out.entries()].map(([group, items]) => ({ group, items }));
};

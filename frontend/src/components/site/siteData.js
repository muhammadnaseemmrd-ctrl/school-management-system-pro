// Content for the public site. Everything here describes something the product already does (checked against the build notes
// for each area). Screens named in `shot` are real screenshots of the demo school in /public/showcase.

export const WHATSAPP_NUMBER = '923314920631'; // +92 331 4920631
export const WHATSAPP_DISPLAY = '+92 331 4920631';
export const whatsappLink = (text = 'Hello Aulensia, I would like to know more about your school management system.') =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

export const NAV = [
  { id: 'top', label: 'Overview', to: '/' },
  { id: 'platform', label: 'Platform', to: '/#platform' },
  { id: 'how', label: 'How it works', to: '/#how' },
  { id: 'who', label: "Who it's for", to: '/#who' },
  { id: 'pricing', label: 'Pricing', to: '/#pricing' },
  { id: 'about', label: 'About', to: '/about' },
  { id: 'faq', label: 'FAQ', to: '/#faq' },
];

/* ───────── Hero: the connected campuses on the globe (illustrative, not customers) ───────── */
export const CAMPUSES = [
  { id: 'hub', label: 'Head office of a school group', short: 'School group', lat: 24, lon: -8, flows: ['Every campus side by side', 'Shared rules, campus exceptions', 'Group reports'] },
  { id: 'school', label: 'School', short: 'School', lat: 32, lon: 68, flows: ['Daily attendance', 'Marks and exams', 'Fees and payments', 'Notices to families'] },
  { id: 'nursery', label: 'Nursery and early years', short: 'Nursery', lat: 46, lon: 8, flows: ['Daily diary for families', 'Safe pick-up checks', 'Care log'] },
  { id: 'uni', label: 'College or university', short: 'College', lat: 4, lon: 118, flows: ['Courses and sections', 'Degree progress check', 'Signed transcripts'] },
  { id: 'academy', label: 'Academy or training centre', short: 'Academy', lat: -22, lon: 36, flows: ['Courses and cohorts', 'Signed certificates', 'Learner portal'] },
  { id: 'campus2', label: 'Another campus', short: 'Second campus', lat: -10, lon: -48, flows: ['Its own administrators', 'Same trusted records', 'Own timetable and fees'] },
  { id: 'bus', label: 'School transport', short: 'Transport', lat: 14, lon: 170, flows: ['Routes and stops', 'Safe hand-over to the right adult', 'Bus seen only during a trip'] },
];
export const CAMPUS_LINKS = [['hub', 'school'], ['hub', 'nursery'], ['hub', 'uni'], ['hub', 'academy'], ['hub', 'campus2'], ['hub', 'bus'], ['school', 'nursery'], ['school', 'bus'], ['uni', 'academy'], ['school', 'academy']];

export const HERO_CHIPS = ['Fees in PKR', 'English + اردو', 'CNIC / B-Form', 'Works on any phone'];

/* ───────── Problem → solution ───────── */
export const SCATTERED = [
  { id: 'reg', label: 'Paper attendance registers', x: 8, y: 14, r: -6 },
  { id: 'xls', label: 'Fee spreadsheets', x: 70, y: 6, r: 5 },
  { id: 'wa', label: 'WhatsApp groups for notices', x: 80, y: 46, r: -4 },
  { id: 'marks', label: 'Marks in separate files', x: 6, y: 56, r: 4 },
  { id: 'calls', label: 'Parents phoning the office', x: 18, y: 82, r: -5 },
  { id: 'slips', label: 'Fee slips and screenshots', x: 58, y: 80, r: 6 },
];
export const PAIRS = [
  { icon: 'FileSpreadsheet', problem: 'Too many spreadsheets', fix: 'One record for every child, kept in one place.' },
  { icon: 'Layers', problem: 'Separate tools for attendance, fees, messages and exams', fix: 'Everything shares the same student record, so nothing has to be typed twice.' },
  { icon: 'Clock', problem: 'Teachers losing hours to paperwork', fix: 'Roll call and marks in a few taps, with the day laid out on one screen.' },
  { icon: 'Phone', problem: 'Parents chasing the office for news', fix: 'Attendance, fees and notices on their own phone, in English or Urdu.' },
  { icon: 'Eye', problem: 'Leaders who cannot see the whole picture', fix: 'One dashboard that shows what needs attention first.' },
  { icon: 'Unplug', problem: 'Records that do not match each other', fix: 'Changes are kept with who made them and when, so people trust the numbers.' },
];

/* ───────── Ecosystem: what the product covers, in plain words ───────── */
// Each feature: t (name), what (what it does), who (who uses it), fix (the everyday problem it solves)
export const CATEGORIES = [
  {
    id: 'admissions', icon: 'UserPlus', color: '#2a5cac', title: 'Admissions and students', shot: 'admin-students',
    intro: 'From the first enquiry to a full student record, kept in one place.',
    features: [
      { t: 'Admissions', what: 'Take enquiries, track each applicant and turn an accepted child into a student.', who: 'Admissions office', fix: 'No more lost enquiry slips.' },
      { t: 'Student records', what: 'One record per child with guardians, documents and history.', who: 'Office and principals', fix: 'No searching through folders.' },
      { t: 'Bring in your existing data', what: 'Upload classes and students from a sheet. See a preview first; nothing is saved until you agree.', who: 'Administrators', fix: 'Starting out takes hours, not weeks.' },
      { t: 'New school year', what: 'Move classes up to the next year in one guided step, with a dry run and a way back.', who: 'Administrators', fix: 'Year-end without the chaos.' },
    ],
  },
  {
    id: 'academic', icon: 'CalendarDays', color: '#2c776c', title: 'Classes and timetable', shot: 'admin-timetable',
    intro: 'Who teaches what, where and when, without clashes.',
    features: [
      { t: 'Timetable planning', what: 'Build the timetable. A teacher or room can never be booked twice.', who: 'Administrators', fix: 'No double bookings on the first day.' },
      { t: 'Cover and swaps', what: 'When a teacher is away, see who is free. Lesson swaps need the right approval.', who: 'Administrators and teachers', fix: 'Fair, quick cover.' },
      { t: 'Teacher Today', what: 'A teacher opens one screen and sees lessons, roll calls and marking for the day.', who: 'Teachers', fix: 'No hunting for what is next.' },
    ],
  },
  {
    id: 'attendance', icon: 'UserCheck', color: '#b86650', title: 'Attendance', shot: 'admin-attendance',
    intro: 'Know who is in school, and tell families quickly and fairly.',
    features: [
      { t: 'Daily roll call', what: 'Present, absent, leave or half day for each class, with reports and percentages.', who: 'Teachers and office', fix: 'No paper registers.' },
      { t: 'Alerts to families', what: 'Families are told about an absence after a short wait, so a quick fix does not cause a false alarm.', who: 'Parents', fix: 'Fewer panicked phone calls.' },
      { t: 'Leave requests', what: 'Families ask for leave and a different person decides. Approved leave is marked as excused.', who: 'Families and office', fix: 'No arguments about what was agreed.' },
      { t: 'Works offline', what: 'Teachers can take attendance without a connection and it saves when they are back online.', who: 'Teachers', fix: 'Patchy signal is no problem.' },
    ],
  },
  {
    id: 'exams', icon: 'ClipboardList', color: '#2a5cac', title: 'Exams and results', shot: 'admin-measures',
    intro: 'Set, take, mark and publish results with a clear trail.',
    features: [
      { t: 'Exams and marks', what: 'Create exams, enter marks by subject and see results and averages.', who: 'Teachers and office', fix: 'No calculators, no re-typing.' },
      { t: 'Online quizzes and exams', what: 'Eight kinds of question, timed attempts, automatic marking and teacher review.', who: 'Teachers and students', fix: 'Less marking by hand.' },
      { t: 'Paper exams, scanned', what: 'Photograph answer sheets with a phone. A person checks anything the reader is unsure about.', who: 'Teachers', fix: 'Paper exams marked faster, with a person in charge.' },
      { t: 'Documents and transcripts', what: 'Report cards, certificates and ID cards with a public check page so anyone can verify them.', who: 'Office', fix: 'Fewer forged papers.' },
    ],
  },
  {
    id: 'learning', icon: 'BookOpen', color: '#2c776c', title: 'Homework and learning', shot: 'student-home',
    intro: 'Daily learning, from nursery play to adult courses.',
    features: [
      { t: 'Homework', what: 'Teachers set homework with files. Students hand it in and teachers review it.', who: 'Teachers and students', fix: 'Nothing lost in a bag.' },
      { t: 'Nursery and early years', what: 'A daily diary for families, safe pick-up checks, and play-based learning notes with no scores.', who: 'Nursery teams and parents', fix: 'Parents see the day, not just the fee.' },
      { t: 'Training courses', what: 'Sell and run short courses with cohorts and signed certificates.', who: 'Academies', fix: 'Courses run from the same tool.' },
      { t: 'Writing assistant', what: 'Helps a teacher start a lesson plan or notice. A person always reads and approves it, and children’s details are never sent.', who: 'Teachers', fix: 'A faster first draft, kept safe.' },
    ],
  },
  {
    id: 'people', icon: 'Briefcase', color: '#b86650', title: 'Teachers and staff', shot: 'teacher-home',
    intro: 'The people who make the school run.',
    features: [
      { t: 'Staff files and contracts', what: 'Positions, contracts, joining checklists and leave in one place.', who: 'Principals and office', fix: 'No staff paperwork in drawers.' },
      { t: 'Pay and payslips', what: 'Pay runs checked by one person and approved by another, with payslips staff can keep.', who: 'Finance and principals', fix: 'Payroll mistakes caught early.' },
      { t: 'Staff attendance and rosters', what: 'Who is in, who is on leave, and who covers.', who: 'Administrators', fix: 'Fair, visible rosters.' },
    ],
  },
  {
    id: 'finance', icon: 'Wallet', color: '#2a5cac', title: 'Fees and finance', shot: 'admin-fees',
    intro: 'Know what is paid, what is due and where the money went.',
    features: [
      { t: 'Fees and payments', what: 'Tuition plans, other fees and monthly transport fee. Parents upload the payment proof; the office approves it.', who: 'Office and parents', fix: 'Fee slips no longer lost in chat.' },
      { t: 'School accounts', what: 'A proper ledger with monthly close, budgets and statements. Important entries need a second person.', who: 'Finance team', fix: 'Books you can show an auditor.' },
      { t: 'Purchasing and assets', what: 'Requests, quotes, orders, bills and an asset register, with repair tickets any teacher can raise.', who: 'Office and teachers', fix: 'Spending that follows the rules.' },
    ],
  },
  {
    id: 'families', icon: 'MessageCircle', color: '#2c776c', title: 'Families and communication', shot: 'admin-notices',
    intro: 'Parents hear from the school clearly, on their own phone.',
    features: [
      { t: 'Notices', what: 'Publish to the whole school or one class, with attachments and read tracking.', who: 'Office and teachers', fix: 'No more notices nobody saw.' },
      { t: 'Messages and help desk', what: 'Families message teachers or the office. Requests get numbers and deadlines.', who: 'Parents and staff', fix: 'Every question gets an answer.' },
      { t: 'Parent-teacher meetings', what: 'Families book their own slot and the school sees who has not.', who: 'Parents and teachers', fix: 'No scheduling by phone call.' },
      { t: 'English and Urdu', what: 'One tap switches every screen, right to left.', who: 'Everyone', fix: 'Everybody reads comfortably.' },
    ],
  },
  {
    id: 'campus', icon: 'Building2', color: '#b86650', title: 'Campus, transport and care', shot: 'admin-overview',
    intro: 'Safe arrivals, safe journeys and safe support.',
    features: [
      { t: 'Gate, visitors and drills', what: 'Visitor passes, safe dismissal to the right adult, and fire or lockdown drills with a head count.', who: 'Guards and administrators', fix: 'The right child goes home with the right person.' },
      { t: 'Transport', what: 'Routes, stops and daily trips. The bus is visible to families only while a trip is running.', who: 'Drivers, office and parents', fix: 'Peace of mind, without constant tracking.' },
      { t: 'Student care', what: 'Private case notes, health plans and a medicine log with parent consent.', who: 'Care team', fix: 'Sensitive details only reach the right people.' },
      { t: 'Library and school store', what: 'Lending with fines, textbook sets, a store till with stock counts and pickup orders.', who: 'Librarians and office', fix: 'Books and stock accounted for.' },
    ],
  },
  {
    id: 'insights', icon: 'BarChart3', color: '#2a5cac', title: 'Reports and insights', shot: 'admin-measures',
    intro: 'See what needs attention, then act on it.',
    features: [
      { t: 'Measures', what: 'Plain measures for attendance, learning, fees and more, with the lines your school sets.', who: 'Principals', fix: 'Problems found before parents find them.' },
      { t: 'Many campuses, one view', what: 'Compare every campus side by side. Campus leaders see only their own.', who: 'School groups', fix: 'A group that is easy to steer.' },
      { t: 'Annual report', what: 'Build the yearly report from your own figures. It is locked when approved and can be shared with a link.', who: 'Leaders', fix: 'No more last-minute reports.' },
    ],
  },
  {
    id: 'trust', icon: 'ShieldCheck', color: '#2c776c', title: 'Permissions, privacy and connections', shot: 'parent-home',
    intro: 'Each person sees what they need and nothing more.',
    features: [
      { t: 'Roles and permissions', what: 'Give each person the tools they need, without giving them information they do not need.', who: 'Administrators', fix: 'Fewer mistakes and less risk.' },
      { t: 'Consent and guardian rights', what: 'Families say what the school may do. Restrictions on who may collect a child are always respected.', who: 'Families', fix: 'Trust that is built in.' },
      { t: 'Two people for big decisions', what: 'Pay runs, rule changes and many other important steps need a second approver.', who: 'Administrators', fix: 'Nobody can quietly change what matters.' },
      { t: 'Your data, yours', what: 'Weekly backups and a download of everything. Connect other learning tools safely when you choose to.', who: 'Owners', fix: 'No lock-in, no surprises.' },
    ],
  },
  {
    id: 'community', icon: 'HeartHandshake', color: '#b86650', title: 'Alumni, giving and quality', shot: 'admin-notices',
    intro: 'Stay close to former students and show your standards.',
    features: [
      { t: 'Alumni', what: 'Graduates choose whether to stay in touch, and what the school may keep.', who: 'Advancement office', fix: 'A real, willing community.' },
      { t: 'Giving', what: 'Funds, pledges, gifts and receipts. Money given for one purpose stays for that purpose.', who: 'Fundraising office', fix: 'Donors can trust the school.' },
      { t: 'Quality and board', what: 'Standards, evidence and findings, board meeting minutes and service hours for students.', who: 'Leaders and board', fix: 'Accreditation without panic.' },
    ],
  },
];

/* ───────── Walkthrough: real screens with the part to look at marked ───────── */
// rect is in % of the screenshot (x, y, w, h)
export const JOURNEYS = [
  {
    id: 'admin', label: 'Administrator', icon: 'LayoutDashboard',
    blurb: 'See the whole school, then act on what matters.',
    steps: [
      { shot: 'admin-overview', rect: [3, 19, 94, 19], t: 'Open your school dashboard', text: 'The first screen shows how many students, teachers and classes you have, and how many notices are out.' },
      { shot: 'admin-students', rect: [3, 34, 94, 22], t: 'Manage students and classes', text: 'Pick a class card to see the children in it. Add, edit or move a student in a few taps.' },
      { shot: 'admin-attendance', rect: [3, 40, 94, 10], t: 'Review attendance', text: 'See which classes have taken the register today, and which are still waiting.' },
      { shot: 'admin-overview', rect: [3, 41, 94, 29], t: 'Watch the school fees', text: 'Collected, pending and the total, at a glance. No spreadsheet needed.' },
      { shot: 'admin-notices', rect: [3, 19, 94, 12], t: 'Tell parents', text: 'Publish a notice to everyone or just one class. Parents see it in their own portal.' },
      { shot: 'admin-measures', rect: [3, 47, 94, 40], t: 'Spot problems early', text: 'A short list of what crossed a line your school set, with the most urgent first.' },
    ],
  },
  {
    id: 'teacher', label: 'Teacher', icon: 'GraduationCap',
    blurb: 'Less paperwork, more teaching.',
    steps: [
      { shot: 'teacher-home', rect: [3, 33, 94, 17], t: 'Open your day', text: 'Lessons, roll calls, marking and clashes for today, all on one screen.' },
      { shot: 'teacher-home', rect: [3, 83, 94, 9], t: 'Take the roll call', text: 'Open your class and mark everyone present, absent or on leave.' },
      { shot: 'teacher-home', rect: [3, 94, 94, 6], t: 'Marks and homework', text: 'See what is waiting to be marked or entered, then work through it.' },
      { shot: 'teacher-home', rect: [79, 19, 17, 6], t: 'Keep working offline', text: 'Save your day for offline use. What you do is sent when you are back online.' },
    ],
  },
  {
    id: 'parent', label: 'Parent', icon: 'Home',
    blurb: 'Know how your child is doing, from your phone.',
    steps: [
      { shot: 'parent-home', rect: [23, 19, 54, 23], t: 'Open the parent portal', text: 'One simple menu for attendance, messages, documents, fees and notices.' },
      { shot: 'parent-home', rect: [24, 56, 52, 33], t: 'See your child’s attendance', text: 'The last seven days at a glance, and the percentage for the term.' },
      { shot: 'parent-home', rect: [66, 29, 10, 7], t: 'Check fees', text: 'See what is due, pay in your usual way, and upload the proof.' },
      { shot: 'parent-home', rect: [26, 36, 12, 6], t: 'Read notices', text: 'Notices from the school are one tap away. Messages and help requests sit in the same menu.' },
    ],
  },
  {
    id: 'finance', label: 'Fees office', icon: 'Wallet',
    blurb: 'Every payment checked, nothing lost.',
    steps: [
      { shot: 'admin-fees', rect: [3, 26, 40, 7], t: 'Open Payments and other fees', text: 'Payment reviews, other fees such as uniforms and books, and transport, in one place.' },
      { shot: 'admin-fees', rect: [4, 38, 50, 32], t: 'Review a payment', text: 'See who paid, how much, the method and the proof they uploaded.' },
      { shot: 'admin-fees', rect: [4, 63, 50, 6], t: 'Mark as paid, or reject', text: 'One tap. The family is told either way.' },
      { shot: 'admin-overview', rect: [3, 41, 94, 29], t: 'Track what is still pending', text: 'The school-wide picture of what has been collected and what is outstanding.' },
    ],
  },
  {
    id: 'student', label: 'Student', icon: 'School',
    blurb: 'Everything for today, nothing extra.',
    steps: [
      { shot: 'student-home', rect: [3, 19, 94, 19], t: 'Open your page', text: 'Your attendance, average marks, homework and exams, as simple tiles.' },
      { shot: 'student-home', rect: [3, 41, 94, 35], t: 'See today’s focus', text: 'A short list of what matters today, so nothing is missed.' },
    ],
  },
];

/* ───────── Scenarios ───────── */
export const SCENARIOS = [
  {
    id: 'student', label: 'A student’s school journey', icon: 'GraduationCap',
    nodes: [
      { icon: 'UserPlus', t: 'Admission', text: 'An enquiry becomes an application, then an offer.' },
      { icon: 'CreditCard', t: 'Enrolment', text: 'A full student record and an ID card.' },
      { icon: 'School', t: 'Class', text: 'Placed in a class with a timetable.' },
      { icon: 'UserCheck', t: 'Attendance', text: 'Marked every day, seen by parents.' },
      { icon: 'BookOpen', t: 'Homework', text: 'Set, handed in and reviewed.' },
      { icon: 'ClipboardList', t: 'Exams', text: 'Marks entered once.' },
      { icon: 'Award', t: 'Results', text: 'A report card with a check page.' },
    ],
  },
  {
    id: 'teacher', label: 'A teacher’s day', icon: 'Presentation',
    nodes: [
      { icon: 'LayoutDashboard', t: 'Open Today', text: 'Lessons and jobs for the day.' },
      { icon: 'UserCheck', t: 'Roll call', text: 'Mark the class in a minute.' },
      { icon: 'Presentation', t: 'Teach', text: 'Timetable and any cover shown clearly.' },
      { icon: 'BookOpen', t: 'Homework', text: 'Set it, then review hand-ins.' },
      { icon: 'ClipboardList', t: 'Marks', text: 'Enter marks for the subjects you teach.' },
      { icon: 'MessageCircle', t: 'Tell families', text: 'A message or notice, in one place.' },
    ],
  },
  {
    id: 'parent', label: 'A parent’s connection', icon: 'Home',
    nodes: [
      { icon: 'Megaphone', t: 'School updates', text: 'Notices arrive on the phone.' },
      { icon: 'UserCheck', t: 'Attendance', text: 'See each day, and any alert.' },
      { icon: 'Wallet', t: 'Fees', text: 'See what is due and upload proof.' },
      { icon: 'MessageCircle', t: 'Talk to the school', text: 'Messages, help requests and meeting slots.' },
    ],
  },
  {
    id: 'ops', label: 'A school’s daily operations', icon: 'Building2',
    nodes: [
      { icon: 'Users', t: 'Students', text: 'One record for each child.' },
      { icon: 'Briefcase', t: 'Staff', text: 'Teachers, rosters and leave.' },
      { icon: 'School', t: 'Classes', text: 'Classes, subjects and timetable.' },
      { icon: 'Wallet', t: 'Finance', text: 'Fees in, bills out, accounts closed.' },
      { icon: 'BarChart3', t: 'Reports', text: 'Measures and what needs attention.' },
      { icon: 'MessageCircle', t: 'Communication', text: 'Everyone hears the same thing.' },
    ],
  },
];

/* ───────── Showcase ───────── */
export const SHOTS = [
  { id: 'admin-overview', label: 'School dashboard', who: 'Administrator', note: 'Students, teachers, fees and notices at a glance.', pins: [{ x: 22, y: 33, t: 'Headline numbers' }, { x: 12, y: 62, t: 'Fee collection' }] },
  { id: 'admin-students', label: 'Students and classes', who: 'Administrator', note: 'Open a class to see its students.', pins: [{ x: 14, y: 36, t: 'A class and its divisions' }] },
  { id: 'admin-attendance', label: 'Attendance', who: 'Administrator', note: 'Which registers are done, which are waiting.', pins: [{ x: 15, y: 46, t: 'Registers waiting' }, { x: 26, y: 73, t: 'Take attendance' }] },
  { id: 'admin-fees', label: 'Payments and fees', who: 'Fees office', note: 'A payment with its proof, ready to approve.', pins: [{ x: 11, y: 49, t: 'Payment proof' }, { x: 25, y: 66, t: 'Approve or reject' }] },
  { id: 'admin-notices', label: 'Notice board', who: 'Administrator', note: 'Pinned and class-specific notices.', pins: [{ x: 90, y: 24, t: 'Publish a notice' }, { x: 16, y: 38, t: 'Pinned notice' }] },
  { id: 'admin-measures', label: 'Measures', who: 'Principal', note: 'What crossed a line the school set.', pins: [{ x: 10, y: 59, t: 'Urgent first' }, { x: 87, y: 59, t: 'Act on it' }] },
  { id: 'admin-timetable', label: 'Timetable planning', who: 'Administrator', note: 'Clashes, cover and swaps in one place.', pins: [{ x: 12, y: 36, t: 'Double bookings' }, { x: 87, y: 61, t: 'Publish and notify' }] },
  { id: 'teacher-home', label: 'Teacher Today', who: 'Teacher', note: 'Lessons, roll calls and marking.', pins: [{ x: 12, y: 40, t: 'Today at a glance' }, { x: 91, y: 88, t: 'Take roll call' }] },
  { id: 'parent-home', label: 'Parent portal', who: 'Parent', note: 'Attendance, fees, notices and messages.', pins: [{ x: 50, y: 24, t: 'Everything in one menu' }, { x: 50, y: 75, t: '97% attendance' }] },
  { id: 'student-home', label: 'Student page', who: 'Student', note: 'Attendance, marks, homework and exams.', pins: [{ x: 14, y: 33, t: 'Your tiles' }, { x: 30, y: 55, t: 'Today’s focus' }] },
];

/* ───────── Audiences ───────── */
export const AUDIENCES = [
  { icon: 'Crown', t: 'School owners', text: 'See how the school is doing, keep control of money and rules, and know your data is yours.' },
  { icon: 'LayoutDashboard', t: 'Principals and administrators', text: 'One dashboard, clear lists of what needs attention, and approvals that keep things fair.' },
  { icon: 'GraduationCap', t: 'Teachers', text: 'Roll call, homework and marks in a few taps, with the day set out on one screen.' },
  { icon: 'Home', t: 'Parents', text: 'Attendance, fees, notices and messages on their own phone, in English or Urdu.' },
  { icon: 'School', t: 'Students', text: 'A simple page for attendance, marks, homework and exams.' },
  { icon: 'Wallet', t: 'Fees and finance teams', text: 'Payments checked, outstanding fees visible, and accounts that close cleanly.' },
  { icon: 'Network', t: 'Multi-campus groups', text: 'Every campus side by side, shared rules, and campus leaders who see only their own.' },
  { icon: 'Presentation', t: 'Academies and training centres', text: 'Courses, cohorts and signed certificates, with a learner portal.' },
];
export const INSTITUTIONS = [
  { t: 'Schools', text: 'The heart of Aulensia: classes, attendance, exams, fees, parents and daily life.' },
  { t: 'Nurseries and early years', text: 'Daily diary, safe pick-up and play-based learning notes.' },
  { t: 'Colleges and universities', text: 'Course catalogue, registration, degree progress checks and signed transcripts.' },
  { t: 'Academies and training centres', text: 'Courses with cohorts, payments and signed certificates.' },
  { t: 'Groups with several campuses', text: 'A group view, shared rules and campus-level access.' },
];

/* ───────── About ───────── */
export const PRINCIPLES = [
  { icon: 'MessageSquare', t: 'Plain words, always', text: 'If a school owner or a parent cannot understand a screen, we have not finished it.' },
  { icon: 'ShieldCheck', t: 'Privacy first', text: 'People say what the school may do. Children’s details are kept to what is needed, and are never used to train a model.' },
  { icon: 'Users', t: 'Two people for big decisions', text: 'Pay runs, rule changes and many other important steps need a second approver, so nobody can quietly change what matters.' },
  { icon: 'Languages', t: 'English and Urdu', text: 'Every screen works in both, right to left included.' },
  { icon: 'Banknote', t: 'Built for Pakistan', text: 'Rupees, JazzCash and Easypaisa proofs, CNIC and B-Form fields, provinces and Pakistan time.' },
  { icon: 'Download', t: 'Your data is yours', text: 'A backup is taken every week, and the school can download a full copy at any time.' },
];

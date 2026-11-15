import {
  Banknote, BellRing, BookOpen, Bus, CalendarDays, ClipboardList, Database, Download,
  GraduationCap, Home, Languages, LayoutDashboard, Lock, Megaphone, MessageSquare, Receipt, School, Settings,
  Shield, Smartphone, Upload, UserCheck, Wallet, Clock, Building2, Layers, Eye,
} from 'lucide-react';

// Every English string below has an Urdu entry in i18n/ur.js, so the page switches language in one tap.

export const NAV = [
  { id: 'features', label: 'Features' },
  { id: 'roles', label: 'Who uses it' },
  { id: 'how', label: 'How it works' },
  { id: 'pakistan', label: 'Made for Pakistan' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' },
];

export const HERO_CHIPS = ['Fees in PKR', 'JazzCash / Easypaisa', 'English + اردو', 'CNIC / B-Form'];

export const STATS = [
  { value: '4', label: 'Logins in one system', note: 'Admin, teacher, student, parent' },
  { value: '12+', label: 'School modules', note: 'Attendance to fees to backups' },
  { value: '2', label: 'Languages', note: 'English and Urdu, one tap' },
  { value: '100%', label: 'Separate school data', note: 'Every school sees only its own' },
];

export const BEFORE_AFTER = {
  before: [
    'Paper registers for attendance and marks',
    'Fee slips and screenshots lost in WhatsApp',
    'Parents calling the office for every update',
    'Student records in many different files',
  ],
  after: [
    'Attendance and marks entered once, visible to everyone who needs them',
    'Fee payment proof uploaded and approved in one place',
    'Parents check attendance, fees and notices on their phone',
    'One record per student, with documents, always backed up',
  ],
};

export const MODULES = [
  { icon: UserCheck, title: 'Attendance', text: 'Daily attendance with present, absent, leave and half day. Class sheets, reports and percentages.' },
  { icon: ClipboardList, title: 'Exams and marks', text: 'Create exams, enter marks by subject, and see results and averages without a calculator.' },
  { icon: BookOpen, title: 'Homework', text: 'Teachers assign homework with files. Students submit; teachers review and grade.' },
  { icon: CalendarDays, title: 'Timetable', text: 'Build class timetables and teacher timetables with your own period timings.' },
  { icon: Wallet, title: 'Fees and payments', text: 'Tuition plans, other fees and monthly transport fee. Parents upload a payment screenshot; the office approves it.' },
  { icon: Bus, title: 'Transport', text: 'Add routes and assign students. Transport fee is added to the monthly dues automatically.' },
  { icon: Megaphone, title: 'Notices and events', text: 'Rich-text notices with attachments and a school events calendar, for the whole school or one class.' },
  { icon: MessageSquare, title: 'Messages and grievances', text: 'Messages between users and a grievance desk so complaints get a reply, not silence.' },
  { icon: BellRing, title: 'Notifications', text: 'In-app bell and phone push notifications for notices, fees and replies, even on the free plan.' },
  { icon: Upload, title: 'Files and documents', text: 'Upload CNIC / B-Form copies, certificates, photos and homework files. Stored safely, shown only to the right people.' },
  { icon: Settings, title: 'School setup', text: 'Your logo, name, province, timings and time zone. The school looks like your school.' },
  { icon: Database, title: 'Backup and export', text: 'Automatic weekly backup plus a one-click downloadable copy of all school data with an Excel sheet.' },
];

export const ROLES = [
  {
    id: 'admin', tab: 'Admin / Principal', icon: LayoutDashboard,
    headline: 'Run the whole school from one dashboard',
    text: 'The school admin sets things up once and then watches the school at a glance.',
    points: [
      'Overview of students, teachers, attendance and fees',
      'Add and manage students, teachers, parents and classes',
      'Assign subjects and class teachers',
      'Build timetables and schedule exams',
      'Create tuition plans, other fees and transport routes',
      'Review and approve fee payment screenshots',
      'Publish notices and answer grievances',
      'Edit school logo and details, download backups',
    ],
  },
  {
    id: 'teacher', tab: 'Teacher', icon: GraduationCap,
    headline: 'Less paperwork, more teaching',
    text: 'Teachers see only their own classes and do the daily work in a few taps.',
    points: [
      'Take class attendance',
      'Enter marks for the subjects you teach',
      'Assign homework and review submissions',
      'See your timetable and class students',
      'Read notices and raise or answer grievances',
      'Keep your profile and documents up to date',
    ],
  },
  {
    id: 'student', tab: 'Student', icon: School,
    headline: 'Everything a student needs, in one place',
    text: 'Students check their own progress and submit work without chasing anyone.',
    points: [
      'Attendance percentage and monthly record',
      'Marks and results for every subject',
      'Pending homework, with submission',
      'Upcoming exams and class timetable',
      'Fee status, and upload payment proof',
      'Notices from the school',
    ],
  },
  {
    id: 'parent', tab: 'Parent', icon: Home,
    headline: 'Parents stay informed from their phone',
    text: 'The parent portal is built for mobile, with a simple bottom menu.',
    points: [
      'See the child’s attendance',
      'Check fees due and upload the payment screenshot',
      'Read school notices',
      'Get push notifications on the phone',
      'Several children under one parent login',
    ],
  },
  {
    id: 'owner', tab: 'Platform owner', icon: Building2,
    headline: 'Run Darsgah as a business',
    text: 'For the company that offers the system to many schools.',
    points: [
      'See all schools, signups and monthly revenue',
      'Create, edit and delete subscription plans in PKR',
      'Switch features on or off for each plan',
      'Create offers and discounts',
      'Suspend or activate a school',
      'Back up and export any school’s data',
    ],
  },
];

export const STEPS = [
  { n: '1', title: 'Register your school', text: 'Fill in the school name, province and admin details. You get a school code and your admin login in a minute.' },
  { n: '2', title: 'Set up classes and people', text: 'Add classes, subjects, teachers and students. Upload your logo so every screen carries your school name.' },
  { n: '3', title: 'Use it every day', text: 'Teachers take attendance and enter marks. The office collects fees and posts notices. Students and parents log in to see it.' },
  { n: '4', title: 'Stay safe', text: 'A backup is taken every week. Download a full copy yourself whenever you want one.' },
];

export const PAKISTAN = [
  { icon: Banknote, title: 'Fees in PKR', text: 'All plans and school fees are in rupees, with monthly and yearly amounts.' },
  { icon: Receipt, title: 'JazzCash, Easypaisa and bank proof', text: 'Parents pay the way they already do and upload the screenshot. The office approves or rejects it.' },
  { icon: Shield, title: 'CNIC, B-Form and NTN', text: 'Proper Pakistani identity fields for students, teachers and schools, with document upload.' },
  { icon: Building2, title: 'Provinces and postal codes', text: 'Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan, Islamabad, Gilgit-Baltistan and Azad Kashmir.' },
  { icon: Languages, title: 'English and Urdu', text: 'Switch the whole interface to Urdu, right-to-left, with one button.' },
  { icon: Clock, title: 'Pakistan time', text: 'Dates and attendance follow Asia/Karachi time, so a school day ends when it should.' },
];

export const TRUST = [
  { icon: Layers, title: 'Every school is separate', text: 'Each school has its own code. Data from one school is never shown to another.' },
  { icon: Lock, title: 'Role-based access', text: 'Admin, teacher, student and parent each see only what their role allows. Passwords are stored hashed.' },
  { icon: Database, title: 'Weekly automatic backup', text: 'A fresh copy of each school is saved every week. The latest copies are kept for you.' },
  { icon: Download, title: 'Download your data', text: 'School admins can download a ZIP any time: an Excel workbook, the full data file and optional uploaded documents.' },
  { icon: Eye, title: 'No passwords in downloads', text: 'Downloaded backups never contain passwords or reset tokens.' },
  { icon: Smartphone, title: 'Works on any phone', text: 'The pages fit small screens. Nothing to install: open the link and log in.' },
];

export const FAQ = [
  { q: 'Do we need to install anything?', a: 'No. Darsgah runs in the browser on a phone, tablet or computer. Open the link and log in.' },
  { q: 'Can parents and students use their own phones?', a: 'Yes. Each has their own login. The parent portal is designed for mobile, and push notifications can reach the phone.' },
  { q: 'Is our school data kept separate from other schools?', a: 'Yes. Each school has its own school code and its own data. Users can only see the school they belong to.' },
  { q: 'Can we get a copy of our data?', a: 'Yes. The school admin can download a ZIP backup at any time from School Setup. It contains an Excel workbook and the full data file. A backup is also saved automatically every week.' },
  { q: 'How do parents pay fees?', a: 'Parents pay by JazzCash, Easypaisa or bank transfer, then upload the payment screenshot in the app. The school office checks it and marks the fee as paid.' },
  { q: 'Is the system available in Urdu?', a: 'Yes. One button switches the interface between English and Urdu, including right-to-left layout.' },
  { q: 'How many students can we add?', a: 'It depends on the plan. The Free plan is for small schools, and larger plans raise or remove the student and teacher limits. See Pricing above.' },
  { q: 'What if our school is bigger than the plan limit?', a: 'Choose a larger plan. The system tells the admin when the limit is reached, so nothing breaks silently.' },
];

export const DEMO_LOGINS = [
  { role: 'Teacher', email: 'sara.khan@demo.school', password: 'Teacher@123' },
  { role: 'Student', email: 'ayesha.khan@demo.school', password: 'Student@123' },
  { role: 'Parent', email: 'parent@demo.school', password: 'Parent@123' },
];
export const DEMO_SCHOOL_CODE = 'DEMO01';

// Used only if the live pricing request fails, so the section never looks empty.
export const FALLBACK_PLANS = [
  { slug: 'free', label: 'Free', description: 'Get started with the basics', pricePKR: 0, yearlyPricePKR: 0, studentLimit: 100, teacherLimit: 10,
    features: ['Daily attendance', 'Notices', 'Homework', 'Exams & marks', 'Timetable', 'Events'] },
  { slug: 'standard', label: 'Standard', description: 'Parents and fee management', pricePKR: 4999, yearlyPricePKR: 49990, studentLimit: 500, teacherLimit: 50,
    features: ['Daily attendance', 'Parent portal', 'Fees & payment proofs', 'Homework', 'Exams & marks', 'Timetable', 'Notices', 'Events', 'Messages', 'Grievances', 'File uploads'] },
  { slug: 'premium', label: 'Premium', description: 'Everything, unlimited', pricePKR: 12999, yearlyPricePKR: 129990, studentLimit: 0, teacherLimit: 0,
    features: ['Daily attendance', 'Parent portal', 'Fees & payment proofs', 'Transport fees', 'Homework', 'Exams & marks', 'Timetable', 'Notices', 'Events', 'Messages', 'Grievances', 'File uploads'] },
];


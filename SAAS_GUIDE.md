# Aulensia: SaaS, Super Admin and Parent Dashboard

This guide covers what was added on top of the original project so it can be sold as a multi-school SaaS.

## Roles and sign-in

| Role | Sign in at | Notes |
|---|---|---|
| Super Admin (platform owner) | `/superadmin/login` (API: `POST /api/superadmin/login`) | Account is created on server start from `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` |
| School Admin, Teacher, Student, Parent | `/login` | School code + email + password |

The original project had no super admin. Set the two `SUPERADMIN_*` variables in `backend/.env` (or in the host's environment settings) and start the server; the owner account is created automatically. To recover a lost password, set `SUPERADMIN_FORCE_RESET=true` once, restart, then remove it.

## Super Admin console

Platform overview, school list with search and filters, add / edit / suspend / delete schools, reset a school admin's password, plan and limit management. Deleting a school requires typing its school code.

## Plans, prices and features (dynamic, in PKR)

Super Admin > **Plans & Pricing**: create, edit or delete plans. Each plan has a monthly and yearly price in PKR, a student and teacher limit (0 = unlimited) and a checklist of features (attendance, parent portal, fees, transport, homework, marks, timetable, notices, events, messages, grievances, file uploads). Saving a plan applies immediately: schools on that plan gain or lose the modules at once (menus hide, the server answers HTTP 403 `FEATURE_LOCKED`) and their limits follow the plan. First start seeds Free (Rs 0), Standard (Rs 4,999) and Premium (Rs 12,999); change them freely. Estimated monthly income on the overview page is calculated from these prices.

Limits are enforced on the server when creating or importing students and teachers (HTTP 402). Suspended or expired schools cannot sign in (HTTP 423). Public self-registration always creates a Free school.

## Fees, payment screenshots and transport

* Students and parents can **never** mark a fee paid. They tick the fees they paid, upload a payment screenshot (JazzCash, Easypaisa, bank, cash deposit) and the fee shows **Under review**.
* Admin > **Payments & Other Fees** > *Payment reviews* shows each screenshot with student, class and the fees included. **Mark as paid** or **Reject** (a reason is required and is shown to the parent, who can resubmit).
* *Other fees*: add uniform, books, admission, exam, trip or other fees for one class, a whole standard, selected students or everyone. Admin can also record cash received at school.
* *Transport*: define routes with a monthly PKR fee, put students on routes and press **Create monthly fees** (never creates the same month twice).
* Uploaded files are stored in PostgreSQL by default (max 4 MB, photos are shrunk in the browser). Set the three `CLOUDINARY_*` variables to store in Cloudinary's free tier instead.

## Parent dashboard

Admins create parent accounts under **Parents & Guardians** and link them to one or more students. Parents sign in at `/login` and see:

- Children overview: attendance ring, today's status, last 7 days, today's periods, low-attendance alert (below 75%).
- Attendance details: ranges (7 / 30 days, month, 90 days, custom), counts, daily chart, period breakdown, subject-wise bars, calendar with day drill-down, day-by-day log.
- Notice board (school-wide and the children's classes) and account security.

API: `GET /api/parents/me/children`, `GET /api/parents/me/children/:studentId/attendance?startDate&endDate`. A parent can only read students linked to their account (403 otherwise).

## How attendance works

1. The admin builds the timetable (class, subject, teacher, start and end time).
2. A teacher can mark a period only while its window is open, in the school's time zone (`School.timezone`, default `DEFAULT_TIMEZONE`), and only for periods they are scheduled to teach.
3. Statuses: Present, Absent, Late, Leave. The server checks the window, the teacher's timetable slot, class membership of each student and valid statuses, and forces the date to the school's today.
4. After the period ends the record is locked; only the School Admin can correct it.
5. Attendance % = periods present / periods marked (Late and Leave are marked but not present). Day status for parents: Present, Partial, Absent, Leave.

## Demo data

```bash
cd backend
npm run seed:demo          # adds Demo Public School (code DEMO01)
npm run seed:demo -- --reset   # wipes and recreates the demo school
```

| Role | Email | Password |
|---|---|---|
| School Admin | admin@demo.school | Demo@1234 |
| Teacher | sara.khan@demo.school | Teacher@123 |
| Student | ayesha.khan@demo.school | Student@123 |
| Parent | parent@demo.school | Parent@123 |

Delete or change these before going live.

## Free deployment (Vercel or Render + Neon PostgreSQL)

On Vercel: Storage > Create > Neon (Free), connect it to the project (this adds `DATABASE_URL`), push to GitHub, then open any `/api/...` URL once so the tables and demo data are created.

On Render:

1. Create a free Neon (or Render) PostgreSQL database and copy its connection string.
2. Push this project to GitHub.
3. In Render choose New > Blueprint, pick the repository (uses `render.yaml`).
4. Set `DATABASE_URL`, `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` when prompted.
5. Open `https://<your-service>.onrender.com/superadmin/login`.

The single web service serves both the API and the built React app. Free Render services sleep when idle, so the first request after a pause is slow.

## Security notes

- Every record carries `schoolId`; queries are scoped by it.
- Login is rate limited (20 per 15 min) and public sign-up (10 per hour). Rate-limit state is in memory, so use a shared store if you run several instances.
- Legacy attendance endpoints `/api/attendance/mark` and `/mark-class` are admin-only.
- Tailwind note: this project redefines the `rose` and `sky` colors as single values, so shades like `rose-500` do not exist. Use explicit hex classes such as `bg-[#f43f5e]`.

## Attendance model (v2: once a day, by the head master)

- Attendance is taken **once per day per student**, not per subject/period.
- Each class has **one head master** (a teacher; a teacher can head only one class). Assign or change it as school admin: Attendance page, then the pencil on the class card (`PUT /api/classes/:id/head-master`).
- The head master opens **Take Attendance**, picks a date, sees the class list with a checkbox per student (everyone starts as Present), unticks the absent ones, optionally sets a status (Late / Half day / Leave) and presses **Save**.
- **Half day**: if a student leaves early, the head master sets Half day and enters the leaving time. It counts as 0.5 in the percentage.
- Weights: Present 1, Late 1, Half day 0.5, Absent 0, Leave 0. Low-attendance warning below 75%.
- Edit window: the head master can edit the last 7 days; the school admin can correct any past date. Future dates are not allowed.
- Parents see today's status as one sentence, the last 7 days, a calendar and low-attendance alerts.
- API: `/api/daily-attendance` (`GET /my-class`, `GET|POST /class/:classId`, `GET /overview`, `GET /student/:studentId`, `PUT /student-day`, `GET /student/my/report`).

## Languages

English and Urdu (right-to-left). The toggle is on every page including login. New/rewritten screens use `t('English text')`; the dictionary is `frontend/src/i18n/ur.js`; older screens are translated by `autoTranslate.js` for exact-match text. Add Urdu for a new string by adding `"English": "اردو"` to `ur.js`.


## Offers, notifications, school setup and profiles

* **Offers** (Super Admin > Offers): percent or fixed PKR discounts, optional code, plan filter and end date. Live offers show on every school admin's **School Setup > Plan & offers** page with the discounted price per plan, and admins get a notification. Give an offer to one school from the school's Edit window.
* **Notifications** (bell in the header, every role): new notices, homework, absent / late / half-day marks (to parent and student), fee requests, payment approved / rejected, messages, complaint updates, offers (to admins). The bell checks every 40 seconds while the app is open. Users can also tap "Get alerts on this phone / browser" to receive **Web Push** even when the app is closed (the app generates its own push keys on first start and keeps them in the database; on iPhone the site must be added to the Home Screen first). The free host has no live sockets, so this polling + push combination is how real-time works here.
* **School Setup** (admin): logo, name, motto, academic year, contact, address, time zone, principal, bank / JazzCash / Easypaisa details (shown on parents' fee screen), plan usage, offers, and a viewer for documents uploaded by students, teachers and parents.
* **My profile & documents**: students, teachers, parents and admins can change their photo, phone, address, emergency contact and upload up to 25 documents (4 MB each).

## Backups

* **Weekly automatic backup.** Every school gets a stored copy of its data each week (the latest 4 are kept). On Vercel a daily cron job (`/api/cron/backup`, protected by the `CRON_SECRET` variable) backs up every school whose last automatic copy is about a week old; on Render/Node hosting a timer does it on Sundays at 02:00 Pakistan time.
* **School admin:** School Setup > *Backup & export* lets the admin save a backup now, download a stored backup, or download a full backup (.zip) with an Excel workbook (one sheet per table), the complete data as `backup.json` and, optionally, the uploaded documents. Downloads never contain passwords.
* **Platform owner:** the archive icon on each school in the Schools tab opens the same screen for that school; *Run weekly backups* runs the job on demand. Deleting a school also deletes its stored backups, so download one first.
* **Limits on the free Vercel server:** a single download must stay under 4.5 MB. Very large schools, or large uploaded files, may exceed that; the app then says so and the owner can export from the command line.
* **Restore:** `node backend/scripts/restoreBackup.js --backup <id>` (a stored copy, keeps passwords) or `--file backup.json` (a downloaded copy; users then reset their passwords). Add `--replace` to first remove the school's current rows and `--dry-run` to preview.
* Uploaded file contents are not part of the stored weekly copies (they can be large). Use Cloudinary (`CLOUDINARY_*`) and the file links stay valid, or include files in a manual download.
* Neon also keeps its own short history for point-in-time recovery; treat it as an extra safety net, not a replacement for these backups.

## Database: PostgreSQL (Neon) and how far it scales

The app runs on PostgreSQL. `backend/lib/pgdoc` is a small Mongoose-compatible layer: every model is one table (`id` text key + `doc` JSONB, files in `bytea` columns), queries are translated to SQL with indexes on the fields the app filters by (including `schoolId`), and tables are created automatically on first start. So the models and controllers did not change, and the data stays isolated per school. It is a document-style design on Postgres, not a fully normalised relational schema; reports that need heavy joins would be a later step.

Set `DATABASE_URL` (or `POSTGRES_URL`) to any Postgres connection string. For local development with no install, set `PGLITE_DIR=./.data` (an embedded Postgres). Run `node backend/test/smoke.js` for the 120-check end-to-end test.

Rough capacity (estimates, not guarantees). A 500-student school stores about 40-50 MB per school year (daily attendance is the biggest part). Uploaded files are the real risk: one payment screenshot is about 250 KB, so 2,000 a year is about 500 MB.

| Setup | Realistic capacity |
|---|---|
| Neon Free (1 GB per project, 100 compute-hours a month) with files in the database | demo / 2-3 pilot schools |
| Neon Free with files on Cloudinary (set `CLOUDINARY_*`) | about 15-20 schools, ~10,000 students, ~100-300 people online at once |
| Neon Launch / Scale (paid, 10 GB+, autoscaling) + Cloudinary | about 200-300 school-years, 100,000+ students, ~1,000+ concurrent users |
| Larger Postgres with read replicas / partitioning by `schoolId` | hundreds of thousands to millions of students |

## Partner agents, payments and commission (built)

**Roles:** the platform has six sign-ins: school admin, teacher, student, parent, platform owner (`/superadmin/login`) and partner agent (`/agent/login`).

**Owner console tabs:** Agents, Payments, Commissions, Ledger & activity (plus a Record payment button and an Agent button on each school row).

**Flow**
1. Owner adds an agent (name, email, commission %). A referral code (`AG-XXXX`) and a temporary password are created; the password is shown once.
2. A school signs up at `/register?ref=AG-XXXX` (or types the code). The agent's percent is frozen on the school at that moment. A wrong code never blocks sign-up. An agent cannot refer a school that uses their own email.
3. When the school pays by bank / JazzCash / Easypaisa / cash, the owner records the payment. The plan is extended, a double-entry journal is posted and, if the school has an agent and a paid plan, a commission row is created.
4. Commission = round(amount × percent). It earns for `recurringMonths` (default 12) after the school joined, waits `holdDays` (default 7) as Pending, then the owner approves it (or approves early).
5. Refunds void an unpaid commission, or add a negative adjustment if it was already paid out.
6. Payout pays all Approved rows for an agent together; the amount must match exactly.

**Safety:** payments are idempotent (`Idempotency-Key`), one commission per payment, agent tokens can only reach `/api/agent/*`, notifications and a read-only profile, agent responses never include student, fee or admin-email data, and every money action is written to an append-only activity log. The Ledger tab runs reconciliation checks (debits = credits, revenue = payments, bank = payments − payouts, payable = unpaid commission) and can repair interrupted posts.

**Database indexes:** every collection declares its indexes in the model (`schoolId` is always indexed, plus the compound indexes used by list screens). They are created automatically and checked by the test suite.

**Still future (from the Aulensia V6 PRD):** granular permission grants, guardian-rights model, restore drills, and the remaining epics. See the product handover document.

## Backups you can trust, guardians, and access (owner and admin guide)

**Owner: Backups & recovery.** A backup only counts once a restore drill has shown it can be restored. Press *Run restore drill* on a school: the latest backup is loaded into temporary tables, every row is compared, then the tables are thrown away. A failed drill, a backup older than 8 days or proof older than 30 days shows as an alert on the overview. Weekly backups run from the cron job, which also runs due drills.

**School admin: Parents & Guardians.** Click a child's name to see who may do what for that child: profile, attendance, marks, fees, paying fees, notices, and collecting the child. Rights can have an end date. A driver or relative without an account can be authorised for pickup only. A restriction (court order, safety plan) always wins; teachers and gate staff are never told why. The pickup check on the same screen answers Authorised or Denied.

**School admin: Access & permissions.** Give a cover teacher attendance for one class for a few days, or give another admin access to restriction reasons for a week. Emergency access opens restriction reasons for up to 60 minutes, tells every other admin, and is logged.

## Admissions (school admin)

Admin sidebar, Admissions. Record every inquiry (phone, walk-in, website form) with a follow-up date. Start an application from it for each child. The system flags a child who looks like one already applied or enrolled, and a person decides if it is the same child before an offer can be made. Set seats per grade under Seats. Offer a seat when the required documents are checked; with no free seat the child goes on the waitlist, and when a seat opens the admins are told who is next. Enroll after the family accepts: this creates the student, the parent login and guardian rights in one step and shows the first passwords once.

## Fee collection (E06)
Fee collection tab: generate invoices per class (preview first), print a three-copy challan, take cash at an open till or record bank/JazzCash/Easypaisa payments, import the bank statement and confirm matches, and approve refunds, write-offs, credit notes and discount rules (a second admin always decides). Closing the till records any difference with a note. "Check the books" proves each invoice equals the payments placed on it. Receipts and vouchers are never edited: a mistake is a refund or reversal, both kept in the audit log.

## Staff and payroll (E07)
Admin tab "Staff & payroll": positions with salary bands, staff files with contracts (notice dates), documents and mandatory training with expiry warnings, onboarding checklist, shifts and a published roster, staff attendance, leave with automatic cover requests for teachers, overtime and advances (another admin approves), monthly payroll and exit settlements. Payroll rules (tax bands, provident fund, fixed deductions) are entered by you and must be reviewed by a different person; nothing statutory is built in. The person who prepares a payroll run can never finalize it. Teachers see their roster, cover duties, leave, appraisals and payslips under "My staff record".

## Attendance desk (E08)
Admin and teacher tab "Attendance desk"; parents see "Leave & alerts" and students "Leave, alerts & check-in". Policy lets you require a teacher to verify each absence and add a wait before parents are told, so a quick correction never reaches a family. Alerts show who received, who read and who answered. Families ask for leave (excused, kept apart from unexplained absence; exam, field trip, internship and transfer are separate states) and report a wrong mark; a different person always decides and the original mark stays in the history. Repeated absence opens a supportive follow-up case for the head master. Teachers take a register for each lesson, and a register taken offline is sent once when the phone reconnects. Classroom QR check-in (off until the school turns it on) shows a code that changes every 30 seconds; students scan or type it, the teacher approves, and no location is read. Register gate readers and badges under Readers: a gate scan proves entry only and never marks a lesson. Findings lists things for a person to look at (no register by the cutoff, everyone present, present on a leave day, absent but seen at the gate, silent or drifting readers). A biometric pilot cannot be switched on until a no-camera alternative exists, and families can opt out.


## Gate & safety (E09)
Admin tab "Gate & safety" with Overview, Visitors, Dismissal, Contractors, Gate log, Logbook, Drills and Policy. Teachers see Dismissal for their own class, their own guests and the drill head count; an administrator can give a teacher gate duty for up to 90 days from Access & permissions, which adds the gate tabs. Parents get "Pickup & visitors" under Leave & alerts: who collected my child, authorise one person for one day (a code is shown once), and request a visit.

**Visitors.** A host invites a guest and gets a code (and QR) shown once; at the gate the guard checks the ID, confirms the purpose and prints a role-limited badge that shows no ID or phone number. Only the last four characters of an ID are kept and they are erased after the retention period. Someone barred from the campus is refused with a generic message and the admins are told why.

**Dismissal.** A restriction on a person always wins. Otherwise the child is released to a linked guardian, or to a one-day alternate whose name and code match. Whatever the reason, the person at the gate hears the same sentence; the real reason is for admins. Exceptions and emergency overrides need a written reason and are decided or reviewed by a different administrator. A child can be released once a day; release marks a half day and tells the family.

**Contractors and the logbook.** A contractor pass is made by one admin and approved by another, with a shift limit and allowed gates; leaving is never refused. The guard logbook keeps incidents and notes; a shift handover counts only when the named person accepts it, and open items carry over.

**Drills.** Start a fire, earthquake, lockdown, evacuation or emergency assembly; class teachers count their class (Safe, Missing with where last seen, or already collected). Families are told only about children marked safe; a phone list covers the rest. The drill cannot be closed while anyone is unaccounted for unless the administrator writes why, and a different administrator signs the report.

## Timetable planning (E10)
Open **Timetable planning** in the admin menu (or **Timetable & cover** for teachers).

- **Overview** shows double bookings, teachers over their limits, cover waiting and swaps waiting, and the publish panel. Publishing is blocked while a teacher or room is booked twice. Only the people whose lessons changed are told.
- **Rooms**: list classrooms and labs with seats. Once rooms exist, periods must use a listed room, a room can't be used by two classes at once, and lab subjects go to labs. A manual edit to a period is kept when you regenerate.
- **Cover**: ask for cover, see free teachers in fair order with the reason anyone is left out, propose one. A second administrator approves, then the teacher is told and can confirm or hand the lesson back with a reason.
- **Swaps**: two teachers exchange one lesson on a date. The colleague agrees, an administrator approves.
- **Workload**: per teacher per day, free periods, longest run; the limits are editable here.
- **Versions**: every published timetable is kept; open one to see what changed, or restore it.

## Teacher Today (E11)
Teachers land on **Today**: the lessons they teach (including cover), the class roll call for the class they head, exam marks still missing, homework to mark, and drafts. 

- **Works with no network.** Take registers, enter marks and write notes. They wait on the device and are marked "Waiting to send" until the server has them. Press **Save for offline** to keep the day on the device; reopening the app with no connection shows that copy.
- **Nothing is lost or doubled.** Each change is sent once even if the connection drops mid-send.
- **Clashes are never decided silently.** If someone else marked a child or changed a mark while you were away, that item goes to **Clashes**, showing both versions. Keep yours, keep the saved one, combine them, or hand it to a colleague or the school office. The decision and the reason are kept.
- **Offline sync** (admin): integrity of the last 30 days, open clashes by teacher, what was refused and why, and which devices have sent work.

## Documents studio (E12)

Admins open **Documents studio**. Start from an Aulensia original, make your own copy and change it on the canvas: drag, resize, snap to guides, nudge with the arrow keys (Shift for bigger steps), align, undo and redo, front and back sides, school colours, English and Urdu previews, and a live checks panel (text contrast, safe area, picture licences). Send it for review; another administrator approves it and it goes live. Issue documents one by one or in bulk; each gets a number and a check code, and is kept exactly as issued. Print in batches (several cards to a sheet with cut marks, or one per page), record jams or failures and retry only what failed. Download any issued document as a PDF or a 300 dpi PNG. Students and parents see their documents under **My documents**; anyone can check a document at `/verify/<code>`.

## Quizzes and online exams (E13)
Teachers and administrators find **Quizzes & exams** in the dashboard menu. Students find it in their menu, and parents see released results under **Quizzes & exams**.

1. **Write questions** in the *Question bank*: multiple choice, several correct, true/false, short answer, essay, matching, ordering and number. Type maths as `x^2`, `H_2O`, `\frac{a}{b}`, `\sqrt{x}`; the preview shows it drawn and the way a screen reader will say it. Say where each question came from. A question used in a published quiz is never changed behind it: saving makes a new version.
2. **Build a quiz** from chosen questions, or fill a **blueprint** (for example 5 easy, 3 medium, 2 hard on a topic) for a balanced paper. Set time, attempts, which score counts, opening and closing times, who is checked how, and whether two people mark written answers.
3. **Publish.** You can publish a quiz yourself. An exam goes for review and a different administrator approves it. Papers and answer keys stay sealed until the window allows them.
4. **Students write** on any device. The school's server keeps the time, answers are saved as they type, and a lost connection does not lose work. They are told exactly what is recorded (never camera, microphone or screen).
5. **Mark.** Closed questions mark themselves. Written answers wait in *Marking*; with two markers the second cannot see the first mark, and large differences go to a third person.
6. **Release.** Results stay hidden until you release them (now or at a set time). Students and parents see them after that; students can ask for a second look within the appeal period, and a different person decides.
7. **Learn from it.** *Analysis* shows how many got each question right, which questions separate strong from weak students, and how often each choice was picked. Save the figures back to the bank.
8. **Arrangements.** Teachers request extra time, large text, read aloud or a make-up window for a student; an administrator approves. The reason is private.


## Paper exams: answer-sheet scanning (E14)
Teachers and administrators find **Paper exams (OMR)** in the dashboard menu.

1. **Make an answer sheet.** Choose the class, number of questions (up to 100), choices (2 to 5), marks for a right answer and any marks lost for a wrong one. Print blank sheets, or one sheet for each candidate with the name and number already filled in. The sheet has four corner squares, so a phone photo taken at an angle is straightened.
2. **Enter the key.** Click a question to change its answer, or paste the whole key. Use `(BC)` when two answers are accepted, `*` to give everyone the marks, `-` to drop a question. Changing a key later needs a reason and regrades anything not yet published.
3. **Start a sitting and photograph the sheets** with the phone camera (it shows when all four corners are in view) or choose photos from the phone or computer. Each photo is read straight away: *Ready*, *Needs review* or *Needs a new photo*.
4. **Check what the reader was unsure of.** The review window shows only doubtful questions with a close-up, and you answer with the keyboard or buttons. Blurry, dark or duplicate sheets can be accepted only after you look and write why.
5. **Grade, send for moderation, approve, publish.** Moderation shows how the class did and flags questions that nearly everyone got wrong in the same way, which usually means the key is wrong. A different administrator approves. Publishing writes the marks into the marks book and tells students and guardians.
6. **Export** the grades as a CSV once approved.

Photos are kept with the sitting so any decision can be checked later. This version needs a network connection to send photos, and does not mark written answers.

## Nursery and early years (E15)
Administrators and teachers find **Nursery** in the dashboard menu; parents see a **Nursery** tab when their child is in a room.

1. **Set up (administrator).** Open *Rooms and settings*. Create a room, pick an age group, a lead and carers, then place children in it. Check the children-per-adult figures under *School settings*: they are the school's own numbers, so make sure they match what applies to you.
2. **Each morning (carers).** *Today* shows who is expected, here, collected or absent. Check children in by naming who brought them; release them to a person on the collection list. Press *I am in the room* so the adult count is right. A red banner says when a room needs another adult.
3. **Log the day.** Tick children and log meals, drinks, naps, toilet, mood and notes in one go. Change one child's amount without redoing the rest. A flaky connection never records the same batch twice.
4. **Family diary.** *Make drafts from today's log*, add a photo or a comment, then send for review. A different person reviews it before the family sees anything. Photos appear only for children whose family has agreed.
5. **Learning.** Record what you saw a child do (Exploring, Practising, Confident). *Milestones* shows where the room has not yet been looked at. There are no scores or rankings. Copy a built-in framework to make your own.
6. **Activities.** Browse or write activities, plan the week for a room, print tracing and observation sheets. Activities with small parts for under-threes need an adult close by.
7. **Pickup changes.** When a family asks to add, pause or remove a collector, phone them on the number the school already holds (or see them, or use a signed form), record how you confirmed it, then apply. Every guardian is told.

Parents read the diary, see today's status, update health information (the nursery confirms it with them first), change what the nursery may share, and ask for collector changes.

## Family communication (E20)
Administrators and teachers find **Family messages** in the dashboard menu; parents find **Messages & help**. The school needs the Messages feature in its plan.

1. **Messages.** Parents write to the school office or to a teacher of their child, in English or Urdu. Staff reply the same way; add the same message in the other language and each person reads their own. Teachers see only their own conversations. When an administrator opens a teacher's conversation, that is recorded. Conversations that wait longer than the school's reply time show *Reply is late*.
2. **Quiet hours.** Under *Settings* choose when non-urgent phone alerts wait (default 21:00 to 07:00). Everything is still in the app straight away. Safety alerts and administrator messages marked urgent are never held. Each person can also set their own quiet hours, language and phone alerts under *My alerts*.
3. **Help desk (administrator).** Families raise requests (fees, documents, transport, health, a complaint and so on). Each gets a number and two deadlines counted in working time. Take a request, reply, add internal notes the family cannot see, use ready-made replies, ask the family for something (the clock pauses until they answer) and resolve it. The family can rate the help or reopen within the reopening period. *Report* shows volumes, median reply and resolution times, deadlines met, reopenings and ratings.
4. **Meeting days.** Plan a day: classes, teachers, sessions, minutes per meeting and when booking opens and closes. Publish it and families are told. Watch who has not booked and remind them once a day. Teachers block times they cannot do and, afterwards, record each meeting: a summary the family sees and a private note only staff see. Families get a reminder about a day before. The day closes itself after its last session.
5. **Delivery check.** Open a conversation and press *Delivery* to see which alerts were sent, held for quiet hours or failed and retried.

Set `CRON_SECRET` on Vercel. The daily job (07:05 Pakistan time) releases held alerts and raises breaches; away from Vercel the server sweeps every 10 minutes.

## Student care (E21)
Administrators and teachers find **Student care** in the dashboard menu; parents find **Wellbeing**; students find **Wellbeing & support**.

1. **Cases.** Open a case when a child needs coordinated help: choose the topic, how much support, a lead and who else may see it. Add notes, actions with owners and dates, and referrals. Bullying and safeguarding cases are confidential: only the people on them and the safeguarding leads can open them, and each read is recorded. Closing one needs a second safeguarding lead to sign off.
2. **Concerns.** Students, parents and staff can tell the safeguarding team about a worry, with or without a name. Someone who sends one without a name gets a code to see the reply. Triage a concern: reply, close it with a reason, or turn it into a case.
3. **Sick bay.** The nurse keeps a health plan per child (allergies, conditions, emergency plan), adds medicines (the parent is asked to agree first), records each dose as given, refused or not given, and logs visits. Parents are told straight away if a child is sent home or an allergic reaction happens. Teachers see an alert for the children they teach and can record a visit.
4. **Support.** Propose adjustments (extra time, a reader and so on); another coordinator decides. Book appointments with the counsellor, nurse or a mentor; students and parents can ask for one. Set goals, pair a mentor, and keep a career pathway.
5. **Staff and access.** Record safeguarding and other training; teachers without current safeguarding training cannot join confidential cases. Ask for emergency access to a confidential case by its number; a second lead approves. Answer families' privacy requests before they are due. Under *Settings* choose the escalation times and review periods.

Set `CRON_SECRET` on Vercel. The daily job (07:40 Pakistan time) escalates cases without a lead and unseen concerns, flags reviews and training that is running out, and closes emergency access that has expired; away from Vercel the server sweeps every 15 minutes.

## Brand & theme (E27)
Administrators open **Brand & theme** (sidebar). **Look**: start a draft, pick the main and second colours, light/dark/follow-the-device, corners and letters. The screen shows two small previews and seven readability checks; a colour that fails can be fixed with one click ("nearest colour that works"). *Try it on this whole screen* paints the draft on the administrator's screen only. **Publish** puts it live for everyone and for printed documents; every version is kept and *Go back to this* publishes a copy of an old one (with a reason).

Every person can also choose **light, dark or follow my device** with the appearance button in the top bar (and on the sign-in pages). The choice stays on that device. Dark mode is computed from the school's colour, so a school's brand stays recognisable.

**Web address**: Premium schools add their own address (for example `portal.myschool.edu.pk`). The screen shows the TXT record to prove ownership, then the CNAME to point at the platform, then goes live. On that address the sign-in page shows the school's name, logo and colours and already knows the school code. A daily check marks an address that stopped working and tells the administrators.

**Urdu wording**: set a label the school's own way ("Class" → "درجہ"). Labels people saw in Urdu with no translation are listed by how often; give them wording or ignore them.

Platform owner: set `ROOT_DOMAIN` (the shared address schools can take a name under) and `CNAME_TARGET` (what custom addresses point at). Add the school's address to the Vercel project's domains; Aulensia does not do that automatically. `vercel.json` runs `/api/cron/theme` daily.

## Sales, quotes and support (E28)

**From website to paying school.** A visitor uses *Book a demo* or *Get a quote* on the landing page. The request appears in **Sales & support → Leads** with where it came from (campaign, partner code). Open the lead, mark when you contacted them, make a **quote** (plan, monthly or yearly, an optional set-up item, a discount up to 50% with a reason), and copy the private link to send by email or WhatsApp. The buyer opens the link, reads the quote and terms and accepts with their name and email; that creates an **invoice** and shows your payment details (set them under *Settings*). When the money arrives, **Create their school** on the lead if it does not exist yet, then **Record payment** on the invoice. That one step puts the school on the plan, adds the entry to the books, pays the partner's commission if the lead came through one, and marks the lead Won. Recording it twice changes nothing.

**Help for schools.** School administrators open **Help & invoices** to ask a question, follow replies, mark a case solved and rate the help. You answer from **Support inbox**. Internal notes are never shown to the school. Each case has a first-reply and a resolve deadline counted in working hours (Monday to Friday, 9am to 6pm Pakistan time); *Waiting for the school* pauses the resolve clock. Missed deadlines are flagged once and shown in the inbox.

**Customer words on the website.** The website shows no testimonials until you publish one. To publish, record the person's exact words, where the original is kept, their consent date and how to reach them (and, if you shortened the words, the date they approved the edit). Entries ask for a fresh review after a year and stop showing on their own. Withdrawing one removes it from the website within seconds.

## Import and new academic year (E29)

**Bringing in your data.** Open **Import & new year**. Download the template, fill in students or classes, and upload the file (or paste the rows). Nothing is saved yet: you see how many rows would be added, how many would change a record that already exists, how many are unchanged, and which rows have problems, with the reason for each. A person who looks like someone already in the school (same admission number, same name and birth date, or the same name and guardian phone) is held for your decision: skip, update the existing record, or add as new. When you start the import it runs in small steps. Guardian accounts are made from the guardian email, and a guardian with several children in the file gets one account. Temporary passwords are shown once at the end as a download. Run the same file again and nobody is added twice. If something is wrong, **Take this import back** removes what it added and undoes what it changed. Anything already used (a student with attendance or marks, a record you edited since) is kept and listed.

**Closing the year.** On the **Year rollover** tab, start a rollover to the next year. First **freeze results**: marks of exams made so far cannot change. Then check readiness. Scanned marking that is not published, duplicate enrolments and a missing freeze stop the rollover until fixed; missing class teachers and over-full classes are warnings. The dry run shows each learner's move (promote, stay in class, graduate) and the reason. You can hold a learner back or graduate them by hand, and choose to keep learners with unpaid fees in their class. Another look is needed before it runs: tick that you read the counts, and mark it reviewed. If anything changes after that, the plan must be reviewed again. **Open the new year** then moves everyone, makes the next classes if they do not exist, sets the school and classes to the new year and keeps the old year in the school's history. Unpaid fees stay on each learner's account. **Roll back** puts everyone back, except anyone changed by hand since, who is listed.

## Campuses, consent and organizations (E01)
- **Admin → Access & permissions** now has three sections: Permissions, Campuses and Consent register.
- **Campuses:** every school has a main campus. Add more, move classes between them (students move with their class), and tie an administrator to a campus. A tied administrator sees only that campus's classes, students and consents, and cannot reach another campus even by guessing a link. At least one administrator always stays school-wide.
- **Consent register:** record answers received on paper, in person or by phone; parents answer for their children and themselves in the parent portal (**Permissions** tab). Every change adds a row, and the old row stays as history. "Not answered" always counts as no. Use the **Not answered yet** list to chase families.
- **Organizations (platform owner):** group schools under one owner. Grouping never lets one school see another's data.
- **Safety fix:** editing a student, class, teacher or exam can no longer move it into another school, and editing a student without naming a class no longer lowers that class's head count.

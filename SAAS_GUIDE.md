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

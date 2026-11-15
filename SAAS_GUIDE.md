# SchoolHub Pro: SaaS, Super Admin and Parent Dashboard

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
* Uploaded files are stored in MongoDB by default (max 4 MB, photos are shrunk in the browser). Set the three `CLOUDINARY_*` variables to store in Cloudinary's free tier instead.

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

## Free deployment (Render + MongoDB Atlas)

1. Create a free MongoDB Atlas M0 cluster and copy its connection string.
2. Push this project to GitHub.
3. In Render choose New > Blueprint, pick the repository (uses `render.yaml`).
4. Set `MONGODB_URI`, `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` when prompted.
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

# User Flow and Journeys

Follow this top to bottom to walk the whole product on the front end. Each journey says who you are, where to sign in, where to click and what you should see. Menu names match the sidebar (or the bottom bar for parents).

Related: `QUICK_START.md` (running locally), `SAAS_GUIDE.md` (features), `API_DOCUMENTATION.md` (API).

## 1. Who uses the system

| Role | Sign in at | Their job |
|---|---|---|
| Platform owner (Super Admin) | `/superadmin/login` | Owns the platform: schools, plans, payments, organizations |
| Partner agent | `/agent/login` | Brings schools in and earns commission |
| Director | `/director/login` | Looks after a group (organization) of schools |
| School admin | `/login` | Runs one school |
| Teacher | `/login` | Classes, attendance, homework, marks |
| Student | `/login` | Homework, marks, attendance |
| Parent | `/login` | Follows children, pays fees, messages the school |

Sign-in for school people (admin, teacher, student, parent) is **email + password only**. The school is found from the email.

## 2. Big picture

```
Platform owner ── creates plans, organizations, agents
      │
      ├── Organization (group of schools) ── Director
      │
      └── School ── School admin
              ├── adds Teachers, Classes, Subjects, Students, Parents
              ├── Teachers take attendance, set homework, enter marks
              ├── Parents see children, pay fees, message the school
              └── Students see homework, marks, attendance
```

Schools in one organization never see each other's students, staff or money.

## 3. Journey: register a school and sign in

1. Open `/register`. Fill school name, admin name, email, phone, address and password.
   - Password needs 6+ characters, one capital letter, one number and one special character.
2. Submit. You see "School registered successfully" and land on the login page with your email filled in.
3. Open `/login`, enter email and password, press **Login to Dashboard**.
4. You arrive on the admin dashboard. A new school starts on the Free plan.

**Same email on several accounts** (for example a teacher who is also a parent):
1. After the password, a list appears: "Teacher: Ayesha - School X", "Parent: Ayesha - School X".
2. Pick one. You enter that dashboard.
3. Later, use **Switch account** in the top bar (in the menu on phones) to move to the other without signing in again. The current account has a tick. Switching only reaches accounts with the same email in the same school, or in schools of the same organization.

## 4. Journey: School admin sets the school up

Menu groups on the admin sidebar: Overview, User Management, Admissions & Records, Academics, Attendance & Safety, Fees & Finance, Communication, Campus Services, Branches & Reports, Settings. Click a group to open its sub-tabs. The group that holds the open page opens by itself.

Do these in order the first time:

1. **Settings > School Setup**: school name, logo, details.
2. **Quick Creation > Class Setup** (bottom of the sidebar): create standards and divisions (for example Std 5, division A).
3. **Academics > Subjects**: add subjects per standard with marks limits.
4. **User Management > Teachers**: add teachers. Then **Academics > Teacher assignments**: give each teacher class and subject pairs. Mark one teacher as head master (class teacher) of a class.
5. **User Management > Students**: add students (or **Admissions & Records > Import from Excel** to bring many at once).
6. **User Management > Parents & Guardians**: add parents and link each to their children.
7. **Academics > Timetable**: build the timetable.
8. **Fees & Finance > Fee setup**: define fees per class.
9. **Communication > Notices**: post the first notice.

### Find a student
**User Management > Students**: type a name, roll number, registration number or email in the search box at the top. Click a result to open that student's class list. With no search text, pick a standard, then a division card to see its students.

## 5. Journey: teacher's day

Sidebar groups: Home, My Classes, Exams & Quizzes, Attendance & Care, Communication, School Work. Marks Entry and Account links sit below the groups.

1. Sign in. **Home > Today** shows the day's lessons and tasks.
2. **My Classes > Take Attendance** (only for the head master of a class): mark each student once for the day.
3. **My Classes > Homework & Grading**: set homework for a class, later grade submissions.
4. **Marks Entry & View** (sidebar, under the groups): pick a class and subject from the list, enter marks for an exam.
5. **My Classes > Notice Board**: read school notices.
6. **Communication > Family messages**: answer parents.
7. **Account**: My Detailed Profile, Raise Grievance / Complaint, Account Security.

## 6. Journey: parent

Bottom bar on phones (top bar on larger screens): **Home**, **School life**, **Learning**, **Family & care**, **Fees & account**. A section with several pages shows them as chips under the bar.

1. **Home**: one card per child. With several children, pick the child at the top.
2. **School life**: Attendance, Leave & alerts, Notices, Nursery (only if a child is in nursery), School bus.
3. **Learning**: Quizzes & exams, Documents, Library & store.
4. **Family & care**: Messages & help, Wellbeing, Permissions, What devices recorded.
5. **Fees & account > Fees**: tick the fees you paid, upload a payment screenshot, submit. The fee shows **Under review**. Parents can never mark a fee paid themselves.
6. If rejected, the reason is shown and you can send a new screenshot.
7. **Fees & account > My account**: profile and password.

## 7. Journey: student

Sidebar groups: Dashboard Overview, Learning, Attendance & Wellbeing, School Life. Report card and subject marks sit below.

1. **Learning**: My Homework, Quizzes & exams, My Class Timetable, Academic record, Training courses, My documents (some depend on the school's plan).
2. **Attendance & Wellbeing**: Roster & Attendance, Leave alerts & check-in, Wellbeing & support, What devices recorded.
3. **School Life**: Notice Board, Library & store, School bus, Community service.
4. **All Subjects Report Card**, or one subject: marks by exam.

## 8. Journey: fee payment, end to end

1. Admin: **Fees & Finance > Fee setup** creates the fees. Other fees (uniform, books, trip) go under **Payments & Other Fees**.
2. Parent: **Fees & account > Fees**, pays by JazzCash, Easypaisa, bank or cash deposit, uploads a screenshot.
3. Admin: **Fees & Finance > Payments & Other Fees > Payment reviews**. A red number on the menu shows how many wait.
4. Admin presses **Mark as paid**, or **Reject** with a reason.
5. Parent sees **Paid**, or the rejection reason.
6. Admin tracks money in **Fees & Finance > Fee collection** and **School accounts**.

## 9. Journey: attendance, end to end

1. Head master takes attendance once a day (**My Classes > Take Attendance**).
2. Admin watches and fixes it in **Attendance & Safety > Attendance**.
3. Parent and student see it under **Attendance**. A correction by the school sends them a notification.
4. Leave requests: parent or student under **Leave & alerts**, school staff under **Attendance & Safety > Attendance desk**.

## 10. Journey: notifications

1. The bell in the top bar shows a red number for unread items. It refreshes about every 40 seconds.
2. Click the bell. On phones the list opens full width under the top bar.
3. Click an item. It is marked read and opens the right page and tab for your role. If you are already on that dashboard, the page reloads to show the tab.
4. **Mark all read** clears the number.
5. At the bottom you can turn on phone or browser alerts so you are told even when the app is closed.

## 11. Journey: platform owner and organizations

1. Sign in at `/superadmin/login`.
2. **Schools (Tenants)**: add, edit, suspend or delete schools. Deleting needs the school code typed in.
3. **Plans & Pricing**: set prices in PKR, limits and features.
4. **Organizations**: open "How organizations work" at the top of the page.
   1. **New organization**: a name for one owner or trust.
   2. **Add a school** to it. A school sits in one group at a time.
   3. **Directors > Appoint a director**: enter name and email. A first-time password is shown once. Copy it and hand it over.
   4. The director signs in at `/director/login`, opens the group's schools and appoints the people who run each school. They never read a school's own records.
   5. **Suspend** stops new schools joining the group. **Remove** takes a school out without deleting it.
5. **Agents**, **Payments**, **Commissions**, **Backups & recovery**, **Sales & support** and **Account Security** are the other tabs.

## 12. Journey: partner agent

1. Sign in at `/agent/login`.
2. Tabs: Overview, My schools, Payments, Commissions & payouts, Share, Profile.
3. **Share** gives the referral link. A school that registers through it is linked to the agent.

## 13. Behaviours to expect on every dashboard

- Choosing any menu item scrolls the page back to the top.
- On phones the sidebar closes after you choose a page.
- The browser Back button stays inside the dashboard.
- Pages your school's plan does not include are hidden from the menu.
- A suspended or expired school cannot sign in and sees a message saying why.

## 14. Front-end test checklist

Tick each line while walking the journeys above.

**Sign-in**
- [ ] Login has no school code field.
- [ ] Wrong password shows "Invalid credentials".
- [ ] An email with two accounts shows the picker; each choice opens the right dashboard.
- [ ] **Switch account** shows only for such emails, and the tick sits on the current account.

**Navigation (admin, teacher, student, parent)**
- [ ] Groups open and close; the open page's group is open.
- [ ] Every old tab is still reachable.
- [ ] Choosing a tab from the bottom of a long page lands at the top.
- [ ] Phone width (360 px): no sideways scroll, sidebar closes after a choice.

**Students**
- [ ] Search finds by name, roll number, registration number and email.
- [ ] Clearing the box returns to the standard cards.
- [ ] No match shows a clear message.

**Labels**
- [ ] The student form and profile say **Mother Language**.

**Notifications**
- [ ] Each notification opens a real page, not the old tab.
- [ ] On a phone the list fits the screen and long titles wrap.

**Organizations**
- [ ] The guide shows, and is open when there are no organizations yet.

# API Documentation - Aulensia School Management System

## Base URL
```
http://localhost:5000/api
```

## Authentication Header
```
Authorization: Bearer <access_token>
```

---

## 🔐 Authentication Endpoints

### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@school.com",
  "password": "password123",
  "phone": "1234567890",
  "role": "student",
  "schoolId": "school_id",
  "rollNumber": "A001",
  "registrationNumber": "REG001",
  "classId": "class_id",
  "division": "A"
}

Response: 201
{
  "message": "User registered successfully",
  "user": {...},
  "accessToken": "token",
  "refreshToken": "token"
}
```

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@school.com",
  "password": "password123",
  "schoolCode": "SCHOOL001"
}

Response: 200
{
  "message": "Login successful",
  "user": {...},
  "accessToken": "token",
  "refreshToken": "token"
}
```

### Refresh Token
```http
POST /auth/refresh-token
Content-Type: application/json

{
  "refreshToken": "token"
}

Response: 200
{
  "accessToken": "new_token",
  "refreshToken": "new_token"
}
```

### Logout
```http
POST /auth/logout
Authorization: Bearer <token>

Response: 200
{
  "message": "Logged out successfully"
}
```

### Get Profile
```http
GET /auth/profile
Authorization: Bearer <token>

Response: 200
{
  "user": {...}
}
```

### Update Profile
```http
PUT /auth/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "phone": "9876543210",
  "avatar": "avatar_url"
}

Response: 200
{
  "message": "Profile updated successfully",
  "user": {...}
}
```

### Change Password
```http
PUT /auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "oldPassword": "password123",
  "newPassword": "newpassword123"
}

Response: 200
{
  "message": "Password changed successfully"
}
```

---

## 🏫 School Endpoints

### Create School (Super Admin)
```http
POST /schools
Content-Type: application/json

{
  "name": "ABC School",
  "code": "SCHOOL001",
  "email": "admin@abcschool.com",
  "phone": "1234567890",
  "address": {
    "street": "123 Main St",
    "city": "City",
    "province": "Punjab",
    "zipCode": "12345"
  },
  "principalName": "Mr. Principal",
  "principalEmail": "principal@abcschool.com",
  "adminName": "Admin Name",
  "adminEmail": "admin@school.com",
  "adminPassword": "password123"
}

Response: 201
{
  "message": "School created successfully",
  "school": {...},
  "admin": {...}
}
```

### Get All Schools
```http
GET /schools?page=1&limit=10&search=ABC
Authorization: Bearer <token>

Response: 200
{
  "schools": [...],
  "pagination": {...}
}
```

### Get My School
```http
GET /schools/my
Authorization: Bearer <token>

Response: 200
{
  "school": {...}
}
```

### Get School Statistics
```http
GET /schools/stats
Authorization: Bearer <token>

Response: 200
{
  "stats": {
    "totalStudents": 1250,
    "totalTeachers": 85,
    "totalClasses": 32,
    "totalSubjects": 25,
    "totalAttendance": 5000,
    "pendingComplaints": 12,
    "todayAttendance": 1200
  }
}
```

---

## 👨‍🎓 Student Endpoints

### Get All Students
```http
GET /students?page=1&limit=10&classId=id&search=name
Authorization: Bearer <token>

Response: 200
{
  "students": [...],
  "pagination": {...}
}
```

### Get Student by ID
```http
GET /students/:id
Authorization: Bearer <token>

Response: 200
{
  "student": {...}
}
```

### Create Student
```http
POST /students
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Doe",
  "email": "student@school.com",
  "password": "password123",
  "phone": "1234567890",
  "rollNumber": "A001",
  "registrationNumber": "REG001",
  "classId": "class_id",
  "division": "A",
  "dateOfBirth": "2010-01-01",
  "gender": "Male",
  "bloodGroup": "O+",
  "parentName": "Parent Name",
  "parentEmail": "parent@email.com",
  "parentPhone": "9876543210"
}

Response: 201
{
  "message": "Student created successfully",
  "student": {...}
}
```

### Update Student
```http
PUT /students/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "phone": "9876543210"
}

Response: 200
{
  "message": "Student updated successfully",
  "student": {...}
}
```

### Delete Student
```http
DELETE /students/:id
Authorization: Bearer <token>

Response: 200
{
  "message": "Student deleted successfully"
}
```

### Promote Student
```http
POST /students/:id/promote
Authorization: Bearer <token>
Content-Type: application/json

{
  "newClassId": "new_class_id"
}

Response: 200
{
  "message": "Student promoted successfully",
  "student": {...}
}
```

### Get Student Attendance
```http
GET /students/:id/attendance?page=1&limit=10
Authorization: Bearer <token>

Response: 200
{
  "attendance": [...],
  "stats": {
    "totalDays": 100,
    "presentDays": 92,
    "absentDays": 5,
    "leaveDays": 3,
    "lateDays": 0,
    "percentage": "92.00"
  }
}
```

---

## 👨‍🏫 Teacher Endpoints

### Get All Teachers
```http
GET /teachers?page=1&limit=10&search=name
Authorization: Bearer <token>

Response: 200
{
  "teachers": [...],
  "pagination": {...}
}
```

### Create Teacher
```http
POST /teachers
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Mr. Teacher",
  "email": "teacher@school.com",
  "password": "password123",
  "phone": "1234567890",
  "employeeId": "EMP001",
  "qualification": "B.Sc, B.Ed",
  "experience": 5,
  "joiningDate": "2020-01-01",
  "salary": 50000
}

Response: 201
{
  "message": "Teacher created successfully",
  "teacher": {...}
}
```

### Assign Subject to Teacher
```http
POST /teachers/:id/assign-subject
Authorization: Bearer <token>
Content-Type: application/json

{
  "subjectId": "subject_id"
}

Response: 200
{
  "message": "Subject assigned successfully",
  "teacher": {...}
}
```

### Assign Class to Teacher
```http
POST /teachers/:id/assign-class
Authorization: Bearer <token>
Content-Type: application/json

{
  "classId": "class_id"
}

Response: 200
{
  "message": "Class assigned successfully",
  "teacher": {...}
}
```

---

## 📚 Class Endpoints

### Get All Classes
```http
GET /classes?page=1&limit=10&standard=10A
Authorization: Bearer <token>

Response: 200
{
  "classes": [...],
  "pagination": {...}
}
```

### Create Class
```http
POST /classes
Authorization: Bearer <token>
Content-Type: application/json

{
  "standard": "10",
  "division": "A",
  "academicYear": "2024",
  "capacity": 40
}

Response: 201
{
  "message": "Class created successfully",
  "class": {...}
}
```

### Get Class Students
```http
GET /classes/:id/students
Authorization: Bearer <token>

Response: 200
{
  "students": [...],
  "totalStudents": 40
}
```

---

## 📖 Subject Endpoints

### Get All Subjects
```http
GET /subjects?page=1&limit=10&search=Math
Authorization: Bearer <token>

Response: 200
{
  "subjects": [...],
  "pagination": {...}
}
```

### Create Subject
```http
POST /subjects
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Mathematics",
  "code": "MATH01",
  "maxMarks": 100,
  "minMarks": 35
}

Response: 201
{
  "message": "Subject created successfully",
  "subject": {...}
}
```

---

## 📅 Timetable Endpoints

### Create Timetable
```http
POST /timetables
Authorization: Bearer <token>
Content-Type: application/json

{
  "classId": "class_id",
  "dayOfWeek": "Monday",
  "slots": [
    {
      "startTime": "09:00",
      "endTime": "10:00",
      "subjectId": "subject_id",
      "teacherId": "teacher_id",
      "room": "Room 101"
    }
  ],
  "academicYear": "2024"
}

Response: 201
{
  "message": "Timetable created successfully",
  "timetable": {...}
}
```

### Get Timetable by Class
```http
GET /timetables/class/:classId
Authorization: Bearer <token>

Response: 200
{
  "timetables": [...]
}
```

### Get Timetable by Teacher
```http
GET /timetables/teacher
Authorization: Bearer <token>

Response: 200
{
  "timetables": [...]
}
```

---

## 📝 Attendance Endpoints

### Mark Attendance
```http
POST /attendance/mark
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": "user_id",
  "date": "2024-01-15",
  "status": "Present",
  "remarks": ""
}

Response: 201
{
  "message": "Attendance marked successfully",
  "attendance": {...}
}
```

### Mark Class Attendance
```http
POST /attendance/mark-class
Authorization: Bearer <token>
Content-Type: application/json

{
  "classId": "class_id",
  "date": "2024-01-15",
  "attendanceData": [
    {
      "userId": "student_id",
      "status": "Present",
      "remarks": ""
    }
  ]
}

Response: 200
{
  "message": "Class attendance marked successfully",
  "marked": 40,
  "errors": []
}
```

### Get User Attendance
```http
GET /attendance/user/:userId?month=1&year=2024&page=1&limit=50
Authorization: Bearer <token>

Response: 200
{
  "attendance": [...],
  "stats": {...},
  "pagination": {...}
}
```

---

## 📊 Marks Endpoints

### Create Exam
```http
POST /marks/exams
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Unit Test",
  "classId": "class_id",
  "subjectId": "subject_id",
  "date": "2024-01-20",
  "totalMarks": 100,
  "passingMarks": 35
}

Response: 201
{
  "message": "Exam created successfully",
  "exam": {...}
}
```

### Enter Marks
```http
POST /marks/enter
Authorization: Bearer <token>
Content-Type: application/json

{
  "examId": "exam_id",
  "studentId": "student_id",
  "subjectId": "subject_id",
  "marks": 85,
  "outOfMarks": 100
}

Response: 201
{
  "message": "Marks entered successfully",
  "marks": {...}
}
```

### Bulk Enter Marks
```http
POST /marks/bulk
Authorization: Bearer <token>
Content-Type: application/json

{
  "examId": "exam_id",
  "subjectId": "subject_id",
  "marksData": [
    {
      "studentId": "student_id",
      "marks": 85,
      "outOfMarks": 100
    }
  ]
}

Response: 200
{
  "message": "Marks entered successfully",
  "entered": 40,
  "errors": []
}
```

### Get Exam Result
```http
GET /marks/exam/:examId
Authorization: Bearer <token>

Response: 200
{
  "results": [...],
  "summary": {
    "totalStudents": 40,
    "topScore": 95,
    "averageScore": "78.50",
    "passedCount": 38,
    "failedCount": 2
  }
}
```

### Get Toppers
```http
GET /marks/toppers?limit=10
Authorization: Bearer <token>

Response: 200
{
  "toppers": [...]
}
```

---

## 📢 Notice Endpoints

### Create Notice
```http
POST /notices
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Annual Day Announcement",
  "content": "Notice content here...",
  "targetAudience": "All",
  "isPinned": true,
  "priority": "High"
}

Response: 201
{
  "message": "Notice created successfully",
  "notice": {...}
}
```

### Get All Notices
```http
GET /notices?page=1&limit=10&isPinned=true
Authorization: Bearer <token>

Response: 200
{
  "notices": [...],
  "pagination": {...}
}
```

### Mark Notice as Read
```http
POST /notices/:id/read
Authorization: Bearer <token>

Response: 200
{
  "message": "Notice marked as read"
}
```

---

## 📚 Homework Endpoints

### Create Homework
```http
POST /homework
Authorization: Bearer <token>
Content-Type: application/json

{
  "classId": "class_id",
  "subjectId": "subject_id",
  "title": "Chapter 5 Exercises",
  "description": "Complete all exercises...",
  "dueDate": "2024-01-20"
}

Response: 201
{
  "message": "Homework assigned successfully",
  "homework": {...}
}
```

### Submit Homework
```http
POST /homework/:id/submit
Authorization: Bearer <token>
Content-Type: application/json

{
  "fileUrl": "url_to_submitted_file"
}

Response: 200
{
  "message": "Homework submitted successfully",
  "homework": {...}
}
```

### Grade Homework
```http
POST /homework/:id/grade
Authorization: Bearer <token>
Content-Type: application/json

{
  "studentId": "student_id",
  "marks": 9,
  "feedback": "Good work!"
}

Response: 200
{
  "message": "Homework graded successfully",
  "submission": {...}
}
```

---

## 🗣️ Complaint Endpoints

### Create Complaint
```http
POST /complaints
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Issue with attendance",
  "description": "Detailed description...",
  "category": "Academic",
  "priority": "High"
}

Response: 201
{
  "message": "Complaint raised successfully",
  "complaint": {...}
}
```

### Get All Complaints
```http
GET /complaints?status=Pending&category=Academic&page=1&limit=10
Authorization: Bearer <token>

Response: 200
{
  "complaints": [...],
  "pagination": {...}
}
```

### Assign Complaint
```http
POST /complaints/:id/assign
Authorization: Bearer <token>
Content-Type: application/json

{
  "assignedTo": "staff_id"
}

Response: 200
{
  "message": "Complaint assigned successfully",
  "complaint": {...}
}
```

### Resolve Complaint
```http
POST /complaints/:id/resolve
Authorization: Bearer <token>
Content-Type: application/json

{
  "resolution": "Issue resolved..."
}

Response: 200
{
  "message": "Complaint resolved successfully",
  "complaint": {...}
}
```

---

## 📅 Event Endpoints

### Create Event
```http
POST /events
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Annual Day",
  "description": "Our annual celebration...",
  "eventType": "Cultural",
  "startDate": "2024-02-15",
  "endDate": "2024-02-15",
  "location": "School Auditorium",
  "isHoliday": false
}

Response: 201
{
  "message": "Event created successfully",
  "event": {...}
}
```

### Get All Events
```http
GET /events?page=1&limit=10&eventType=Academic&upcoming=true
Authorization: Bearer <token>

Response: 200
{
  "events": [...],
  "pagination": {...}
}
```

---

## 💬 Message Endpoints

### Send Message
```http
POST /messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "recipientId": "user_id",
  "subject": "Subject",
  "message": "Message content"
}

Response: 201
{
  "message": "Message sent successfully",
  "message": {...}
}
```

### Get Inbox
```http
GET /messages/inbox?page=1&limit=10&isRead=false
Authorization: Bearer <token>

Response: 200
{
  "messages": [...],
  "pagination": {...}
}
```

### Get Conversation
```http
GET /messages/conversation/:userId?page=1&limit=50
Authorization: Bearer <token>

Response: 200
{
  "messages": [...]
}
```

---

## 📊 Dashboard Endpoints

### Get Admin Dashboard Stats
```http
GET /dashboard/admin
Authorization: Bearer <token>

Response: 200
{
  "stats": {
    "totalStudents": 1250,
    "totalTeachers": 85,
    "totalAttendance": 5000,
    "pendingComplaints": 12,
    "todayAttendance": 1200
  },
  "recentNotices": [...],
  "upcomingExams": [...]
}
```

### Get Teacher Dashboard Stats
```http
GET /dashboard/teacher
Authorization: Bearer <token>

Response: 200
{
  "stats": {
    "totalStudents": 120,
    "todayAttendance": 95,
    "pendingHomework": 15,
    "mySubjects": 3,
    "assignedClasses": 2
  }
}
```

### Get Student Dashboard Stats
```http
GET /dashboard/student
Authorization: Bearer <token>

Response: 200
{
  "stats": {
    "attendancePercentage": "92.00",
    "averageMarks": "78.50",
    "pendingHomework": 5,
    "upcomingExams": 2
  }
}
```

---

## Error Responses

All endpoints return standard error responses:

```json
{
  "message": "Error description",
  "status": 400
}
```

### Common Error Codes
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden/Access Denied
- `404`: Not Found
- `500`: Internal Server Error

---

## Pagination

Most endpoints support pagination:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)

Response includes:
```json
{
  "pagination": {
    "total": 100,
    "pages": 10,
    "currentPage": 1
  }
}
```

---

## Rate Limiting

- 100 requests per minute per IP
- 1000 requests per hour per user

---

**Last Updated**: 2024  
**API Version**: 1.0.0

## Partner agent and platform billing API

Agent (token role `agent`): `POST /api/agent/login`, `GET/PUT /api/agent/me`, `PUT /api/agent/password`, `GET /api/agent/summary|schools|payments|commissions|payouts|policy`. Public: `GET /api/public/referral/:code`.

Owner (superadmin): `GET/POST /api/superadmin/agents`, `GET/PUT /agents/:id`, `POST /agents/:id/reset-password`, `POST /agents/:id/payouts`, `PUT /schools/:id/agent`, `GET/POST /payments` (send `Idempotency-Key`), `POST /payments/:id/refund`, `GET /commissions`, `POST /commissions/approve`, `POST /commissions/:id/void`, `GET /payouts`, `GET/PUT /commission-policy`, `GET /ledger`, `POST /ledger/reconcile`, `GET /audit`.

## Recovery proof, guardian rights and permissions (PRD E33, E05, E01)

Status codes: 403 not allowed, 404 not in this school, 409 changed by someone else, 422 not possible in the current state. Every change below writes an audit row.

**Owner (superadmin)**
- `GET /api/superadmin/ops/health` alerts (no backup, stale over 8 days, never proven, proof older than 30 days, failed jobs) and a per-school backup and proof state.
- `GET /api/superadmin/ops/backup-runs`, `GET /api/superadmin/ops/restore-drills` paged history (filter `schoolId`).
- `POST /api/superadmin/schools/:id/restore-drill` restores the latest backup into temporary sandbox tables, compares every row, returns each check. 422 when the school has no backup. Live data is never touched. The weekly cron also runs due drills.

**School admin: guardians** (`/api/guardians`)
- `GET /students/:studentId` links, implicit old-style links, restrictions. Reasons and court references are returned only to the admin who recorded them or to someone with `safeguarding.case.read`; others get `reasonHidden: true`.
- `POST /students/:studentId/links` `{ parentId | personName, relationship, rights, validFrom, validTo }`. A person without an account can only receive `pickup`.
- `PUT /links/:id` `{ rights, version }` returns 409 if `version` is stale; `POST /links/:id/end` `{ reason }`.
- `POST /students/:studentId/restrictions` `{ type: no-access|no-contact|no-pickup|no-fees, reason, referenceNo, validTo }`; `POST /restrictions/:id/end`.
- `POST /students/:studentId/pickup-verify` (admin or teacher) `{ parentId | personName }`. The reply is `Authorised` or `Denied` and never says why; every check is audited with the real reason.
- Rights enforced for parents on children, attendance, marks, fee summary and fee payment proofs, and on every notice fan-out.

**School admin: permissions** (`/api/permissions`)
- `GET /matrix`, `GET /people`, `GET /grants?source=break-glass|&active=1`.
- `POST /grants` `{ granteeId, granteeRole, action, classId, validTo, reason }`: scoped, at most 90 days, never to yourself.
- `POST /grants/:id/revoke` `{ reason }`.
- `POST /break-glass` `{ action: 'safeguarding.case.read', reason, minutes }`: at most 60 minutes, reason of a full sentence, every other admin is notified.

## Admissions CRM (PRD E04)

School admin: `/api/admissions` (`summary`, `capacity` GET/PUT, `inquiries` GET/POST/PUT, `applications` GET/POST, `applications/:id` GET/PUT, `/stage`, `/checklist/:key` (use `new` to add a document), `/duplicates`, `/enroll`). Public: `POST /api/public/schools/:code/inquiry` (creates an inquiry only, rate limited, honeypot field `website`).

Rules: every application has one source inquiry (siblings share one). Stages: New, Documents, Interview, Waitlisted, Offered, Accepted, Enrolled, Rejected, Withdrawn; invalid moves return 422, stale screens 409. An offer needs required documents verified, no undecided duplicate, and a free seat (else waitlist). The waitlist is first come first served; skipping needs a recorded reason. Enroll creates the student, the parent account and the guardian rights together and is idempotent.

## Fee collection (E06) — `/api/finance` (admin; parents use `GET /api/finance/me/family`)

Whole PKR. 403 not allowed (including approving your own request) · 404 not in this school · 422 not possible in the current state · 409 not used here.

| Method | Path | What it does |
|---|---|---|
| POST | `/invoices/generate` | `{classId \| studentIds, period, dueDate, itemKeys?, dryRun?}`. One invoice per student from unpaid installments and charges not already on a live invoice. Applies active discount rules. |
| GET | `/invoices`, `/invoices/:id`, `/invoices/:id/challan` | List (`status`, `studentId`, `overdue=1`, `search`), detail, three-copy challan data with the check-digit challan code. |
| POST | `/invoices/:id/void` | `{reason}`. Only while nothing has been paid. |
| POST | `/payments` | `{studentId, amount, method, reference?, invoiceId?}` with `Idempotency-Key`. Cash needs the caller's open till and is receipted at once. Other methods stay Pending until confirmed. |
| POST | `/payments/:id/confirm` | `{bankLineId}` (same amount) or `{proofId}` (approved) or `{reject:true, note}`. Allocates oldest due date first; any excess is kept as credit. |
| POST | `/students/:id/apply-credit` | Put unused credit on open invoices. |
| GET | `/payments/:id/receipt` | Immutable receipt `R-000001`. |
| POST | `/adjustments`, `/adjustments/:id/decide` | Credit note, write-off, refund. A different admin must approve. Refunds take back credit first, then newest allocations. |
| POST | `/rules`, `/rules/:id/decide` | Effective-dated concession, scholarship or sibling rule; approved by another admin before it applies. `decision:"end"` stops it. |
| POST | `/sessions/open`, `/sessions/:id/close` | Cashier till. Closing needs the counted cash and a note if it differs from expected. |
| POST | `/bank/import` | `{csv, fileName, dryRun?}`. Dedupes by file checksum and per-row fingerprint; suggests matches, never settles. |
| GET/POST | `/bank/lines`, `/bank/lines/:id/match`, `/bank/lines/:id/ignore` | Match to an invoice (creates a confirmed bank payment) or ignore with a reason. |
| GET/PUT | `/settings`, POST `/late-fees/run` | Grace days and late fee amount; one late fee per invoice. |
| GET | `/overview`, `/reconcile`, `/students/:id/statement`, `/families/:parentId/statement` | Totals, books check, statements. The parent family statement honours the `viewFees` guardian right. |

## Staff, leave and payroll (E07) — `/api/hr` (admin; teachers use `/api/hr/me/*` for their own record)

Whole PKR; dates are `YYYY-MM-DD`; Sunday is the weekly day off. 403 not allowed (including approving your own entry) · 404 not in this school · 409 stale or already exists · 422 not possible in this state.

| Area | Endpoints |
|---|---|
| People | `GET/POST /positions`, `PUT /positions/:id` (salary band; changes kept in history; `{retire:true}`) · `GET/POST /employees`, `GET/PUT /employees/:id` (`version` guard; salary must fit the position band) · `PUT /employees/:id/checklist/:key`, `POST /employees/:id/activate` (needs full checklist and a signed contract) |
| Contracts | `POST /contracts`, `/contracts/:id/sign` (one signed contract at a time; renewal ends the old), `/contracts/:id/end` |
| File | `POST /employees/:id/records` (`document`, `training` with `mandatory`, `appraisal` needs consented goals and written review), `POST /appraisals/:id/respond`, `GET /expiring?days=60` |
| Roster | `GET/POST /shifts`, `GET/POST /roster` (skips Sundays and approved leave; warns over 48 h/week), `POST /roster/publish` |
| Attendance | `GET/POST /attendance` (late is computed against the rostered shift; changing a recorded day needs a reason and is kept) |
| Leave and cover | `POST /leave`, `/leave/:id/decide`, `/leave/:id/cancel`; approved leave for a teacher creates one `CoverAssignment` per timetabled lesson. `GET /cover`, `/cover/:id/candidates`, `POST /cover/:id/assign` (no overlap, not on leave, mandatory training in date) |
| Overtime, advances | `POST /overtime`, `/overtime/:id/decide`; `POST /advances`, `/advances/:id/decide` (another admin decides; advances capped at N months of basic) |
| Payroll | `POST /payroll/rules`, `/payroll/rules/:id/review` (another admin or accountant, with a note; nothing statutory is built in), `POST /payroll/batches {period}` (prepare or re-prepare), `POST /payroll/batches/:id/finalize` (preparer cannot finalize; blocked while any rule is unreviewed; 409 if inputs changed), `GET /payroll/batches/:id/payslips/:employeeId` (audited) |
| Exit | `POST /settlements`, `PUT /settlements/:id/clear/:key`, `POST /settlements/:id/settle` (another admin; all clearance items done) |
| Teacher | `GET /me`, `GET /me/payslips/:id`, `POST /me/leave`, `POST /me/leave/:id/cancel`, `POST /me/appraisals/:id/respond` |

## Attendance operations (E08) — `/api/attendance-ops`

Dates are `YYYY-MM-DD` in the school's time zone. 403 not allowed (including deciding your own request) · 404 not in this school or not yours · 409 already decided or already exists · 422 not possible in this state · 428 consent needed first.

| Area | Endpoints |
|---|---|
| Policy | `GET/PUT /settings` (admin). `requireVerification`, `graceMinutes`, `caseThreshold`, `caseWindowDays`, `rollCallCutoff`, `selfCheckInEnabled`, `qrWindowSeconds`, `biometricPilot` (refused with 422 until QR check-in or a badge reader exists), device tolerances. `GET /overview` counts open work. |
| Alerts | `GET /alerts`, `GET /alerts/:id` (receipts), `POST /alerts/:id/verify`, `POST /alerts/:id/cancel {reason}`, `POST /alerts/dispatch`. An alert is sent only after it is verified and its wait has passed; a correction inside the wait cancels it; a correction after sending notifies the family. Only guardians with the `viewAttendance` right are told. |
| Receipts | `GET /me/alerts`, `POST /me/alerts/:id/ack {reply}` (parent or student). Delivered, read and acknowledged are separate fields; read is taken from the in-app notice. |
| Leave | `POST /leave {studentId, kind, fromDate, toDate, reason}` by a guardian, the student, the head master or the office; `kind` is Medical, Family, Religious, Other, or a mobility state: Exam, FieldTrip, Internship, Transfer (office only). `GET /leave`, `POST /leave/:id/decide {decision, note}` (never the requester), `POST /leave/:id/cancel`. Approving turns days already marked Absent into Leave; an Absent saved on a leave day is stored as Leave. |
| Corrections | `POST /corrections`, `GET /corrections`, `POST /corrections/:id/decide`. The original is copied onto the request; `GET /history/:studentId` lists every change with source, person and reason. |
| Follow-up | `GET /cases`, `GET /cases/:id`, `POST /cases/:id/notes`, `POST /cases/:id/status {status, outcome}`, `POST /cases/scan`. A case opens when absences reach the threshold in the window and is assigned to the head master. |
| Findings | `GET /anomalies`, `POST /anomalies/scan {date?}`, `POST /anomalies/:id/review {status, note}`. Kinds: MissingRollCall, EveryonePresent, PresentOnLeave, AbsentButAtGate, PresentNoGateEntry, PeriodClash, DeviceDrift, DeviceSilent. Nothing is changed automatically. |
| Period register | `GET /period/today` (teacher, includes lessons covered), `GET /period/roster`, `POST /period {classId, subjectId, startTime, endTime, records, mutationId?, capturedAt?}`, `GET /period/report`. A teacher must be scheduled (or cover) for that exact slot; the lesson window is judged by `capturedAt` for an offline register. |
| Class check-in | `POST /sessions`, `GET /sessions`, `GET /sessions/:id`, `GET /sessions/:id/code`, `POST /sessions/:id/close`, `POST /sessions/:id/approve-clean`, `POST /sessions/:id/evidence/:eid/decide`; student `POST /check-in {code, consent?, clientKey?}`. Codes rotate and are signed; a check-in waits for the teacher and records no location; two students on one `clientKey` are both flagged. |
| Consent | `GET/PUT /consent/:studentId {selfCheckIn, biometricOptOut}` (guardian, the student, or admin). |
| Devices | `GET/POST /devices` (key shown once), `POST /devices/:id/rotate-key`, `POST /devices/:id/status`, `PUT /badges/:studentId`, `GET /gate`. A reader signs in with `X-Device-Id` and `X-Device-Key` and calls `POST /device/heartbeat {deviceTime}` and `POST /device/events {events:[{badgeId, at, method, direction}]}` (up to 200). Events are evidence of entry only and never mark a lesson; unknown badges, future times, clock drift and suspect duplicates are named or flagged. |

Offline roll call: `POST /daily-attendance/class/:classId` and `POST /attendance-ops/period` accept a client-made `mutationId` (8-80 characters). The first arrival is applied; a replay returns the first answer with `replayed:true` and writes nothing. A failed save releases the id. The daily save also takes `arrivedAt` and `authorizedBy` for Late and HalfDay, and `GET /api/cron/attendance` (bearer `CRON_SECRET`) sends due alerts and scans every school.


## Gate, visitors, dismissal and drills (E09) — `/api/safety`

Staff routes need gate duty: admins by default, teachers only with a time-limited `safety.gate.operate` grant (`POST /api/permissions/grants`, up to 90 days). 403 not allowed (including approving your own request) · 404 not in this school or not yours · 409 already done (a child is released once a day) · 422 not possible in this state · 428 consent needed. Every change is audited.

| Area | Endpoints |
|---|---|
| Policy and desk | `GET/PUT /settings` (admin): gates, `inviteHours`, `requireId`, `idRetentionDays`, `badgeHours`, `maxVisitHours`, `walkInAllowed`, `contractorMaxHours`, `handoverAcceptMinutes`, `familyFallbackMinutes`, `notifyOnPickup`. `GET /overview` (duty), `GET /duty-staff`. Overview also runs housekeeping (expires invitations, flags overstays, erases ID details after the retention period); `GET /api/cron/safety` does the same nightly. |
| Visits | `GET/POST /visits` (staff, parents for their family), `GET /visits/:id`, `POST /visits/:id/decide {decision, override?, note?}`, `POST /visits/:id/invite` (code shown once, a new one replaces the old), `POST /visits/:id/cancel`, `POST /visits/:id/check-in {gate, idType, idNumber, purposeConfirmed, idChecked}`, `POST /visits/:id/check-out`, `GET /visits/:id/badge`, `POST /scan/lookup {code}`. A visit moves Requested, Approved, CheckedIn, CheckedOut (or Declined, Expired, Cancelled, Refused). A host's own visit is approved at once; nobody approves a visit they created, except reception on a walk-in with `override:true` and a note of 10+ characters. Only the last four characters of an ID are kept. Barred people get one generic refusal; the reason goes to admins. |
| Contractors | `GET/POST /contractors`, `POST /contractors/:id/decide` (a different admin from the creator), `POST /contractors/:id/credential` (code shown once), `POST /contractors/:id/revoke {reason}`, `POST /contractors/:id/move {direction, gate}`. Shift limit, gate and reader restrictions; leaving is never refused. |
| Readers | `POST /device/scan` with `X-Device-Id` and `X-Device-Key`: contractors are admitted inside their window and gates; visitors may leave; a visitor arriving is sent to the desk (202). |
| Gate log | `GET /gate-log`, `POST /gate-log` (manual entry needs a reason). Denied attempts are logged too. Gate entries never change classroom attendance. |
| Logbook | `GET/POST /logbook {kind, severity, text, gate}`, `POST /logbook/:id/resolve`. High severity tells admins. `GET/POST /handovers`, `POST /handovers/:id/decide {decision: accept\|dispute}`: only the named person can accept, open items are carried over, one pending handover per gate. |
| Dismissal | `GET /dismissal/classes`, `GET /dismissal/roster?classId`, `POST /dismissal/check {studentId, collectorKind, ...}`, `POST /dismissal/release`, `POST /dismissal/exceptions` (phoned guardian's name, reason 10+) and `POST /dismissal/exceptions/:id/decide` (a second admin; restrictions re-checked), `POST /dismissal/override` (admin only, reason 15+, never for a restricted person, reviewed by another admin via `POST /dismissal/events/:id/review`), `GET /dismissal/events`, `GET /dismissal/mine` (family). A restriction always wins, then the guardian link, then a one-day alternate. Every refusal returns the same wording to the person at the gate; the real cause is visible to admins only. A child marked absent today needs `overrideAbsent` and a reason (422 `absent-today`). Release marks a half day with the time and who authorised it, tells the family, and updates attendance alerts. |
| Alternates | `GET/POST /dismissal/authorizations` (parent with the pickup right, or admin who phoned a guardian: `confirmedWith`), `POST /dismissal/authorizations/:id/revoke`. One person, one child, one day, up to 7 days ahead; a 6-digit code is shown once and only its hash is kept. |
| Drills | `POST /drills {kind, title, assemblyPoint, real}` (one open at a time), `GET /drills`, `GET /drills/current`, `GET /drills/:id`, `GET /drills/:id/roster` (class head counts; teachers count their own class), `POST /drills/:id/muster {classId, marks, allSafe}`, `POST /drills/:id/others/:lineId`, `POST /drills/:id/notify-families` (only for students marked Safe), `GET /drills/:id/fallback` (phone list), `POST /drills/:id/close {summary, forceReason?}` (blocked while anyone is unaccounted for unless `forceReason`), `POST /drills/:id/sign` (a different admin), `POST /drills/:id/actions`, `POST /drills/:id/actions/:index/done`. |

Not in this release: a separate guard login (gate duty is given to an admin or a granted teacher), SMS and WhatsApp (notices are in-app and push, with a phone-call list as fallback), identity checks on readers for visitors (sent to the desk), camera, transport and health links (later epics).

## Timetable planning, rooms, cover and swaps (E10) — `/api/timetable-ops`
Gated by the `timetable` module. Admins manage everything; teachers use `/mine`, `/colleagues`, `/lessons`, `/cover/:id/respond` and the swap routes.

| Area | Routes |
|---|---|
| Overview | `GET /overview` (conflicts, workload exceptions, cover needed/proposed, swaps waiting, rooms) |
| Rooms | `GET/POST /rooms {name, kind, capacity, equipment, homeClassId, notes}`, `PUT /rooms/:id`, `POST /rooms/:id/active {active}`, `GET /rooms/free?day&startTime&endTime`, `GET /rooms/:id/schedule`. A room can never be booked twice, even with `force`. A room that is on the timetable cannot be renamed (409). With no rooms listed, a free-text room is still accepted |
| Checks | `GET /conflicts` (teacher/room double bookings plus capacity, kind, inactive and unknown room warnings), `GET /workload` (per teacher per day, free periods, longest run, cover counts, exceptions against the school limits) |
| Versions | `GET /versions/status`, `GET /versions`, `POST /versions/publish {note, effectiveFrom}` (422 while a double booking exists or nothing changed), `GET /versions/:id?classId`, `POST /versions/:id/restore`. A published version is an immutable snapshot with a per-class diff; only teachers and families whose lessons changed are notified |
| Cover | `GET/POST /cover` (ad-hoc cover; leave cover from E07 also appears), `GET /cover/:id/candidates` (ranked: knows subject, knows class, fewest covers in 30 days, lightest day; excluded list with reasons), `POST /cover/:id/propose {teacherId}`, `POST /cover/:id/decide {decision}` (a **different** admin; 403 for the proposer), `POST /cover/:id/release {cancel?}`, `POST /cover/:id/respond {response: Accepted|Declined, note}` (the covering teacher) |
| Teacher | `GET /mine?from` (week with lesson states normal/covered/cover-needed/cover), `GET /colleagues`, `GET /lessons?date&teacherId` |
| Swaps | `GET/POST /swaps {date, peerId, myLesson, peerLesson, reason}`, `POST /swaps/:id/respond {response}` (peer), `/decide {decision}` (admin), `/cancel`. Requested → PeerAccepted → Approved; approval creates two swap covers |

Generator: `POST /api/timetables/generate` keeps manual (locked) periods by default (`keepManual:false` starts clean) and returns `preservedManual, droppedManual, roomsPlaced, roomsUnplaced`. Config also takes `maxPeriodsPerDay`, `maxPeriodsPerWeek`, `maxConsecutive`; `Subject.roomKind` restricts a subject to a room kind.

Not in this release: the live timetable is visible to everyone before publishing (publishing records a version and notifies); cleared periods are refilled by the generator; leave cover is still assigned in the HR flow (no second-admin step there); no notice to families for one-off covers; teacher availability is lessons, leave, training and the daily limit only.

## Teacher Today and offline sync (E11) — `/api/sync`, `/api/teacher-today`
A change made on a device with no network is queued with a client-made `mutationId`. On reconnect the device sends it once; the server applies each id once, compares it with what changed meanwhile, and sends clashes to an inbox.

| Area | Routes |
|---|---|
| Push | `POST /sync/push {mutations:[{mutationId, kind, entityKey, baseRevision, capturedAt, payload}], deviceId}` (max 50). Per item result: `Applied`, `Partial`, `Conflicted`, `Rejected` (with the reason), `Retry` (not recorded, send again). A replay returns the first answer with `duplicate: true`. Kinds: `draft`, `marks`, `attendance` (daily roll call), `period` (lesson register) |
| Compare | Registers and marks use a three-way compare: `base` is what the device last saw. If the server value equals `base` the change applies; if it equals the new value nothing changes; otherwise that student or mark becomes a conflict while the rest are applied. Drafts use a revision number (`baseRevision`). Who may write is checked before any comparison, so a clash never reveals data the person could not write |
| Pull | `GET /sync/pull?since`, `GET /sync/mutations` (history of what this person sent) |
| Drafts | `GET /sync/drafts`, `POST /sync/drafts/:localId/publish` (homework only; 422 if class, subject, due date or title missing; 409 if already published), `POST /sync/drafts/:localId/discard` |
| Clashes | `GET /sync/conflicts?status=Open|Resolved`, `POST /sync/conflicts/:id/resolve {resolution: mine|server|merged, value, note}`, `POST /sync/conflicts/:id/delegate {to:'office'}` or `{teacherId}`. The owner, the person it was handed to, or an admin may act; a clash handed to the office can only be settled by the office (403 for the owner). Resolving writes through the same rules as a live save (head master only, edit windows, assignment) and a refused resolution leaves the clash open. The owner is told when someone else settles it |
| Office | `GET /sync/overview` (integrity %, counts, open clashes by teacher, devices), `GET /sync/rejections` |
| Today | `GET /teacher-today` (lessons with register progress, class roll calls, marking, exam marks missing, cover and swaps waiting, drafts, counts), `GET /teacher-today/pack` (the same plus rosters, what is already marked, existing marks, drafts and an expiry, to be kept on the device) |

The app shell is cached by the service worker so Today reopens offline; `/api` is never cached by it. A queued change is shown as "waiting on this device", never as saved. Daily and lesson registers are still validated by the E08 rules (future dates, lesson windows judged by capture time, who is scheduled).

Not in this release: a lesson register for a student in two lessons of the same subject on a day still keeps one record (E08 limit); no background sync when the app is closed (the queue is sent when the app is next open and online); the offline copy holds rosters in the browser's storage until sign-out.

## Documents studio (E12) — `/api/studio`

Templates, review, issuing, print queue and pictures for ID cards, staff badges, visitor passes, report cards, transcripts, certificates, fee challans, invoices, receipts, letterheads, library cards and letters. Permissions: `documents.template.manage`, `documents.issue`, `documents.print` (admin by default; others by grant). Every change is audited.

| Area | Endpoints |
|---|---|
| Catalog | `GET /catalog` (families, merge fields, papers, default theme), `GET /overview` (counts and the caller's `can` flags) |
| Templates | `GET /templates?preview=1` (adds a front-side preview of the live design), `POST /templates {name, family, basedOnId}`, `GET /templates/:id`, `POST /templates/:id/duplicate`, `POST /templates/:id/archive {archived}`, `POST /templates/import` (file; the package must state its licence), `GET /templates/:id/versions/:vid/export` |
| Versions | `POST /templates/:id/versions` (new draft), `GET|PUT|DELETE /templates/:id/versions/:vid`, `POST .../submit`, `.../approve`, `.../reject {note}`, `GET .../proof?locale=&subjectId=&term=` (PDF), `POST /validate {family, layout, theme}` (live checks: contrast, safe area, QR/barcode content, licences) |
| Pictures | `GET /assets`, `POST /assets` (PNG/JPEG, 2 MB, with licence), `PUT /assets/:id/license`, `POST /assets/:id/verify`, `POST /assets/:id/retire` |
| Issuing | `GET /subjects?family=&q=&classId=`, `POST /issue {templateId, subjectIds, custom, term, validUntil, locale}` (up to 200), `GET /issuances`, `GET /issuances/:id`, `GET /issuances/:id/pdf`, `GET /issuances/:id/snapshot` (the stored copy for PNG export), `POST /issuances/:id/revoke {reason}`, `POST /issuances/:id/replace {reason}` |
| Print | `GET|POST /batches`, `GET /batches/:id`, `GET /batches/:id/pdf?scope=pending|all`, `POST /batches/:id/start`, `.../results {allOk | results:[{itemId, ok, errorCode}]}`, `.../retry`, `.../items/:itemId/cancel {reason}`, `.../cancel {reason}` |
| Family | `GET /my/documents`, `GET /my/documents/:id/pdf` (student, or a linked parent with the right to see the child's information, marks or fees) |
| Public | `GET /api/public/verify/:token` (no sign-in, rate limited): status, school, document, masked holder, number, dates |

Rules worth knowing: an Aulensia original cannot be edited, only copied; a different administrator approves (a sole administrator may approve their own, recorded as such); a design with an error, or a picture without a cleared licence, cannot go live; an issued document is a frozen copy (values, layout, theme, photo) and prints identically after later template or record changes; one valid ID card, library card or staff badge per person; the QR code carries only the check link and the barcode only the number; a batch holds one paper size; a revoked or replaced document is dropped from open batches.

Front end: admin "Documents studio" (also in the teacher dashboard for anyone granted a documents permission), "My documents" for students, "Documents" for parents, and the public `/verify/:token` page.

## Quizzes and online exams (E13) — `/api/assess`
Staff routes need an administrator or teacher sign-in; a teacher works only on the classes and subjects they teach. Student routes (`/take/*`) are for students, `/take/family` is for parents.

| Area | Routes |
|---|---|
| Question bank | `GET /bank/meta`, `GET /bank?q=&kind=&state=&topic=&difficulty=&bloom=&mine=1`, `POST /bank`, `GET|PUT|DELETE /bank/:id`, `POST /bank/:id/activate|retire|duplicate`, `POST /bank/:id/share {sharing}`, `POST /bank/notation {text}` (tokens, spoken form, plain text) |
| Types | `mcq`, `multi`, `tf`, `short`, `essay`, `match`, `order`, `numeric`. Options, pairs, accepted answers, numeric tolerance, part marks, negative marks, rubric, Urdu stem, topic, difficulty, thinking level, learning goal, licence |
| Package | `GET /bank/export?ids=` (only questions the school wrote or that are openly licensed), `POST /bank/import {format, items, licenseStatement}` |
| Rubrics | `GET|POST /rubrics`, `PUT /rubrics/:id`, `POST /rubrics/:id/archive` |
| Quizzes | `GET|POST /quizzes`, `GET|PUT|DELETE /quizzes/:id`, `POST /quizzes/:id/blueprint/preview|apply`, `POST .../submit-review|publish|approve|reject|close|archive|extend`, `GET .../paper?key=0|1`, `POST .../authorize-key {reason}`, `GET .../invigilator-code`, `GET .../roster`, `POST .../release {mode, at, force, reason}`, `GET .../analysis`, `POST .../analysis/apply` |
| Taking | `GET /take/available`, `POST /take/:id/start {identity}`, `GET /take/attempts/:id`, `PUT /take/attempts/:id/save {answers, seq, focus}` (returns a signed receipt), `POST /take/attempts/:id/submit {answers, receipt}`, `GET /take/attempts/:id/result`, `POST /take/attempts/:id/appeal {reason, refs}`, `GET /take/results`, `GET /take/family` |
| Marking | `GET /grading/queue`, `GET /grading/attempts/:id`, `POST /grading/attempts/:id/items/:ref/mark {score | criteria, comment}`, `POST .../incidents`, `POST .../void` (administrator) |
| Appeals | `GET /appeals`, `POST /appeals/:id/decide {decision: uphold|reject|revise, note, changes:[{ref, score}]}` |
| Arrangements | `GET|POST /access`, `POST /access/:id/decide` (administrator), `POST /access/:id/revoke` (administrator) |

Rules worth knowing:
- **Versions.** A question used in a published quiz is locked. Changing it makes a new version with a change note; the published quiz keeps the old one exactly.
- **Quizzes and exams.** The author can publish a quiz. An exam is sent for review and a different administrator approves it (a sole administrator may approve their own, recorded as such). An exam needs an opening and closing time and the window must be at least as long as the time allowed.
- **Sealing.** Before an exam opens, or while a quiz is open, the paper and answer key return **423**. After the closing time an administrator can release them early with a reason. While a quiz is open the teacher view shows no key.
- **Variants.** Each attempt gets a seed that rebuilds the same paper (question and choice order) later, so an appeal can show exactly what the student saw.
- **Clock.** The deadline is set by the server when the attempt starts (extra time from an approved arrangement included) and is never taken from the phone. Autosave returns a signed receipt. After the deadline, saves are refused (**422**). A hand-in made up to the offline grace period late is accepted only with a valid receipt for the answers the server holds, and is flagged as late because of the connection; otherwise only what was saved in time is marked. Answers sent with a late hand-in are ignored. An abandoned attempt is handed in by the server.
- **Identity.** Sign-in, admission number, or the invigilator's daily six-digit code. Five wrong checks in an hour return **429**.
- **Marking.** Closed questions mark automatically (partial and negative marks as set). A short answer that does not match is flagged for the teacher instead of being marked wrong. With two markers the second cannot see the first mark or the student's name; if the marks differ by more than the set percentage a third person who has not marked it decides. A finished result is signed (HMAC) and carries a version.
- **Release.** Results stay hidden from students and parents until released. A release is refused while the quiz is open or marking is unfinished, unless an administrator forces it with a reason. Exam results are released by an administrator. A scheduled release takes effect at its time.
- **Appeals.** Within the appeal period; one open appeal per result; the reviewer cannot be anyone who marked the work. A revision creates a new signed result version and records before, after and the changed marks.
- **Arrangements.** Extra time, large text, read aloud, separate room, extra attempts, and make-up windows. A teacher requests, an administrator approves. The reason is visible only to the requester and administrators and never reaches the paper or the class.
- **Privacy.** The student is told exactly what is recorded: answers and save times, and window focus changes as a note. No camera, microphone or screen recording.
- **Parents.** `GET /take/family` shows released results only for children whose guardian rights include marks.


## Paper exams: answer-sheet scanning (E14) — `/api/omr`
Administrators and teachers (a teacher works only on classes and subjects they teach). Photos are JPEG data URLs up to about 900 KB; the phone shrinks and checks them first, and the server reads them again.

| Area | Routes |
|---|---|
| Answer sheets | `GET|POST /forms`, `GET|PUT /forms/:id`, `POST /forms/:id/archive|candidates`, `GET /forms/:id/layout`, `GET /forms/:id/sheet?mode=blank|named&copies=` (PDF) |
| Answer key | `POST /forms/:id/key {answers, reason}`, `GET /forms/:id/key/history`. Letters, `(BC)` for two accepted answers, `*` credits everyone, `-` drops the question. Changing a key needs a reason and regrades unpublished sittings |
| Sittings | `POST /forms/:id/batches {title}`, `GET /batches?status=&formId=`, `GET /batches/:id` (counts, absent candidates, sheet settings) |
| Sheets | `POST /batches/:id/scans {image, source, capturedAt, rescanOf}`, `GET /batches/:id/scans?status=`, `GET /scans/:id` (answers, fills, thresholds, history), `GET /scans/:id/image?kind=photo` |
| Checking | `POST /scans/:id/review {decisions:[{q, final}], candidate, accept:[flag], reason}`, `POST /scans/:id/reject {reason}` |
| Grading | `POST /batches/:id/grade|submit|note|approve|reopen|publish|regrade-published`, `GET /batches/:id/moderation`, `GET /batches/:id/export` (CSV) |

Rules worth knowing:
- **What the reader decides.** Each question is `ok`, `blank`, `multiple`, `faint` or `low`. Anything but `ok`/`blank` waits for a person. Candidate number and sheet code are read the same way. Thresholds are per sheet (defaults: filled 0.5, faint 0.22, gap 0.3).
- **Photo checks.** Blurry, too dark, low contrast, mostly blank, wrong sheet, unknown or duplicate candidate block grading until a person accepts them with a reason (wrong sheet can only be rejected). Missing corners ask for a new photo (**Rescan**). Tilt, rotation (any of four ways up), slight misalignment only warn.
- **Decisions are kept.** Every correction stores who, when, the reader's answer, the final answer and the reason.
- **Grading.** Right answers earn the sheet's marks, wrong ones lose the negative marks, blanks score zero, and a total never goes below zero. Grading is refused while any sheet needs a person (**422**). Results are deterministic and carry a hash.
- **Moderation.** Spread of marks, unusual sheets, how each question went, and questions where nearly everyone chose one wrong answer (suspect key). Notes and history are kept.
- **Approval.** A different administrator from whoever graded, sent, created or corrected (a sole administrator may approve and it is recorded). **Publish** writes ordinary marks scaled to the exam's total and tells students and guardians who may see marks. Published sittings changed by a later key revision are flagged and changed only by `regrade-published` with a reason.
- **Status codes.** 403 denied, 404 not in your school, 409 already done or layout locked, 422 wrong state, 428 consent, 429 rate limit.

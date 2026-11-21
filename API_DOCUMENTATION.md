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

## Nursery and early years (E15) — `/api/early`
Administrators manage rooms, settings and frameworks. A room's lead and carers work only in their own room. Parents use `/family/*` for linked children only. Photos are JPEG data URLs (the phone shrinks them first); activity audio is a data URL up to 1 MB and must have a transcript.

| Area | Routes |
|---|---|
| Settings and rooms | `GET|PUT /settings` (children-per-adult figures, nap alert, photo size, arrival and collection notices), `GET /overview`, `GET|POST /rooms`, `GET|PUT /rooms/:id`, `POST /rooms/:id/archive|children|presence/in|presence/out`, `GET /rooms/:id/safety-card|coverage`, `GET /children/search`, `DELETE /children/:id/placement` |
| Ratios | `GET /ratios`, `GET /ratio-events`, `POST /ratio-events/:id/ack` |
| Arrival and collection | `POST /check-in|check-out|absent` (release uses the same collection checks as the gate; a refusal always reads "Do not release the child. Ask the person to wait and call the principal.") |
| Care log | `POST /care/bulk` (one tap, many children, `clientKey` makes a repeat harmless), `GET /care`, `POST /care/:id/correct|void|discussed` |
| Child profile | `GET /children/:id/profile|collectors|timeline|progress|practice`, `PUT /children/:id/consent` (office consent needs who gave it), `POST /profile/pending/:pid` (confirm a family's update) |
| Family diary | `POST /media`, `GET /media/:id/image`, `GET|POST /posts`, `POST /posts/generate`, `PUT /posts/:id`, `POST /posts/:id/submit|review|retract` |
| Learning | `GET /frameworks`, `POST /frameworks/:id/copy|publish|archive`, `PUT /frameworks/:id`, `GET|POST /observations`, `POST /observations/:id/void`, `GET|POST /activities`, `POST /activities/:ref/copy|publish|archive`, `POST /activities/:id/audio`, `GET|POST /plans`, `POST /plans/:id/done|skip`, `GET /icons`, `GET|POST /routines`, `GET|POST /practice`, `GET /worksheets/tracing|observation` (PDF) |
| Pickup changes | `GET|POST /pickup-changes`, `POST /pickup-changes/:id/verify|apply|decline` |
| Family | `GET /family/children`, `GET /family/children/:id/feed|profile|consent|routine|pickup`, `POST /family/children/:id/profile|pickup`, `PUT /family/children/:id/consent`, `POST /family/posts/:id/read`, `POST /family/pickup/:id/cancel` |

Rules worth knowing:
- **Ratios are the school's own.** Children per adult are editable and are not presented as legal minimums. A room short of adults raises an event, notifies the lead and administrators, and stays on record until acknowledged.
- **A second person checks every diary.** The turn-off setting does not exist. If the lead is the only person who can review, that is recorded.
- **Photos go out only inside a reviewed post, for children whose family agreed.** Withdrawing consent hides existing photos from the family straight away.
- **Behaviour notes** can be shared only after staff record that they were talked over with the family (`discussedAt`).
- **No scores, ranks or leaderboards.** Observations use Exploring, Practising and Confident; practice effort uses Exploring, Following and Steady.
- **Built-in content** is original: a 37-milestone, five-area framework and 26 activities (`aul:` references). Copy to edit; content of unknown licence cannot be published, and content not written by the school is published only by an administrator.
- **Pickup people.** A family can ask to add, pause or remove a collector, but nothing applies until staff record how they confirmed it (call-back, in person or signed form) and with whom. Pause ends the link and starts a new one from the return date. Named collectors hold no guardian rights except collection.
- **Safety.** Under-three activities with small parts need an adult close by. Each entry records who wrote it.
- **Status codes.** 400 invalid, 403 denied, 404 not in your school, 409 already done, 422 wrong state, 428 consent.

## Family communication (E20) — `/api/comms`
Messages, the family help desk, parent-teacher meeting days, quiet hours and bilingual (English/Urdu) delivery. Behind the plan feature `messages`. Administrators run the school office inbox, help desk, meeting days and settings; teachers write only about children they teach; parents use only their own children. Who may be contacted follows the guardian rights in E02 (`receiveMessages`, `receiveNotices`, contact restrictions).

| Area | Routes |
|---|---|
| Settings and preferences | `GET|PUT /settings` (admin: quiet hours, working days and hours, reply and resolution deadlines per priority, auto-close and reopen days, meeting defaults), `GET|PUT /prefs` (anyone: language `en`/`ur`, own quiet hours, phone alerts on/off), `GET /overview` (counts for the badges; also runs a throttled sweep for staff), `POST /sweep` (admin) |
| Who can I write to | `GET /family/children` (parent), `GET /contacts?studentId` (parent: school office and the child's teachers), `GET /students?q` (staff: child search with contactable parents) |
| Messages | `GET|POST /threads` (`box=all|unread|waiting|closed`, `q`, `scope=office|teachers|all` for admin), `GET /threads/:id`, `POST /threads/:id/messages|read|close|reopen`, `POST /threads/:id/messages/:mid/remove` (admin, reason shown to the family), `GET /threads/:id/deliveries` (admin) |
| Help desk | `GET|POST /tickets` (parents raise; admin lists with `status`, `category`, `priority`, `assignee=me|none`, `breach=1`, `q`), `GET /tickets/:id`, `POST /tickets/:id/comments|status|assign|priority|rate`, `GET|POST /canned`, `PUT|DELETE /canned/:id`, `GET /helpdesk/report?days`, `GET /helpdesk/admins` |
| Meeting days | admin: `GET|POST /ptm`, `GET|PUT /ptm/:id`, `POST /ptm/:id/publish|close|cancel|nudge`, `GET /ptm/:id/unbooked`; staff: `GET /ptm/:id/slots`, `POST /ptm/slots/:sid/block|unblock|done|noshow|cancel`; family: `GET /ptm/family`, `GET /ptm/family/:id/slots?studentId`, `POST /ptm/slots/:sid/book|cancel` |
| Housekeeping | `GET /api/cron/comms` (bearer `CRON_SECRET`; sweeps every school) |

Rules worth knowing:
- **One conversation per family, child and teacher (or the office).** Starting one that exists adds to it (`existing: true`). `clientKey` makes a retried send harmless. At most 30 messages an hour per sender.
- **Two languages.** The sender may add a translation; each reader sees their own language first (`text`, with `alt` when both exist). Alerts are sent to each person in their own language.
- **Quiet hours are enforced for every alert, not just messages.** The in-app notification is always immediate; only the phone push waits. Safety alerts and urgent messages (administrators only, with a reason) are never held. Held pushes are released by the sweep.
- **Deliveries are tracked and retried** (3 tries, 5, 30 and 120 minutes apart). Admins see the state of each.
- **Deadlines count working time only** (default Mon–Sat 08:00–15:00) and pause while a request is *Waiting on family*; the paused time is added back to the due date. A breach is raised once, with an event and an alert.
- **Help desk.** Numbers look like `HD-2026-00001`. Safety concerns are urgent and visible to administrators only; health concerns start high. A priority change needs a reason and is audited. A resolved request closes itself after `autoCloseDays`; the family can reopen within `reopenDays`. Internal notes are never shown to families.
- **Meeting days.** Publishing creates a slot per teacher per session. Booking is a conditional write, so two families racing for one time cannot both get it; a family cannot hold overlapping times, book the same teacher about the same child twice, or exceed the day's limit. Families can cancel until `cancelHoursBefore`; staff cancel with a reason and the family is told. The teacher's private note is never shown to the family; the summary is.
- **Reading a teacher's conversation as an administrator is recorded** in the audit log.
- **Status codes.** 400 invalid, 403 denied, 404 not in your school or not yours, 409 conflict (already booked, limit, closed), 422 wrong state, 429 rate limit.

## Student care (E21) — `/api/care`
Support cases, concerns, health and medicine, adjustments, appointments, goals, mentors, career pathways, staff training, emergency access and privacy requests. Staff reach the screens as **Student care**; parents as **Wellbeing**; students as **Wellbeing & support**. Permissions come from the permission fabric (`care.case.work`, `care.safeguarding.lead`, `care.health.manage`, `care.counsel`, `care.privacy.manage`); administrators hold them all.

| Area | Routes |
|---|---|
| Who am I here | `GET /me` (what this person can do), `GET|PUT /settings` (admin), `GET /overview`, `GET /students?q=` (staff search), `GET /staff` |
| Cases | `GET|POST /cases`, `GET|PATCH /cases/:id`, `POST /cases/:id/status|notes|actions|actions/:aid|referrals|referrals/:rid|circle|close|close/approve|reopen|access-request`, `DELETE /cases/:id/circle/:pid` |
| Emergency access | `POST /access-request` (by case number), `GET /access-requests|access-requests/mine`, `POST /access-requests/:id/decide|revoke`, `GET /access-log` |
| Concerns | `POST /reports` (everyone; `anonymous` allowed for students and parents; returns a receipt `code`), `GET /reports/status?code=`, staff: `GET /reports`, `GET /reports/:id`, `POST /reports/:id/reply|dismiss|convert` |
| Health | `GET /health/summary|alerts|proposals|plan/:studentId|medication/today|incidents`, `PUT /health/plan/:studentId`, `POST /health/plan/:studentId/medications|proposal`, `PUT /health/plan/:studentId/medications/:mid`, `POST /health/medication/log`, `POST /health/incidents` |
| Families | `GET /family/health`, `POST /family/health/proposal` (parent), `POST /family/medication-consent` (parent), `GET /family/support` |
| Support | `GET|POST /accommodations`, `POST /accommodations/:id/decide|end`, `GET /accommodations/class/:classId`, `GET /class/:classId`, `GET|POST /goals`, `POST /goals/:id/review`, `GET|POST /appointments`, `POST /appointments/:id/schedule|status`, `GET|POST /mentors`, `POST /mentors/:id/meeting|end`, `GET /careers/pathways`, `GET|PUT /careers/:studentId` |
| Training | `GET|POST /training` |
| Privacy | `GET|POST /privacy` (families and students raise), `POST /privacy/:id/decide` (`review`, `fulfil`, `refuse`), `GET /privacy/:id/export` |
| Housekeeping | `GET /api/cron/care` (bearer `CRON_SECRET`; escalates unled cases and unseen concerns, flags reviews and expiring training, closes lapsed emergency access) |

Rules worth knowing:
- **Confidential cases (safeguarding, bullying)** are visible only to their lead, circle, opener and safeguarding leads. Ordinary case rights never reach them. Every read is logged.
- **Emergency access** needs a different safeguarding lead to approve, lasts at most 60 minutes, is read-only and is recorded. A lead who is the only one may open it themselves; that is marked as sole approval.
- **Closing a confidential case** needs a second lead to sign off (or a recorded sole sign-off). An adjustment needs a coordinator other than its proposer (or a recorded sole approval).
- **Teachers must hold current safeguarding training** to join or lead a confidential case.
- **Anonymous concerns** store no person, only a hash of the receipt code. The code is the only way back to the reply. There is a daily limit per person.
- **Medicine is given only with a parent's consent**, once per slot per day. Changing the name, dose or times removes the consent. Teachers see an emergency alert view only; every full plan read is logged.
- **Counselling is private.** Sessions are not shown to parents or other staff, and the reason is only shown to the counsellor.
- **Privacy requests** have a due date. An access export leaves out cases, notes, concerns and counselling reasons. Erasure removes goals, careers and past appointments and keeps the health plan and any cases under a legal hold, and says so.
- **Status codes.** 403 denied, 404 not in your school or not yours, 409 conflict (already decided or closed), 422 invalid, 423 locked (training lapsed), 428 second person needed, 429 rate limit.

## Brand, theme, web address and wording (E27) — `/api/theme`, `/api/public/brand`

A school's look is a list of safe tokens (two hex colours, light/dark/system, corner style, font), never free CSS. Every colour in the app is a variable (the build rewrites the Tailwind colours), so one published theme recolours all four portals, and dark mode works the same way.

| Route | Who | What |
|---|---|---|
| `GET /api/theme/current` | all school roles | Live theme `{version, tokens, publishedAt, note}`; version 0 is the standard look. Never cached (`no-cache`). |
| `GET /api/theme` | admin | Live version, the draft (if any) and the last 40 versions |
| `POST /api/theme/check` | admin | Run the contrast checks on `{tokens}` without saving |
| `POST /api/theme/draft` | admin | Start a draft from the live theme, or from `{fromVersion}`. 409 if one exists |
| `PUT /api/theme/draft` | admin | Change draft tokens `{tokens, note}`. A bad colour, mode, corner style or font is refused (422), not replaced. Returns the report |
| `DELETE /api/theme/draft` | admin | Discard the draft |
| `POST /api/theme/draft/publish` | admin | Publish `{note}`. 422 with the report when any of the seven checks fails. The old live version is archived |
| `POST /api/theme/versions/:id/rollback` | admin | `{reason ≥ 5}`. Publishes a copy of that version as the newest one (history is never rewritten) |
| `GET/POST /api/theme/domains`, `POST …/:id/verify`, `POST …/:id/activate`, `DELETE …/:id` | admin | Web addresses. Adding needs the `whiteLabel` plan feature (Premium). Up to 5 per school |
| `GET /api/theme/i18n/overrides` | all school roles | The school's own Urdu wording `{ur: {English: Urdu}}` |
| `POST /api/theme/i18n/missing` | all school roles | `{labels: [≤30]}`: counts labels that had no Urdu. Only label-like text is kept (see rules). |
| `GET /api/theme/i18n?q=` | admin | Wording and the open missing-label list |
| `PUT /api/theme/i18n/overrides`, `DELETE …/overrides/:id`, `POST …/missing/:id/dismiss` | admin | Set, remove, ignore |
| `GET /api/public/brand?host=` | public (rate limited) | Which school owns an address: name, code, logo, motto and theme tokens only. 404 for unknown, pending, failed or removed addresses |
| `GET /api/cron/theme` | cron secret | Re-checks live custom addresses; marks failures and tells administrators once |

The seven checks: primary on white, white on primary (buttons), primary on the page background (all 4.5:1), accent on white (3:1), primary printed in grey (4.5:1), primary and accent distinguishable in grey (1.3:1), and the automatically lightened primary on the dark surface (4.5:1). `report.suggestion` is the nearest darker shade that passes everything.

Rules worth knowing:
- **Web addresses.** A single label under `ROOT_DOMAIN` (not a reserved name such as `www`, `admin`, `api`) is live at once. Any other name is a custom address: prove ownership with a TXT record at `_aulensia.<host>` (value `aulensia-verify=<token>`), then point a CNAME at `CNAME_TARGET` (default `cname.<ROOT_DOMAIN>`). IP addresses, localhost, test names and hosting addresses are refused. At most 10 checks an hour per address (429). Hosting the address on the platform (adding the domain to Vercel) is a separate step for the platform owner.
- **Missing-label privacy.** The browser only sends short text found in buttons, headings, column titles and tabs. The server drops anything with digits, `@`, slashes, markup, more than seven words or the shape of a person's name, ignores labels already translated, and caps requests (30), people (120 an hour) and labels per school (1,500). Counts are per school, never per person.
- **Wording overrides.** Plain text only (no `<` or `>`), the same `{placeholders}` as the English label; text without Urdu letters is saved with a warning. A school's wording is applied before the built-in dictionary.
- **Documents.** Studio documents take the school's published colours unless the design sets its own.
- **Status codes.** 403 denied or plan feature off, 404 not found or not your school, 409 draft exists, address taken, already live, 422 invalid or checks failed, 429 too many address checks.

## Website leads, quotes, invoices, support and proof (E28)

### Public (no sign-in) — `/api/public`
| Method | Path | What it does |
|---|---|---|
| POST | `/leads` | Ask for a demo, quote or answer. Needs `name`, `email`, `schoolName` and `consent: true`; optional `phone`, `city`, `role`, `students`, `interest` (`demo`/`quote`/`question`), `message`, `preferredTime`, `refCode` (partner code), `utmSource/utmMedium/utmCampaign`. A filled hidden `website` field is treated as a robot and silently ignored. The same email or phone (last 10 digits) within 90 days is one lead with `requests` counted up. Limits: 10 requests/hour/route and 5 new leads/hour per address. Only a hash of the address is stored. |
| GET | `/proposal/:token` | The buyer's view of a quote (and its invoice and payment details once accepted). `Cache-Control: no-store`. A wrong or withdrawn link is 404. |
| POST | `/proposal/:token/accept` | `{name, email, agree:true}`. A conditional write makes two clicks one acceptance. Creates one invoice for the exact quote total and records who accepted, when, from which address hash, and a hash of the terms. |
| POST | `/proposal/:token/decline` | `{reason?}`. |
| GET | `/proof` | Published, consented, in-review-date customer words only. Empty by default. |

### Owner — `/api/superadmin/sales/...` and `/api/superadmin/support/...`
- `GET sales/pipeline` counts, conversion (90 days), sources, open quotes and unpaid/overdue invoices.
- `GET sales/leads?status&q&agentId`, `GET/PATCH sales/leads/:id` (status, `lostReason`, `demoAt`, `ownerNote`, `logContact`), `POST sales/leads/:id/convert` (creates the school and its administrator; the temporary password is returned once). `Won` is set only by a paid invoice.
- `POST/GET sales/quotes`, `GET/PATCH sales/quotes/:id` (drafts only), `POST sales/quotes/:id/send` (returns the private link once; only a hash is stored), `POST sales/quotes/:id/withdraw`. Discounts are 0–50% and need a reason; plan prices come from the plan list.
- `GET sales/invoices?status&overdue=1`, `POST sales/invoices/:id/pay` (same payment path as every other subscription payment, so ledger, plan, expiry and agent commission follow; the invoice id is the idempotency key), `POST sales/invoices/:id/void` (reason).
- `GET/PUT sales/settings` payment details, terms (versioned), quote and invoice days, support hours.
- `GET/POST sales/proof`, `PUT sales/proof/:id`, `POST sales/proof/:id/publish` (needs consent, a consent date within a year, a contact, where the original is kept, and an edit approval if the words were changed), `POST .../withdraw`, `DELETE`.
- `GET support`, `GET support/stats`, `GET support/:id`, `POST support/:id/reply` (`internal`, `waitForSchool`), `PATCH support/:id` (status, priority, assignee).

### School administrator — `/api/support` (admin role only)
`GET/POST /cases`, `GET /cases/:id`, `POST /cases/:id/reply|resolve|rate`, `GET /invoices`. A school sees only its own cases and invoices; internal notes are never returned. A `clientKey` makes a retried "open" one case.

### Daily job
`GET /api/cron/sales` (Bearer `CRON_SECRET`): expires old quotes, reminds an overdue invoice once a week, flags missed support deadlines once, closes cases resolved for 7 days.

Support deadlines use working hours (Monday–Friday, 09:00–18:00 Pakistan time). Waiting on the school pauses the resolve clock.

## Data import and year rollover (E29) — `/api/migration`
School administrators only (`admin` role). Nothing is written by a preview. Every commit works in small batches, remembers each row or learner, and can be repeated safely. Every job can be taken back.

### Overview and templates
- `GET /overview` — current and next academic year, class and learner counts, the default class order, the active results freeze, recent imports and rollovers.
- `GET /template/students|classes` — a CSV with the expected columns and one sample row.

### Import (classes or students)
- `POST /import/preview` `{ kind: "students"|"classes", fileName?, csv? | rows?[], options?: { createMissingClasses } }` → `201 { job, rows }`. Up to 1000 rows (`413` above that). Column names are matched loosely (for example `DOB`, `Date of Birth`, `Grade`/`Standard`, `Adm No`). A row is `ok` (will be added), `update` (a matching record would change; the exact `diff` is returned), `skip` (nothing would change), `review` (a likely duplicate that needs a decision) or `error` (with the reason). Matching: same admission number; same name and date of birth; same name and guardian phone; repeats inside the file; an admission number that belongs to someone with a different name is held for review. The summary also reports `planLimit` (plan seats) and `sameFileAs` (this exact file was imported before).
- `GET /import`, `GET /import/:id?state=&page=&limit=` (rows with their results), `GET /import/:id/issues.csv`.
- `POST /import/:id/decisions` `{ decisions: { "<row>": "skip"|"update"|"create" }, defaultReview? }`. `update` needs an existing match.
- `POST /import/:id/commit` `{ batch? }` (default 25, up to 100 rows). Call until `done: true`. Returns `credentials` for the accounts made in that batch (temporary passwords are returned once and are never stored in readable form). `422` while review rows have no decision, `402` if the plan seat limit would be exceeded, `423` while another call is working, `200 { alreadyCommitted: true }` when repeated. A record saved before an interrupted request is adopted on the next try, not created twice. Students are created with their class, a guardian account and link when a guardian email is given (an existing guardian is linked, not duplicated), and a fee record when the class has a fee structure.
- `POST /import/:id/rollback` `{ reason }` (5+ characters). Removes what the job created and undoes its changes. Anything used since is kept and listed (a student with attendance, marks or fee records; a record changed again after the import). Empty classes made by the job are removed. `POST /import/:id/cancel` for a preview that has not started.

### Year rollover
Classes stay the same records from year to year; a learner moves between classes and the school's `academicYear` changes. The class order (ladder) defaults to the school's standards in natural order, with pre-school stages first, and can be edited.
- `POST /rollover` `{ toYear?, holdOnDues?, ladder? }` — opens a draft (`409` if another is open) and runs the first dry run. `GET /rollover`, `GET /rollover/:id?action=&q=&page=&limit=`.
- `PATCH /rollover/:id/config` `{ toYear?, ladder?, holdOnDues?, overrides?: { "<studentId>": { action: "promote"|"repeat"|"graduate", reason } | null }, acknowledgedDuplicates? }` — changes the settings and re-runs the dry run.
- `POST /rollover/:id/preview` — recomputes readiness and the plan. Readiness blockers: year format and order, the year was already opened, another rollover open, no classes, scanned marking batches not published (`unresolved-grades`), duplicate enrolments (admission number repeated, or the same name and date of birth) until marked as checked, and results not frozen. Warnings: classes without an active class teacher, learners without a class, classes over capacity after the move. Information: open invoices and outstanding fees (these stay on each learner's account and carry into the new year) and timetables kept.
- `POST /rollover/:id/freeze` / `unfreeze` (unfreeze only before the commit). While frozen, marks of exams made on or before the freeze time cannot be entered, edited or deleted (`423`), including OMR publishing and regrading. Exams made afterwards are not affected, so the closed year stays frozen after the rollover.
- `POST /rollover/:id/review` `{ acknowledge: true, planHash?, note? }` — records who read the plan and its hash (`selfReviewed` shows if it was the same person who prepared it). Refused with `422` while blocked and `409` if the plan changed.
- `POST /rollover/:id/commit` `{ batch? }` (default 200, up to 500) — call until `done: true`. Refused with `409 stale` if learners or classes changed since the reviewed dry run. Creates any missing next classes, moves learners (promote, stay, graduate; graduates become `Graduated` and inactive), recounts class headcounts, sets every class and the school to the new year and keeps the closed year in `School.academicYearHistory`. Resumable; `423` while another call is working.
- `POST /rollover/:id/rollback` `{ reason }` — puts learners back where they were (only those still where the rollover put them; others are listed as conflicts), removes empty classes the rollover made, restores the years and unfreezes. `POST /rollover/:id/cancel` for a draft or reviewed run.

Indexes: `ImportJob (schoolId, createdAt)`, `(schoolId, status)`, `(schoolId, kind, planHash, status)`; `RolloverRun (schoolId, createdAt)`, `(schoolId, status)`, `(schoolId, status, frozen.at)`; `Student (schoolId, importJobId)`, `(schoolId, admissionNumber)`.

## Tenants, campuses and consent (E01)
The school always comes from the signed-in session, never from a request body. Update endpoints for students, classes, teachers and exams drop `schoolId`, `_id`, timestamps and import/rollover markers from the body (`utils/tenantGuard.safeBody`); linking a teacher to a class or subject checks that it belongs to the same school.

### Campuses — `/api/campuses` (admin)
Every school has one default campus ("Main campus", code `MAIN`), made the first time it is needed. A class with no campus belongs to it. An administrator with no active campus membership is **school-wide**; the first membership makes them a **campus admin** who sees only classes and students of their campuses (lists, by-id reads, edits, deletes, class creation, grants, consents). At least one administrator must stay school-wide.
- `GET /` — campuses with class, student and limited-admin counts, `me: { schoolWide, campusIds }`, and the organization the school belongs to.
- `POST /` `{ name, code?, address?, phone? }` — school-wide only; code unique per school (`409`); at most 25.
- `PATCH /:id` `{ name?, address?, phone?, status? }` — `closed` refused for the default campus or one that still has classes (`409`).
- `POST /:id/classes` `{ classIds[] }` — moves classes (students move with them). A campus admin may only move within their campuses.
- `GET /classes` — classes the caller may see, with their campus.
- `GET /members`, `POST /members` `{ userId, campusId }`, `DELETE /members/:mid` — school-wide only; limits an admin to a campus and takes the limit away.
Campus-limited grants: `POST /api/permissions/grants` accepts `campusId`; a grant tied to a campus only works for that campus (directly or through a class on it). Role defaults of a campus admin stop at their campus edge (`permissions.can`). Emergency (break-glass) access stays available and audited.

### Consent register — `/api/consents`
Append-only: giving, renewing or withdrawing adds a row; the newest row is `isCurrent` and the database allows only one current row per person and purpose (`currentKey` unique). No answer means no.
- `GET /purposes` (any signed-in role) — purposes with plain wording and current wording `version`: `photo_media`, `trip_participation`, `health_sharing`, `data_sharing`, `ai_tools` (about a child), `news_messages` (about a parent), `staff_directory` (about a teacher).
- Office (admin): `GET /` (`purpose, subjectType, subjectId, status, history=1, page, limit`), `GET /summary` (given, withdrawn, ended and not-answered counts), `GET /pending?purpose=`, `GET /history?subjectType&subjectId&purpose`, `GET /check?…` → `{ allowed, state: granted|withdrawn|expired|none, version, since, expiresAt }`, `POST /` `{ subjectType, subjectId, purpose, givenByName, givenByRelation?, method: paper|in-person|phone, evidenceNote?, expiresAt? }`, `POST /withdraw` `{ subjectType, subjectId, purpose, reason?, method? }`. A campus admin sees and records only consents of their campuses; staff consents need a school-wide admin.
- Family: `GET /mine` (parent: each linked child with `viewInfo` right, and themselves; student: self, read only), `POST /mine` `{ subjectType: student|parent, subjectId, purpose, expiresAt? }`, `POST /mine/withdraw`. Recorded with method `portal`.
- Other modules ask `utils/consent.hasConsent(schoolId, studentId, purpose)` (false when nothing is recorded).

### Organizations — `/api/organizations` (platform owner)
`GET /`, `POST /` `{ name, contactName?, contactEmail? }`, `GET /:id`, `PATCH /:id` (`status: active|suspended`), `GET /unassigned-schools`, `POST /:id/schools` `{ schoolId }` (a school is in at most one organization), `DELETE /:id/schools/:schoolId`. Grouping never shares data: schools in one organization cannot reach each other's records.

Indexes: `Campus (schoolId, code) unique`, `(schoolId, status)`, `(schoolId, isDefault)`; `CampusMembership (activeKey) unique`, `(schoolId, userId, revokedAt)`, `(schoolId, campusId, revokedAt)`; `Consent (currentKey) unique`, `(schoolId, subjectType, subjectId, purpose, createdAt)`, `(schoolId, isCurrent, purpose, status)`, `(schoolId, campusId, isCurrent)`, `(schoolId, purpose, status, createdAt)`, `(schoolId, expiresAt)`; `Organization (slug) unique`; `School (organizationId)`; `Class (schoolId, campusId)`; `PermissionGrant (schoolId, campusId, validTo)`.

## University registrar and degree audit (E16) — `/api/registrar`
A school-wide registrar for colleges and universities: course catalogue with prerequisites, programmes with **catalogue-year rules**, terms and sections, registration with the rules enforced, grades, a transparent **degree audit**, grade changes, appeals, exceptions, graduation and **signed transcripts** with a public check page. It is optional: schools that do not create courses never see it (the teacher and student menu items appear only for people who have something there). Administrators limited to one campus get `403` (the registrar is school-wide). Statuses: `403` wrong role or not your section/advisee, `404` not found or another school, `409` state conflict, `422` a rule refuses (the body names the reason).
Approvals are **maker-checker**: the person who asked cannot approve; a school with one administrator may approve its own request and the record says `sole: true`. Approvals are HMAC-signed (`JWT_SECRET`) over the content.

### Setup (admin)
- `GET /overview` — counts and what is waiting (`waiting.{versions, gradeChanges, appeals, exceptions, sectionsToGrade}`), `soleAdmin`.
- `GET|PUT /settings` — grade `scale` (`[{grade, points, pass}]`, letters with optional +/-, `W I AU P NP` reserved; a grade on published transcripts cannot change points or be removed → `409`) and `policy` (`repeat: latest|best|average`, `repeatBelow`, `minPassGrade`, `maxAttempts`, `maxCreditsPerTerm`, `appealDays`, `selfRegistration`). Switching `repeat` recalculates every record at once; every attempt stays on the record.
- Courses: `GET /courses?q&status&page&limit` (admin and teachers), `POST /courses` `{ code, title, credits, department?, prerequisites[{code,minGrade}], corequisites[{code}] }`, `PATCH /courses/:id` (code and school cannot change; `revision` and `history` kept), `POST /courses/:id/status` `{ status: active|retired }` (a course in published rules cannot retire → `409`). Prerequisite loops, self references and unknown codes → `422`.
- Programmes: `GET /programs` (with versions and student counts), `POST /programs` `{ code, name, level }`, `PATCH /programs/:id`.
- Versions (catalogue years): `POST /programs/:id/versions` `{ catalogYear, copyFrom? | totalCredits, minCgpa }`, `PATCH /versions/:id` (draft only: `requirements[{title, rule: all|credits|count, courses[], prefixes[], minCredits?, minCount?}]`, `totalCredits`, `minCgpa`, `minGrade`, `note`), `GET /versions/:id/checks` (problems that block publishing), `POST /versions/:id/submit`, `POST /versions/:id/decide` `{ approve, note? }`, `POST /versions/:id/retire`. A published version is immutable (`409`) and carries a content hash and who approved; students keep the version they started on.
- Terms: `GET|POST /terms`, `PATCH /terms/:id`, `POST /terms/:id/:step` with step `open` (`allowParallel` to run two terms), `grading`, `publish` (blocked with `blockers[]` while sections have unfinished grades; `markIncomplete: true` + `reason` publishes with `I`), `close`. Grades are hidden from students and from the average until `publish`.
- Sections: `GET /sections?termId`, `POST /sections` `{ termId, courseId, section, teacherId?, capacity, schedule?, room? }`, `PATCH /sections/:id`, `POST /sections/:id/cancel` `{ reason }` (drops students and tells them), `GET /teachers`.

### Students, registration and the audit
- `GET /people?q&placed=yes|no&programId` — students with their programme. `POST /students/:id/program` `{ programId, versionId?, advisorId?, switch? }` (latest published year by default; a draft year → `422`), `PATCH /students/:id/advisor`.
- `GET /students/:id/catalog` and `GET /me/catalog` — every section of the open term with `ok` and the exact `reasons[]` (`prerequisite`, `corequisite`, `repeat`, `full`, `clash`, `load`, `duplicate`, `section`, `course`).
- `POST /students/:id/enroll` `{ sectionId, lateReason? }` (admin, or the advisor), `POST /me/enroll` `{ sectionId }` (when `selfRegistration`). Seat count is a compare-and-set, so the last seat goes to one person. After `addDropUntil` a student cannot add; the office needs `lateReason`.
- `POST /students/:id/enrollments/:eid/drop` `{ reason? }` and `POST /me/enrollments/:eid/drop` — inside the add/drop period the registration disappears; after it the course is `W` (reason needed) and never counts toward credits or the average.
- `GET /students/:id/record` (admin; advisor of that student), `GET /me` — terms, courses, `cgpa`, `creditsEarned`, `audit`, exceptions, transcripts. `GET /students/:id/what-if?versionId=` checks the record against another published year without changing anything.
- Degree audit shape: `{ groups[{key,title,rule,status,items[{code,state: done|substituted|inprogress|todo}],remaining,options[]}], credits{earned,needed}, cgpa, eligible, blockers[], exceptionsApplied[], hash }`.
- Graduation: `GET /candidates?programId`, `POST /students/:id/graduate` (`422` with `blockers`; `409` if courses are still running), records the audit hash and the exceptions relied on and issues a final transcript.

### Grades
- Instructor: `GET /my/sections`, `GET /sections/:id/roster`, `PUT /sections/:id/grades` `{ grades[{enrollmentId, grade}] }` (draft; a grade off the scale, `W`, or a stranger's registration is skipped and listed), `POST /sections/:id/submit` (`422` names who is missing). Submitted grades are locked; `POST /sections/:id/reopen` `{ reason }` is the registrar's.
- Published grades change only through `POST /grade-changes` `{ enrollmentId, toGrade, reason }` then `POST /grade-changes/:id/decide` `{ approve, note? }` — signed, the old grade stays on the request, the version goes up. `GET /grade-changes?status`.
- Appeals: `POST /me/appeals` `{ enrollmentId, reason (≥ 20 characters) }` within `appealDays` of publishing; number `AP-YYYY-NNNNN`; one open appeal per course. `POST /me/appeals/:id/withdraw`; office `GET /appeals`, `POST /appeals/:id/assign`, `POST /appeals/:id/note` (the course's instructor or the office), `POST /appeals/:id/decide` `{ outcome: uphold|reject, toGrade?, note }` — upholding makes a signed grade change.
- Exceptions: `POST /exceptions` `{ studentId, kind: overload|prereq_waiver|extra_attempt|requirement_waiver|substitution|catalog_switch, reason, … }`, `POST /exceptions/:id/decide`, `POST /exceptions/:id/withdraw`, `GET /exceptions?status`. An approved exception is used once where it applies (an extra attempt is marked `used`).
- Advising: `GET /my/advisees`.

### Transcripts
- `POST /students/:id/transcripts` `{ kind? }` — official copy with number `TR-YYYY-NNNNN`, a 12-character check code, a frozen snapshot, a content hash and an HMAC signature. `GET /transcripts/:id`, `GET /transcripts/:id/pdf` (use `live` with `?studentId=` or as a student for an **unofficial** copy that is never stored), `POST /transcripts/:id/revoke` `{ reason }`, `POST /me/transcript-request`.
- Public, no sign-in: `GET /api/public/registrar/verify/:key` → `{ valid, status: Valid|Altered|Withdrawn, serial, kind, school, student (first name and initials), program, issuedAt }`. `Altered` means the stored copy no longer matches its hash or signature. Page: `/verify-transcript/:key`.

Indexes: `RegCourse (schoolId, code) unique`; `RegProgram (schoolId, code) unique`; `RegProgramVersion (schoolId, programId, catalogYear) unique`; `RegTerm (schoolId, code) unique`; `RegSection (schoolId, termId, courseId, section) unique`, `(schoolId, teacherId, termId)`; `RegStudentProgram currentKey unique`, `(schoolId, advisorId, isCurrent)`; `RegEnrollment activeKey unique`, `(schoolId, studentId, termId)`, `(schoolId, sectionId, status)`; `RegAppeal activeKey unique`, `(schoolId, number) unique`; `RegTranscript verifyKey unique`, `(schoolId, serial) unique`, `(schoolId, studentId, createdAt)`; `RegGradeChange`, `RegException` by `(schoolId, status)` and `(schoolId, studentId)`.


## Training courses, cohorts and certificates (E17) — `/api/training`
Courses for people outside the normal classes (staff, parents, outsiders). Staff and admins write courses; learners buy or are given access; the school confirms payment by hand; counted time, checks and reviewed work decide completion; an approval issues a signed certificate anyone can check. School-wide: a campus-limited admin gets `403`. No payment gateway, no email or WhatsApp: private links are shown once and copied by hand.

Rules the server enforces:
- Proof of payment never opens access. Only an admin confirm with the **exact** amount does (`422` otherwise). A reused reference needs `force: true` and a `forceReason` (10+ characters).
- Access comes only from a confirmed payment, a confirmed sponsorship, a free course, or a written admin grant (reason, optional end date).
- Video and reading lessons need **server-counted visible time**: a heartbeat every 15 s; only visible beats at least 5 s apart count, a gap over 40 s counts for nothing, 20 s at most per beat; needed time = min(1800 s, 60% of the lesson minutes). Early `complete` → `422`.
- Check questions are graded on the server; right answers are never sent to the learner.
- Assignments: rubric with a pass mark, a maximum number of attempts, extra attempts by an admin; returned work needs feedback.
- Completion runs `none → ready → held → complete`. Approval issues credential `TC-YYYY-NNNNN` with a 12-character check key, an HMAC signature and a frozen snapshot. A refund after a certificate sets `refundFlag` for an admin decision.
- Maker-checker: the person who asked cannot approve; a sole admin may approve their own request and the record says `sole: true`.

### Learner (private link or student sign-in) — `/api/training/learn`
The link goes in the `X-Learner-Key` header (`lk_` + 48 hex; only its SHA-256 hash is stored and the key is shown once). A signed-in student may omit it.
- `GET /me` (courses, orders, certificates), `GET /catalog`, `POST /checkout`, `POST /orders/:id/proof` `{ reference, note }`, `POST /orders/:id/cancel`.
- `GET /courses/:id`, `GET /courses/:id/lessons/:lid`, `POST …/beat` `{ visible }`, `POST …/position`, `POST …/answer` `{ answers }`, `POST …/submit` `{ text, link }`, `POST …/complete`.
- `GET|POST /courses/:id/discussion` (posts are moderated; under-18 posts are held; three reports hold a post), report and reply routes.
- `GET /courses/:id/slots`, `POST /slots/:id/book`, `POST /slots/:id/cancel` (office hours; a slot is booked by a conditional write so two people cannot take it).
- `GET /credentials/:id/pdf`, `GET /credentials/:id/export`.

### Staff
- `GET /overview`, `GET|PUT /settings` (currency, tax percent and label, refund, grace and hold days, payment instructions, public page, policy versions with a reason).
- `GET|POST /instructors`, verify/suspend/reset. Courses: `GET|POST /courses`, `PATCH /courses/:id` (modules, landing, price, instalments), `POST /courses/:id/submit`, `POST /courses/:id/decide`.
- Cohorts and sessions: `GET|POST /cohorts`, `POST /cohorts/:id/sessions`, attendance, status steps. Seats are taken by compare-and-set.
- Offers: `GET|POST /bundles` (`ordered` bundles unlock in order), `GET|POST /coupons` (validated on the server, usage and attribution counted).
- Sales: `GET|POST /learners`, `GET|POST /orders`, `POST /orders/:id/installments/:no/confirm`, proof turn-down, cancel, refund, end access, `GET|POST /entitlements`, `GET|POST /sponsors` (approval needs a contract reference), `GET|POST /sponsorships`, `GET /reports`.
- Review: `GET /submissions`, `POST /submissions/:id/review` `{ decision: accept|return, scores, feedback }`; `GET /completions`, `POST /completions/:id/decide` (approve issues the certificate; hold needs a reason); `GET /credentials`, withdraw with a reason; `GET /posts`, `POST /posts/:id/decide`; `GET|POST /slots`.

### Public, no sign-in
- `GET /api/public/training/:code` (page text, courses, bundles; `404` until the school opens its public page), `GET …/:code/course/:slug`, `POST …/:code/quote`, `POST …/:code/checkout` (consent required, a hidden `website` field is a honeypot, rate limited).
- `GET /api/public/training/credential/:key` → Valid / Altered / Withdrawn / Expired with a masked name. `GET /api/public/training/sponsor/:key` → a report with only that sponsor's learners.
- Pages: `/courses/:code`, `/courses/:code/:slug`, `/learn` (the link arrives in the address bar after `#`, is stored in this browser and removed from the address), `/verify-credential/:key`, `/sponsor/:key`.
- Cron: `GET /api/cron/training` daily (pause overdue instalments after the grace days, cancel unpaid holds, start and close cohorts, send session reminders 26 hours ahead).

Indexes: every `Tr*` collection leads with `schoolId` except the two keys that are looked up without a school. Unique: course `(schoolId, slug)`, order `(schoolId, orderNo)`, sponsor invoice `(schoolId, invoiceNo)`, credential `(schoolId, serial)` and `verifyKey`, learner `keyHash` (unique only where set, so learners without a link do not collide), entitlement `(schoolId, learnerId, courseId)`, submission `(schoolId, learnerId, courseId, lessonId, attempt)`. Lookups: orders by status and date and by `refs`, posts by course and status (`reportCount` is top-level so the report limit is a plain filter), submissions by status, sessions and slots by start time.

## Library and school store (E18) — `/api/library`, `/api/store`

Roles: administrators do everything. A teacher works the desk or till only with a time-limited permission (`library.desk.operate`, `store.till.operate`, granted under Access and permissions). Students, teachers and parents use `/me` routes for their own records. Campus-limited administrators receive `403`. Barcodes are `BK` (copy), `LC` (library card) and `ST` (store item) plus seven digits and a Luhn check digit; a misread code is refused before any lookup.

### Library — people and portal
- `GET /me/enabled` → `{ enabled }` (lightweight check used to show the tab). `GET /me` (card, loans, reservations, charges; parents pass `childId` and need the guardian right), `GET /me/titles?q=`, `POST /me/reserve` `{ titleId }`, `POST /me/reservations/:id/cancel`, `POST /me/loans/:id/renew`.
- `GET /access` → `{ has, desk, till }` for a teacher.

### Library — desk (administrator or granted teacher)
- `GET /overview`, `GET|PUT /policy` (PUT is administrator only: loan days, limits per role, renewals, grace days, fine per day, cap, lost-book percent and handling, damage percent, hold days, `reason` required; each save is a new version and each charge remembers the version it was made under).
- Catalogue: `GET|POST /titles`, `GET|PATCH /titles/:id`, `POST /titles/:id/copies` `{ count }`, `GET /copies/lookup?barcode=`, `PATCH /copies/:id` (status, condition, shelf, withdraw with reason).
- People and cards: `GET /people?q=`, `GET /cards`, `GET /cards/lookup?cardId|card|studentId|teacherId`, `POST /cards/:id/status` (block or unblock needs a reason).
- Lending: `POST /issue` `{ cardId|card, barcode, dueOn? }`, `POST /return` `{ barcode, damage? }` (late fine from the policy; lost-then-found voids the open lost charge and flags a refund if it was paid; damage sets the copy status), `POST /loans/:id/renew`, `POST /loans/:id/lost`, `GET /loans` and `GET /loans.csv`.
- Reservations: `GET|POST /reservations`, `POST /reservations/:id/cancel` (the next person in line is offered a returned copy and has the hold days to collect it).
- Charges: `GET /fines`, `POST /fines/:id/pay`, `POST /fines/:id/waive` (reason of 10+ characters).
- Offline desk: `POST /sync` `{ ops: [{ clientKey, type, … , capturedAt }] }` up to 100; every op is idempotent on `clientKey`, returns `{ ok, result|message, retry, late }` per op, and a failed op never blocks the others.
- Textbooks: `GET /textbooks/needs?classId&year`, `POST /textbooks/class-set` (issues one copy per student, refuses to overdraw stock and says exactly how many were issued).
- Import: `POST /import/preview` (CSV rows classified `add|conflict|same|duplicate|problem`), `POST /import/commit` with decisions for conflicts; repeating the same file is a no-op (hash key).
- Labels: `POST /labels/copies`, `POST /labels/cards` → PDF. `GET /reports/usage`, `POST /sweep` (administrator: runs the daily rules now).

### School store (administrator or granted teacher at the till)
- `GET /overview`, `GET|PUT /settings`. Items: `GET /skus`, `POST /skus` (duplicate code → `409`), `PATCH /skus/:id`. `POST /receive` `{ skuRef, qty, unitCost, supplier }`, `GET /movements`, `GET /low-stock`, `GET /reconcile` (stock on the shelf against the sum of movements).
- Tills and shifts: `GET|POST /tills`, `PATCH /tills/:id`, `GET /shift`, `POST /shifts/open` (one open shift per till and per cashier), `POST /shifts/:id/close` `{ counted, note }` (a large difference needs a note and is flagged), `GET /shifts`.
- Sales: `POST /sales` (cart, discount, cash received; stock is taken by conditional writes so two tills cannot sell the last item), `GET /sales`, `GET /sales/:id` (receipt `RC-…`).
- Pickup orders: family `GET|POST /me/orders` (reserves stock); staff `GET /orders`, `POST /orders/:id/pay`, `POST /orders/:id/cancel`; unpaid holds are released by the daily sweep.
- Refunds: `POST /refunds` `{ saleId, lines, reason }`, `GET /refunds`, `POST /refunds/:id/decide` — a different administrator must approve (the sole administrator of a school may approve their own); approval restocks or writes off and reduces the open shift's cash.
- Counts: `GET|POST /counts`, `GET /counts/:id`, `PUT /counts/:id` (save), `POST /counts/:id/submit`, `POST /counts/:id/decide` (different approver; the shelf follows the approved figures through movements). `GET /reports/day?date=`.
- Cron: `GET /api/cron/library` daily at 03:50 UTC (overdue marking, hold expiry, unpaid order release).

Indexes: every `Lb*` and `St*` collection leads with `schoolId`. Unique: copy barcode, card barcode `(schoolId, barcode)`, open loan per copy (`activeCopy`), SKU `(schoolId, code)` and barcode, sale `(schoolId, orderNo)` and receipt number, import hash, offline `clientKey`, one open shift per till (`tillKey`) and per cashier (`cashierKey`).

Not in E18: posting to the fee ledger, online payment (charges and store sales are paid at the desk), a public online catalogue, email or SMS reminders, a buyer picker at the till, and lab consumables, IT devices, work orders, space booking, cafeteria, sports and bus rosters (other epics).

## Purchasing, funds, assets and facilities (E19) — `/api/procure`

Roles: administrators do everything. A teacher works under two time-limited permissions granted under Access and permissions: `procure.request` (raise and follow their own purchase requests) and `procure.officer` (work in the purchasing office: suppliers, quotes, orders, goods received, bills, the asset register, repairs, routines, projects). Any teacher can report a fault and sees only the jobs they reported. Campus-limited administrators get `403` because purchasing is school-wide. Students, parents and agents are refused. Another school's records are always `404`.

### Access and rules
- `GET /access` → `{ officer, request, admin }`. `GET /options` (cost centres, categories, thresholds, this year's approved budget lines and open projects; for requesters).
- `GET /settings`, `PUT /settings` (administrator; `reason` of 5+ characters; every save is a new version with its history). Rules: `singleApprovalLimit` (above it two different approvers), `quoteThreshold` and `minQuotes` (at or above it, written quotes or a stated reason), `tolerancePercent` (orders against approvals, bills against what was received), `capitalizationThreshold`, `fiscalYearStartMonth`, cost centres, categories and asset kinds with useful lives.
- `GET /overview` (budget position, what is waiting, repairs open, contracts ending, asset totals).

### Suppliers
- `GET|POST /vendors`, `GET|PATCH /vendors/:id`. The same name, tax number or bank account cannot be added twice (`409`); keys ignore case, spaces and punctuation. A list never exposes an account number, only its last four digits.
- Bank details are never edited in place: `POST /vendors/:id/bank` `{ bank, reason }` creates a pending change and `POST /vendors/:id/bank/decide` (administrator, a different person) applies or turns it down. A bank transfer to a supplier is held while a change is pending, or when no account has been approved.
- Blocking a supplier needs a reason; a blocked supplier cannot be quoted, ordered from or paid.

### Funds, budgets and variations
- `GET|POST /funds`, `GET /funds/:id` (history), `POST /funds/:id/money` `{ amount, note }` or `{ kind: 'adjust', direction, amount, note }`, `POST /funds/:id/close`. Kinds `general|restricted|grant|donor`; a restricted fund names the categories it allows and may have valid dates. Every change is an append-only entry with the balance after it; a correction is a new entry. `GET /reconcile` checks that every fund, budget line and project equals its entries.
- `GET|POST /budgets`, `PUT /budgets/:id` (drafts only), `POST /budgets/:id/approve` (a different administrator, the only administrator of a school may approve their own and the record says so), `POST /budgets/:id/close`. One budget per cost centre and year; one line per category.
- `GET|POST /variations` `{ kind: 'move'|'increase', fromLineId, toLineId, amount, reason }`, `POST /variations/:id/decide` (a different administrator).

### Requests, quotes, orders, goods and bills
- Requests: `GET|POST /requisitions`, `GET|PATCH /requisitions/:id`, `POST /requisitions/:id/submit` `{ soleSourceReason? }`, `/cancel` `{ reason }`, `/decide` `{ approve, note }` (administrator). A requester sees only their own. Submitting checks the budget line, the fund's category and dates, and what is left (`409` says how much). Money is set aside on final approval, once, by conditional writes: two administrators deciding together produce one `200` and one `409`; above the one-approver limit two different administrators must approve.
- Quotes (office): `POST /requisitions/:id/quotes`, `DELETE /requisitions/:id/quotes/:key`, `POST /requisitions/:id/choose-quote` (a quote that is not the lowest needs a reason).
- Orders: `POST /requisitions/:id/order` `{ vendorId, expectedOn, lines? }` (one order per request; an order above the approved amount beyond the tolerance is refused, below it gives the difference back), `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel` and `/close` (administrator, with a reason).
- Goods: `POST /orders/:id/receive` `{ clientKey, lines: [{ lineId, qty, rejected }] }`; the same `clientKey` returns the first receipt (`200`), and two people receiving the last items together cannot exceed what was ordered (`409`, `over_receipt`).
- Bills: `POST /orders/:id/bills` `{ invoiceNo, amount, invoiceDate, dueOn }` runs the three-way match (`matched|within_tolerance|exception|over`; over is refused `422`; a duplicate invoice number from the same supplier is `409`). `GET /bills`, `POST /bills/:id/decide` (administrator, not the person who entered it; an exception needs `exceptionReason` of 10+ characters), `POST /bills/:id/pay` `{ method, reference, paidOn }` (administrator; paid once even if two administrators pay together), `POST /bills/:id/void` (office; frees the order and the invoice number), `POST /bills/:id/credit` `{ amount, reason }` (a paid bill only; returns money to the budget line and fund).

### Projects
- `GET|POST /projects`, `GET /projects/:id`, `POST /projects/:id/approve` `{ budgetLineId, fundId?, authorized }`, `POST /projects/:id/phase` `{ phase, note }` (`approved → building → handover → completed`, or `cancelled` with no money set aside), `POST /projects/:id/milestones/:key` `{ done }`, `POST /projects/:id/changes` `{ kind: 'increase'|'scope'|'schedule', amount, endOn, reason }`, `POST /changes/:id/decide` (a different administrator).

### Assets
- `GET|POST /assets`, `GET|PATCH /assets/:id` (value today, depreciation schedule, history, repair jobs), `GET /assets/by-tag?tag=` (a tag is `AS` + 7 digits + a check digit; a misread is `422` with `reason: 'scan'`), `POST /assets/from-order` `{ orderId, lineId, count, category }` (only what has arrived and is not yet tagged; two people tagging together never tag an item twice), `POST /assets/:id/transfer`, `POST /assets/:id/dispose` `{ how, reason, proceeds }` and `POST /assets/:id/dispose/decide` (a different administrator), `POST /assets/labels` `{ ids }` → PDF. Straight-line depreciation by whole months to the scrap value.

### Repairs, routines and running costs
- `GET|POST /tickets` (any teacher may report; list is scoped to what they reported unless they are on the office), `PATCH /tickets/:id` (office; `open → assigned → in_progress → done → closed`, finishing needs a note, cancelling needs a reason).
- `GET|POST /plans`, `PATCH /plans/:id` (a routine opens a job `leadDays` before it is due; one job per routine per due date, enforced by a unique key, so two sweeps at once open one job).
- `GET|POST /contracts`, `PATCH /contracts/:id` (administrator), `GET /forecast?from&to` (monthly, quarterly and yearly costs on the right dates, clamped to month end).

### Reports (administrator)
- `GET /reports/:name` for `budget`, `funds`, `pipeline`, `payables`, `projects`, `assets`, `vendors`, `contracts`; add `?format=csv` where a table exists (cells starting with `= + - @` are prefixed to defeat formula injection). `POST /sweep` runs the daily rules now.
- Cron: `GET /api/cron/procure` daily at 04:15 UTC (opens routine jobs, ends and warns about contracts, tells the office about late bills).

Indexes: every `Pc*` collection leads with `schoolId`. Unique: vendor name, tax number and bank account `(schoolId, key)`, fund name, budget `(schoolId, year, costCentre)`, budget line `(budgetId, category)`, request, order, receipt, bill and ticket numbers, receipt `clientKey`, bill `(schoolId, vendorId, invoiceKey)`, order line `(orderId, n)`, asset tag, routine job `planKey`. Unique indexes ignore a missing key, so a voided or turned-down bill gives its invoice number back.

Not in E19: posting to the general ledger or the fee ledger (E23 will connect it), a payment gateway or bank file export, uploading the supplier's invoice or quote as a file, a supplier portal, purchase returns beyond credit notes, stock-keeping of consumables (E18 store covers uniforms and stationery for sale), and email or SMS alerts (in-app notifications only).


## School transport and active-trip safety (E22) — `/api/transport`

Roles. Administrators do everything, except that a campus-limited administrator gets 403 (transport is school-wide). A teacher works under two time-limited permissions granted under Access and permissions: `transport.dispatch` (see the day, trips, children, incidents and reports; board a child for the driver, cancel or reassign a trip, add a one-day rider, settle exceptions) and `transport.manage` (everything in dispatch, plus plan routes, stops and plans, keep the fleet and drivers, assign riders and record inspections). Only an administrator changes the rules. A driver has no school login: a private key opens `/api/transport/driver/*`. Parents use `/me/*` for their linked children; a student uses it for themselves.

### Driver (headers `X-Driver-Id` and `X-Driver-Key`; limiter 200 per minute)
- `GET /driver/me` → today's trips for this driver, each with stops, the pre-trip checklist (while not started) and the riders: only name, class, stop, state, hand-over rule and, in the afternoon for a child who must go to an adult, the list of people who may collect. No phone, guardian record, health or history. A wrong, rotated or switched-off key gets 401 or 403.
- `GET /driver/trips/:id`; `POST /driver/trips/:id/op` with `{type, clientKey?, at?, …}`. Types: `checklist` (every item answered; a failed critical item leaves the trip scheduled, opens a vehicle-fault incident and tells the office), `start` (needs a passed checklist, an active vehicle that is not on hold, unexpired fitness and insurance, an unexpired licence, and a time inside the start window), `ping` (`lat`, `lng`, optional `speedKmh`; only while the trip is active; implausible positions, speeds and times are refused; positions closer than the minimum gap are ignored), `arrive` (`stopId`), `board` and `no_show` (`studentId`, `stopId`), `alight` (`studentId`, `stopId`, `handedTo`), `school_arrival` (everyone on board gets off), `exception`, `incident`, `end` (`emptyChecked: true`, optional `count`, `reason`).
- Hand-over in the afternoon: a child marked "to an adult" needs `handedTo` of `{kind:'guardian', ref:'p:<parentId>'}`, `{kind:'guardian', ref:'n:<name>'}`, `{kind:'authorised', name}` or `{kind:'no_one'}`. The person is checked against the guardian rights and restrictions. A refusal is always 409 `handoff_refused` with the same wording and `stillOnBus: true`; it never says why, the child stays on the bus and an `unauthorised_collector` exception is recorded. `no_one` keeps the child on the bus and opens a `no_one_at_stop` exception.
- `end` is refused (409 `unreconciled`) while any child is still on board or was never marked, unless a `reason` is given; with a reason the trip closes, a critical `child_missing` incident is opened that keeps the position track, and every family of the trip is told the school is responding (no detail).
- `POST /driver/sync` `{ops:[…]}` takes up to 100 saved actions from an offline phone, applies them oldest first by their captured time (a time in the future is pulled back to now), and answers each on its own: `{ok, replayed?, message?, retry?}`. An action already applied is recognised by its `clientKey` and not repeated; one that fails never stops the rest; only a server fault is marked `retry: true`.

### Families (`parent` or `student`)
- `GET /me/children`, `GET /me?childId=` (route, stop, hand-over rule, today's trips with state, expected time, delay, driver first name and plate, recent days, notices given). A parent under a no-access restriction, or not linked, gets 403.
- `GET /me/live?childId=` (parent only): `{live:true, position, etaAt, stopsAway, stops[]}` only while the child's trip is active **and** consent purpose `bus_tracking` is held; otherwise `{live:false, reason}` (`no_consent`, `no_active_trip`, `no_position_yet`, `family_only`, `not_a_rider`). A student's own login never gets a position. Consent is given and withdrawn at `/api/consents/mine` and `/mine/withdraw`.
- `POST /me/skip` `{childId, date, direction: morning|afternoon|both, reason?}` (today to 60 days ahead; refused when the child is already on that trip); `DELETE /me/skip/:id`. `POST /me/concern` `{childId, note}` opens a `family_concern` incident and tells dispatchers.

### Office (dispatch tier unless noted)
- `GET /access` → `{manage, dispatch, admin}`. `GET /overview` (today's trips and totals, open incidents, unsettled exceptions, vehicles on hold, papers expiring, inspections due). `GET /trips?date&status&routeId&page`, `GET /trips/:id` (boards, events, incidents and, only while active, the track). `POST /trips/generate {date?}` (today to a few days ahead; makes each day's trips from the plans; idempotent). `POST /trips/:id/op` (the same operations, done by the office and recorded as such; `start` still needs the safety steps). `POST /trips/:id/cancel {reason}` (not while under way; families told). `POST /trips/:id/reassign {driverId?, vehicleId?, reason}` (a held, retired or clashing vehicle is refused; mid-trip needs a reason and the first driver loses access). `POST /trips/:id/add-rider {studentId, stopId, reason}` (one trip only).
- `GET /exceptions`, `POST /exceptions/:id/resolve {resolution (8+ chars), alighted?, handedKind?, handedName?}`. `GET /incidents?status&kind`, `POST /incidents`, `POST /incidents/:id {action: acknowledge|resolve, resolution (10+ chars)}`.
- `GET /vehicles`, `GET /drivers`, `GET /routes`, `GET /riders?routeId&unassigned=1&q`, `GET /students?q` (find a child), `GET /reports/:name` (`punctuality`, `ridership`, `exceptions`; `from`, `to`, `format=csv` with a spreadsheet-formula guard).
- Manage tier: `POST/PATCH /vehicles` (unique plate ignoring spaces and case; retire needs a reason and no active plan; a held vehicle cannot be set active by hand), `POST/PATCH /drivers` (unique phone when given; the private key is returned once on create and on `POST /drivers/:id/key`, which switches the old key off; switching a driver off needs a reason and no active plan or trip), `POST /routes`, `PUT /routes/:id/stops` (names unique, offsets not going back, both coordinates or neither, ids kept on rename, a stop with riders cannot be removed), `PUT /plans` (one per route and direction; clash checks on vehicle and driver; a change to an existing plan needs a reason; warns when riders exceed seats), `POST /riders/assign`, `PATCH /riders/:studentId`, `DELETE /riders/:studentId`, `POST /inspections` (every line answered; a failed critical line puts the vehicle on `inspection_hold` and opens an urgent repair job in the purchasing office; only a later passing inspection by a different person lifts it, except for a sole administrator), `GET /inspections`, `GET /settings`.
- Administrator: `PUT /settings {reason, settings}` (versioned with history), `POST /sweep` (the daily rules).
- Cron: `GET /api/cron/transport` (bearer `CRON_SECRET`, daily 00:30 UTC) makes today's and tomorrow's trips, marks trips that never started as `missed`, closes trips left active too long (raising a `child_missing` incident if children were unaccounted for), deletes position tracks of finished trips unless an incident still needs them (at most `incidentPingDays`), and sends one reminder a day about papers and inspections.

Privacy. Positions come only from the driver's phone and are kept only while a trip is active. They are deleted when it ends unless an open incident needs the track, and never after `incidentPingDays`. A family sees the bus only while the trip is under way and only with consent; a child's own login never shows it. The driver's list carries no contact or health data.

Indexes: every `Tp*` collection leads with `schoolId`. Unique: vehicle plate key, driver phone key (when set), route stop `(routeId, seq)`, plan `(routeId, direction)`, trip `tripKey`, rider `(tripId, studentId)`, trip event `(schoolId, tripId, clientKey)` (what makes a repeated action count once), opt-out `(studentId, date, direction)`, incident number. `TransportAssignment` gains `stopId`, `handoff` and `(schoolId, routeId)`.

Not in E22: a map service or turn-by-turn routing (families see a sketch of the route and an estimate, and no outside service is contacted), SMS or WhatsApp alerts (in-app notifications only), RFID or card scanning, and fee billing (the Fees Center keeps monthly route fees).


## School ledger and financial statements (E23) — `/api/accounts`

Roles. Administrators do everything, except that a campus-limited administrator gets 403 (the ledger is school-wide). A teacher works under three time-limited permissions (Access and permissions): `accounts.audit` reads the books; `accounts.prepare` also drafts journals, budgets and reconciliations and asks for months to be closed; `accounts.approve` also posts, signs off and manages funds. Each tier includes the one below. Students and parents get 403.

Rule of the whole module: money is whole rupees; a journal must balance to the rupee; a posted line is never edited or deleted. A mistake is reversed by a new journal. Whoever prepared something cannot approve it (403 `maker_checker`), except that a school with one administrator may approve its own work, and the record says so (`sole`).

### Reading
- `GET /access` → `{admin, approve, prepare, audit, ready}`. `GET /overview` (cash and bank, fees receivable and received in advance, suppliers and salaries owed, year income and expense, journals waiting, months closed through, held postings; an incremental feed run is made first when the last run is over 10 minutes old). `GET /settings` (versioned, with history).
- `GET /accounts`, `GET /journals?status&type&ym&q&fundId&page&limit`, `GET /journals/:id`, `GET /ledger?code&from&to&fundId[&format=csv]`, `GET /statements/:name[?format=csv]` where name is `trial-balance` (`asOf`), `income-expenditure` (`from`, `to`, `fundId`), `balance-sheet` (`asOf`), `funds`, `budget` (`fy`, `upTo`, `version`), `receipts-payments` (`from`, `to`). `GET /funds`, `GET /funds/:id/lines`, `GET /budgets?fy`, `GET /recons?ym&code`, `GET /periods`, `GET /periods/:ym/checklist`, `GET /periods/:ym/verify`.
- `GET /check` verifies every journal balances, every posted journal still has its lines and every line still matches the fingerprint taken at posting (kinds `unbalanced`, `missing_lines`, `changed`). `GET /trace/:type/:id` shows the journals made from a record in another module. `GET /feeds` shows the last run and held items. CSV downloads guard cells that begin with `=`, `+`, `-` or `@`.

### Preparing (prepare tier)
- `POST /journals`, `POST /journals/preview` (checks without saving: balance, accounts, fund rules, budget), `PATCH /journals/:id` (draft or returned, by its preparer), `DELETE /journals/:id` (draft), `POST /journals/:id/submit`, `POST /journals/:id/reverse {reason, date?}`. Types: `manual`, `adjusting`, `opening`; `system` and `reversal` are made by the module. A fund may be named only on income, expense and fixed-asset lines.
- `POST/PATCH /accounts` (code 2–12 letters, numbers, dots, dashes; unique per school; kind and code cannot change; an account used by an automatic posting cannot be switched off). `POST/PUT/DELETE /budgets` (drafts), `POST /recons` (one per account and month; difference = books − (statement + items)), `POST /periods/:ym/close` (asks for sign-off), `POST /periods/:ym/cancel`, `GET /opening-suggestion`.

### Approving (approve tier)
- `POST /journals/:id/decide {decision: approve|reject, note}` (reject needs a reason). Approval claims the journal (`posting`), writes the lines, then marks it `posted`; two approvals at once give one 200 and one 409, and a journal left in `posting` by a crash is finished by the next run.
- `POST/PATCH /funds`, `POST /funds/:id/close|reopen {reason}`, `POST /budgets/:id/approve` (supersedes the earlier version of that year), `POST /recons/:id/sign` (difference must be 0; not the preparer), `POST /periods/:ym/approve` (not the requester; stores the closing fingerprint), `POST /feeds/run`.
- Fund rules, checked at submit and again at approval: the fund is open, the date is inside its window, the account is on its list, and spending stays within the award. A rule change that would make past spending ineligible is refused. Budget control `off|warn|block` governs manual journals only: `warn` attaches a warning; `block` refuses (422 `over_budget`).

### Administrator
- `POST /setup {startDate, fiscalStartMonth}` (once; makes the chart of 30 accounts), `PUT /settings {reason, settings}` (budget control, reconciliation requirement, automatic-posting accounts; start date and fiscal month cannot change after the first posting or budget), `POST /sweep` (full feed run plus check), `POST /recons/:id/reopen {reason}` (only while its month is open), `POST /periods/:ym/reopen {reason (10+ chars)}` (only the latest closed month).
- Cron: `GET /api/cron/accounts` (bearer `CRON_SECRET`, daily 01:45 UTC) runs a full feed pass for every school.

### Automatic postings
Fee invoices (income by line kind, concessions, bad debts, late fees), fee payments (cash or bank against receivable; unallocated money to fees received in advance; refunds), finalized pay runs (salaries, net pay, tax, advance recovery, other deductions), staff advances, approved supplier bills (fixed assets or the expense account for the category, charged to the purchasing grant's ledger fund) and their payment, and store sales and refunds. Each source keeps the net it has posted; a change posts only the difference, dated today (or the first open month when the original month is closed, marked `shifted`). Invoices dated before the start date are left to the opening balances. A posting that cannot be made (for example a switched-off account) is held with its reason, listed in the overview and in the month-end checklist, and posted by the next run once fixed. Runs are idempotent: one source revision has one journal (unique `sourceKey`).

Months. A month closes only in order, after it has ended, with no draft or waiting journals, a balanced trial balance and (if required) a signed reconciliation for every bank account. While a month waits for sign-off nothing new can be submitted into it (423 `period_locked`).

Indexes: every `Ac*` collection leads with `schoolId`. Unique: account `(schoolId, code)`, period `(schoolId, ym)`, journal `sourceKey` and `reversalOf`, line `(schoolId, journalId, seq)`, fund `pcFundId`, budget `(schoolId, fy, version)`, reconciliation `(schoolId, code, ym)`, source `key`. Lines carry `kind`, `ym`, `date`, `fundId`, `campusId` so statements are one indexed aggregation, not a scan of journals.

Not in E23: multi-currency, depreciation runs, tax returns, bank statement import (reconciliation is typed in), cost-centre reporting beyond the stored field, and campus-level books (the ledger is school-wide; `campusId` is kept on lines for E26).


## Analytics, measures and reports (E25) — `/api/analytics`

Roles and levels. Administrators and teachers only (others get 403). Each person has a level: `teacher` (own classes only), `lead` (a teacher with the `analytics.lead` permission grant: learning and attendance for the whole school), `admin`. A campus-limited administrator sees only the classes of their campuses and never a measure that covers the whole school. `GET /access` → `{level, limited, classes, measures, groupBys, admin, today}`.

What a measure is. Measures are defined in code (15: attendance rate, unexcused absence, excused share, registers not taken, children often absent, average mark, pass rate, fees collected, fees overdue, admissions conversion, help desk first reply and resolution, library overdue, bus on time, staff attendance). Each names its numerator, denominator and who sees it. Care and safeguarding records are never read.

Small groups. A group (class, grade, campus) with fewer than `minCell` children (1 to 30, default 5) returns `suppressed: true` and no number. Where hiding one group would let it be worked out from the total and its neighbours, a second group is hidden too.

### Reading
- `GET /catalog` (measures this person may see, and those hidden with the reason), `GET /overview?from&to&groupBy` (every visible measure with change against the period before, exceptions from the lines the school set, open jobs), `GET /measures/:key?from&to&groupBy` (total, groups, month series, numerator, denominator, version). `groupBy` is `none|class|standard|campus`. Periods are at most 400 days.
- `GET /progress?from&to` average marks by class and subject across exams, oldest first. `GET /ageing?groupBy` (administrators) fees owed on open invoices by 0, 1–30, 31–60, 61–90, over 90 days late; invoice-based, not a forecast. `GET /funnel?from&to` (whole-school administrators) admissions reached at least each step, and the roll by grade. `GET /health` (whole-school administrators) age of the latest register, marks and invoices, failed family messages, held postings, failed schedules, late jobs.

### Definitions (whole-school administrators)
- `GET /definitions`, `PUT /definitions/:key {reason, params, alert, target, minCell, minLevel}` proposes a new version, `POST /definitions/:key/decide {approve, note}` (a different administrator; a school with one administrator may decide its own and the version records `soleAdmin`; turning down needs a note), `POST /definitions` makes a custom measure (a built-in narrowed to `filters.standards` and, for learning measures, `filters.subjectIds`; at most 40), `POST /definitions/:key/retire {reason}`. One change may wait at a time (409 `pending`). `minLevel` can only be raised, never opened to more people.

### Saved reports and schedules
- `POST /runs {title, kind: manual|pack, keys, from, to, groupBy}` saves what this person may see, with each measure's definition version and a SHA-256 of the figures. A saved run is never changed. `GET /runs`, `GET /runs/:id`, `GET /runs/:id/file/csv|pdf` (a board pack as a PDF). A person opens runs they made or were sent, and an administrator of the whole school opens all of them.
- `GET/POST /schedules`, `PATCH /schedules/:id {active, …}`, `POST /schedules/:id/run`, `POST /sweep`. A schedule is weekly (day of week) or monthly (day 1–28), covers the last 7 or 30 days, the last full month or the month so far, and has 1–60 recipients. One run is made per distinct view (level and campus scope), so each recipient only gets what their role allows; the list shows what each will not see. At most 30 are active. Cron: `GET /api/cron/analytics` (bearer `CRON_SECRET`, daily 02:20 UTC) runs due schedules, once per period (unique on school, schedule, period, scope) and notifies recipients in the app.

### Jobs
- `GET /jobs?status&page`, `POST /jobs {title, detail, ownerId, ownerRole, dueOn, metricKey, groupKey, classId}` (administrators; the date within 180 days; one open job per measure and group, 409), `POST /jobs/:id/done {note}` (the owner or an administrator), `POST /jobs/:id/drop {reason}`, `POST /jobs/:id/reassign {ownerId, ownerRole, dueOn}`. `GET /people` lists the administrators and teachers who can own one.

### Teacher time pulse (voluntary)
- Teachers: `GET /pulse/me`, `POST /pulse/join`, `POST /pulse/leave {erase}` (erase deletes every entry), `PUT /pulse/entry {week: "2026-W07", category, minutes}` (marking, attendance, planning, family, forms, documents; weeks in the last 26, not future). Only the teacher reads their own entries. `GET /pulse/report` (whole-school administrators) gives average minutes a week per kind of work, and a figure only where at least 5 teachers who are currently joined have entered; otherwise it is hidden. No name is ever returned.

Indexes: every `An*` collection leads with `schoolId`. Unique: metric `(schoolId, key)`, run `(schoolId, scheduleId, periodKey, scopeKey)` for scheduled runs, pulse `(schoolId, teacherId, kind, week, category)`. Open job lookup by `(schoolId, status, dueOn)` and `(schoolId, metricKey, groupKey, status)`.

Not in E25: planned against unplanned withdrawal reasons (the school does not record why a child left), email or WhatsApp delivery (in-app only), curriculum coverage from lesson outcomes, individual staff analytics, forecasting. Custom measures use their own default parameters; they do not inherit later changes to the measure they narrow.

## Multi-campus group operations (E26) — `/api/group`

Administrators only. A school-wide administrator (no campus membership) sees every campus. A campus administrator sees only their own campuses, and every total is computed from those campuses alone, so nothing outside them can be worked out by subtraction. Campuses outside a person's access answer `404`.

**Group view**
- `GET /access` — `{wide, campuses[{campusId,name,code,isDefault,status}], today, canDecide}`.
- `GET /rollup?from&to` — every campus the viewer may see: children, classes, teachers, places and fill (`capacity.students`), attendance, fees collected and average mark (same definitions as `/api/analytics`, same small-group hiding: under five children shows no figure, and the next smallest group is hidden with it), each with the target it is held to, the gap, and how many rules are the campus's own, set aside, or waiting. Also `group` totals over the visible campuses, `exceptions` (campuses under a target, urgent first), `hidden` (measures the viewer may not see) and a `scopeNote`. A look across campuses is written to the audit trail (`group.view`), once per person in ten minutes.
- `GET /rollup/:campusId?from&to` — one campus: its classes with the same measures, and the rules that apply.

**Rules**
Seven rules: `attendance.alertGraceMinutes`, `fees.lateGraceDays`, `fees.lateFeeAmount`, `target.attendanceRate`, `target.feeCollection`, `target.learningAverage`, and `capacity.students` (campus only). A value resolves as: campus override (if the group has not locked the rule and the value is inside the group's limits) → group value → the module's own setting → nothing. `fees.lateGraceDays` and `fees.lateFeeAmount` are read by the late-fee run (`POST /api/finance/late-fees/run`, per campus of the child's class) and `attendance.alertGraceMinutes` by absence alerts, so a published rule changes behaviour. With no rule published, behaviour is unchanged.
- `GET /policies/catalog` — the rules with units, widest range, what reads them.
- `GET /policies?campusId&asOf` — what applies at a campus, with `source {kind: campus|group|setting|default, version}`, `locked`, `lo`/`hi`, `groupValue`, `override`, `ignored` (`locked`|`limits`), `canOverride`, and any waiting change. `asOf` reads the past.
- `GET /policies/group` — the group's own values, limits, locks and the number of campuses with their own (waiting changes only for school-wide administrators).
- `GET /policies/pending` — changes waiting. A campus administrator sees only requests for their campuses.
- `GET /policies/history?key&campusId` — every version with who made it, why, who decided and when; `soleAdmin` marks a decision made by the only school-wide administrator.
- `GET /effective?campusId` — the values in force, for other tools.
- `PUT /policies/group/:key` — school-wide only. `{value|null, lo, hi, locked, reason}`; a limit-only change has no value. `PUT /policies/campus/:campusId/:key` — `{value|null, reason}`; `null` removes the campus's own value. A campus administrator may ask only for campuses they administer, inside the group's limits (`422` with `reason:'limits'`, `lo`, `hi`); a locked rule answers `409 reason:'locked'`. Both create a version waiting for approval; one waiting version per rule and scope (`409`).
- `POST /policies/:id/decide` — school-wide only. `{approve, note}`; turning down needs a note. The person who made a group change cannot decide it (`403 reason:'maker_checker'`); a school with one school-wide administrator may decide its own and the version records `soleAdmin`. A campus request is decided by any school-wide administrator. A request is checked again when it is decided, so one that no longer fits the group's limits answers `409 reason:'limits'`.

Versions are never edited or deleted. A published version replaces the previous one (`superseded`). An override that falls outside new limits, or under a new lock, is set aside, not deleted, and applies again if the group allows it. Notifications go to the other school-wide administrators when a change is waiting, and to the maker when it is decided.

Not in E26: users who belong to several schools or an organisation above the school, sharing a template between separate schools, a campus switcher across every module (campus scoping already applies in each module), and rules for modules other than attendance alerts and late fees.

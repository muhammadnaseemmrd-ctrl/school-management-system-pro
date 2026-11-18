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

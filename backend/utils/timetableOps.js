// Shared timetable rules (PRD E10): rooms, clashes, workload. Used by the slot editor, the generator and the planning desk.
const Room = require('../models/Room'); const Timetable = require('../models/Timetable'); const Student = require('../models/Student');
const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };
const overlaps = (a1, a2, b1, b2) => toMin(a1) < toMin(b2) && toMin(b1) < toMin(a2);
const roomKey = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const label = (c) => (c && c.standard ? `Std ${c.standard} (${c.division})` : 'another class');

// Is this room usable for this lesson? Returns null when fine, or { status, body } to send back.
// A room that is already in use is never allowed; capacity and room kind can be overridden with `force`.
async function checkRoom({ schoolId, classId, day, startTime, endTime, roomName, subject, force }) {
  const name = String(roomName || '').trim(); if (!name) return null;
  if (!(await Room.countDocuments({ schoolId }))) return null;            // no room list yet: free text is accepted
  const room = await Room.findOne({ schoolId, nameKey: roomKey(name) });
  if (!room) return { status: 400, body: { message: `"${name}" is not in the room list. Add it under Rooms first.` } };
  if (!room.active) return { status: 409, body: { roomInactive: true, message: `${room.name} is out of use.` } };
  const others = await Timetable.find({ schoolId, dayOfWeek: day }).populate('classId', 'standard division');
  for (const t of others) {
    if (String(t.classId?._id || t.classId) === String(classId)) continue;
    for (const s of t.slots || []) if (!s.isBreak && roomKey(s.room) === room.nameKey && overlaps(s.startTime, s.endTime, startTime, endTime)) {
      return { status: 409, body: { roomClash: true, message: `${room.name} is already used by ${label(t.classId)} at ${s.startTime} - ${s.endTime} on ${day}. A room cannot be booked twice.` } };
    }
  }
  if (!force) {
    const size = await Student.countDocuments({ schoolId, classId, isActive: { $ne: false } });
    if (size > room.capacity) return { status: 409, body: { capacity: true, message: `${room.name} holds ${room.capacity} but the class has ${size} students.` } };
    if (subject?.roomKind && subject.roomKind !== room.kind) return { status: 409, body: { roomKind: true, message: `${subject.name} needs a ${subject.roomKind}, and ${room.name} is a ${room.kind}.` } };
  }
  return null;
}

// Every teacher or room used twice at the same time, from the live timetable.
async function findConflicts(schoolId) {
  const tts = await Timetable.find({ schoolId, isActive: { $ne: false } }).populate('classId', 'standard division');
  const out = []; const seenT = new Set(); const seenR = new Set();
  const byDay = {}; for (const t of tts) (byDay[t.dayOfWeek] ||= []).push(t);
  for (const [day, list] of Object.entries(byDay)) {
    const rows = []; for (const t of list) for (const s of t.slots || []) if (!s.isBreak) rows.push({ cls: label(t.classId), classId: String(t.classId?._id || t.classId), s });
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j]; if (a.classId === b.classId || !overlaps(a.s.startTime, a.s.endTime, b.s.startTime, b.s.endTime)) continue;
      if (a.s.teacherId && String(a.s.teacherId) === String(b.s.teacherId)) { const k = `${day}|${a.s.teacherId}|${[a.classId, b.classId].sort()}|${a.s.startTime}`; if (!seenT.has(k)) { seenT.add(k); out.push({ kind: 'teacher', day, teacherId: String(a.s.teacherId), a: `${a.cls} ${a.s.startTime}-${a.s.endTime}`, b: `${b.cls} ${b.s.startTime}-${b.s.endTime}` }); } }
      if (a.s.room && roomKey(a.s.room) === roomKey(b.s.room)) { const k = `${day}|${roomKey(a.s.room)}|${[a.classId, b.classId].sort()}|${a.s.startTime}`; if (!seenR.has(k)) { seenR.add(k); out.push({ kind: 'room', day, room: a.s.room, a: `${a.cls} ${a.s.startTime}-${a.s.endTime}`, b: `${b.cls} ${b.s.startTime}-${b.s.endTime}` }); } }
    }
  }
  return out;
}

// periods a lesson counts as (a merged double lesson counts twice)
const periodsOf = (s, dur) => Math.max(1, Math.round((toMin(s.endTime) - toMin(s.startTime)) / (dur || 45)));

module.exports = { toMin, overlaps, roomKey, DAYS, label, checkRoom, findConflicts, periodsOf };

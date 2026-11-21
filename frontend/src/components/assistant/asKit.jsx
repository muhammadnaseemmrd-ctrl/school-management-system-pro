import React from 'react';
import { Tag } from '../group/gKit';
export { useGet, call, Tabs, Loading, Note, Table, Td, Reason, AskForm, Tag, dt, day, download } from '../group/gKit';

export const DSTATUS = { Draft: ['Draft (only you can see it)', 'none'], Review: ['Waiting for review', 'warn'], Approved: ['Approved', 'good'], Rejected: ['Turned down', 'bad'], Withdrawn: ['Withdrawn', 'none'], Expired: ['Expired', 'none'] };
export const DStatus = ({ s }) => { const m = DSTATUS[s] || [s, 'none']; return <Tag tone={m[1]}>{m[0]}</Tag>; };
export const SEV = { block: ['Must fix', 'bad'], warn: ['Check', 'warn'], note: ['Note', 'info'] };
export const Sev = ({ s }) => { const m = SEV[s] || [s, 'none']; return <Tag tone={m[1]}>{m[0]}</Tag>; };
export const KIND_WORD = { lesson_plan: 'Lesson plan', notice: 'Notice', question_set: 'Questions', rubric_feedback: 'Feedback comments', translation: 'Translation' };
export const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

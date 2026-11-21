import React from 'react';
import apiClient from '../../utils/apiClient';
import { useGet, AskForm, addDays, today } from './anKit';

// Hand a job to a named person. Loaded only when an administrator opens it (the list of people is an administrator's).
export default function JobForm({ seed = {}, onClose, onDone }) {
  const people = useGet('/analytics/people', {});
  const opts = people.data ? [...people.data.admins.map((a) => [`admin:${a.id}`, `${a.name} (administrator)`]), ...people.data.teachers.map((a) => [`teacher:${a.id}`, `${a.name} (teacher)`])] : [];
  return (
    <AskForm title={seed.heading || 'Give this to someone'} intro={seed.intro} confirm="Make the job" onClose={onClose}
      initial={{ title: seed.title || '', dueOn: addDays(today(), 7), owner: '' }}
      fields={[{ k: 'title', label: 'What needs doing', required: true, full: true, max: 160 }, { k: 'detail', label: 'More detail (optional)', type: 'textarea', max: 500 },
        { k: 'owner', label: 'Who owns it', type: 'select', required: true, options: [['', people.loading ? 'Loading…' : 'Choose a person'], ...opts] }, { k: 'dueOn', label: 'Due by', type: 'date', required: true }]}
      onDone={async (v) => {
        const [role, id] = v.owner.split(':');
        const isClass = seed.groupKey && /^[a-f0-9]{24}$/.test(seed.groupKey);
        await apiClient.post('/analytics/jobs', { title: v.title, detail: v.detail, ownerId: id, ownerRole: role, dueOn: v.dueOn, metricKey: seed.metricKey || '', groupKey: seed.groupKey || '', groupLabel: seed.groupLabel || '', classId: isClass ? seed.groupKey : undefined, source: seed.metricKey ? 'exception' : 'manual' });
        onDone();
      }} />
  );
}

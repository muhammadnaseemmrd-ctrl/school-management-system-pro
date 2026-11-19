import React, { useState } from 'react';
import QuestionBank from './QuestionBank';
import QuizDesk from './QuizDesk';
import { MarkingQueue, Appeals, Arrangements } from './MarkingDesk';

// Quizzes and online exams for staff: build, publish, mark, release, analyse
export default function AssessDesk({ isAdmin = false }) {
  const [tab, setTab] = useState('quizzes');
  const tabs = [['quizzes', 'Quizzes and exams'], ['bank', 'Question bank'], ['marking', 'Marking'], ['appeals', 'Appeals'], ['access', 'Arrangements']];
  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Quizzes and exams" className="flex flex-wrap gap-2">{tabs.map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${tab === k ? 'border-[#2a5cac] bg-[#eef2f8] text-[#234c91]' : 'border-[#e3e7e7] bg-white text-[#3b4a5c]'}`}>{v}</button>)}</div>
      {tab === 'quizzes' && <QuizDesk isAdmin={isAdmin} />}{tab === 'bank' && <QuestionBank />}{tab === 'marking' && <MarkingQueue />}{tab === 'appeals' && <Appeals />}{tab === 'access' && <Arrangements isAdmin={isAdmin} />}
    </div>
  );
}

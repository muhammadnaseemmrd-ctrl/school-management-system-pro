// What the writing assistant can make, and the fixed rules around it (PRD E31).
const KINDS = {
  lesson_plan: { label: 'Lesson plan', purpose: 'lesson_plan', separate: false, publishes: null, cites: true, help: 'A lesson skeleton built from your aims and the approved teaching sources you choose. Facts come only from those sources.' },
  notice: { label: 'Notice for families', purpose: 'notice', separate: true, publishes: 'Notice', cites: false, help: 'A notice written only from the facts you give. A different person must approve it before it is published.' },
  question_set: { label: 'Questions', purpose: 'question_set', separate: true, publishes: 'QuestionItem', cites: true, help: 'Questions made from approved sources. A qualified person other than the author must check every answer before they enter the question bank.' },
  rubric_feedback: { label: 'Feedback from a rubric', purpose: 'rubric_feedback', separate: false, publishes: null, cites: false, help: 'Feedback sentences built from the rubric levels you pick. It never writes or changes marks.' },
  translation: { label: 'English and Urdu terms', purpose: 'translation', separate: false, publishes: null, cites: false, help: 'Suggested terms from the school glossary. A person who reads the target language must finish and check the text.' },
};
const KIND_KEYS = Object.keys(KINDS);

const LIMITS = { perUserPerHour: 10, perSchoolPerDay: 300, draftRetentionDays: 90 };
const LIMIT_RANGE = { perUserPerHour: [1, 200], perSchoolPerDay: [10, 5000], draftRetentionDays: [7, 365] };
const PURPOSES = KIND_KEYS;
const MAX = { topic: 160, objective: 200, objectives: 6, notes: 600, fact: 300, source: 20000, sources: 5, minutes: [10, 180], questions: 10, translation: 1500, glossary: 300 };

// A short school glossary, English and Urdu. A school can add its own; its own entries win.
const BUILTIN_GLOSSARY = [
  ['school', 'اسکول'], ['student', 'طالب علم'], ['students', 'طلبہ'], ['teacher', 'استاد'], ['teachers', 'اساتذہ'], ['parent', 'والدین'], ['parents', 'والدین'], ['class', 'جماعت'], ['homework', 'گھر کا کام'],
  ['exam', 'امتحان'], ['result', 'نتیجہ'], ['results', 'نتائج'], ['fee', 'فیس'], ['fees', 'فیس'], ['attendance', 'حاضری'], ['absent', 'غیر حاضر'], ['present', 'حاضر'], ['holiday', 'چھٹی'],
  ['notice', 'اطلاع'], ['meeting', 'ملاقات'], ['report card', 'رپورٹ کارڈ'], ['timetable', 'ٹائم ٹیبل'], ['library', 'کتب خانہ'], ['principal', 'پرنسپل'], ['uniform', 'یونیفارم'],
  ['annual day', 'سالانہ تقریب'], ['sports day', 'کھیلوں کا دن'], ['syllabus', 'نصاب'], ['lesson', 'سبق'], ['subject', 'مضمون'], ['quiz', 'کوئز'], ['test', 'ٹیسٹ'], ['term', 'ٹرم'],
  ['admission', 'داخلہ'], ['due date', 'آخری تاریخ'], ['reminder', 'یاد دہانی'], ['school trip', 'تعلیمی دورہ'], ['parent-teacher meeting', 'والدین اور اساتذہ کی ملاقات'], ['closed', 'بند'],
  ['tomorrow', 'کل'], ['today', 'آج'], ['please', 'براہ کرم'], ['important', 'اہم'], ['safety', 'حفاظت'], ['bus', 'بس'], ['transport', 'ٹرانسپورٹ'], ['event', 'تقریب'], ['prize', 'انعام'],
  ['certificate', 'سند'], ['scholarship', 'وظیفہ'], ['reading', 'پڑھنا'], ['writing', 'لکھنا'], ['mathematics', 'ریاضی'], ['science', 'سائنس'], ['english', 'انگریزی'], ['urdu', 'اردو'],
  ['islamiat', 'اسلامیات'], ['social studies', 'معاشرتی علوم'], ['computer', 'کمپیوٹر'], ['monday', 'پیر'], ['tuesday', 'منگل'], ['wednesday', 'بدھ'], ['thursday', 'جمعرات'], ['friday', 'جمعہ'], ['saturday', 'ہفتہ'], ['sunday', 'اتوار'],
].map(([en, ur]) => ({ en, ur }));

const STOP = new Set('the a an and or but of to in on at by for with from as is are was were be been being this that these those it its into than then there their they them you your we our not no yes can could should would will may might do does did have has had about over under between during before after above below up down out off also such more most some any each other which who whom what when where why how all both few many much very just only own same so too'.split(' '));

module.exports = { KINDS, KIND_KEYS, LIMITS, LIMIT_RANGE, PURPOSES, MAX, BUILTIN_GLOSSARY, STOP };

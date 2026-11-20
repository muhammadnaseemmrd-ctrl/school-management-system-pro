import React from 'react';
import LearnerApp from './LearnerApp';
import { studentApi } from './lkit';

// A student who was made a learner opens their courses from their ordinary dashboard, with their ordinary sign-in.
export default function StudentCourses() { return <LearnerApp api={studentApi} compact />; }

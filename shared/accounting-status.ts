import type { Assessment, AssessmentStatus } from './contracts';

export type AccountingStatus = 'not-reviewed' | 'needs-follow-up' | 'ready-for-handoff';
export const accountingStatuses = [
  { value: 'not-reviewed', label: 'Not reviewed', tone: 'neutral', rank: 0 },
  { value: 'needs-follow-up', label: 'Needs follow-up', tone: 'warning', rank: 1 },
  { value: 'ready-for-handoff', label: 'Ready for handoff', tone: 'success', rank: 2 },
] as const;

export const followUpReasons = [
  { value: 'needs-evidence', label: 'Missing evidence' },
  { value: 'investigate', label: 'Unresolved discrepancy' },
] as const;

// Keep stored assessment IDs compatible while presenting progress separately
// from the follow-up reason recorded inside a case.
export function accountingStatus(assessment?: Pick<Assessment, 'status'> | null) {
  return !assessment ? accountingStatuses[0] : assessment.status === 'ready' ? accountingStatuses[2] : accountingStatuses[1];
}

export function followUpReason(status: AssessmentStatus) {
  return followUpReasons.find(reason => reason.value === status)?.label;
}

import type { Assessment } from './contracts';

// Read existing single-source assessments without rewriting persisted history.
export function assessmentCitations(assessment?: Pick<Assessment, 'citations' | 'sourceDocumentId' | 'pageNumber'> | null) {
  return assessment?.citations ?? (assessment?.sourceDocumentId ? [{ sourceDocumentId: assessment.sourceDocumentId, pageNumber: assessment.pageNumber || 1 }] : []);
}

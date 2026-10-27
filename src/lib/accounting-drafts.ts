import type { AssessmentStatus } from '../../shared/contracts';

export interface AssessmentDraftFields {
  status: AssessmentStatus | 'follow-up' | '';
  note: string;
  citations: Array<{ sourceDocumentId: string; page: string }>;
}

type StoredDraft = AssessmentDraftFields & { version: 2; caseId: string; revision?: string };
const memory = new Map<string, StoredDraft>();
const unpersisted = new Set<string>();
const key = (caseId: string) => 'ridgeline-assessment-draft:v1:' + caseId;

function decode(value: unknown, caseId: string): StoredDraft | undefined {
  if (!value || typeof value !== 'object') return;
  const draft = value as Record<string, unknown>;
  if (![1, 2].includes(draft.version as number) || draft.caseId !== caseId
    || !['', 'ready', 'needs-evidence', 'investigate', 'follow-up'].includes(draft.status as string)
    || typeof draft.note !== 'string' || draft.note.length > 4000
    || (draft.revision !== undefined && typeof draft.revision !== 'string')) return;
  let citations: AssessmentDraftFields['citations'];
  if (draft.version === 1) {
    if (typeof draft.citationId !== 'string' || draft.citationId.length > 200 || typeof draft.page !== 'string' || draft.page.length > 50) return;
    citations = draft.citationId ? [{ sourceDocumentId: draft.citationId, page: draft.page }] : [];
  } else {
    if (!Array.isArray(draft.citations) || draft.citations.length > 100 || !draft.citations.every(citation => citation && typeof citation.sourceDocumentId === 'string' && citation.sourceDocumentId.length <= 200 && typeof citation.page === 'string' && citation.page.length <= 50)) return;
    citations = draft.citations;
  }
  return { version: 2, caseId, status: draft.status as AssessmentDraftFields['status'], note: draft.note, citations, revision: draft.revision as string | undefined };
}

const unavailable = 'Browser storage is unavailable. Keep this tab open or save before refreshing.';
function recovered(draft?: StoredDraft, warning?: string) {
  // Old drafts without a revision remain recoverable until the next edit.
  return { draft, revision: draft ? draft.revision || JSON.stringify(draft) : undefined, warning };
}

export function readAssessmentDraft(caseId: string) {
  if (unpersisted.has(caseId)) return recovered(memory.get(caseId), unavailable);
  let raw: string | null;
  try {
    raw = localStorage.getItem(key(caseId));
  } catch {
    return recovered(memory.get(caseId), unavailable);
  }
  if (!raw) return recovered(memory.get(caseId));
  try {
    const value = decode(JSON.parse(raw), caseId);
    if (value) { memory.set(caseId, value); return recovered(value); }
  } catch { /* Invalid stored data must not replace a saved assessment. */ }
  return recovered(memory.get(caseId), 'The browser draft could not be read. The saved assessment is still available.');
}

// Write in the input event so immediate navigation cannot outrun an effect.
export function writeAssessmentDraft(caseId: string, fields: AssessmentDraftFields): boolean {
  const draft: StoredDraft = { ...fields, version: 2, caseId, revision: crypto.randomUUID() };
  memory.set(caseId, draft);
  try { localStorage.setItem(key(caseId), JSON.stringify(draft)); unpersisted.delete(caseId); return true; }
  catch { unpersisted.add(caseId); return false; }
}

// Call only after the service acknowledges an explicit Save assessment.
export function clearAssessmentDraft(caseId: string, submittedRevision?: string): 'cleared' | 'changed' | 'unavailable' {
  const current = readAssessmentDraft(caseId);
  if (!submittedRevision || current.revision !== submittedRevision) return current.draft ? 'changed' : current.warning ? 'unavailable' : 'cleared';
  memory.delete(caseId);
  unpersisted.delete(caseId);
  try { localStorage.removeItem(key(caseId)); return 'cleared'; }
  catch { return 'unavailable'; }
}

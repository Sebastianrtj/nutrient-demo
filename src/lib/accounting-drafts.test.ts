import assert from 'node:assert/strict';
import test from 'node:test';
import { readAssessmentDraft, writeAssessmentDraft, clearAssessmentDraft } from './accounting-drafts';

test('legacy single-source drafts recover as multiple-source drafts without losing edits', t => {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  const caseId = 'legacy-citation-test';
  values.set('ridgeline-assessment-draft:v1:' + caseId, JSON.stringify({ version: 1, caseId, status: 'investigate', note: 'Keep this unsaved review.', citationId: 'scan-RS-417652', page: '1' }));
  const legacy = readAssessmentDraft(caseId);
  assert.equal(legacy.draft?.note, 'Keep this unsaved review.');
  assert.deepEqual(legacy.draft?.citations, [{ sourceDocumentId: 'scan-RS-417652', page: '1' }]);
  const fields = { status: 'investigate' as const, note: legacy.draft!.note, citations: [...legacy.draft!.citations, { sourceDocumentId: 'invoice-INV-2104464', page: '2' }] };
  assert.equal(writeAssessmentDraft(caseId, fields), true);
  const submitted = readAssessmentDraft(caseId);
  assert.deepEqual(submitted.draft?.citations, fields.citations);
  writeAssessmentDraft(caseId, { ...fields, note: 'A newer edit while saving.' });
  assert.equal(clearAssessmentDraft(caseId, submitted.revision), 'changed');
  const newer = readAssessmentDraft(caseId); assert.equal(newer.draft?.note, 'A newer edit while saving.');
  assert.equal(clearAssessmentDraft(caseId, newer.revision), 'cleared');
  assert.equal(readAssessmentDraft(caseId).draft, undefined);
});

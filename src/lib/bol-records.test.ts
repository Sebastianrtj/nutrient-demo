import test from 'node:test';
import assert from 'node:assert/strict';
import type { DocumentRecord } from '../../shared/contracts';
import { bolRecordLabel, chronologicalBolRecords, isCombinedBol, preferredBolRecord } from '../../shared/bol-records';

const doc = (id: string, kind: DocumentRecord['kind'], createdAt: string, sourceDocumentId?: string, shipmentId = 'RS-test'): DocumentRecord => ({id, kind, createdAt, sourceDocumentId, shipmentId, name: id + '.pdf', url: '/api/documents/' + id});
const pickup = doc('pickup-A', 'demo-pickup', '2026-10-27T21:00:00Z');
const completed = doc('completed-A', 'demo-receiving', '2026-10-27T22:00:00Z', pickup.id);

test('combined BOL requires a same-shipment saved pickup parent', () => {
  assert.equal(isCombinedBol(completed, [pickup, completed]), true);
  assert.equal(isCombinedBol(completed, [completed]), false);
  assert.equal(isCombinedBol(completed, [{...pickup, shipmentId:'other'}, completed]), false);
  assert.equal(isCombinedBol({...completed, sourceDocumentId:'original'}, [doc('original','bol',''), pickup]), false);
});

test('latest completed BOL is independent of store directory order and later incomplete rehearsals', () => {
  const laterPickup = doc('pickup-B', 'demo-pickup', '2026-10-27T23:00:00Z');
  const next = doc('completed-B', 'demo-receiving', '2026-10-28T01:00:00Z', laterPickup.id);
  assert.equal(preferredBolRecord([completed,laterPickup,pickup])?.id, completed.id);
  assert.equal(preferredBolRecord([next,completed,laterPickup,pickup])?.id, next.id);
});

test('legacy receiver-only records stay accurately labelled and do not supersede completed BOLs', () => {
  const legacy = doc('legacy', 'demo-receiving', '2026-10-29T01:00:00Z', 'unsigned');
  assert.equal(bolRecordLabel(legacy, [legacy,pickup,completed]), 'Receiver-only BOL');
  assert.equal(bolRecordLabel(completed,[legacy,pickup,completed]), 'Signed BOL');
  assert.equal(preferredBolRecord([legacy,pickup,completed])?.id,completed.id);
  assert.equal(preferredBolRecord([legacy,pickup])?.id,pickup.id);
});

test('history ordering is deterministic and leaves input documents unchanged', () => {
  const b = doc('b','demo-pickup','2026-10-27T20:00:00Z');
  const a = doc('a','demo-pickup','2026-10-27T20:00:00Z');
  const input = [b,completed,a,pickup];
  assert.deepEqual(chronologicalBolRecords(input).map(doc=>doc.id),['a','b','pickup-A','completed-A']);
  assert.deepEqual(input,[b,completed,a,pickup]);
  assert.equal(preferredBolRecord([]),undefined);
});

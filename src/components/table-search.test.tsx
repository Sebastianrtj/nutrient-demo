import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Highlight, matchesSearch, searchTerms } from './table-search';

const matches = (query: string, ...fields: string[]) => matchesSearch(fields, searchTerms(query));
const marks = (query: string, text: string) => [...renderToStaticMarkup(<Highlight text={text} terms={searchTerms(query)} />).matchAll(/<mark>(.*?)<\/mark>/g)].map(match => match[1]);

test('a shipment reference matches and highlights as one reference', () => {
  for (const query of ['RS-418806', 'rs418806', 'RS 418806', 'RS-4188']) {
    assert.equal(matches(query, 'RS-418806', 'Halvorsen Trucking Co.'), true, query);
    assert.equal(matches(query, 'RS-999999', 'PO-418806', 'Halvorsen Trucking Co.'), false, query);
    assert.deepEqual(marks(query, 'Halvorsen Trucking Co.'), [], query);
  }
  assert.deepEqual(marks('RS-418806', 'RS-418806'), ['RS-418806']);
  assert.deepEqual(marks('rs418806', 'Shipment RS-418806 · Invoice INV-2105744'), ['RS-418806']);
});

test('short words match prefixes, without arbitrary mid-word results or highlights', () => {
  assert.equal(matches('rs', 'Halvorsen Trucking Co.'), false);
  assert.deepEqual(marks('rs', 'Halvorsen Trucking Co.'), []);
  assert.equal(matches('rs', 'RS-418806'), true);
  assert.equal(matches('halv', 'Halvorsen Trucking Co.'), true);
  assert.deepEqual(marks('halv', 'Halvorsen Trucking Co.'), ['Halv']);
});

test('independent text terms can match different fields', () => {
  assert.equal(matches('BuildRight P10', 'BuildRight Depot', 'P10'), true);
  assert.equal(matches('buildright P10', 'BuildRight Depot', 'P06'), false);
  assert.equal(matches('pallet missing', 'Missing pallet evidence'), true);
  assert.equal(matches('ready handoff', 'Ready for handoff'), true);
  assert.equal(matches('  ', 'Any shipment'), true);
});

test('Accounting IDs, invoices, POs, filenames and numeric portions remain searchable', () => {
  for (const [query, text] of [
    ['CHB0899904', 'CHB-0899904'], ['INV 2105744', 'INV-2105744'],
    ['BR401022449', 'PO BR-401022449'], ['418806', 'RS418806'],
    ['P10_RS-417652_20260707.pdf', 'P10_RS-417652_20260707.pdf'],
    ['RS417652', 'P10_RS-417652_20260707.pdf'],
    ['5750', '$5,750.00'],
  ]) {
    assert.equal(matches(query, text), true, `${query} in ${text}`);
    assert.ok(marks(query, text).length, `highlight ${query} in ${text}`);
  }
});

test('accent folding preserves the displayed letters and mark offsets', () => {
  assert.equal(matches('cafe', 'Café Supply'), true);
  assert.deepEqual(marks('cafe', 'Café Supply'), ['Café']);
  assert.deepEqual(marks('cafe', 'Cafe\u0301 Supply'), ['Cafe\u0301']);
  assert.deepEqual(marks('supply', 'Cafe\u0301 Supply'), ['Supply']);
});

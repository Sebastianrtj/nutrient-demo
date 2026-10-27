import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronRight, SearchX } from 'lucide-react';
import type { Shipment } from '../../shared/contracts';
import { date, Status } from '../ui';
import { TableToolbar, TableSelect, TableFilters, TableResults, SortHeading } from './TableControls';
import type { FilterChip } from './TableControls';
import { Highlight, matchesSearch, searchTerms, tableCollator } from './table-search';
import RecordRow from './RecordRow';
import { useFlipList, useChipMotion } from '../lib/motion-hooks';
import './shipment-list.css';

type SortKey = 'date' | 'id' | 'customer' | 'destination' | 'record';
type SortValue = `${SortKey}-${'asc' | 'desc'}`;
type RecordFilter = 'all' | 'original' | 'stored';
interface View { plant: string; customer: string; record: RecordFilter; sort: SortValue; filtersOpen: boolean; }
let rememberedView: View = { plant: '', customer: '', record: 'all', sort: 'date-desc', filtersOpen: false };
const hasPickup = (item: Shipment) => item.documents.some(doc => doc.kind === 'demo-pickup');
const fieldsFor = (item: Shipment) => [item.id, item.customer, item.destination, item.plant, item.invoiceNo, item.customerPo, item.asnId, item.carrier, `shipment ${item.id}`, `PO ${item.customerPo}`, `invoice ${item.invoiceNo}`, ...item.documents.map(doc => doc.name), hasPickup(item) ? 'demo pickup stored' : 'original BOL'];
const sortOptions: Array<{ value: SortValue; label: string }> = [
  { value: 'date-desc', label: 'Newest first' }, { value: 'date-asc', label: 'Oldest first' },
  { value: 'id-asc', label: 'Shipment: A–Z' }, { value: 'id-desc', label: 'Shipment: Z–A' },
  { value: 'customer-asc', label: 'Customer: A–Z' }, { value: 'customer-desc', label: 'Customer: Z–A' },
  { value: 'destination-asc', label: 'Destination: A–Z' }, { value: 'destination-desc', label: 'Destination: Z–A' },
  { value: 'record-desc', label: 'Stored pickups first' }, { value: 'record-asc', label: 'Originals first' },
];
export default function ShipmentList({ shipments, query, setQuery, returningId }: { shipments: Shipment[]; query: string; setQuery: (value: string) => void; returningId?: string }) {
  const [view, setView] = useState<View>(() => ({ ...rememberedView }));
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const terms = useMemo(() => searchTerms(query), [query]);
  useEffect(() => { rememberedView = view; }, [view]);
  const plants = useMemo(() => [...new Set(shipments.map(item => item.plant))].sort(tableCollator.compare), [shipments]);
  const customers = useMemo(() => [...new Set(shipments.map(item => item.customer))].sort(tableCollator.compare), [shipments]);
  const [sortKey, direction] = view.sort.split('-') as [SortKey, 'asc' | 'desc'];
  const rows = useMemo(() => shipments.filter(item => {
    if (view.plant && item.plant !== view.plant || view.customer && item.customer !== view.customer) return false;
    if (view.record === 'stored' && !hasPickup(item) || view.record === 'original' && hasPickup(item)) return false;
    return matchesSearch(fieldsFor(item), terms);
  }).sort((a, b) => {
    let compared = sortKey === 'date' ? tableCollator.compare(a.shipDate, b.shipDate) : sortKey === 'record' ? Number(hasPickup(a)) - Number(hasPickup(b)) : tableCollator.compare(a[sortKey], b[sortKey]);
    if (direction === 'desc') compared *= -1;
    return compared || tableCollator.compare(a.id, b.id);
  }), [shipments, view.plant, view.customer, view.record, sortKey, direction, terms]);
  const tbody = useRef<HTMLTableSectionElement>(null), chipRow = useRef<HTMLDivElement>(null);
  const prepareRows = useFlipList(tbody, [rows]);
  const prepareChips = useChipMotion(chipRow, [view.plant, view.customer, view.record]);
  const update = (patch: Partial<View>, source?: { key: string; el: Element }) => { prepareRows(); prepareChips(source); setView(current => ({ ...current, ...patch })); };
  const searchFor = (value: string) => { prepareRows(); setQuery(value); };
  const resetFilters = () => update({ plant: '', customer: '', record: 'all' });
  function clearAll() { searchFor(''); resetFilters(); }
  const chips: FilterChip[] = [];
  if (view.plant) chips.push({ key: 'plant', label: `Plant ${view.plant}`, removeLabel: `Remove plant ${view.plant} filter`, onRemove: () => update({ plant: '' }) });
  if (view.customer) chips.push({ key: 'customer', label: view.customer, removeLabel: `Remove ${view.customer} customer filter`, onRemove: () => update({ customer: '' }) });
  if (view.record !== 'all') chips.push({ key: 'record', label: view.record === 'stored' ? 'Demo pickup stored' : 'No demo pickup', removeLabel: 'Remove pickup record filter', onRemove: () => update({ record: 'all' }) });
  function sortBy(key: SortKey) { update({ sort: `${key}-${sortKey === key ? direction === 'asc' ? 'desc' : 'asc' : key === 'date' || key === 'record' ? 'desc' : 'asc'}` }); }
  const ariaSort = (key: SortKey) => sortKey === key ? direction === 'asc' ? 'ascending' : 'descending' : 'none';
  const heading = (key: SortKey, label: string) => <SortHeading label={label} active={sortKey === key} direction={direction} onClick={() => sortBy(key)} />;
  return <main className={`workspace list-workspace record-list shipments${query.trim() ? ' has-query' : ''}`} aria-labelledby={`${id}-title`}>
    <div className="page-heading"><div><div className="eyebrow">Dock workspace</div><h1 id={`${id}-title`}>Shipments</h1></div></div>
    <TableToolbar query={query} onQueryChange={searchFor} inputRef={search} searchLabel="Search shipments" clearSearchLabel="Clear shipment search" placeholder="Shipment, PO or invoice" filtersOpen={view.filtersOpen} filterCount={chips.length} panelId={`${id}-filters`} onToggleFilters={() => update({ filtersOpen: !view.filtersOpen })} sortLabel="Sort shipments" sortValue={view.sort} sortOptions={sortOptions} onSortChange={value => update({ sort: value as SortValue })} />
    <TableFilters id={`${id}-filters`} open={view.filtersOpen} label="Shipment filters" active={chips.length > 0} onReset={resetFilters}>
      <TableSelect label="Plant" className="table-field--small" value={view.plant} onChange={event => update({ plant: event.target.value }, { key: 'plant', el: event.currentTarget })}><option value="">All plants</option>{plants.map(plant => <option key={plant} value={plant}>Plant {plant}</option>)}</TableSelect>
      <TableSelect label="Customer" className="table-field--wide" value={view.customer} onChange={event => update({ customer: event.target.value }, { key: 'customer', el: event.currentTarget })}><option value="">All customers</option>{customers.map(customer => <option key={customer} value={customer}>{customer}</option>)}</TableSelect>
      <TableSelect label="Pickup record" value={view.record} onChange={event => update({ record: event.target.value as RecordFilter }, { key: 'record', el: event.currentTarget })}><option value="all">All records</option><option value="original">No demo pickup</option><option value="stored">Demo pickup stored</option></TableSelect>
    </TableFilters>
    <TableResults chipRef={chipRow} count={rows.length} total={shipments.length} noun="shipment" constrained={Boolean(query) || chips.length > 0} chips={chips} onClear={clearAll} />
    <div className="table-scroll"><table className="data-table shipment-table"><caption className="sr-only">Shipments. Select a column heading to sort.</caption><thead><tr>
      <th scope="col" aria-sort={sortKey === 'customer' ? ariaSort('customer') : ariaSort('id')}>{heading('id', 'Shipment')}<span className="record-header-detail"> / Customer</span></th><th scope="col" aria-sort={ariaSort('destination')}>{heading('destination', 'Destination')}</th><th scope="col" aria-sort={ariaSort('date')}>{heading('date', 'Ship date')}</th><th scope="col" aria-sort={ariaSort('record')}>{heading('record', 'Pickup record')}</th><th scope="col"><span className="sr-only">Action</span></th>
    </tr></thead><tbody ref={tbody}>{rows.map(item => <RecordRow key={item.id} motionId={item.id} returning={item.id === returningId} href={`#/dock/${encodeURIComponent(item.id)}`}>
      <td><a className="row-title" aria-label={item.id} href={`#/dock/${encodeURIComponent(item.id)}`}><Highlight text={item.id} terms={terms} /></a><span className="cell-detail"><Highlight text={item.customer} terms={terms} /></span><span className="cell-detail shipments__references"><span><Highlight text={item.customerPo ? `PO ${item.customerPo}` : 'PO not supplied'} terms={terms} /></span><span aria-hidden="true">·</span><span><Highlight text={item.invoiceNo} terms={terms} /></span>{item.asnId && terms.some(term => matchesSearch([item.asnId], [term])) && <span><Highlight text={item.asnId} terms={terms} /></span>}</span></td>
      <td><Highlight text={item.destination} terms={terms} /><span className="cell-detail">Plant <Highlight text={item.plant} terms={terms} /> · <Highlight text={item.carrier} terms={terms} /></span></td><td className="nowrap"><span className="mobile-cell-label">Ship date</span>{date(item.shipDate, true)}</td><td><Status tone={hasPickup(item) ? 'success' : 'neutral'}>{hasPickup(item) ? 'Demo pickup stored' : 'Original BOL'}</Status></td><td className="row-action"><a className="text-button" href={`#/dock/${encodeURIComponent(item.id)}`} aria-label={`Review BOL for ${item.id}`}>Review BOL<ChevronRight size={16} /></a></td>
    </RecordRow>)}</tbody></table></div>
    {!rows.length && <div className="empty-state record-empty"><SearchX size={28} aria-hidden="true" /><h2>No matching shipments</h2><button type="button" className="button button--secondary" onClick={() => { clearAll(); search.current?.focus(); }}>Clear search and filters</button></div>}
  </main>;
}

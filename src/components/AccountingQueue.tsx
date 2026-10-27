import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronRight, SearchX } from 'lucide-react';
import type { Deduction, Shipment } from '../../shared/contracts';
import { accountingStatus, accountingStatuses } from '../../shared/accounting-status';
import type { AccountingStatus } from '../../shared/accounting-status';
import { date, deadlineLabel, daysUntil, money, Status } from '../ui';
import { TableToolbar, TableSelect, TableFilters, TableResults, SortHeading } from './TableControls';
import type { FilterChip } from './TableControls';
import { Highlight, matchesSearch, searchTerms, tableCollator } from './table-search';
import RecordRow from './RecordRow';
import './accounting-queue.css';

type SortKey = 'deadline' | 'amount' | 'id' | 'retailer' | 'reason' | 'status';
type SortValue = `${SortKey}-${'asc' | 'desc'}`;
type EvidenceFilter = 'all' | 'gaps' | Deduction['evidenceState'];
type ReviewFilter = 'all' | AccountingStatus;
type DeadlineFilter = 'all' | 'overdue' | 'week' | 'later';
interface View { query: string; retailer: string; evidence: EvidenceFilter; review: ReviewFilter; deadline: DeadlineFilter; sort: SortValue; filtersOpen: boolean; }
let rememberedView: View = { query: '', retailer: '', evidence: 'all', review: 'all', deadline: 'all', sort: 'deadline-asc', filtersOpen: false };
const evidenceOptions = [{ value: 'all', label: 'All files' }, { value: 'gaps', label: 'Missing or mismatched' }, { value: 'available', label: 'Files available' }, { value: 'missing', label: 'Missing files' }, { value: 'mismatch', label: 'Match needs checking' }];
const reviewOptions = [{ value: 'all', label: 'All statuses' }, ...accountingStatuses];
function reviewFilter(value: string): ReviewFilter {
  if (value === 'unassessed') return 'not-reviewed';
  if (value === 'ready') return 'ready-for-handoff';
  if (value === 'needs-evidence' || value === 'investigate') return 'needs-follow-up';
  return accountingStatuses.some(status => status.value === value) ? value as AccountingStatus : 'all';
}
const reasonFor = (item: Deduction) => /PALLET/.test(item.reasonCode) ? 'Pallet count' : /NOT.?RECEIVED/.test(item.reasonCode) ? 'Not received' : /SHORT/.test(item.reasonCode) ? 'Shortage' : item.reasonText;
const deadlineOptions = [{ value: 'all', label: 'All deadlines' }, { value: 'overdue', label: 'Overdue' }, { value: 'week', label: 'Due within 7 days' }, { value: 'later', label: 'Later than 7 days' }];
const sortOptions: Array<{ value: SortValue; label: string }> = [
  { value: 'deadline-asc', label: 'Due soonest' }, { value: 'deadline-desc', label: 'Due latest' },
  { value: 'amount-desc', label: 'Highest amount' }, { value: 'amount-asc', label: 'Lowest amount' },
  { value: 'id-asc', label: 'Deduction: A–Z' }, { value: 'id-desc', label: 'Deduction: Z–A' },
  { value: 'retailer-asc', label: 'Retailer: A–Z' }, { value: 'retailer-desc', label: 'Retailer: Z–A' },
  { value: 'reason-asc', label: 'Reason: A–Z' }, { value: 'reason-desc', label: 'Reason: Z–A' },
  { value: 'status-asc', label: 'Not reviewed first' }, { value: 'status-desc', label: 'Ready for handoff first' },
];
export default function AccountingQueue({ deductions, shipments, sampleDate }: { deductions: Deduction[]; shipments: Shipment[]; sampleDate: string }) {
  const [view, setView] = useState<View>(() => ({ ...rememberedView }));
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => { rememberedView = view; }, [view]);
  const terms = useMemo(() => searchTerms(view.query), [view.query]);
  const currentReview = reviewFilter(view.review);
  const retailerFor = (item: Deduction) => shipments.find(shipment => shipment.id === item.shipmentId)?.customer || item.sourcePortal;
  const retailers = [...new Set(deductions.map(retailerFor))].sort(tableCollator.compare);
  const [sortKey, direction] = view.sort.split('-') as [SortKey, 'asc' | 'desc'];
  const rows = deductions.filter(item => {
    if (view.retailer && retailerFor(item) !== view.retailer) return false;
    if (view.evidence !== 'all' && (view.evidence === 'gaps' ? item.evidenceState === 'available' : item.evidenceState !== view.evidence)) return false;
    if (currentReview !== 'all' && accountingStatus(item.assessment).value !== currentReview) return false;
    const days = daysUntil(item.deadline, sampleDate);
    if (view.deadline === 'overdue' && days >= 0 || view.deadline === 'week' && (days < 0 || days > 7) || view.deadline === 'later' && days <= 7) return false;
    return matchesSearch([item.id, item.invoiceNo, item.customerPo, item.sourcePortal, retailerFor(item), item.reasonText, item.reasonCode, item.shipmentId || '', `PO ${item.customerPo}`, `invoice ${item.invoiceNo}`, `deduction ${item.id}`, ...item.documents.map(doc => doc.name), String(item.amountUsd), money(item.amountUsd), date(item.deadline, true), accountingStatus(item.assessment).label], terms);
  }).sort((a, b) => {
    let compared = sortKey === 'deadline' ? tableCollator.compare(a.deadline, b.deadline)
      : sortKey === 'amount' ? a.amountUsd - b.amountUsd
      : sortKey === 'retailer' ? tableCollator.compare(retailerFor(a), retailerFor(b))
      : sortKey === 'reason' ? tableCollator.compare(reasonFor(a), reasonFor(b))
      : sortKey === 'status' ? accountingStatus(a.assessment).rank - accountingStatus(b.assessment).rank : tableCollator.compare(a.id, b.id);
    if (direction === 'desc') compared *= -1;
    return compared || tableCollator.compare(a.id, b.id);
  });
  const update = (patch: Partial<View>) => setView(current => ({ ...current, ...patch }));
  const resetFilters = () => update({ retailer: '', evidence: 'all', review: 'all', deadline: 'all' });
  const clearAll = () => update({ query: '', retailer: '', evidence: 'all', review: 'all', deadline: 'all' });
  const chips: FilterChip[] = [];
  if (view.retailer) chips.push({ key: 'retailer', label: view.retailer, removeLabel: 'Remove retailer filter', onRemove: () => update({ retailer: '' }) });
  if (view.evidence !== 'all') chips.push({ key: 'evidence', label: `Files: ${evidenceOptions.find(option => option.value === view.evidence)!.label}`, removeLabel: 'Remove evidence filter', onRemove: () => update({ evidence: 'all' }) });
  if (currentReview !== 'all') chips.push({ key: 'review', label: `Status: ${reviewOptions.find(option => option.value === currentReview)!.label}`, removeLabel: 'Remove review filter', onRemove: () => update({ review: 'all' }) });
  if (view.deadline !== 'all') chips.push({ key: 'deadline', label: deadlineOptions.find(option => option.value === view.deadline)!.label, removeLabel: 'Remove deadline filter', onRemove: () => update({ deadline: 'all' }) });
  function sortBy(key: SortKey) { update({ sort: `${key}-${sortKey === key ? direction === 'asc' ? 'desc' : 'asc' : key === 'amount' ? 'desc' : 'asc'}` }); }
  const ariaSort = (key: SortKey) => sortKey === key ? direction === 'asc' ? 'ascending' : 'descending' : 'none';
  const heading = (key: SortKey, label: string) => <SortHeading label={label} active={sortKey === key} direction={direction} onClick={() => sortBy(key)} />;
  return <main className={`workspace list-workspace record-list accounting-queue${view.query.trim() ? ' has-query' : ''}`} aria-labelledby={`${id}-title`}>
    <div className="page-heading"><div><div className="eyebrow">Accounting workspace</div><h1 id={`${id}-title`}>Deduction review</h1></div><div className="sample-date"><span>Sample date</span><strong>{date(sampleDate, true)}</strong></div></div>
    <TableToolbar query={view.query} onQueryChange={query => update({ query })} inputRef={search} searchLabel="Search deductions" clearSearchLabel="Clear deduction search" placeholder="Deduction, PO or invoice" filtersOpen={view.filtersOpen} filterCount={chips.length} panelId={`${id}-filters`} onToggleFilters={() => update({ filtersOpen: !view.filtersOpen })} sortLabel="Sort deductions" sortValue={view.sort} sortOptions={sortOptions} onSortChange={sort => update({ sort: sort as SortValue })} />
    <TableFilters id={`${id}-filters`} open={view.filtersOpen} label="Deduction filters" active={chips.length > 0} onReset={resetFilters}>
      <TableSelect label="Retailer" className="table-field--wide" value={view.retailer} onChange={event => update({ retailer: event.target.value })}><option value="">All retailers</option>{retailers.map(retailer => <option key={retailer} value={retailer}>{retailer}</option>)}</TableSelect>
      <TableSelect label="Files" value={view.evidence} onChange={event => update({ evidence: event.target.value as EvidenceFilter })}>{evidenceOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</TableSelect>
      <TableSelect label="Status" value={currentReview} onChange={event => update({ review: event.target.value as ReviewFilter })}>{reviewOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</TableSelect>
      <TableSelect label="Deadline" value={view.deadline} onChange={event => update({ deadline: event.target.value as DeadlineFilter })}>{deadlineOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</TableSelect>
    </TableFilters>
    <TableResults count={rows.length} total={deductions.length} noun="case" constrained={Boolean(view.query) || chips.length > 0} chips={chips} onClear={clearAll} />
    <div className="table-scroll"><table className="data-table deduction-table"><caption className="sr-only">Deductions. Select a column heading to sort.</caption><thead><tr>
      <th scope="col" aria-sort={sortKey === 'retailer' ? ariaSort('retailer') : ariaSort('id')}>{heading('id', 'Deduction')}<span className="record-header-detail"> / Retailer</span></th><th scope="col" aria-sort={ariaSort('reason')}>{heading('reason', 'Reason')}</th><th scope="col" className="numeric" aria-sort={ariaSort('amount')}>{heading('amount', 'Amount')}</th><th scope="col" aria-sort={ariaSort('deadline')}>{heading('deadline', 'Respond by')}</th><th scope="col" aria-sort={ariaSort('status')}>{heading('status', 'Status')}</th><th scope="col"><span className="sr-only">Action</span></th>
    </tr></thead><tbody>{rows.map(item => { const state = accountingStatus(item.assessment); return <RecordRow key={item.id} href={`#/accounting/${encodeURIComponent(item.id)}`}>
      <td><a className="row-title" aria-label={item.id} href={`#/accounting/${encodeURIComponent(item.id)}`}><Highlight text={item.id} terms={terms} /></a><span className="cell-detail"><Highlight text={retailerFor(item)} terms={terms} /></span><span className="cell-detail accounting-queue__references"><span><Highlight text={item.invoiceNo} terms={terms} /></span><span aria-hidden="true"> · </span><span><Highlight text={`PO ${item.customerPo}`} terms={terms} /></span></span></td>
      <td className="reason-cell"><span title={item.reasonText}><Highlight text={reasonFor(item)} terms={terms} /></span><span className="cell-detail"><Highlight text={item.shipmentId || 'Shipment match unresolved'} terms={terms} /></span></td><td className="numeric amount-cell">{money(item.amountUsd)}</td><td className="deadline-cell"><span className="mobile-cell-label">Respond by</span><span className="nowrap">{date(item.deadline)}</span>{daysUntil(item.deadline, sampleDate) <= 7 && <span className="cell-detail text-warning">{deadlineLabel(item.deadline, sampleDate)}</span>}</td><td><Status tone={state.tone}>{state.label}</Status></td><td className="row-action"><a className="text-button" href={`#/accounting/${encodeURIComponent(item.id)}`} aria-label={`Review deduction ${item.id}`}>Review<ChevronRight size={16} /></a></td>
    </RecordRow>; })}</tbody></table></div>
    {!rows.length && <div className="empty-state record-empty"><SearchX size={28} aria-hidden="true" /><h2>No matching deductions</h2><button type="button" className="button button--secondary" onClick={() => { clearAll(); search.current?.focus(); }}>Clear search and filters</button></div>}
    <p className="list-footnote">File availability does not establish delivery or a valid dispute.</p>
  </main>;
}

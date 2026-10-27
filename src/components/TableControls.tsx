import { useEffect, useId } from 'react';
import type { ReactNode, RefObject, SelectHTMLAttributes } from 'react';
import { ArrowDown, ArrowUpDown, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { removeChip, RollingNumber } from '../lib/motion-hooks';
import './table-controls.css';

export function TableSelect({ label, hideLabel = false, className = '', leadingIcon, id, children, ...props }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & { label: string; hideLabel?: boolean; className?: string; leadingIcon?: ReactNode }) {
  const autoId = useId();
  const fieldId = id || autoId;
  return <label className={`table-field ${className}`} htmlFor={fieldId}>
    <span className={hideLabel ? 'sr-only' : 'table-field__label'}>{label}</span>
    <span className={`table-select${leadingIcon ? ' table-select--leading' : ''}`}>
      {leadingIcon && <span className="table-select__leading" aria-hidden="true">{leadingIcon}</span>}
      <select {...props} id={fieldId} aria-label={props['aria-label'] || label} className="table-select__native">{children}</select>
      <ChevronDown className="table-select__chevron" size={14} strokeWidth={1.6} aria-hidden="true" />
    </span>
  </label>;
}

export function TableToolbar({ query, onQueryChange, inputRef, searchLabel, placeholder, clearSearchLabel, filtersOpen, filterCount, panelId, onToggleFilters, sortLabel, sortValue, sortOptions, onSortChange }: {
  query: string; onQueryChange: (value: string) => void; inputRef: RefObject<HTMLInputElement | null>;
  searchLabel: string; placeholder: string; clearSearchLabel: string;
  filtersOpen: boolean; filterCount: number; panelId: string; onToggleFilters: () => void;
  sortLabel: string; sortValue: string; sortOptions: Array<{ value: string; label: string }>; onSortChange: (value: string) => void;
}) {
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && target instanceof Element && !target.closest('input,textarea,select,[contenteditable="true"]')) { event.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', focus); return () => window.removeEventListener('keydown', focus);
  }, [inputRef]);
  return <div className="record-toolbar">
    <div className="record-search"><Search size={18} aria-hidden="true" /><input ref={inputRef} type="search" aria-label={searchLabel} value={query} onChange={event => onQueryChange(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && query) { event.preventDefault(); onQueryChange(''); } }} placeholder={placeholder} autoComplete="off" spellCheck={false} enterKeyHint="search" aria-keyshortcuts="/" />{query ? <button type="button" onClick={() => { onQueryChange(''); inputRef.current?.focus(); }} aria-label={clearSearchLabel}><X size={16} /></button> : <kbd aria-hidden="true">/</kbd>}</div>
    <button type="button" className={`record-filter-toggle${filterCount ? ' has-filters' : ''}`} aria-expanded={filtersOpen} aria-controls={panelId} onClick={onToggleFilters}><SlidersHorizontal size={16} aria-hidden="true" />Filters{filterCount > 0 && <span className="record-filter-count" aria-label={`${filterCount} active`}>{filterCount}</span>}<ChevronDown size={14} className={filtersOpen ? 'is-open' : ''} aria-hidden="true" /></button>
    <TableSelect label={sortLabel} hideLabel className="record-sort-select" leadingIcon={<ArrowUpDown size={15} />} value={sortValue} onChange={event => onSortChange(event.target.value)}>{sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</TableSelect>
  </div>;
}

export function TableFilters({ id, open, label, children, active, onReset }: { id: string; open: boolean; label: string; children: ReactNode; active: boolean; onReset: () => void }) {
  return <section id={id} className="record-filters" hidden={!open} aria-label={label}>{children}{active && <button type="button" className="text-button record-reset-filters" onClick={onReset}>Reset filters</button>}</section>;
}
export interface FilterChip { key: string; label: string; removeLabel: string; onRemove: () => void; }
export function TableResults({ count, total, noun, constrained, chips, onClear, chipRef }: { chipRef?: RefObject<HTMLDivElement | null>; count: number; total: number; noun: string; constrained: boolean; chips: FilterChip[]; onClear: () => void }) {
  return <div className="record-results"><span className="record-result-count" role="status" aria-live="polite"><strong><RollingNumber value={count} /></strong>{constrained && <span> of {total}</span>} {noun}{(constrained ? total : count) === 1 ? '' : 's'}</span><div ref={chipRef} className="record-chips" aria-label="Active filters">{chips.map(chip => <button type="button" key={chip.key} data-chip={chip.key} onClick={event => { removeChip(event.currentTarget); chip.onRemove(); }} aria-label={chip.removeLabel}>{chip.label}<X size={12} aria-hidden="true" /></button>)}</div>{constrained && <button type="button" className="text-button record-clear-all" onClick={onClear}>Clear all</button>}</div>;
}
export function SortHeading({ label, active, direction, onClick }: { label: string; active: boolean; direction: 'asc' | 'desc'; onClick: () => void }) {
  const Icon = active ? ArrowDown : ArrowUpDown;
  return <button type="button" className={`record-sort-heading${active ? ' is-active' : ''}`} onClick={event => {
    const table = event.currentTarget.closest('table');
    const pinned = table && (table.querySelector('thead')?.getBoundingClientRect().top ?? 2) <= 1;
    const tableTop = table ? table.getBoundingClientRect().top + window.scrollY : 0;
    onClick();
    // Show the start of the new order, keeping a pinned header in context.
    if (pinned) requestAnimationFrame(() => window.scrollTo({ top: tableTop, behavior: 'instant' }));
  }} aria-label={`Sort by ${label === 'Respond by' ? 'response deadline' : label.toLowerCase()}`}>{label}<Icon size={13} className={active ? 'sort-arrow' : undefined} data-dir={direction} aria-hidden="true" /></button>;
}

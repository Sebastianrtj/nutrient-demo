import type { MouseEvent, ReactNode } from 'react';
import './record-row.css';

/** Extend the record link to its row while retaining native table/link semantics. */
export default function RecordRow({ href, children, motionId, returning = false }: { href: string; children: ReactNode; motionId?: string; returning?: boolean }) {
  function open(event: MouseEvent<HTMLTableRowElement>) {
    if (event.defaultPrevented || ![0, 1].includes(event.button)) return;
    const target = event.target;
    if (target instanceof Element && target.closest('a,button,input,select,textarea,summary,[contenteditable="true"],[role="button"]')) return;
    // A drag to select or copy a reference should never open the record.
    if (window.getSelection()?.toString()) return;
    if (event.button === 1 || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      window.open(href, '_blank', 'noopener');
    } else {
      window.location.assign(href);
    }
  }

  return <tr className={'record-row' + (returning ? ' is-returning' : '')} data-flip-id={motionId} data-row-href={href} onClick={open} onAuxClick={open}>{children}</tr>;
}

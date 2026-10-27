import { ChevronDown, Plus, X } from 'lucide-react';
import type { DocumentRecord } from '../../shared/contracts';
import { chronologicalBolRecords } from '../../shared/bol-records';
import type { AssessmentDraftFields } from '../lib/accounting-drafts';
import { dateTime, docLabel } from '../ui';

type Citations = AssessmentDraftFields['citations'];
export function sourceName(doc: DocumentRecord, documents: DocumentRecord[]) {
  if (['bol', 'invoice', 'scan'].includes(doc.kind)) return docLabel(doc);
  const versions = chronologicalBolRecords(documents);
  return `${docLabel(doc, documents)} ${versions.findIndex(item => item.id === doc.id) + 1} · ${dateTime(doc.createdAt)}`;
}

export default function AssessmentSources({ documents, citations, selected, disabled, onChange, onView, onAddViewed }: {
  documents: DocumentRecord[]; citations: Citations; selected?: DocumentRecord; disabled: boolean;
  onChange: (citations: Citations) => void; onView: (doc: DocumentRecord) => void; onAddViewed: () => void;
}) {
  return <fieldset className="assessment-sources" disabled={disabled}>
    <legend>Assessment sources <span>{citations.length ? `${citations.length} cited` : ''}</span></legend>
    <div className="citation-tools"><details className="citation-picker"><summary><Plus size={14} />Add sources<ChevronDown size={14} /></summary>
      <div className="citation-options">{documents.map(doc => <label key={doc.id} title={doc.name}>
        <input type="checkbox" checked={citations.some(citation => citation.sourceDocumentId === doc.id)} onChange={event => onChange(event.target.checked ? [...citations, { sourceDocumentId: doc.id, page: '1' }] : citations.filter(citation => citation.sourceDocumentId !== doc.id))} />
        <span>{sourceName(doc, documents)}</span>
      </label>)}</div>
    </details>{selected && !citations.some(citation => citation.sourceDocumentId === selected.id) && <button type="button" className="text-button" onClick={onAddViewed}>Add viewed source</button>}</div>
    <div className="cited-sources">{citations.map(citation => {
      const doc = documents.find(item => item.id === citation.sourceDocumentId), name = doc ? sourceName(doc, documents) : 'Unavailable source';
      return <div className={`cited-source${doc ? '' : ' cited-source--unavailable'}`} key={citation.sourceDocumentId}>
        <button type="button" className="cited-source__name" title={doc?.name || citation.sourceDocumentId} aria-label={`View cited ${name}`} disabled={!doc} onClick={() => doc && onView(doc)}>{name}</button>
        <button type="button" className="cited-source__remove" aria-label={`Remove citation ${name}`} onClick={() => onChange(citations.filter(item => item.sourceDocumentId !== citation.sourceDocumentId))}><X size={14} /></button>
      </div>;
    })}{!citations.length && <p className="citation-empty">No sources cited</p>}</div>
  </fieldset>;
}

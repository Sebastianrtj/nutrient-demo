"""Read-only sample audit; requires Python 3 and pypdf."""
import csv, hashlib, json, re, sys
from pathlib import Path
from pypdf import PdfReader

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'samples'
base = root / 'ridgeline-sample-pack/base-pack'
ar = root / 'ridgeline-followup-ar-documents/discovery-pack'
shipments = list(csv.DictReader((base / 'erp_shipments_export.csv').open(newline='')))
deductions = list(csv.DictReader((ar / 'retailer_deductions_export.csv').open(newline='')))
ship_by_id = {r['shipper_no']:r for r in shipments}
checks = []
for kind, folder in [('bol', base/'bol'), ('invoice', ar/'invoices'), ('scan', base/'dock_scans')]:
 for path in sorted(folder.glob('*.pdf')):
  reader = PdfReader(path)
  text = '\n'.join(p.extract_text() or '' for p in reader.pages)
  compact = re.sub(r'\s+', '', text)
  warnings = []
  if kind == 'invoice':
   candidates = [r for r in shipments if r['invoice_no'] == path.stem]
   row = candidates[0] if len(candidates) == 1 else None
  else:
   found = re.search(r'RS-\d+', path.stem)
   row = ship_by_id.get(found.group()) if found else None
  if not row: warnings.append('No unique shipment in ERP register')
  elif kind == 'scan':
   expected = f"{row['plant']}_{row['shipper_no']}_{row['ship_date'].replace('-', '')}"
   if path.stem != expected: warnings.append('Scan filename plant/date does not match ERP')
  else:
   for key in (['shipper_no','customer_po'] if kind == 'bol' else ['invoice_no','shipper_no','customer_po']):
    if re.sub(r'\s+', '', row[key]) not in compact: warnings.append(f'PDF text does not contain expected {key}')
  checks.append({'path':str(path.relative_to(root)), 'kind':kind, 'shipmentId':row['shipper_no'] if row else None, 'sha256':hashlib.sha256(path.read_bytes()).hexdigest(), 'pages':len(reader.pages), 'textCharacters':len(text), 'identityMethod':'filename only; image-only scan requires human review' if kind=='scan' else 'PDF text cross-check against ERP shipment/invoice/PO', 'warnings':warnings})
joins=[]
for d in deductions:
 candidates=[r for r in shipments if r['invoice_no']==d['invoice_no']]
 warnings=[]
 if len(candidates)!=1: warnings.append('Invoice does not match exactly one shipment')
 elif candidates[0]['customer_po'] != d['customer_po']: warnings.append('Deduction PO does not match invoice shipment PO')
 joins.append({'deductionId':d['deduction_id'], 'shipmentId':candidates[0]['shipper_no'] if len(candidates)==1 else None, 'warnings':warnings})
result={'auditedAt':'2026-10-27','sampleDate':'2026-10-01','counts':{'shipments':len(shipments),'invoices':sum(c['kind']=='invoice' for c in checks),'bols':sum(c['kind']=='bol' for c in checks),'scans':sum(c['kind']=='scan' for c in checks),'deductions':len(deductions)},'documents':checks,'joins':joins}
Path(__file__).with_name('source-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'counts':result['counts'],'documentWarnings':[c for c in checks if c['warnings']],'joinWarnings':[j for j in joins if j['warnings']]},indent=2))

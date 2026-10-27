# Ridgeline API data audit

27 October 2026. Synthetic supplied material. Historical sample date: **1 October 2026**. No source file was rewritten.

## Checks and result

- Indexed 40 unique shipment rows, 40 unsigned BOL PDFs, 40 invoice PDFs, 25 historical scan PDFs and 12 unique deduction rows.
- All 12 deductions match exactly one shipment by `invoice_no`. Each deduction's `customer_po` equals that shipment's PO. No conflicting joins were found in the supplied CSVs.
- Read all 40 BOLs and 40 invoices with `pypdf`. Every BOL contains its expected shipment number and PO. Every invoice contains its expected invoice number, shipment reference and PO. Each supplied PDF has one page.
- Every scan filename matches a known shipment number, plant and ship date. All 25 scans have no extractable text. Scan identity in the application is therefore **provisional, matched by filename**. It is surfaced as a review warning; document availability is not a claim of a usable signature, delivery, quantity or acceptance.
- SHA-256 is recorded for each supplied document. Runtime verifies the file against the checked audit hash before reusing that identity check. A changed source file produces a mismatch warning instead of inheriting the previous audit.
- Fifteen of the 40 shipments have no historical scan in the supplied material. `missing` refers to absent historical scan evidence, even though an unsigned BOL and invoice exist. `available` refers only to file availability. It does not mean ready to dispute.

Machine-readable details: `source-audit.json`. Reproduce the text/filename audit from the app directory:

```sh
python3 server/audit-sources.py
```

The audit checks text identities and file structure. It does not use OCR, handwriting recognition, signer authentication, retailer receipt verification or automatic business judgments. Human review of the displayed scan remains necessary.

## Record and packet behavior

Originals are served only by registered document IDs. New capture IDs are separate `demo-pickup` records with current timestamps, source-document reference, content hash and durable service receipt. A capture never changes a deduction's historical evidence state or writes an assessment. It cannot supply missing historical delivery evidence.

The service requires the target shipment's original BOL source ID and rejects known supplied bytes from a different document, malformed/encrypted PDFs, wrong page counts and uploads over 12 MB. This local prototype trusts the client's declared source for a newly exported PDF; it does not cryptographically establish derivation, signature identity or a valid acknowledgement. The real SDK/visual export checkpoint belongs to integration QA.

Capture PDF and receipt metadata are fsynced together in a temporary directory, then atomically renamed. Acknowledgement follows the commit. A stable operation ID is idempotent across concurrent requests and restart; changing its source, shipment or bytes returns a conflict. Assessments use fsynced atomic JSON replacement. The local service assumes one process owns a data directory.

Packets contain unmodified original evidence, any clearly labelled new demo pickup, `summary.txt` and `manifest.json`. Each document has its archive path, bytes, hash and provenance. New demo records include their source and receipt. Summaries preserve the human assessment, evidence warnings and explicit limits. A packet is prepared for review; it is not submitted to a retailer.

`POST /api/demo/reset` removes only generated captures and assessments in `.data/`. Source and state directories may not overlap. `POST /api/demo/fail-next-upload` exists only with `DEMO_FAULTS=1` (or an explicit test factory option), fails once before storage, and leaves retry bytes usable.

## Verified API checks

From the repository root:

```sh
node --import tsx --test server/app.test.ts
```

Nine integration tests pass: full indexing/joins and registered file access; concurrent idempotent retries and restart persistence; source/operation/PDF/size rejection; assessment validation and persistence; independent Python ZIP CRC/content/hash verification; controlled failed transfer and retry; explicit PO/source mismatches; historical evidence separation and reset preserving originals; and byte-exact capture reopening from a dot-prefixed `.data` directory before/after restart. The build checks TypeScript. SDK signature rendering and flattening also require browser verification.

Run the service with `npm run dev:api`. It binds `127.0.0.1:8769` by default. `PORT` overrides the port. `npm start` serves `dist/` and the API in production mode. This is a local demo without production authentication, an ERP connection, retailer submission, offline synchronization or multi-process storage coordination.


## Hosted implementation

The public hosted build uses `worker/handler.mjs` and the same audited inputs. Generated PDFs and their receipt metadata commit as one conditional R2 object write. Assessments are separate R2 JSON objects. An HttpOnly session cookie isolates each browser's records. The hosted API exposes no reset or failure-injection endpoint.

Worker tests cover concurrent retries, content/source conflicts, session isolation, assessment validation and packet contents. A local Cloudflare preview with the real SDK also verifies signature export, receipt acknowledgement, stored-PDF reopening, Accounting handoff and packet preparation.

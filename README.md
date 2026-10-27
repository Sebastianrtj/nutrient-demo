# Nutrient · Ridgeline demo

A working PDF workflow: capture a driver pickup signature, add the receiver’s acknowledgement to that saved BOL, and review the combined document in Accounting. The browser uses Nutrient Web SDK 1.24.0 for viewing, annotations and flattened PDF export.

**[Open the demo](https://sebastian.ac/nutrientdemo/#/dock)** · **[Open Accounting](https://sebastian.ac/nutrientdemo/#/accounting/CHB-0899904)** · [Presentation](https://sebastian.ac/nutrientdemo/#/present?slide=title)

Ridgeline is fictional. All supplied documents are synthetic hiring-exercise samples. This repository contains the runnable implementation and those inputs. Private correspondence, discovery transcripts, credentials and generated session records are excluded.

## Code review path

| Start here | What to look at |
| --- | --- |
| [`src/lib/pdf-sdk.ts`](src/lib/pdf-sdk.ts) | Real SDK lifecycle, queued annotation changes, dates and receiver fields, flattened PDF export. |
| [`src/components/Dock.tsx`](src/components/Dock.tsx) | Driver capture, preview, explicit save, receipt and retry states. |
| [`src/components/Receiving.tsx`](src/components/Receiving.tsx) | Receiver acknowledgement on the saved driver PDF, receiving fields and recovery. |
| [`src/components/Accounting.tsx`](src/components/Accounting.tsx) | Combined BOL selection, version history, source/page citations and explicit assessment save. |
| [`src/api.ts`](src/api.ts) | API client and IndexedDB recovery of prepared PDF bytes and operation identity. |
| [`shared/`](shared) | Contracts, receiving validation, BOL version selection, citation compatibility and status rules. |
| [`server/app.ts`](server/app.ts), [`server/store.ts`](server/store.ts) | Local API, validation, atomic on-disk PDF/receipt storage and evidence packets. |
| [`worker/handler.mjs`](worker/handler.mjs) | Hosted API adapter, session isolation, conditional R2 commits and packet hashes. |
| [`worker/index.mjs`](worker/index.mjs) | Static delivery and byte-range streaming for large runtime files and videos. |
| [`server/app.test.ts`](server/app.test.ts), [`worker/handler.test.mjs`](worker/handler.test.mjs) | API and storage regression cases. Component/helper tests sit beside their source. |

The presentation lives in [`src/story/`](src/story). The task screens and SDK integration above are the main implementation.

## Run locally

Requires Node.js 24 and npm.

```sh
npm ci
npm run build
npm start
```

Open [Dock on localhost:8769](http://127.0.0.1:8769/#/dock). For development, `npm run dev` runs Vite on 8768 and the Node API on 8769. The SDK assets are copied from the pinned official npm package during installation. No trial key is required; the evaluation watermark stays visible. Optional licensed-deployment variables are shown in `.env.example`.

Local generated records persist in ignored `.data/`. Browser drafts and pending PDF bytes stay in that browser. Hosted records use an isolated browser session and R2 storage.

## Try the workflow

1. Open shipment **RS-417652** in Dock. Draw a fresh driver signature, preview it on the actual BOL, then choose **Save and send**.
2. Open the saved PDF and inspect its receipt. In receiving, add the receiver’s name, date, pallet count and signature. Receiving requires that shipment’s saved pickup PDF.
3. Open **CHB-0899904** in Accounting. The completed Signed BOL contains both acknowledgements. Older versions remain in history; explicit document links and saved citations keep their original source.
4. Compare the BOL with the invoice and historical scan. Save a human assessment with source/page citations and download the ZIP packet. Check `manifest.json`, `summary.txt` and the included PDFs.
5. Open **CHB-0912707 / RS-417741** to inspect a missing historical scan. New demonstration records do not resolve that historical gap.

Retries reuse the prepared PDF bytes and stable operation ID. A matching retry returns the existing receipt. Changed bytes, source, stage or receiving details conflict with an already committed operation.

**[Watch the current combined-BOL workflow (40 seconds)](https://sebastian.ac/nutrientdemo/proof/combined-bol.mp4)**: driver pickup → receiver acknowledgement → controlled local failure → refresh/retry → one combined Accounting citation → packet export. This is a silent, original-speed recording on a disposable local service with synthetic data.

The presentation is planned for 14:45. Its seven proof recordings cover an earlier pickup-to-Accounting revision, before the combined receiver workflow. They show actual interface behavior at original speed, including a controlled local upload failure. They are supporting evidence for that revision, not a recording of every current feature.

## Verify

```sh
npm test
npm run test:worker
npm run build:hosted
```

GitHub Actions repeats these checks. Automated tests cover source matching, original preservation, receiving validation, durable retry convergence, source/page citations, BOL selection, packet membership and hashes, and browser-session isolation. The Worker tests use an in-memory R2 substitute. Real browser SDK checks and responsive visual review are separate; mocked storage tests do not establish those behaviors.

## Architecture and deployment

React/TypeScript renders the task screens and presentation. Nutrient runs in the browser. There are two backend adapters: Node/Express for local use and a Cloudflare Worker for hosting. Shared contracts and rules live in `shared/`; route and storage implementations remain separate. Both adapters have regression coverage, but their duplication remains a prototype tradeoff.

The hosted Worker stores each PDF, receipt and operation identity in one conditional R2 object write. Assessment JSON is stored separately. A scoped HttpOnly session cookie isolates each browser’s generated records. The hosted API exposes no reset or fault endpoint. `DEMO_FAULTS=1 npm run dev` enables controlled failures locally for disposable rehearsals.

`npm run build:hosted` builds for `/nutrientdemo/`, writes static assets to `dist/` and bundles the Worker into `.site-output/`. It includes 105 registered synthetic PDFs. The deployment host must serve the assets at that prefix, route API requests through the Worker, and provide R2 binding `NUTRIENT_FILES`.

The builder splits files above the host’s 25 MiB asset limit. The Worker streams their original bytes and supports bounded byte ranges for video seeking. Video part filenames ensure a static-first host invokes the Worker for the original video URL. The hosted PDF-only package excludes the separate processor engine for non-PDF conversion. Local installation retains the complete official SDK package.

The demo is mounted inside Sebastian’s existing website. That website’s source and hosting credentials are outside this public repository.

## Boundaries and licensing

This is an evaluation demo, not a production Android application. Native Android, ERP/identity/storage integration, rugged-tablet validation, retention policies and retailer acceptance remain deployment work. Electronic ink and a file hash do not authenticate a signer or create a certificate-backed PDF signature. No OCR, AI extraction, Document Engine, live ERP, retailer submission or revenue recovery is connected.

Nutrient and other dependencies retain their respective licenses. The runtime is installed from the official package rather than committed here. Public source availability does not grant a commercial SDK entitlement. See [Nutrient’s trial guidance](https://www.nutrient.io/sdk/try) before adapting this evaluation for production.

The [productization answer](docs/ridgeline-productization.pdf) contains planning assumptions, customer adapters and excluded licensing. These are not supplier quotes.

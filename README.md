# Nutrient · Ridgeline demo

A working browser demonstration of paperless pickup and shipment evidence review, with a 21-slide presentation planned for 14 minutes 45 seconds.

**Live:** [sebastian.ac/nutrientdemo](https://sebastian.ac/nutrientdemo/)

Ridgeline is fictional. Documents are synthetic hiring-exercise samples. The proposed identity and presentation illustrations are original demo work. This repository contains the runnable implementation and synthetic inputs. Private correspondence, discovery transcripts, credentials and generated session records are excluded.

## Run locally

Requires Node.js 24 and npm.

```sh
npm ci
npm run build
npm start
```

Open [localhost:8769](http://127.0.0.1:8769/#/present?slide=title). For development, `npm run dev` runs Vite on 8768 and the Node API on 8769. The SDK assets are copied from the pinned official npm package during installation. No trial key is required; the evaluation watermark stays visible. Licensed deployments can provide the optional variables shown in `.env.example`.

## Walkthrough

The presentation uses the same sections as its progress rail: Context, Discovery, Demo, Product & cost, Discussion. Each demo scene and working task is a main slide. Use the footer for navigation during live tasks.

1. Review shipment **RS-417652**, show the driver acknowledgement, and draw a fresh pickup signature.
2. Preview the mark on the actual BOL, choose **Save and send**, then inspect the receipt and reopened PDF.
3. Continue through distinct receiving and evidence retrieval. A pickup acknowledgement does not establish delivery.
4. Review case **CHB-0899904** in Accounting, compare the original BOL, invoice and historical scan, save an explicit assessment/citation, and prepare a ZIP packet.
5. Inspect **CHB-0912707 / RS-417741** separately to see a missing historical scan. A new pickup does not fill that gap.

The final criteria slide has six Watch links and a full 3:37 walkthrough. Clips show the actual interface at original speed with no narration. They include a deliberately failed first upload on a disposable local service. Each link also works as a standalone video page.

Static slides introduce one point per click. Space/Right reveals, Left reverses, A shows the remaining points, N opens notes and Home restarts the presentation. Unsent ink survives main-slide navigation. Accounting drafts recover in the same browser after refresh. Save is explicit.

## Hosted architecture

`npm run build:hosted` builds for `/nutrientdemo/` and creates a self-contained Cloudflare Worker in `.site-output/`. The UI and generated source-PDF assets are in `dist/`.

- **Nutrient Web SDK 1.24.0:** real viewing, signature annotations and flattened PDF export in the browser.
- **React / TypeScript:** presentation and task interface.
- **Hosted Worker:** matching, upload validation, receipts, assessment validation and ZIP preparation.
- **R2 binding `NUTRIENT_FILES`:** durable PDF/receipt objects and assessment JSON. A scoped HttpOnly session cookie isolates each browser's generated records. A PDF and its receipt commit as one conditional R2 write, so concurrent retries keep one version.
- **Local Node/Express service:** the same application contracts backed by an on-disk `.data/` store for local use.

The static host must serve `dist/` at `/nutrientdemo/` and route that prefix through the Worker. The supplied builder splits assets larger than the host's 25 MiB asset limit; the Worker streams their original bytes. The PDF viewer runtime remains unmodified. The hosted package excludes the separate processor-engine conversion assets: this demo opens PDFs only, and does not expose Office or other non-PDF conversion. Local installation keeps the complete official SDK package. The Worker also implements bounded byte ranges for proof videos, so seeking works even when the asset binding returns whole files.

The hosted path is added to Sebastian's existing website project. Its private hosting credentials and website source are not part of this public repository. No reset/fault endpoint is exposed by the hosted API. Local `DEMO_FAULTS=1 npm run dev` enables the controlled local failure endpoint for disposable rehearsals only.

## Verify

```sh
npm test
npm run test:worker
npm run build:hosted
```

Tests cover source matching, original preservation, retry convergence, durable storage contracts, assessment/page validation, packet contents and hashes, browser-session isolation, and consistent workflow statuses. GitHub Actions repeats these checks. Browser QA also verifies the real SDK, and the local Worker preview verifies full-file hashes and byte ranges across static asset chunks. Mocked storage tests alone do not establish browser behavior.

## Boundaries and licensing

This is an evaluation demo, not a production Android application. Native Android, ERP/identity/storage integration, rugged-tablet validation, retention policies and retailer acceptance remain deployment work. Electronic ink and a file hash do not authenticate a signer or create a certificate-backed PDF signature. No OCR, AI extraction, Document Engine, live ERP, retailer submission or revenue recovery is connected.

Nutrient and other dependencies retain their respective licenses. The Nutrient runtime is installed from its official package rather than committed to this repository. Public source availability does not grant a commercial SDK entitlement. See [Nutrient's trial guidance](https://www.nutrient.io/sdk/try) before adapting this evaluation for production.

The [one-page productization answer](docs/ridgeline-productization.pdf) contains planning assumptions, including customer adapters and excluded licensing. These are not supplier quotes.

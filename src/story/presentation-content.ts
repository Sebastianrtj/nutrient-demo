export const presentationSlides = [
  { id: 'title', label: 'Ridgeline Building Products', section: 'Introduction', seconds: 15,
    notes: 'Ridgeline asked for a viewer and signature SDK. This proof connects paperless pickup to a record Accounting can retrieve. Ridgeline and the supplied documents are fictional.' },
  { id: 'agenda', label: 'Today’s discussion', section: 'Introduction', seconds: 15,
    notes: 'Follow the same five chapters shown in the footer: Context, Discovery, Demo, Product & cost, and Discussion. Context covers the customer and inbound request. Discovery explains the work, findings and proposed proof. Demo connects Dock and Accounting. Product & cost covers the stack, reuse and deployment. Discussion closes with the pilot, the six sent evaluation criteria and questions. The planned run is 14 minutes 45 seconds, leaving five minutes fifteen seconds for questions.' },
  { id: 'client', label: 'Ridgeline at a glance', section: 'Customer & discovery', seconds: 45,
    notes: 'Ridgeline makes vinyl siding, trim and composite decking. The supplied account has about 1,800 people, 11 plants and 500–650 million dollars in annual revenue. Two retail chains account for about half of revenue. Its in-house ERP is moving to a new framework, which means the shipping screen is being rewritten. That creates the opportunity; the rugged tablets are already purchased.' },
  { id: 'request', label: 'The inbound request', section: 'Customer & discovery', seconds: 35,
    notes: 'Dana Kowalski is the lead application developer. Dana contacted Nutrient through its website and asked for an Android PDF viewer and signature SDK for shipping docks. That is the request we started with. The acquisition channel is stated in the supplied account brief; it is not an assumption about search or referral.' },
  { id: 'workflow', label: 'The work at the dock', section: 'Customer & discovery', seconds: 35,
    notes: 'The ERP prints a BOL. The driver checks and signs it. A clerk scans it into shared storage. Accounting later needs the supporting record. Dana’s concern was the handling and finding the record, not just drawing a signature. The exact storage naming and ERP interface remain integration work.' },
  { id: 'discovery', label: 'What discovery changed', section: 'Customer & discovery', seconds: 60,
    notes: 'Follow the six headings, rather than explaining the framework. Work: retain a usable pickup acknowledgement. Consequence: Accounting can lack supporting records in a deduction. Scale: Dana reported about 130,000 BOLs across 11 plants last year. Priority: the VP wants paperless handling; Accounting uses the scans. Outcome: a record that reaches the right shipment and can be retrieved. Open decisions: the ERP contract, evidence acceptance and integrity requirements. The financial exposure mentioned on the call was secondhand; there is no proven savings claim here.' },
  { id: 'success', label: 'What the proof must demonstrate', section: 'Scope & success', seconds: 35,
    notes: 'The sent evaluation statement proposes a connected Dock and Accounting proof. At the dock, the driver reviews, signs and sends a flattened BOL. Accounting retrieves the correct sources, records a human assessment and prepares a packet. We must retain originals, match the shipment correctly and recover a failed transfer without a duplicate. These are our proposed criteria, not a claim that every detail was accepted by the customer.' },
  { id: 'boundaries', label: 'The boundary of this proof', section: 'Scope & success', seconds: 25,
    notes: 'Walk through four comparisons: documents, records, evidence and trust. The browser proof demonstrates signing, retrieval and recovery with human review. Production needs native Android and customer integration, plus validated acceptance, identity and integrity. End with the boundary: a new pickup does not establish historical delivery.' },
  { id: 'demo-divider', label: 'The working proof', section: 'Working proof', seconds: 5,
    notes: 'Follow one shipment through the illustrated context and the real Dock and Accounting tasks. Each step is a slide in this same presentation.' },
  { id: 'demo-dock', label: 'The paper workflow', section: 'Working proof', seconds: 25,
    notes: 'Establish the paper workflow. The signature gap is an illustrated risk, not a finding about the supplied shipment. Each scene is now part of the main slide sequence.' },
  { id: 'demo-pickup', label: 'Paperless pickup', section: 'Working proof', seconds: 15,
    notes: 'Review, sign and send. Next opens the live Dock as the next slide. The scene illustrates the workflow; the next screen shows the actual SDK and service.' },
  { id: 'dock-live', label: 'Live · Review, sign and send', section: 'Working proof', seconds: 170,
    notes: 'Two minutes fifty seconds. Review shipment RS-417652, inspect the driver acknowledgement, capture fresh ink, preview it and Save and send. Show receipt and the stored reopen. Demonstrate a controlled retry only if rehearsed in an isolated store. Use the main Next slide control to continue to receiving. The task’s Open in Accounting action can jump directly to the matching case and exact pickup document.' },
  { id: 'demo-receiving', label: 'Pickup and receiving', section: 'Working proof', seconds: 20,
    notes: 'The driver signs at pickup. Retailer receiving is a separate acknowledgement. A new pickup does not establish historical delivery. This is an illustration, not live tracking.' },
  { id: 'demo-accounting', label: 'Retrieve the shipment evidence', section: 'Working proof', seconds: 20,
    notes: 'Retrieve, assess and prepare. Show that originals, historical scans and the new demo pickup remain distinct. Next opens the actual Accounting task inside the presentation.' },
  { id: 'accounting-live', label: 'Live · Review and prepare', section: 'Working proof', seconds: 140,
    notes: 'Two minutes twenty seconds. Inspect the original BOL, invoice, separate historical scan and new pickup. Record a short human assessment with an explicit citation. Save it and prepare the packet. Then use Deduction queue to open CHB-0912707 on RS-417741: make the record change explicit and show the missing historical scan. Keep this unresolved. The chapter tracker and main Next slide control remain visible throughout.' },
  { id: 'product-divider', label: 'Making it repeatable', section: 'Product & cost', seconds: 5,
    notes: 'The proof works for this supplied material. The next question is what stays reusable and what changes for a customer deployment.' },
  { id: 'stack', label: 'The stack and its responsibilities', section: 'Product & cost', seconds: 50,
    notes: 'Nutrient Web SDK 1.24.0 provides document viewing, the electronic signature annotation and flattened PDF export. React and TypeScript provide the task interface. The hosted Cloudflare Worker owns matching, upload validation, idempotency, assessments and ZIP export. R2 stores each browser session’s PDFs and assessment records durably. The repository also includes the local Node/Express service. No Document Engine, OCR or AI extraction is connected. Production replaces the local edges with native Android and the customer’s authorized ERP/storage interfaces. The trial watermark remains visible.' },
  { id: 'repeatability', label: 'What customer two reuses', section: 'Product & cost', seconds: 55,
    notes: 'Retain the capture, version, receipt, assessment and packet workflow with typed contracts. Configure BOL templates, signature placement, naming and stable shipment/invoice/PO mappings. Adapt the ERP, identity, storage and native Android document component. Add production roles, retention, backups, restore tests and monitoring. The second customer should configure the workflow and implement adapters, rather than rebuilding document handling. A one-plant pilot validates these assumptions before expansion.' },
  { id: 'cost', label: 'Cost to productize and deploy', section: 'Product & cost', seconds: 65,
    notes: 'These are planning assumptions, not a quote. At a blended 150 dollars per engineering/QA hour, reusable core, native adapter and deployment hardening are 320–560 hours, or 48–84 thousand dollars. Customer mapping, templates and pilot are another 80–160 hours, or 12–24 thousand dollars. Combined initial allowance is 60–108 thousand dollars. That customer allowance is not a guaranteed fixed price. Recurring support is 600–1,800 dollars per month and infrastructure is provisionally 100–300 dollars per month. Nutrient licensing, devices/MDM and premium external services remain unquoted and excluded. Offline conflicts and certificate signing need separate scope.' },
  { id: 'close', label: 'A usable record, ready for review', section: 'Discussion', seconds: 20,
    notes: 'The proof demonstrates paperless pickup and retrievable shipment evidence. The proposed next step is a one-plant pilot on the actual tablets and ERP, judged on capture success, retrieval time and Accounting’s evidence needs. Customer acceptance and revenue outcomes still need validation. Finish with the linked criteria recap on the next slide, then invite questions.' },
  { id: 'criteria', label: 'The proof against my criteria', section: 'Discussion', seconds: 30,
    notes: 'These are the six things I proposed to be judged on in my sent evaluation statement; Nutrient also has its own criteria. Briefly point to the discovery-to-scope connection, correct handling, both working flows, recovery, a clear demonstration, and productization/cost. The links reopen the relevant presentation or working task. Do not award yourself marks here or claim these are accepted internal weights. The proof is a browser implementation with the production boundaries already stated. Leave this slide available for questions. Planned talk ends at 14:45, leaving five minutes fifteen seconds of the twenty-minute slot.' },
] as const;
export type PresentationSlideId = typeof presentationSlides[number]['id'];
export const plannedSeconds = presentationSlides.reduce((sum, slide) => sum + slide.seconds, 0);
export function clockLabel(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }

// First point is visible on arrival. Each advance reveals one further group.
export const presentationBuilds: Record<string, number> = { agenda: 5, client: 4, request: 3, workflow: 8, discovery: 6, success: 5, boundaries: 5, stack: 3, repeatability: 4, cost: 4, close: 2 };

export const presentationChapters = [
  { label: 'Context', description: 'Who they are, their request and how they found us.', slides: ['title', 'agenda', 'client', 'request'] },
  { label: 'Discovery', description: 'What we learned and the proposed proof.', slides: ['workflow', 'discovery', 'success', 'boundaries'] },
  { label: 'Demo', description: 'The connected Dock and Accounting flow.', slides: ['demo-divider', 'demo-dock', 'demo-pickup', 'dock-live', 'demo-receiving', 'demo-accounting', 'accounting-live'] },
  { label: 'Product & cost', description: 'The stack, reusable workflow and cost.', slides: ['product-divider', 'stack', 'repeatability', 'cost'] },
  { label: 'Discussion', description: 'Pilot, criteria recap and questions.', slides: ['close', 'criteria'] },
];

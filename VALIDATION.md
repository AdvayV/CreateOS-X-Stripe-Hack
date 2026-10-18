# Verified behavior

Local verification on 18 October 2026 (Asia/Kolkata):

- Production frontend build succeeded.
- All 29 automated tests passed, including ten basket/permission contracts and the billing reliability harness.
- A real AI-generated optimizer executed in CreateOS as an unprivileged user, exited 0, produced plan.json and passed 16 independent basket checks.
- The full API flow passed against the real microVM: initial quote $13.16, stale price approval rejected, stockout recovery selected Fresh Lane at $13.59, repeated checkout returned the same simulated receipt, another browser session could not read the job, and evidence export succeeded.
- The managed workspace monitor returned HTTP 200 through CreateOS public ingress.
- Chromium rendered the current storefront and wallet with no page errors or desktop/mobile horizontal overflow. The public sandbox end-to-end flow also passed price/stock recovery, checkout idempotency, session isolation and export. Each planning revision observed all 108 offers across three merchant pages and saved three screenshots; all 16 basket checks passed.

No real groceries were ordered. The checkout result above is a simulation, not a Stripe or Link payment. Link is unavailable because of the operator's country/account restriction; seller test key/profile settings are also absent. Real test settlement remains unverified.

The AI source was generated with the official OpenCode CLI using its free Big Pickle model. The successful generation reported $0 provider cost. Cached runs reuse that source and revalidate fresh inputs; they are labeled as such. OpenAI quota was unavailable, and no paid fallback is automatic.

The app uses idle auto-pause by default because explicit microVM snapshots exceeded a three-minute wait during testing. A valid quote is no longer failed by that optimization. An already paused/pausing VM still needs to finish its lifecycle transition before code can run.

Evidence from the local end-to-end run is in ignored .rehearsal/cart-e2e-report.json. Screenshots are in ignored .rehearsal/screenshots. These files stay local and are excluded from deployment and Git.

Current verified public demo: https://01m55q139gyy1y1x3m45qvt620-4173.app.sb.createos.sh. It runs the application as a managed process in CreateOS. Browser observations in this mode use loopback to the same served merchant pages, avoiding public-ingress hairpin routing; clients use the public HTTPS address. The application directory is root-only, execution users remain separate, and only the control API remains on the idle egress allowlist so the trusted backend can operate its own sandbox.

The separate CreateOS hosting environment accepted the build and deployment assignment but served the previous frontend, then remained reconciling after a restart. It is not the verified demo URL until its runtime is checked again.

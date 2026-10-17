# CartPilot

**Your errands. Your rules.** An agentic quick-commerce study built with CreateOS and Stripe Projects.

Tell the agent "movie night for four, peanut-free, under $35". It runs AI-written Python inside a persistent CreateOS microVM, compares three fictional merchants, verifies the basket independently, and asks permission before checkout. A price change or stockout invalidates permission and triggers replanning.

Current sandbox demo: https://01m55q139gyy1y1x3m45qvt620-4173.app.sb.createos.sh

The separate hosting URL https://hackathon-cartpilot-advay.tyzo.nodeops.app is being reconciled by CreateOS; use the verified sandbox URL while that update is pending. The sandbox preview can sleep after inactivity and may need an operator resume.

## Run locally

Requires Node 24 and npm. Install with 'npm ci', then 'npm run build' and 'npm start'. Open http://localhost:4173. For development use 'npm run dev'.

Stripe Projects manages the ignored .env. Keep optional application settings in ignored .env.app; see .env.example. Never commit credentials. CreateOS credentials are required for shopping execution; the app does not silently simulate a successful sandbox run.

## What actually runs

- 36 fictional products, 108 offers and three separately rendered merchant storefronts.
- Optional Playwright Chromium in CreateOS observes the storefront DOM and downloads screenshots. Failures explicitly fall back to the labeled fixture catalog.
- An isolated coding agent writes planner.py. The default uses the official OpenCode CLI and its free Big Pickle model. Successfully generated source persists in sandbox memory and is reused with fresh inputs. The UI distinguishes cached AI code, fresh generation and the bundled reference optimizer.
- Generated Python executes as a separate unprivileged Linux user with a time limit. The SDK uploads files and downloads plan.json, stdout and exit status. Network egress is restricted; credentials stay outside the uploaded input.
- The independent verifier checks canonical prices, stock, serving coverage, dietary rules, merchant, ETA, tax, fees and budget. Failed execution/verification can feed one repair attempt back to the coding agent.
- The persistent microVM auto-pauses after five minutes of inactivity and resumes on demand. Optional explicit snapshotting is available; snapshot transitions can take several minutes.
- Approval binds the exact basket digest, merchant, amount, budget and expiry. Price/stock fault injection invalidates the old approval. Checkout records a single simulated order per approved intent in SQLite.
- Each browser session has isolated jobs. Evidence exports include code fingerprints, checks, execution output and the event journal.

## Commerce status and boundaries

The default wallet is a **policy simulator**, not a Link wallet or Stripe payment. No real groceries are ordered. Blinkit is inspiration only; there is no affiliation, scraping or live Blinkit ordering.

The optional real test commerce lane uses the official Link Agent Wallet CLI and Stripe MPP. Seller configuration requires STRIPE_TEST_SECRET_KEY and STRIPE_TEST_PROFILE_ID (profile_test_). Live keys/profiles are rejected. Buyer Link authorization is separate from Stripe CLI/Projects authorization. Link is currently unavailable to the operator, and real test settlement has **not** been verified.

The public server never uses the operator's local Link authorization. A buyer can use their own authorized CLI against a fresh quote's MPP endpoint and quote capability. Do not share that capability publicly. The simulator remains usable without a payment account.

## Configuration

- CARTPILOT_AI_ENABLED=true enables generation. The user approved a maximum $2 AI allowance; conservative reservations are tracked locally and in the persistent VM. The selected free provider reported $0 for the verified generation. No paid fallback is automatic.
- CARTPILOT_SANDBOX_ID reuses one VM; auto-pause is enabled. The free account currently has one concurrent sandbox, so run local and hosted workloads sequentially.
- CARTPILOT_BROWSER_OBSERVE=true and PUBLIC_ORIGIN enable observation of the configured CreateOS-hosted demo.
- PUBLIC_DEMO=true disables local operator administration/wallet access. HOST defaults to loopback; the Docker image explicitly binds 0.0.0.0.
- No plan upgrades, credit purchases or real purchases are automatic.

## Verification and deployment

'npm test' runs 15 tests, including ten basket/approval contracts and the original billing reliability harness. 'node --use-system-ca --use-env-proxy scripts/cart-e2e.mjs' exercises real sandbox execution, stale approval, price/stock recovery, repeated checkout and session isolation against the local server. Set CARTPILOT_TEST_URL to use a hosted server instead.

Build with 'npm run build'. The Dockerfile targets CreateOS hosting on port 4173. Deploy a clean source bundle; exclude .env files, .projects, .rehearsal, node_modules and local browser sessions. Provisioned provider access is managed through Stripe Projects; hosting deployment and environment assignment use CreateOS.

The earlier **Rehearsal** billing reliability lab remains at 'npm run lab', opening /?lab. See REHEARSAL.md. CartPilot is the main hackathon demo.

# Rehearsal

**Your webhook returned 200. Did the right thing happen?**

Rehearsal executes Stripe billing handlers against ten failure scenarios,
inspects durable SQLite evidence, and verifies repairs against independent checks.
CreateOS runs candidate code. Stripe Projects provisions the integration.

An optional test-only commerce lane lets a buyer agent purchase a verification
through **Link Agent Wallet + Stripe Machine Payments Protocol (MPP)**.

## Run

Requires Node.js 22.13+ (Node 24 recommended), npm and Git.

```sh
npm ci
npm run dev
```

Open **http://localhost:4173**. For a production build served locally:

```sh
npm run build
npm start
```

On Windows, use `npm.cmd` and `stripe.cmd` if PowerShell blocks script launchers.

## Features and verification

- Ten executable scenarios: activation, duplicate delivery, different events for
  one invoice, stale updates, concurrent workers, crash/retry, renewal grace and
  recovery, scheduled cancellation, unpaid upgrades and forged signatures.
- Separate processes, SQLite durability, controlled concurrency barriers, actual
  post-commit worker termination and Stripe SDK signature verification.
- Live scenario board, event journal, database evidence, code diff, presentation
  mode, editable invoice amount and downloadable JSON reports.
- A deliberately broken starter and bundled reference repair. The reference is
  **not** presented as AI-generated code.
- OpenAI Responses repair adapter with structured output and at most two attempts.
  Paid AI calls are currently deferred; no live AI repair has been verified.
- Test-only MPP seller endpoint with stable purchase IDs and live-key rejection.
  The Link round trip awaits buyer authorization and seller test configuration.

Verified: starter 2/10; reference 10/10 on CreateOS Node 24.21.0. Local tests also
pass the reference at two invoice amounts. The end-to-end API flow and report
download were checked. Native browser visual QA was unavailable in this session.

## Credentials

Stripe Projects manages `.env`. Use `stripe projects env --pull`; do not hand-edit
its managed files or publish credentials. The app accepts the provisioned
CREATEOS_PROJECT_API_KEY, or CREATEOS_SANDBOX_API_KEY directly.

Put optional app settings in ignored **.env.app** or process environment; see
[.env.example](.env.example). Keep the managed `.env` intact.

- STRIPE_TEST_SECRET_KEY: sandbox key for importing/creating test billing fixtures.
- STRIPE_TEST_PROFILE_ID: `profile_test_` ID for the optional MPP seller endpoint.
- Link: authorize the buyer separately with `npx @stripe/link-cli auth login`.
- OPENAI_API_KEY / OPENAI_MODEL: optional model configuration. Paid usage remains
  blocked until separately approved and ALLOW_PAID_AI is enabled.

The Connections page imports a paid test invoice or creates test-only billing
objects with a simulated card. The CLI fallback needs an authorized sandbox
context, separately from Projects' live-account context. Live keys are rejected.

No real account API keys or production data are passed to candidate code.

## Agent commerce

The Agent commerce page displays the buyer command and setup checklist. A configured
seller returns HTTP 402, verifies an MPP test payment, then starts a CreateOS run.
Wallet approval alone does not unlock the service. Repeating the same purchase ID
returns the original run. Link availability is subject to Stripe eligibility.
No successful Link payment round trip has yet been verified in this build.

## Metered-use controls

Ignored `.rehearsal/approvals.json` records this session's explicit permissions:
CreateOS verification is allowed; paid AI calls are deferred. Each cloud suite
reserves five minutes and refunds unused allowance after sandbox destruction.
This is a conservative local runtime limit, not a provider-enforced billing cap.

Paid AI requires both local `ai: true` approval and ALLOW_PAID_AI=true. Do not
enable either without separate user permission. AI-generated code runs only in
CreateOS; local execution is limited to bundled handlers.

## Tests

```sh
npm test
npm run test:cloud
```

Cloud tests consume credits and need local approval. Disposable VMs are destroyed
after each suite; idle auto-pause and a five-minute deadline provide backstops.

## Boundaries

This prototype supports a defined handler contract, USD minor units and explicit
business policies. Passing ten checks is not a production safety certification.
Candidate writes are limited with Node permissions, which are defense in depth,
not a security boundary for hostile JavaScript. The checker stays on the backend;
CreateOS supplies VM isolation and restricted egress. Use synthetic/sanitized data.

See [the brief](PROJECT_BRIEF.md), [scenario contract](scenarios/billing-scenarios.json)
and [demo guide](DEMO.md).

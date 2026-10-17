# Rehearsal demo guide

## Core: 90 seconds

1. Open http://localhost:4173. Toggle presentation mode in the header.
2. Explain: “HTTP 200 doesn't prove billing worked.” Choose local or CreateOS
   execution; the interface always labels the actual environment.
3. Run the deliberately flawed handler. Two baseline checks pass; eight expose
   business failures. The source fixture is labeled synthetic until Stripe import.
4. Expand Same invoice, new event: different event IDs fulfill the same purchase
   twice. Expand Concurrent workers or Crash & retry to show actual fault evidence.
5. Apply reference patch. State explicitly that this is a bundled example repair,
   not an AI generation, while paid AI usage is deferred.
6. All ten checks rerun against fresh state. Inspect the diff and database evidence.
7. Change the invoice from $29.00 to $73.17 and rerun to demonstrate variable input.
8. Download the JSON report. Its acceptance-contract hash is unchanged across repair.

## Link Agent Wallet + MPP

The buyer agent purchases a ten-scenario verification for $0.50 in test mode.
The customer approves through Link. The seller starts execution only after Stripe
MPP payment verification, not simply after wallet approval.

Prerequisites:

- STRIPE_TEST_SECRET_KEY in ignored .env.app or process environment.
- STRIPE_TEST_PROFILE_ID (`profile_test_`) for the seller.
- Buyer Link OAuth authorization with payment_methods.agentic access.
- Confirmed Link customer test eligibility and approved CreateOS allowance.

Open Agent commerce, run its displayed buyer command, complete Link's actual
approval, and retrieve the returned run/report URL. Retry the same purchase ID
to demonstrate that the service does not launch a second execution.

No Link payment round trip has yet been verified. If onboarding blocks it, label
that setup as pending and demonstrate the verified core. Do not fabricate a
payment receipt or substitute an animation for real authorization.

## AI repair

After separate paid-AI approval, enable the local AI allowance and ALLOW_PAID_AI.
Use CreateOS, run baseline, then Generate AI repair. A generated candidate is
checked against the same contract; one further repair attempt is allowed.
Non-passing results remain non-passing on screen.

## Verified

- Local reference: 10/10 at $29.00 and $73.17.
- CreateOS: starter 2/10, reference 10/10, both disposable sandboxes destroyed.
- API: baseline, paid-AI guard, reference repair, report export and origin guard.
- No paid AI calls or real payments were made.

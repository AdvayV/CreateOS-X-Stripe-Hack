# Rehearsal

An AI agent that tests and repairs Stripe billing handlers under duplicate,
delayed, concurrent and interrupted webhook delivery.

Pitch: A webhook returning HTTP 200 does not prove that customers were billed
and fulfilled correctly. Rehearsal executes the code and checks the business outcome.

## Accepted scope

Use the ten scenarios in `scenarios/billing-scenarios.json` as the product's initial
acceptance contract. The executable plans and independent checker implement this
contract in core/plans.mjs and core/checker.mjs.

| ID | Scenario |
| --- | --- |
| S01 | Successful subscription activation |
| S02 | Repeated delivery of the same event |
| S03 | Different events for the same paid invoice |
| S04 | An old update arrives after cancellation |
| S05 | Concurrent deliveries race to fulfill |
| S06 | Process crash after commit and before acknowledgment |
| S07 | Failed renewal, grace expiry and payment recovery |
| S08 | Cancellation at the end of the paid period |
| S09 | Plan upgrade waits for successful payment |
| S10 | Forged webhook cannot grant access |

## Execution and trust boundaries

- Support one Node.js billing handler with SQLite durable state.
- The candidate exposes a webhook entry point and scheduled reconciliation entry point.
- Stripe sandbox APIs supply test objects and reference snapshots. Pin an API
  version when creating fixtures; adapt fields to that version rather than guessing.
- A controlled replay harness produces delivery faults. It does not claim Stripe
  itself generated a forced race, reordered delivery or crash during the demonstration.
- Properly sign replay requests with a demo-only signing secret. Use the Stripe SDK
  to verify raw request bytes. Invalid-signature cases intentionally fail verification.
- CreateOS runs the candidate handler and the agent's generated code.
- Keep real account API credentials on the backend. Candidate code receives only
  synthetic or sanitized fixtures and a demo-only signing secret.
- Trusted checking, reference snapshots, clock advancement, fault injection and
  scoring remain outside the repair agent's control. Candidate stdout is evidence
  to inspect, never the authority for a passing score.
- The agent can edit candidate code, but cannot edit the acceptance contract or
  checker. Reset fixtures before every attempt; use bounded retries and timeouts.
- Durably queue work before acknowledging if processing asynchronously. Local
  fulfillment transactions and uniqueness constraints must survive process restarts.
- Use a deterministic clock and synchronization barriers rather than sleeps for
  expiry and race tests. Do not rank Stripe events only by second-level timestamps.
- Use test data only. No production billing mutations, refunds or payments.

## Application policies

The 72-hour renewal grace period, preserving basic access during an unpaid
upgrade, and access through a scheduled cancellation deadline are explicit demo
business policies. They are not universal Stripe requirements.

The initial contract uses USD integer minor units, no trials, and synchronous card
subscription payments. A passing result covers these defined scenarios, not every
Stripe integration or payment method.

## Demo

Show all ten checks on a scenario board. Expand a duplicate fulfillment failure,
a stale subscription update, and crash recovery to show the actual event sequence,
database effects and independent assertions. Let the agent repair the handler and
rerun all ten checks, then change one fixture input live and rerun it.

Every run should show code diff, sandbox execution output, per-check results and
a downloadable report. Clearly label deliberately broken starter code and captured
fallback recordings. Do not manufacture a successful live result.

## Integration roles

- Stripe Projects: provisions and manages the CreateOS integration.
- Stripe sandbox: supplies billing test objects and reference data.
- CreateOS Sandbox SDK: executes the generated handler and repair attempts.
- AI provider: generates scenarios within the contract and patches candidate code.
  Provider selection and credentials are still pending.

## Source references

- https://docs.stripe.com/webhooks
- https://docs.stripe.com/billing/subscriptions/webhooks
- https://docs.stripe.com/billing/subscriptions/overview

## Current status

The local application, replay harness, independent checker, reference repair,
CreateOS execution and ten-scenario smoke test are implemented and verified.
The OpenAI repair adapter is implemented, but paid AI calls remain deferred.
The test-only Link Agent Wallet / MPP commerce lane is implemented; its real
payment round trip awaits buyer OAuth and seller test credentials/profile.
See README.md and DEMO.md for the current setup and verified demo boundaries.

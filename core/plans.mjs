export const POLICY = { graceHours: 72, currency: 'usd' };
export const TITLES = ['First payment', 'Duplicate delivery', 'Same invoice, new event', 'Out-of-order events', 'Concurrent workers', 'Crash & retry', 'Renewal & recovery', 'Scheduled cancellation', 'Unpaid upgrade', 'Forged webhook'];
const BASE = 1_800_000_000;
export function makePlan(id, options = {}) {
  const amount = options.amount ?? 2900;
  const customer = { id: 'local_ada', stripe_customer_id: options.customerId || 'cus_rehearsal_ada', plan: 'none', access: 0, paid_through: BASE + 86400 * 30, grace_until: null };
  const sub = { id: options.subscriptionId || 'sub_rehearsal', customer: customer.stripe_customer_id, status: 'active', plan: 'basic', current_period_end: customer.paid_through, cancel_at_period_end: false };
  const invoice = { id: options.invoiceId || 'in_rehearsal', customer: customer.stripe_customer_id, subscription: sub.id, status: 'paid', amount_paid: amount, currency: 'usd', plan: 'basic', billing_reason: 'subscription_cycle' };
  const reference = { invoice, subscription: sub };
  let n = 0;
  const evt = (type, object, eid) => ({ id: eid ?? `evt_${id}_${++n}`, object: 'event', type, created: BASE, livemode: false, data: { object: structuredClone(object) } });
  const expected = (extra = {}) => ({ effects: 1, plan: 'basic', access: 1, total: amount, ...extra });
  const step = (label, event, expect, extra = {}) => ({ label, kind: 'deliver', event, now: BASE, reference: structuredClone(reference), expect, ...extra });
  const paid = evt('invoice.paid', invoice);
  const initial = { customers: [customer, { ...customer, id: 'local_other', stripe_customer_id: 'cus_other', plan: 'basic', access: 1 }], effects: [] };
  let steps = [];
  if (id === 'S01') steps = [step('Payment succeeds', paid, expected())];
  if (id === 'S02') steps = [step('First delivery', paid, expected()), step('Retry #1', paid, expected()), step('Retry #2', paid, expected())];
  if (id === 'S03') steps = [step('Original event', paid, expected()), step('New event, same invoice', evt('invoice.paid', invoice), expected())];
  if (id === 'S04') {
    customer.plan = 'basic'; customer.access = 1;
    const old = structuredClone(sub); old.status = 'active';
    reference.subscription.status = 'canceled';
    steps = [step('Cancellation arrives', evt('customer.subscription.deleted', reference.subscription), expected({ effects: 0, total: 0, access: 0 })), step('Stale active update arrives', evt('customer.subscription.updated', old), expected({ effects: 0, total: 0, access: 0 }))];
  }
  if (id === 'S05') steps = [step('Two workers cross the same barrier', paid, expected(), { kind: 'parallel', workers: 2 })];
  if (id === 'S06') steps = [step('Commit, then kill before acknowledgment', paid, expected(), { fault: 'crash-after-commit', expectedCrash: true }), step('Fresh process retries the delivery', paid, expected())];
  if (id === 'S07') {
    customer.plan = 'basic'; customer.access = 1; customer.paid_through = BASE;
    reference.invoice.status = 'open'; reference.invoice.amount_paid = 0; reference.subscription.status = 'past_due';
    steps.push(step('Renewal payment fails', evt('invoice.payment_failed', reference.invoice), expected({ effects: 0, total: 0 })));
    steps.push(step('Grace period still active', null, expected({ effects: 0, total: 0 }), { kind: 'reconcile', now: BASE + 71 * 3600 }));
    steps.push(step('Grace period expires', null, expected({ effects: 0, total: 0, access: 0 }), { kind: 'reconcile', now: BASE + 73 * 3600 }));
    reference.invoice.status = 'paid'; reference.invoice.amount_paid = amount; reference.subscription.status = 'active';
    steps.push(step('Payment recovers', paid, expected(), { now: BASE + 74 * 3600 }));
  }
  if (id === 'S08') {
    customer.plan = 'basic'; customer.access = 1; customer.paid_through = BASE + 3600;
    reference.subscription.current_period_end = customer.paid_through; reference.subscription.cancel_at_period_end = true;
    steps.push(step('Customer schedules cancellation', evt('customer.subscription.updated', reference.subscription), expected({ effects: 0, total: 0 })));
    steps.push(step('One second before period end', null, expected({ effects: 0, total: 0 }), { kind: 'reconcile', now: BASE + 3599 }));
    reference.subscription.status = 'canceled';
    steps.push(step('Paid period ends', evt('customer.subscription.deleted', reference.subscription), expected({ effects: 0, total: 0, access: 0 }), { now: BASE + 3600 }));
  }
  if (id === 'S09') {
    customer.plan = 'basic'; customer.access = 1;
    reference.subscription.plan = 'pro'; reference.invoice.plan = 'pro'; reference.invoice.billing_reason = 'subscription_update'; reference.invoice.status = 'open'; reference.invoice.amount_paid = 0;
    steps.push(step('Pro requested, invoice unpaid', evt('customer.subscription.updated', reference.subscription), expected({ effects: 0, total: 0 })));
    steps.push(step('Upgrade payment fails', evt('invoice.payment_failed', reference.invoice), expected({ effects: 0, total: 0 })));
    reference.invoice.status = 'paid'; reference.invoice.amount_paid = amount;
    const upgradePaid = evt('invoice.paid', reference.invoice);
    steps.push(step('Upgrade invoice is paid', upgradePaid, expected({ plan: 'pro' })));
    steps.push(step('Paid upgrade is redelivered', upgradePaid, expected({ plan: 'pro' })));
  }
  if (id === 'S10') steps = [step('Forged signature', paid, expected({ effects: 0, total: 0, plan: 'none', access: 0 }), { invalid: 'signature', expectStatus: 400 }), step('Payload altered after signing', paid, expected({ effects: 0, total: 0, plan: 'none', access: 0 }), { invalid: 'tampered', expectStatus: 400 })];
  if (!steps.length) throw new Error(`Unknown scenario ${id}`);
  // Expectations are retained by the verifier, never sent to candidate execution.
  return { id, title: TITLES[Number(id.slice(1)) - 1], amount, initial, steps, identity: { customerId: customer.stripe_customer_id, subscriptionId: sub.id, invoiceId: invoice.id } };
}
export function executionPlan(plan) {
  return { ...plan, steps: plan.steps.map(({ expect, expectStatus, expectedCrash, ...step }) => step) };
}

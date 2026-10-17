export function checkEvidence(plan, evidence) {
  const assertions = [];
  const add = (label, expected, actual, step) => assertions.push({ label, expected, actual, passed: JSON.stringify(expected) === JSON.stringify(actual), step });
  add('Every checkpoint produced evidence', plan.steps.length, evidence.checkpoints?.length ?? 0, 'run');
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i], c = evidence.checkpoints?.[i];
    if (!c) continue;
    const user = c.state?.customers?.find(x => x.id === 'local_ada');
    const other = c.state?.customers?.find(x => x.id === 'local_other');
    const effects = c.state?.effects ?? [];
    for (const [key, actual] of Object.entries({ effects: effects.length, plan: user?.plan, access: user?.access, total: effects.reduce((sum, e) => sum + e.amount, 0) })) add(key === 'effects' ? 'Exactly-once fulfillment' : key === 'total' ? 'Invoice amount preserved (cents)' : key === 'plan' ? 'Correct customer plan' : 'Correct access decision', s.expect[key], actual, s.label);
    add('Other customer remains unchanged', { plan: 'basic', access: 1 }, { plan: other?.plan, access: other?.access }, s.label);
    add('Effects belong to the mapped customer', true, effects.every(x => x.customer_id === 'local_ada' && x.invoice_id === plan.identity.invoiceId && x.currency === 'usd' && x.subscription_id === plan.identity.subscriptionId), s.label);
    if (s.expectedCrash) add('Crash injected after durable commit', true, c.results?.some(x => x.crashedAfterCommit === true) ?? false, s.label);
    else for (const r of c.results ?? []) add('Delivery acknowledged correctly', s.expectStatus ?? 200, r.status ?? null, s.label);
    if (s.kind === 'parallel') add('Both workers reached the controlled barrier', 2, c.barrierCount, s.label);
  }
  return { id: plan.id, title: plan.title, status: assertions.every(x => x.passed) ? 'passed' : 'failed', assertions, failedAssertions: assertions.filter(x => !x.passed).length, checkpoints: evidence.checkpoints ?? [], durationMs: evidence.durationMs, stderr: evidence.stderr ?? '' };
}

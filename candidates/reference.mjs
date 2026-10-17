// Bundled reference implementation, not an AI-generated repair.
export async function handle(ctx, raw, signature) {
  let event;
  try { event = ctx.verify(raw, signature); } catch { return { status: 400 }; }
  const object = event.data.object;
  const customer = ctx.db.prepare('SELECT * FROM customers WHERE stripe_customer_id = ?').get(object.customer);
  if (!customer) return { status: 200 };
  const { invoice, subscription } = ctx.reference;
  if (event.type === 'invoice.paid') {
    if (invoice.id !== object.id || invoice.customer !== customer.stripe_customer_id || invoice.status !== 'paid' || !Number.isSafeInteger(invoice.amount_paid)) return { status: 200 };
    await ctx.barrier();
    ctx.db.exec('BEGIN IMMEDIATE');
    try {
      const inserted = ctx.db.prepare('INSERT OR IGNORE INTO effects (business_key, invoice_id, subscription_id, customer_id, amount, currency) VALUES (?, ?, ?, ?, ?, ?)').run(`${invoice.id}:fulfill`, invoice.id, invoice.subscription, customer.id, invoice.amount_paid, invoice.currency);
      if (inserted.changes) ctx.db.prepare('UPDATE customers SET plan = ?, access = ?, paid_through = ?, grace_until = NULL WHERE id = ?').run(subscription.plan, subscription.status === 'active' ? 1 : 0, subscription.current_period_end, customer.id);
      ctx.db.prepare('INSERT OR IGNORE INTO processed(event_id) VALUES (?)').run(event.id);
      ctx.db.exec('COMMIT');
    } catch (error) { ctx.db.exec('ROLLBACK'); throw error; }
    await ctx.afterCommit();
  } else if (event.type === 'invoice.payment_failed') {
    if (invoice.billing_reason !== 'subscription_update' && invoice.status !== 'paid') {
      ctx.db.prepare('UPDATE customers SET grace_until = COALESCE(grace_until, ?), access = 1 WHERE id = ?').run(ctx.now + ctx.policy.graceHours * 3600, customer.id);
    }
  } else if (event.type.startsWith('customer.subscription.')) {
    // Reconcile against authoritative state, not the delivered snapshot's order.
    if (subscription.status === 'canceled' || (subscription.cancel_at_period_end && subscription.current_period_end <= ctx.now)) ctx.db.prepare('UPDATE customers SET access = 0 WHERE id = ?').run(customer.id);
    else if (subscription.cancel_at_period_end) ctx.db.prepare('UPDATE customers SET paid_through = ? WHERE id = ?').run(subscription.current_period_end, customer.id);
    // A subscription update alone never unlocks an unpaid plan upgrade.
  }
  return { status: 200 };
}
export async function reconcile(ctx) {
  ctx.db.prepare('UPDATE customers SET access = 0 WHERE grace_until IS NOT NULL AND grace_until <= ?').run(ctx.now);
  const sub = ctx.reference.subscription;
  if (sub.cancel_at_period_end && sub.current_period_end <= ctx.now) ctx.db.prepare('UPDATE customers SET access = 0 WHERE stripe_customer_id = ?').run(sub.customer);
  return { status: 200 };
}

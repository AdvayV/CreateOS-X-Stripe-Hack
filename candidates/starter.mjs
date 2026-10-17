// Deliberately flawed example. Rehearsal should expose the failures below.
export async function handle(ctx, raw, signature) {
  const event = JSON.parse(raw); // BUG: signature never verified.
  const object = event.data.object;
  const customer = ctx.db.prepare('SELECT * FROM customers WHERE stripe_customer_id = ?').get(object.customer);
  if (!customer) return { status: 200 };
  if (event.type === 'invoice.paid') {
    // BUG: a race can pass this check; event ID is not the fulfillment key.
    const seen = ctx.db.prepare('SELECT 1 FROM processed WHERE event_id = ?').get(event.id);
    await ctx.barrier();
    if (!seen) {
      ctx.db.prepare('INSERT INTO effects (business_key, invoice_id, subscription_id, customer_id, amount, currency) VALUES (?, ?, ?, ?, ?, ?)').run(`${event.id}:${ctx.nonce()}`, object.id, object.subscription, customer.id, object.amount_paid, object.currency);
      ctx.db.prepare('UPDATE customers SET plan = ?, access = 1 WHERE id = ?').run(object.plan || 'basic', customer.id);
      await ctx.afterCommit(); // BUG: completion marker is not part of the transaction.
      ctx.db.prepare('INSERT OR IGNORE INTO processed(event_id) VALUES (?)').run(event.id);
    }
  } else if (event.type === 'invoice.payment_failed') {
    ctx.db.prepare('UPDATE customers SET access = 0 WHERE id = ?').run(customer.id);
  } else if (event.type.startsWith('customer.subscription.')) {
    ctx.db.prepare('UPDATE customers SET plan = ?, access = ? WHERE id = ?').run(object.plan || customer.plan, object.status === 'active' && !object.cancel_at_period_end ? 1 : 0, customer.id);
  }
  return { status: 200 };
}
export async function reconcile(ctx) {
  return { status: 200 }; // BUG: no scheduled expiry or recovery reconciliation.
}

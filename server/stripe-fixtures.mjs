import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Stripe from 'stripe';
const exec = promisify(execFile);
function testClient() {
  const key = process.env.STRIPE_TEST_SECRET_KEY;
  if (!key) return null;
  if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) throw new Error('Stripe fixture integration accepts test keys only.');
  return new Stripe(key);
}
async function stripeCommand(args) {
  const env = { ...process.env }; delete env.STRIPE_API_KEY;
  const shim = process.platform === 'win32' ? `${process.env.APPDATA}/npm/node_modules/@stripe/cli/bin/shim.js` : null;
  const { stdout } = await exec(shim ? process.execPath : 'stripe', [...(shim ? [shim] : []), ...args, '--live=false', '--stripe-version', Stripe.API_VERSION], { env, timeout: 25000, maxBuffer: 1_000_000, windowsHide: true });
  let value; try { value = JSON.parse(stdout); } catch { throw new Error('Stripe CLI did not return JSON. Reauthorize it in a terminal.'); }
  if (value.error) throw new Error(value.error.message);
  if (value.livemode === true || value.data?.some(x => x.livemode === true)) throw new Error('Live billing data is not permitted.');
  return value;
}
export async function captureStripeFixture() {
  const client = testClient();
  const invoices = client ? await client.invoices.list({ limit: 10, status: 'paid' }) : await stripeCommand(['invoices', 'list', '--limit', '10', '--status', 'paid']);
  const invoice = invoices.data?.find(x => Number.isSafeInteger(x.amount_paid) && x.amount_paid > 0 && x.currency === 'usd' && (x.parent?.subscription_details?.subscription || x.subscription));
  if (!invoice) throw new Error('No paid USD subscription invoice found in Stripe test mode. Use Create test fixture once, then import it.');
  const subscriptionId = invoice.parent?.subscription_details?.subscription || invoice.subscription;
  const subscription = client ? await client.subscriptions.retrieve(subscriptionId) : await stripeCommand(['subscriptions', 'retrieve', subscriptionId]);
  if (invoice.livemode || subscription.livemode) throw new Error('Live billing data is not permitted.');
  return { source: 'stripe-sandbox', capturedAt: new Date().toISOString(), apiVersion: Stripe.API_VERSION, customerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id, subscriptionId, invoiceId: invoice.id, amount: invoice.amount_paid, currency: invoice.currency, subscriptionStatus: subscription.status, description: 'Stripe test API snapshot; fault sequences are controlled replays, not changes to your Stripe account.' };
}
export async function seedStripeFixture() {
  const client = testClient();
  if (client) {
    const product = await client.products.create({ name: 'Rehearsal demo subscription', metadata: { rehearsal: 'true' } });
    const price = await client.prices.create({ product: product.id, currency: 'usd', unit_amount: 2900, recurring: { interval: 'month' } });
    const customer = await client.customers.create({ name: 'Ada Rehearsal test fixture', payment_method: 'pm_card_visa', invoice_settings: { default_payment_method: 'pm_card_visa' }, metadata: { rehearsal: 'true' } });
    await client.subscriptions.create({ customer: customer.id, items: [{ price: price.id }], metadata: { rehearsal: 'true' } });
    return captureStripeFixture();
  }
  const product = await stripeCommand(['products', 'create', '--name', 'Rehearsal demo subscription', '-d', 'metadata[rehearsal]=true']);
  const price = await stripeCommand(['prices', 'create', '--product', product.id, '--currency', 'usd', '--unit-amount', '2900', '-d', 'recurring[interval]=month']);
  const customer = await stripeCommand(['customers', 'create', '--name', 'Ada Rehearsal test fixture', '--payment-method', 'pm_card_visa', '-d', 'invoice_settings[default_payment_method]=pm_card_visa', '-d', 'metadata[rehearsal]=true']);
  await stripeCommand(['subscriptions', 'create', '--customer', customer.id, '-d', `items[0][price]=${price.id}`, '-d', 'metadata[rehearsal]=true']);
  return captureStripeFixture();
}

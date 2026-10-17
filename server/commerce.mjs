import crypto from 'node:crypto';
import Stripe from 'stripe';
import { Mppx, stripe } from 'mppx/server';
let server;
export function commerceStatus() {
  const key = process.env.STRIPE_TEST_SECRET_KEY;
  const profile = process.env.STRIPE_TEST_PROFILE_ID;
  const missing = [];
  if (!key?.startsWith('sk_test_') && !key?.startsWith('rk_test_')) missing.push('STRIPE_TEST_SECRET_KEY');
  if (!profile?.startsWith('profile_test_')) missing.push('STRIPE_TEST_PROFILE_ID');
  return { ready: missing.length === 0, testOnly: true, amount: 50, currency: 'usd', missing, linkTokenConfigured: !!process.env.LINK_ACCESS_TOKEN, description: 'An external agent buys one ten-scenario verification through Link Agent Wallet and Stripe MPP.', buyerCommand: 'npx @stripe/link-cli mpp pay http://localhost:4173/api/commerce/rehearsals -X POST -d \'{"purchaseId":"demo-rehearsal-001","amount":2900}\' --context "Purchase one ten-scenario billing verification from Rehearsal for $0.50 in Stripe test mode. The customer requested a verification report before shipping billing code."', authCommand: 'npx @stripe/link-cli auth login', testModeNote: 'Only test seller keys and a profile_test_ profile are accepted. Link customer authorization is separate from Stripe CLI authorization.' };
}
export async function chargeTestRehearsal(req, body, port) {
  const status = commerceStatus();
  if (!status.ready) return { error: `Test commerce setup needs ${status.missing.join(' and ')}. No payment was attempted.`, status: 503 };
  if (!server) {
    const client = new Stripe(process.env.STRIPE_TEST_SECRET_KEY);
    const method = stripe.create({ client, networkId: process.env.STRIPE_TEST_PROFILE_ID, livemode: false });
    server = Mppx.create({ methods: method.defaultMethods(), secretKey: crypto.createHmac('sha256', process.env.STRIPE_TEST_SECRET_KEY).update('rehearsal-mpp-test-challenge').digest('base64') });
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string' && !['host', 'content-length', 'connection'].includes(name)) headers.set(name, value);
  const request = new Request(`http://localhost:${port}/api/commerce/rehearsals`, { method: 'POST', headers, body: JSON.stringify(body) });
  const charge = await server.charge({ amount: '0.50' })(request);
  if (charge.status === 402) return { challenge: charge.challenge };
  return { withReceipt: charge.withReceipt };
}

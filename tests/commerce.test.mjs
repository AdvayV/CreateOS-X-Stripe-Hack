import test from 'node:test';
import assert from 'node:assert/strict';
import { commerceStatus } from '../server/commerce.mjs';
test('Commerce refuses live seller keys and live profiles', () => {
  const key = process.env.STRIPE_TEST_SECRET_KEY, profile = process.env.STRIPE_TEST_PROFILE_ID;
  try {
    process.env.STRIPE_TEST_SECRET_KEY = 'sk_live_not_a_real_credential';
    process.env.STRIPE_TEST_PROFILE_ID = 'profile_live_example';
    const status = commerceStatus();
    assert.equal(status.ready, false);
    assert.deepEqual(status.missing, ['STRIPE_TEST_SECRET_KEY', 'STRIPE_TEST_PROFILE_ID']);
    assert.equal(status.testOnly, true);
    assert.equal(status.amount, 50);
  } finally {
    if (key === undefined) delete process.env.STRIPE_TEST_SECRET_KEY; else process.env.STRIPE_TEST_SECRET_KEY = key;
    if (profile === undefined) delete process.env.STRIPE_TEST_PROFILE_ID; else process.env.STRIPE_TEST_PROFILE_ID = profile;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  buildPayMongoCheckoutPayload,
  canAccessPaymentOrder,
  extractBearerToken,
  extractPayMongoWebhookOutcome,
  isConfiguredPayMongoKey,
  mapPayMongoSessionStatus,
  validateCheckoutEligibility,
  validateEmergencyDispatchLogInput,
  verifyPayMongoWebhookSignature,
} from './paymongoService.ts';

test('isConfiguredPayMongoKey rejects empty and placeholder keys', () => {
  assert.equal(isConfiguredPayMongoKey(undefined), false);
  assert.equal(isConfiguredPayMongoKey(''), false);
  assert.equal(isConfiguredPayMongoKey('sk_test_YOUR_PAYMONGO_SECRET_KEY'), false);
  assert.equal(isConfiguredPayMongoKey('sk_test_realkey12345'), true);
  assert.equal(isConfiguredPayMongoKey('sk_live_realkey12345'), true);
});

test('validateCheckoutEligibility enforces Rx pharmacist approval gate server-side', () => {
  const blocked = validateCheckoutEligibility({
    hasPrescription: true,
    prescriptionStatus: 'pending_review',
    amount: 230,
  });
  assert.equal(blocked.valid, false);
  assert.equal(blocked.statusCode, 403);

  const rejected = validateCheckoutEligibility({
    hasPrescription: true,
    prescriptionStatus: 'rejected',
    amount: 230,
  });
  assert.equal(rejected.valid, false);
  assert.equal(rejected.statusCode, 403);

  const approved = validateCheckoutEligibility({
    hasPrescription: true,
    prescriptionStatus: 'approved',
    amount: 230,
  });
  assert.equal(approved.valid, true);
  assert.equal(approved.statusCode, 200);

  const otc = validateCheckoutEligibility({
    hasPrescription: false,
    amount: 113,
  });
  assert.equal(otc.valid, true);
});

test('buildPayMongoCheckoutPayload converts PHP amounts to centavos and includes GCash', () => {
  const payload = buildPayMongoCheckoutPayload(
    {
      orderId: 5001,
      orderCode: 'MDX-ORD-5001',
      idempotencyKey: 'idem-5001',
      amount: 230,
      deliveryFee: 45,
      items: [{ name: 'Amoxicillin 500mg', quantity: 1, unitPrice: 185 }],
      merchantName: 'Rizal Ave. 24/7 Care Pharmacy',
      customerName: 'Claire Santos',
      customerEmail: 'claire.santos@medex.ph',
      customerPhone: '+639175550101',
      hasPrescription: true,
      prescriptionStatus: 'approved',
    },
    'https://medex.example.com/'
  );

  assert.deepEqual(payload.data.attributes.payment_method_types, ['gcash']);
  assert.equal(payload.data.attributes.line_items.length, 2);
  assert.equal(payload.data.attributes.line_items[0].amount, 18500);
  assert.equal(payload.data.attributes.line_items[1].amount, 4500);
  assert.match(payload.data.attributes.success_url, /^https:\/\/medex\.example\.com\/\?gcash_status=success/);
  assert.equal(payload.data.attributes.metadata.order_id, '5001');
});

test('verifyPayMongoWebhookSignature validates test/live HMAC signatures and rejects tampering', () => {
  const secret = 'whsk_test_secret_123';
  const rawBody = JSON.stringify({ data: { id: 'evt_1' } });
  const timestamp = '1700000000';
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

  const validTest = verifyPayMongoWebhookSignature(
    rawBody,
    `t=${timestamp},te=${sig},li=`,
    secret,
    false
  );
  assert.equal(validTest.valid, true);

  const validLive = verifyPayMongoWebhookSignature(
    rawBody,
    `t=${timestamp},te=,li=${sig}`,
    secret,
    true
  );
  assert.equal(validLive.valid, true);

  const tampered = verifyPayMongoWebhookSignature(
    '{"tampered":true}',
    `t=${timestamp},te=${sig},li=`,
    secret,
    false
  );
  assert.equal(tampered.valid, false);
});

test('extractPayMongoWebhookOutcome & mapPayMongoSessionStatus extract paid & failed events', () => {
  const paidWebhook = extractPayMongoWebhookOutcome({
    data: {
      attributes: {
        type: 'checkout_session.payment.paid',
        data: {
          id: 'cs_test_999',
          attributes: {
            metadata: { order_id: '5001' },
            payments: [{ id: 'pay_888', attributes: { status: 'paid' } }],
          },
        },
      },
    },
  });
  assert.equal(paidWebhook?.status, 'paid');
  assert.equal(paidWebhook?.orderId, 5001);
  assert.equal(paidWebhook?.gatewayReference, 'PM-pay_888');

  const mappedPaid = mapPayMongoSessionStatus({
    data: {
      id: 'cs_test_999',
      attributes: {
        payments: [{ id: 'pay_777', attributes: { status: 'paid' } }],
      },
    },
  });
  assert.equal(mappedPaid.status, 'paid');
  assert.equal(mappedPaid.gatewayReference, 'PM-pay_777');
});

test('extractBearerToken extracts valid bearer JWTs and rejects malformed headers', () => {
  assert.equal(extractBearerToken(undefined), null);
  assert.equal(extractBearerToken('Basic abc123'), null);
  assert.equal(extractBearerToken('Bearer short'), null);
  assert.equal(
    extractBearerToken('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig'),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig'
  );
});

test('canAccessPaymentOrder restricts payment status inspection to owner, assigned approved merchant, or admin', () => {
  assert.equal(
    canAccessPaymentOrder({ userId: 101, isApprovedAdmin: false, role: 'resident' }, { residentId: 101, merchantId: 201 }),
    true
  );
  assert.equal(
    canAccessPaymentOrder({ userId: 102, isApprovedAdmin: false, role: 'resident' }, { residentId: 101, merchantId: 201 }),
    false
  );
  assert.equal(
    canAccessPaymentOrder(
      { userId: 201, isApprovedAdmin: false, role: 'merchant', status: 'approved' },
      { residentId: 101, merchantId: 201 }
    ),
    true
  );
  assert.equal(
    canAccessPaymentOrder(
      { userId: 201, isApprovedAdmin: false, role: 'merchant', status: 'pending' },
      { residentId: 101, merchantId: 201 }
    ),
    false
  );
  assert.equal(
    canAccessPaymentOrder({ userId: 401, isApprovedAdmin: true, role: 'admin', status: 'approved' }, { residentId: 101, merchantId: 201 }),
    true
  );
});

test('validateEmergencyDispatchLogInput enforces Olongapo coordinate bounds and valid reference keys', () => {
  const ok = validateEmergencyDispatchLogInput({
    referenceCode: 'MDX-EMG-261123-ABCDE',
    idempotencyKey: 'emg-101-12345',
    handoffMode: 'mobile_dialer',
    barangayName: 'East Bajac-Bajac',
    addressSnapshot: '18 18th St, Olongapo City',
    latitude: 14.8364,
    longitude: 120.2846,
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.normalized?.handoffMode, 'mobile_dialer');

  const outsideBounds = validateEmergencyDispatchLogInput({
    referenceCode: 'MDX-EMG-261123-ABCDE',
    idempotencyKey: 'emg-101-12345',
    latitude: 40.7128,
    longitude: -74.006,
  });
  assert.equal(outsideBounds.valid, false);

  const missingRef = validateEmergencyDispatchLogInput({
    referenceCode: '',
    idempotencyKey: 'abc',
    latitude: 14.8364,
    longitude: 120.2846,
  });
  assert.equal(missingRef.valid, false);
});

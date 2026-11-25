import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapDbDeliveryRating,
  mapDbMerchantProfile,
  mapDbOrderBundleToOrder,
  mapDbPharmacyReview,
  mapDbProduct,
  parseJsonNumberArray,
  parseJsonStringArray,
  resolveProductImageFallback,
  sanitizeStorageSegment,
} from './dbMappers.ts';

test('parseJsonStringArray handles native arrays, JSON strings, and invalid values', () => {
  assert.deepEqual(parseJsonStringArray(['Fast Delivery', 'Courteous']), [
    'Fast Delivery',
    'Courteous',
  ]);
  assert.deepEqual(parseJsonStringArray('["Complete Items","Well Packaged"]'), [
    'Complete Items',
    'Well Packaged',
  ]);
  assert.deepEqual(parseJsonStringArray('not-valid-json'), []);
  assert.deepEqual(parseJsonStringArray(null), []);
});

test('parseJsonNumberArray handles native arrays and MySQL JSON strings', () => {
  assert.deepEqual(parseJsonNumberArray([301, 302]), [301, 302]);
  assert.deepEqual(parseJsonNumberArray('[301, "302", "bad"]'), [301, 302]);
  assert.deepEqual(parseJsonNumberArray(''), []);
});

test('sanitizeStorageSegment strips unsafe characters and path traversal', () => {
  assert.equal(sanitizeStorageSegment('../../My Rx File (2026).PNG'), '..-..-my-rx-file-2026-.png');
  assert.equal(sanitizeStorageSegment('   '), 'file');
});

test('resolveProductImageFallback follows explicit -> productId -> categoryId -> default', () => {
  const fallbacks = {
    byProductId: { 10: '/img/p10.png' },
    byCategoryId: { 2: '/img/cat2.png' },
    defaultImage: '/img/default.png',
  };
  assert.equal(resolveProductImageFallback('/uploads/products/a.jpg', 10, 2, fallbacks), '/uploads/products/a.jpg');
  assert.equal(resolveProductImageFallback('', 10, 2, fallbacks), '/img/p10.png');
  assert.equal(resolveProductImageFallback(null, 99, 2, fallbacks), '/img/cat2.png');
  assert.equal(resolveProductImageFallback(undefined, 99, 9, fallbacks), '/img/default.png');
});

test('mapDbProduct converts MySQL TINYINT(1) booleans and DECIMAL strings accurately', () => {
  const mapped = mapDbProduct(
    {
      product_id: 501,
      merchant_id: 201,
      category_id: 1,
      name: 'Biogesic Paracetamol 500mg',
      dosage_strength: '500mg',
      description: 'Fever and pain relief',
      image_path: '',
      unit: '10 tablets',
      purchase_limit: 5,
      is_listed: 1,
      requires_prescription: 0,
      regular_price: '48.50',
      stock_quantity: 42,
      low_stock_threshold: 10,
      updated_at: '2026-11-24T00:00:00.000Z',
    },
    { byCategoryId: { 1: '/img/otc.png' } }
  );

  assert.equal(mapped.product_id, 501);
  assert.equal(mapped.is_listed, true);
  assert.equal(mapped.requires_prescription, false);
  assert.equal(mapped.regular_price, 48.5);
  assert.equal(mapped.image_path, '/img/otc.png');
});

test('mapDbMerchantProfile normalizes MySQL TINYINT(1) store status flags', () => {
  const mapped = mapDbMerchantProfile({
    merchant_id: 204,
    user_id: 204,
    shop_name: 'Jeo Ong Pharmacy',
    shop_address_id: 14,
    is_pharmacist: 1,
    pharmacist_name: 'Jeo Ong',
    pharmacist_license_no: 'PRC-0091234',
    is_24_hours: 1,
    is_temporarily_closed: 0,
    contact_no: '+639171234567',
  });

  assert.equal(mapped.is_pharmacist, true);
  assert.equal(mapped.is_24_hours, true);
  assert.equal(mapped.is_temporarily_closed, false);
  assert.equal(mapped.shop_name, 'Jeo Ong Pharmacy');
});

test('mapDbOrderBundleToOrder assembles normalized MySQL tables and sorts status history', () => {
  const order = mapDbOrderBundleToOrder({
    orderRow: {
      order_id: 5001,
      order_code: 'MDX-2026-5001',
      idempotency_key: 'ord-key-5001',
      resident_id: 101,
      merchant_id: 201,
      alert_id: null,
      address_id: 1,
      delivery_address_snapshot: '123 Rizal Ave, Brgy. East Bajac-Bajac, Olongapo City',
      recipient_name: 'Juan Dela Cruz',
      recipient_phone: '+639171234567',
      subtotal: '195.00',
      delivery_fee: '45.00',
      total_amount: '240.00',
      status: 'in_transit',
      placed_at: '2026-11-24T01:00:00.000Z',
    },
    items: [
      {
        order_item_id: 1,
        order_id: 5001,
        product_id: 501,
        merchant_id: 201,
        product_name: 'Biogesic 500mg',
        unit: '10 tablets',
        requires_prescription: 0,
        unit_price: '48.75',
        quantity: 4,
      },
    ],
    history: [
      {
        history_id: 2,
        order_id: 5001,
        status: 'in_transit',
        note: 'Picked up',
        created_at: '2026-11-24T01:15:00.000Z',
      },
      {
        history_id: 1,
        order_id: 5001,
        status: 'placed',
        note: 'Order placed',
        created_at: '2026-11-24T01:00:00.000Z',
      },
    ],
    payment: {
      payment_id: 7001,
      order_id: 5001,
      method: 'GCash',
      idempotency_key: 'pay-5001',
      receipt_number: 'RCP-2026-5001',
      amount: '240.00',
      amount_collected: '240.00',
      is_flagged: 0,
      status: 'paid',
      is_simulated_sandbox: 1,
      created_at: '2026-11-24T01:00:00.000Z',
    },
    delivery: {
      delivery_id: 8001,
      order_id: 5001,
      rider_id: 301,
      pickup_merchant_id: 201,
      status: 'in_transit',
      requested_at: '2026-11-24T01:05:00.000Z',
      confirmation_code: '4829',
      code_attempts: 0,
      is_flagged_for_admin: 0,
      declined_by_rider_ids: '[302, 303]',
    },
  });

  assert.equal(order.total_amount, 240);
  assert.equal(order.items[0].unit_price, 48.75);
  assert.equal(order.status_history[0].status, 'placed');
  assert.equal(order.status_history[1].status, 'in_transit');
  assert.equal(order.payment.is_simulated_sandbox, true);
  assert.deepEqual(order.delivery?.declined_by_rider_ids, [302, 303]);
});

test('privacy-safe views map null resident_id cleanly for anonymous reviews and ratings', () => {
  const review = mapDbPharmacyReview({
    review_id: 11,
    order_id: 5001,
    resident_id: null,
    merchant_id: 201,
    rating: 5,
    tags: '["Accurate Order","Helpful Pharmacist"]',
    comment: 'Great service',
    is_anonymous: 1,
    reviewer_display_name: 'Verified Resident (Anonymous)',
    status: 'visible',
    idempotency_key: 'rev-11',
    created_at: '2026-11-24T02:00:00.000Z',
    updated_at: '2026-11-24T02:00:00.000Z',
  });
  const rating = mapDbDeliveryRating({
    rating_id: 22,
    delivery_id: 8001,
    order_id: 5001,
    resident_id: null,
    rider_id: 301,
    stars: 5,
    tags: '["Fast Delivery"]',
    comment: 'Arrived quickly',
    is_anonymous: 1,
    created_at: '2026-11-24T02:00:00.000Z',
  });

  assert.equal(review.resident_id, 0);
  assert.equal(review.is_anonymous, true);
  assert.equal(review.reviewer_display_name, 'Verified Resident (Anonymous)');
  assert.deepEqual(review.tags, ['Accurate Order', 'Helpful Pharmacist']);
  assert.equal(rating.resident_id, 0);
  assert.deepEqual(rating.tags, ['Fast Delivery']);
});

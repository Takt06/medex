import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAddressRealtimeEvent,
  applyMerchantHourRealtimeEvent,
  applyMerchantProfileRealtimeEvent,
  applyProductRealtimeEvent,
  applyUserRealtimeEvent,
  reconcilePersistedProduct,
  validateOperatingHoursRange,
} from './realtimeReducers';
import type { Address, MerchantHourRow, MerchantProfile, Product, UserAccount } from '../types/medex';

test('applyProductRealtimeEvent handles INSERT, idempotent replay, optimistic reconciliation, UPDATE, and DELETE', () => {
  const initial: Product[] = [
    {
      product_id: 1,
      merchant_id: 201,
      category_id: 1,
      name: 'Paracetamol 500mg',
      dosage_strength: '500mg',
      description: 'Pain reliever',
      image_path: '/img/med.jpg',
      unit: '10 tablets',
      purchase_limit: 5,
      is_listed: true,
      requires_prescription: false,
      regular_price: 68,
      stock_quantity: 50,
      low_stock_threshold: 10,
      updated_at: '2026-11-23T00:00:00Z',
    },
  ];

  // INSERT new product from Jeo Ong Pharmacy (merchant_id 205)
  const inserted = applyProductRealtimeEvent(initial, 'INSERT', {
    product_id: 12,
    merchant_id: 205,
    category_id: 1,
    name: 'Biogesic 500mg',
    dosage_strength: '500mg',
    description: 'Fever relief',
    image_path: '',
    unit: '10 tablets',
    purchase_limit: 3,
    is_listed: true,
    requires_prescription: false,
    regular_price: 45,
    stock_quantity: 25,
    low_stock_threshold: 5,
    updated_at: '2026-11-23T01:00:00Z',
  }, null, { defaultImage: '/fallback.jpg' });

  assert.equal(inserted.length, 2);
  assert.equal(inserted[1].product_id, 12);
  assert.equal(inserted[1].image_path, '/fallback.jpg');

  // Replaying same INSERT is idempotent (no duplicate)
  const replayed = applyProductRealtimeEvent(inserted, 'INSERT', {
    product_id: 12,
    merchant_id: 205,
    category_id: 1,
    name: 'Biogesic 500mg',
    description: 'Fever relief',
    image_path: '/custom.jpg',
    unit: '10 tablets',
    purchase_limit: 3,
    is_listed: true,
    requires_prescription: false,
    regular_price: 45,
    stock_quantity: 25,
    low_stock_threshold: 5,
    updated_at: '2026-11-23T01:00:00Z',
  }, null);
  assert.equal(replayed.length, 2);
  assert.equal(replayed[1].image_path, '/custom.jpg');

  // Optimistic negative-ID product reconciles cleanly on INSERT
  const withOptimistic: Product[] = [
    ...replayed,
    {
      product_id: -99999,
      merchant_id: 205,
      category_id: 2,
      name: 'Alcohol 70%',
      description: 'Antiseptic',
      image_path: '/a.jpg',
      unit: '500ml bottle',
      purchase_limit: 2,
      is_listed: true,
      requires_prescription: false,
      regular_price: 120,
      stock_quantity: 10,
      low_stock_threshold: 3,
      updated_at: '2026-11-23T01:05:00Z',
    },
  ];
  const reconciled = applyProductRealtimeEvent(withOptimistic, 'INSERT', {
    product_id: 13,
    merchant_id: 205,
    category_id: 2,
    name: 'Alcohol 70%',
    description: 'Antiseptic',
    image_path: '/a.jpg',
    unit: '500ml bottle',
    purchase_limit: 2,
    is_listed: true,
    requires_prescription: false,
    regular_price: 120,
    stock_quantity: 10,
    low_stock_threshold: 3,
    updated_at: '2026-11-23T01:05:01Z',
  }, null);
  assert.equal(reconciled.length, 3);
  assert.equal(reconciled.some((p) => p.product_id < 0), false);
  assert.equal(reconciled[2].product_id, 13);

  // UPDATE stock, price, and unlist state
  const updated = applyProductRealtimeEvent(reconciled, 'UPDATE', {
    product_id: 12,
    merchant_id: 205,
    category_id: 1,
    name: 'Biogesic 500mg',
    description: 'Fever relief',
    image_path: '/custom.jpg',
    unit: '10 tablets',
    purchase_limit: 3,
    is_listed: false,
    requires_prescription: false,
    regular_price: 52.5,
    stock_quantity: 0,
    low_stock_threshold: 5,
    updated_at: '2026-11-23T02:00:00Z',
  }, null);
  assert.equal(updated.find((p) => p.product_id === 12)?.regular_price, 52.5);
  assert.equal(updated.find((p) => p.product_id === 12)?.is_listed, false);

  // DELETE removes product; repeated DELETE is safe no-op
  const deleted = applyProductRealtimeEvent(updated, 'DELETE', null, { product_id: 12 });
  assert.equal(deleted.length, 2);
  assert.equal(deleted.some((p) => p.product_id === 12), false);

  const deletedAgain = applyProductRealtimeEvent(deleted, 'DELETE', null, { product_id: 12 });
  assert.equal(deletedAgain, deleted);
});

test('applyMerchantProfileRealtimeEvent updates store open/24h/temp-closed status and handles INSERT/DELETE', () => {
  const initial: MerchantProfile[] = [
    {
      merchant_id: 205,
      user_id: 205,
      shop_name: 'Jeo Ong Pharmacy',
      shop_address_id: 50,
      is_pharmacist: true,
      pharmacist_name: 'Jeo Ong',
      pharmacist_license_no: 'PRC-0094821',
      is_24_hours: false,
      is_temporarily_closed: false,
      contact_no: '+639171234567',
    },
  ];

  // Toggle 24 hours ON + temp closed ON
  const toggled = applyMerchantProfileRealtimeEvent(initial, 'UPDATE', {
    merchant_id: 205,
    user_id: 205,
    shop_name: 'Jeo Ong Pharmacy',
    shop_address_id: 50,
    is_pharmacist: true,
    pharmacist_name: 'Jeo Ong',
    pharmacist_license_no: 'PRC-0094821',
    is_24_hours: true,
    is_temporarily_closed: true,
    contact_no: '+639171234567',
  }, null);
  assert.equal(toggled.length, 1);
  assert.equal(toggled[0].is_24_hours, true);
  assert.equal(toggled[0].is_temporarily_closed, true);

  // INSERT another approved pharmacy
  const added = applyMerchantProfileRealtimeEvent(toggled, 'INSERT', {
    merchant_id: 206,
    user_id: 206,
    shop_name: 'Kalaklan Care Pharmacy',
    shop_address_id: 51,
    is_pharmacist: true,
    pharmacist_name: 'Maria Clara',
    pharmacist_license_no: 'PRC-0112233',
    is_24_hours: false,
    is_temporarily_closed: false,
    contact_no: '+639179998877',
  }, null);
  assert.equal(added.length, 2);

  // DELETE merchant profile
  const removed = applyMerchantProfileRealtimeEvent(added, 'DELETE', null, { merchant_id: 206 });
  assert.equal(removed.length, 1);
  assert.equal(removed[0].merchant_id, 205);
});

test('applyUserRealtimeEvent reflects admin merchant approval/suspension instantly and idempotently', () => {
  const initial: UserAccount[] = [
    {
      user_id: 205,
      role: 'merchant',
      phone_number: '+639171234567',
      email: 'jeo.ong@gmail.com',
      first_name: 'Jeo',
      last_name: 'Ong',
      date_of_birth: '1994-05-01',
      status: 'pending',
      created_at: '2026-11-20T00:00:00Z',
    },
  ];

  // Admin approves merchant
  const approved = applyUserRealtimeEvent(initial, 'UPDATE', {
    user_id: 205,
    role: 'merchant',
    phone_number: '+639171234567',
    email: 'jeo.ong@gmail.com',
    first_name: 'Jeo',
    last_name: 'Ong',
    date_of_birth: '1994-05-01',
    status: 'approved',
    status_reason: null,
    created_at: '2026-11-20T00:00:00Z',
  }, null);
  assert.equal(approved[0].status, 'approved');

  // Admin suspends merchant with reason
  const suspended = applyUserRealtimeEvent(approved, 'UPDATE', {
    user_id: 205,
    role: 'merchant',
    phone_number: '+639171234567',
    email: 'jeo.ong@gmail.com',
    first_name: 'Jeo',
    last_name: 'Ong',
    date_of_birth: '1994-05-01',
    status: 'suspended',
    status_reason: 'Expired PRC license',
    created_at: '2026-11-20T00:00:00Z',
  }, null);
  assert.equal(suspended[0].status, 'suspended');
  assert.equal(suspended[0].status_reason, 'Expired PRC license');

  // DELETE user row
  const deleted = applyUserRealtimeEvent(suspended, 'DELETE', null, { user_id: 205 });
  assert.equal(deleted.length, 0);
});

test('applyMerchantHourRealtimeEvent and applyAddressRealtimeEvent handle schedule and store pin changes', () => {
  const hours: MerchantHourRow[] = [
    { hours_id: 1, merchant_id: 205, day_of_week: 1, opens_at: '08:00', closes_at: '20:00', is_closed: false },
  ];
  const updatedHours = applyMerchantHourRealtimeEvent(hours, 'UPDATE', {
    hours_id: 1,
    merchant_id: 205,
    day_of_week: 1,
    opens_at: '07:00',
    closes_at: '22:00',
    is_closed: false,
  }, null);
  assert.equal(updatedHours[0].opens_at, '07:00');
  assert.equal(updatedHours[0].closes_at, '22:00');

  const addresses: Address[] = [];
  const insertedAddr = applyAddressRealtimeEvent(addresses, 'INSERT', {
    address_id: 50,
    user_id: 205,
    barangay_id: 1,
    recipient_name: 'Jeo Ong Pharmacy',
    recipient_phone: '+639171234567',
    street: '#42 East Bajac Bajac',
    latitude: 14.8355,
    longitude: 120.2842,
    is_primary: true,
    created_at: '2026-11-20T00:00:00Z',
  }, null);
  assert.equal(insertedAddr.length, 1);
  assert.equal(insertedAddr[0].street, '#42 East Bajac Bajac');

  const deletedAddr = applyAddressRealtimeEvent(insertedAddr, 'DELETE', null, { address_id: 50 });
  assert.equal(deletedAddr.length, 0);
});

test('reconcilePersistedProduct avoids duplicates when realtime INSERT/UPDATE arrives before HTTP response', () => {
  const base: Product = {
    product_id: 15,
    merchant_id: 205,
    category_id: 1,
    name: 'Cetirizine 10mg',
    description: 'Antihistamine',
    image_path: '/img/med.jpg',
    unit: '10 tablets',
    purchase_limit: 3,
    is_listed: true,
    requires_prescription: false,
    regular_price: 85,
    stock_quantity: 40,
    low_stock_threshold: 10,
    updated_at: '2026-11-23T01:00:00Z',
  };

  // Case 1: Realtime INSERT already replaced negative optimistic ID with product_id=15
  const afterRealtime: Product[] = [base];
  const merged = reconcilePersistedProduct(afterRealtime, -1732380000, {
    ...base,
    image_path: 'https://cdn.example.com/product-15.jpg',
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].product_id, 15);
  assert.equal(merged[0].image_path, 'https://cdn.example.com/product-15.jpg');

  // Case 2: Both optimistic negative ID and realtime product_id=15 exist transiently
  const bothPresent: Product[] = [{ ...base, product_id: -1732380000 }, base];
  const deduped = reconcilePersistedProduct(bothPresent, -1732380000, base);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].product_id, 15);

  // Case 3: Unlist fallback after realtime UPDATE already patched product_id=15
  const unlisted = reconcilePersistedProduct(deduped, 15, {
    ...base,
    is_listed: false,
    stock_quantity: 0,
  });
  assert.equal(unlisted.length, 1);
  assert.equal(unlisted[0].is_listed, false);
  assert.equal(unlisted[0].stock_quantity, 0);
});

test('validateOperatingHoursRange enforces valid 24-hour times and chronological open/close order', () => {
  assert.equal(validateOperatingHoursRange('08:00', '20:00', false).valid, true);
  assert.equal(validateOperatingHoursRange('00:00', '00:00', true).valid, true);
  assert.equal(validateOperatingHoursRange('20:00', '08:00', false).valid, false);
  assert.equal(validateOperatingHoursRange('09:00', '09:00', false).valid, false);
  assert.equal(validateOperatingHoursRange('25:00', '23:00', false).valid, false);
});


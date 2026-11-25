import assert from 'node:assert/strict';
import test from 'node:test';
import { partitionMobileNavItems } from './mobileNav';

test('partitionMobileNavItems keeps 5 or fewer items inline without a More overflow menu', () => {
  const fourItems = [
    { id: 'dispatch', label: 'Dispatch' },
    { id: 'earnings', label: 'Earnings' },
    { id: 'ratings', label: 'Ratings' },
    { id: 'account', label: 'Profile' },
  ];
  const fourResult = partitionMobileNavItems(fourItems, 5);
  assert.equal(fourResult.hasMore, false);
  assert.equal(fourResult.primaryItems.length, 4);
  assert.equal(fourResult.overflowItems.length, 0);

  const fiveItems = [...fourItems, { id: 'locator', label: 'Map' }];
  const fiveResult = partitionMobileNavItems(fiveItems, 5);
  assert.equal(fiveResult.hasMore, false);
  assert.equal(fiveResult.primaryItems.length, 5);
  assert.equal(fiveResult.overflowItems.length, 0);
});

test('partitionMobileNavItems caps primary capsule buttons at 4 + 1 More button when items exceed 5', () => {
  const customerItems = [
    { id: 'customer_home', label: 'Home' },
    { id: 'locator', label: 'Locator' },
    { id: 'emergency', label: 'Emergency' },
    { id: 'orders', label: 'Orders' },
    { id: 'store', label: 'Medicine Store' },
    { id: 'coupons', label: 'Promo Coupons' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'account', label: 'Account' },
  ];

  const partitioned = partitionMobileNavItems(customerItems, 5);
  assert.equal(partitioned.hasMore, true);
  assert.deepEqual(
    partitioned.primaryItems.map((i) => i.id),
    ['customer_home', 'locator', 'emergency', 'orders']
  );
  assert.deepEqual(
    partitioned.overflowItems.map((i) => i.id),
    ['store', 'coupons', 'feedback', 'account']
  );
  // Center button (slot 3 of 5 = index 2) remains Emergency for customers
  assert.equal(partitioned.primaryItems[2].id, 'emergency');
});

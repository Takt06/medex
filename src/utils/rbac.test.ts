import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAdminCreateRole,
  canRegisterRolePublicly,
  canSuspendTargetAccount,
  getEffectivePermissions,
  hasPermission,
} from './rbac';

test('public registration strictly allows only Customer, Merchant, and Rider', () => {
  assert.equal(canRegisterRolePublicly('resident'), true);
  assert.equal(canRegisterRolePublicly('merchant'), true);
  assert.equal(canRegisterRolePublicly('rider'), true);

  assert.equal(canRegisterRolePublicly('admin'), false);
  assert.equal(canRegisterRolePublicly('delivery_manager'), false);
  assert.equal(canRegisterRolePublicly('coupon_handler'), false);
  assert.equal(canRegisterRolePublicly('inventory_manager'), false);
  assert.equal(canRegisterRolePublicly('customer_service'), false);
});

test('only approved Global Admin can create internal department accounts', () => {
  assert.equal(canAdminCreateRole({ role: 'admin', status: 'approved' }, 'delivery_manager'), true);
  assert.equal(canAdminCreateRole({ role: 'admin', status: 'approved' }, 'coupon_handler'), true);
  assert.equal(canAdminCreateRole({ role: 'admin', status: 'approved' }, 'inventory_manager'), true);
  assert.equal(canAdminCreateRole({ role: 'admin', status: 'approved' }, 'customer_service'), true);

  assert.equal(canAdminCreateRole({ role: 'admin', status: 'approved' }, 'admin'), false);
  assert.equal(canAdminCreateRole({ role: 'delivery_manager', status: 'approved' }, 'coupon_handler'), false);
  assert.equal(canAdminCreateRole({ role: 'resident', status: 'approved' }, 'delivery_manager'), false);
  assert.equal(canAdminCreateRole({ role: 'admin', status: 'suspended' }, 'delivery_manager'), false);
});

test('internal department roles follow strict separation of permissions', () => {
  const deliveryMgr = { role: 'delivery_manager' as const, status: 'approved' as const };
  assert.equal(hasPermission(deliveryMgr, 'deliveries:assign_rider'), true);
  assert.equal(hasPermission(deliveryMgr, 'riders:manage_operational_status'), true);
  assert.equal(hasPermission(deliveryMgr, 'coupons:create'), false);
  assert.equal(hasPermission(deliveryMgr, 'inventory:read_oversight'), false);
  assert.equal(hasPermission(deliveryMgr, 'complaints:manage_cs'), false);
  assert.equal(hasPermission(deliveryMgr, 'system_settings:manage'), false);

  const couponHandler = { role: 'coupon_handler' as const, status: 'approved' as const };
  assert.equal(hasPermission(couponHandler, 'coupons:create'), true);
  assert.equal(hasPermission(couponHandler, 'coupons:view_redemptions'), true);
  assert.equal(hasPermission(couponHandler, 'deliveries:assign_rider'), false);
  assert.equal(hasPermission(couponHandler, 'inventory:read_oversight'), false);
  assert.equal(hasPermission(couponHandler, 'complaints:manage_cs'), false);

  const inventoryMgr = { role: 'inventory_manager' as const, status: 'approved' as const };
  assert.equal(hasPermission(inventoryMgr, 'inventory:read_oversight'), true);
  assert.equal(hasPermission(inventoryMgr, 'inventory:read_history'), true);
  assert.equal(hasPermission(inventoryMgr, 'coupons:create'), false);
  assert.equal(hasPermission(inventoryMgr, 'deliveries:assign_rider'), false);
  assert.equal(hasPermission(inventoryMgr, 'products:manage_own'), false);

  const csStaff = { role: 'customer_service' as const, status: 'approved' as const };
  assert.equal(hasPermission(csStaff, 'complaints:manage_cs'), true);
  assert.equal(hasPermission(csStaff, 'returns:resolve_dispute'), true);
  assert.equal(hasPermission(csStaff, 'coupons:create'), false);
  assert.equal(hasPermission(csStaff, 'riders:manage_operational_status'), false);
});

test('explicit per-user grants and revocations work while Global Admin retains full access', () => {
  const granted = getEffectivePermissions('customer_service', {
    grant: ['orders:read_all'],
    revoke: ['feedback:moderate'],
  });
  assert.equal(granted.has('orders:read_all'), true);
  assert.equal(granted.has('feedback:moderate'), false);

  const suspendedDeliveryMgr = { role: 'delivery_manager' as const, status: 'suspended' as const };
  assert.equal(hasPermission(suspendedDeliveryMgr, 'deliveries:assign_rider'), false);

  const adminPerms = getEffectivePermissions('admin', { revoke: ['system_settings:manage'] });
  assert.equal(adminPerms.has('system_settings:manage'), true);
});

test('scoped suspension allows Delivery Management to suspend riders only, never Admin or merchants', () => {
  const dm = { user_id: 10, role: 'delivery_manager' as const, status: 'approved' as const };
  assert.equal(canSuspendTargetAccount(dm, { user_id: 22, role: 'rider' }), true);
  assert.equal(canSuspendTargetAccount(dm, { user_id: 1, role: 'admin' }), false);
  assert.equal(canSuspendTargetAccount(dm, { user_id: 15, role: 'merchant' }), false);

  const admin = { user_id: 1, role: 'admin' as const, status: 'approved' as const };
  assert.equal(canSuspendTargetAccount(admin, { user_id: 15, role: 'merchant' }), true);
  assert.equal(canSuspendTargetAccount(admin, { user_id: 1, role: 'admin' }), false);
});

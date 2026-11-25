import type {
  InternalAdminRole,
  PublicRegisterRole,
  UserAccount,
  UserPermissionOverrides,
  UserRole,
} from '../types/medex';

export const PUBLIC_REGISTRATION_ROLES: readonly PublicRegisterRole[] = [
  'resident',
  'merchant',
  'rider',
] as const;

export const INTERNAL_DEPARTMENT_ROLES: readonly Exclude<InternalAdminRole, 'admin'>[] = [
  'delivery_manager',
  'coupon_handler',
  'inventory_manager',
  'customer_service',
] as const;

export const INTERNAL_ADMIN_ROLES: readonly InternalAdminRole[] = [
  'admin',
  'delivery_manager',
  'coupon_handler',
  'inventory_manager',
  'customer_service',
] as const;

export const ALL_USER_ROLES: readonly UserRole[] = [
  ...PUBLIC_REGISTRATION_ROLES,
  ...INTERNAL_ADMIN_ROLES,
] as const;

export type RbacPermission =
  // Internal staff & global system admin
  | 'internal_accounts:read'
  | 'internal_accounts:create'
  | 'internal_accounts:manage_permissions'
  | 'system_settings:manage'
  | 'users:verify_partners'
  | 'users:suspend_any'
  | 'audit_logs:read'
  | 'zones:manage'
  // Delivery Management & Rider subsystem
  | 'deliveries:read_all'
  | 'deliveries:assign_rider'
  | 'deliveries:manage_own'
  | 'riders:read_all'
  | 'riders:manage_operational_status'
  | 'riders:suspend_scoped'
  // Coupons & Campaigns subsystem
  | 'coupons:read_public'
  | 'coupons:claim'
  | 'coupons:read_all'
  | 'coupons:create'
  | 'coupons:update'
  | 'coupons:delete'
  | 'coupons:view_redemptions'
  | 'coupons:view_analytics'
  // Inventory Management & Store Product subsystem
  | 'stores:read_all'
  | 'products:read_all'
  | 'products:manage_own'
  | 'inventory:read_oversight'
  | 'inventory:read_history'
  | 'inventory:view_analytics'
  // Customer Service, Feedback, Complaints & Escalations
  | 'feedback:submit'
  | 'feedback:read_all'
  | 'feedback:moderate'
  | 'complaints:respond_store'
  | 'complaints:escalate'
  | 'complaints:manage_cs'
  | 'complaints:view_analytics'
  // Returns & Refunds
  | 'returns:request'
  | 'returns:respond_store'
  | 'returns:escalate'
  | 'returns:resolve_dispute'
  | 'returns:read_oversight'
  // Orders, Rx, Payments & Emergency
  | 'orders:place'
  | 'orders:read_all'
  | 'orders:manage_store'
  | 'prescriptions:review'
  | 'emergency:trigger'
  | 'emergency:verify';

export interface PermissionCatalogItem {
  code: RbacPermission;
  label: string;
  module: string;
  description: string;
}

export const PERMISSION_CATALOG: readonly PermissionCatalogItem[] = [
  {
    code: 'internal_accounts:read',
    label: 'View Internal Staff',
    module: 'Admin & RBAC',
    description: 'View internal administrative department accounts and permission assignments.',
  },
  {
    code: 'internal_accounts:create',
    label: 'Create Internal Accounts',
    module: 'Admin & RBAC',
    description: 'Create Delivery Management, Coupon Handler, Inventory Management, and CS accounts.',
  },
  {
    code: 'internal_accounts:manage_permissions',
    label: 'Manage Role Overrides',
    module: 'Admin & RBAC',
    description: 'Grant or revoke explicit per-user permissions on internal accounts.',
  },
  {
    code: 'system_settings:manage',
    label: 'System Settings',
    module: 'Admin & RBAC',
    description: 'Manage global system configuration, emergency dispatch, and barangay zones.',
  },
  {
    code: 'users:verify_partners',
    label: 'Verify Stores & Riders',
    module: 'Admin & RBAC',
    description: 'Approve or reject partner applications after inspecting legal documents.',
  },
  {
    code: 'users:suspend_any',
    label: 'Suspend Any Account',
    module: 'Admin & RBAC',
    description: 'Suspend or reactivate any non-global-admin account.',
  },
  {
    code: 'audit_logs:read',
    label: 'Read Audit Logs',
    module: 'Admin & RBAC',
    description: 'Inspect platform-wide immutable audit trails.',
  },
  {
    code: 'zones:manage',
    label: 'Manage Service Zones',
    module: 'Admin & RBAC',
    description: 'Add and maintain covered Olongapo City barangays.',
  },
  {
    code: 'deliveries:read_all',
    label: 'Monitor All Deliveries',
    module: 'Delivery Management',
    description: 'View all active, pending, completed, delayed, and failed deliveries and shipped items.',
  },
  {
    code: 'deliveries:assign_rider',
    label: 'Assign Riders',
    module: 'Delivery Management',
    description: 'Assign or reassign available riders to ready-for-pickup deliveries.',
  },
  {
    code: 'riders:read_all',
    label: 'View Rider Roster',
    module: 'Delivery Management',
    description: 'View rider profiles, operational statuses, ratings, and delivery metrics.',
  },
  {
    code: 'riders:manage_operational_status',
    label: 'Update Rider Availability',
    module: 'Delivery Management',
    description: 'Change rider operational status (Active, Available, Assigned, On Delivery, Inactive).',
  },
  {
    code: 'riders:suspend_scoped',
    label: 'Suspend / Reactivate Riders',
    module: 'Delivery Management',
    description: 'Temporarily suspend or reactivate rider dispatch eligibility within delivery scope.',
  },
  {
    code: 'coupons:read_all',
    label: 'View All Coupons',
    module: 'Coupon Handler',
    description: 'Inspect active, scheduled, and expired promotional campaigns.',
  },
  {
    code: 'coupons:create',
    label: 'Create Coupons',
    module: 'Coupon Handler',
    description: 'Create new promo codes, discount caps, store/product restrictions, and limits.',
  },
  {
    code: 'coupons:update',
    label: 'Edit / Toggle Coupons',
    module: 'Coupon Handler',
    description: 'Update coupon limits, expiration dates, eligibility, or active status.',
  },
  {
    code: 'coupons:delete',
    label: 'Delete Coupons',
    module: 'Coupon Handler',
    description: 'Remove unused or retired coupons.',
  },
  {
    code: 'coupons:view_redemptions',
    label: 'View Redemption Audit',
    module: 'Coupon Handler',
    description: 'Inspect successful redemptions and failed/invalid promo code attempts.',
  },
  {
    code: 'coupons:view_analytics',
    label: 'Coupon Analytics',
    module: 'Coupon Handler',
    description: 'View campaign usage rates and total discount savings.',
  },
  {
    code: 'stores:read_all',
    label: 'Browse Store Directory',
    module: 'Inventory Management',
    description: 'Inspect pharmacy stores and merchant branches across Olongapo City.',
  },
  {
    code: 'products:read_all',
    label: 'Inspect Store Catalogs',
    module: 'Inventory Management',
    description: 'Inspect store products, availability, and stock thresholds.',
  },
  {
    code: 'inventory:read_oversight',
    label: 'Cross-Store Stock Oversight',
    module: 'Inventory Management',
    description: 'Monitor stock health (Available, Low Stock, Out of Stock, High Stock).',
  },
  {
    code: 'inventory:read_history',
    label: 'Inventory Movement History',
    module: 'Inventory Management',
    description: 'Review stock additions, checkout deductions, and restock ledger.',
  },
  {
    code: 'inventory:view_analytics',
    label: 'Inventory Analytics',
    module: 'Inventory Management',
    description: 'Analyze restock needs, category distribution, and stockout risks.',
  },
  {
    code: 'feedback:read_all',
    label: 'View All Feedback & Complaints',
    module: 'Customer Service',
    description: 'Monitor store ratings, customer feedback, and complaint reports.',
  },
  {
    code: 'feedback:moderate',
    label: 'Moderate Reviews',
    module: 'Customer Service',
    description: 'Hide or restore policy-violating storefront reviews.',
  },
  {
    code: 'complaints:manage_cs',
    label: 'Manage Complaints & Escalations',
    module: 'Customer Service',
    description: 'Categorize cases, add internal CS notes, respond, and resolve escalated tickets.',
  },
  {
    code: 'complaints:view_analytics',
    label: 'Support Analytics',
    module: 'Customer Service',
    description: 'Track open vs resolved cases, store response status, and resolution speed.',
  },
  {
    code: 'returns:read_oversight',
    label: 'View Return & Refund Cases',
    module: 'Customer Service',
    description: 'Inspect return/refund requests and store responses.',
  },
  {
    code: 'returns:resolve_dispute',
    label: 'Resolve Return Disputes',
    module: 'Customer Service',
    description: 'Decide escalated return/refund disputes when store response is unresolved.',
  },
  {
    code: 'orders:read_all',
    label: 'View All Platform Orders',
    module: 'Global Oversight',
    description: 'Inspect all orders, payments, and COD/PIN compliance flags.',
  },
  {
    code: 'emergency:verify',
    label: 'Verify 911 Alerts',
    module: 'Global Oversight',
    description: 'Verify genuine vs accidental 911 emergency dispatches.',
  },
] as const;

export const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  resident: 'Customer',
  merchant: 'Store / Merchant',
  rider: 'Delivery Rider',
  admin: 'Global Admin',
  delivery_manager: 'Delivery Management',
  coupon_handler: 'Coupon Handler',
  inventory_manager: 'Inventory Management',
  customer_service: 'Customer Service',
};

export const ROLE_PERMISSION_MATRIX: Record<UserRole, readonly RbacPermission[]> = {
  resident: [
    'coupons:read_public',
    'coupons:claim',
    'orders:place',
    'feedback:submit',
    'complaints:escalate',
    'returns:request',
    'returns:escalate',
    'emergency:trigger',
  ],
  merchant: [
    'products:manage_own',
    'orders:manage_store',
    'prescriptions:review',
    'complaints:respond_store',
    'returns:respond_store',
    'inventory:read_history',
  ],
  rider: ['deliveries:manage_own'],
  admin: [
    'internal_accounts:read',
    'internal_accounts:create',
    'internal_accounts:manage_permissions',
    'system_settings:manage',
    'users:verify_partners',
    'users:suspend_any',
    'audit_logs:read',
    'zones:manage',
    'deliveries:read_all',
    'deliveries:assign_rider',
    'riders:read_all',
    'riders:manage_operational_status',
    'riders:suspend_scoped',
    'coupons:read_public',
    'coupons:read_all',
    'coupons:create',
    'coupons:update',
    'coupons:delete',
    'coupons:view_redemptions',
    'coupons:view_analytics',
    'stores:read_all',
    'products:read_all',
    'inventory:read_oversight',
    'inventory:read_history',
    'inventory:view_analytics',
    'feedback:read_all',
    'feedback:moderate',
    'complaints:manage_cs',
    'complaints:view_analytics',
    'returns:read_oversight',
    'returns:resolve_dispute',
    'orders:read_all',
    'emergency:verify',
  ],
  delivery_manager: [
    'deliveries:read_all',
    'deliveries:assign_rider',
    'riders:read_all',
    'riders:manage_operational_status',
    'riders:suspend_scoped',
  ],
  coupon_handler: [
    'coupons:read_public',
    'coupons:read_all',
    'coupons:create',
    'coupons:update',
    'coupons:delete',
    'coupons:view_redemptions',
    'coupons:view_analytics',
    'stores:read_all',
  ],
  inventory_manager: [
    'stores:read_all',
    'products:read_all',
    'inventory:read_oversight',
    'inventory:read_history',
    'inventory:view_analytics',
  ],
  customer_service: [
    'feedback:read_all',
    'feedback:moderate',
    'complaints:manage_cs',
    'complaints:view_analytics',
    'returns:read_oversight',
    'returns:resolve_dispute',
    'stores:read_all',
  ],
};

export function isPublicRegisterRole(role: string): role is PublicRegisterRole {
  return (PUBLIC_REGISTRATION_ROLES as readonly string[]).includes(role);
}

export function isInternalAdminRole(role: string): role is InternalAdminRole {
  return (INTERNAL_ADMIN_ROLES as readonly string[]).includes(role);
}

export function canRegisterRolePublicly(role: string): boolean {
  return isPublicRegisterRole(role);
}

export function canAdminCreateRole(
  actor: Pick<UserAccount, 'role' | 'status'> | null | undefined,
  targetRole: string
): boolean {
  if (!actor || actor.role !== 'admin' || actor.status !== 'approved') return false;
  return (INTERNAL_DEPARTMENT_ROLES as readonly string[]).includes(targetRole);
}

export function getEffectivePermissions(
  role: UserRole,
  overrides?: UserPermissionOverrides | null
): Set<RbacPermission> {
  const base = new Set<RbacPermission>(ROLE_PERMISSION_MATRIX[role] || []);
  if (overrides?.grant) {
    for (const p of overrides.grant) {
      base.add(p as RbacPermission);
    }
  }
  if (overrides?.revoke && role !== 'admin') {
    for (const p of overrides.revoke) {
      base.delete(p as RbacPermission);
    }
  }
  return base;
}

export function hasPermission(
  user: Pick<UserAccount, 'role' | 'status' | 'permission_overrides'> | null | undefined,
  permission: RbacPermission
): boolean {
  if (!user) return false;
  if (user.status === 'suspended' || user.status === 'rejected') return false;
  if (user.role === 'admin' && user.status === 'approved') return true;
  if (isInternalAdminRole(user.role) && user.status !== 'approved') return false;
  const effective = getEffectivePermissions(user.role, user.permission_overrides);
  return effective.has(permission);
}

export function canSuspendTargetAccount(
  actor: Pick<UserAccount, 'user_id' | 'role' | 'status' | 'permission_overrides'> | null | undefined,
  target: Pick<UserAccount, 'user_id' | 'role'>
): boolean {
  if (!actor || actor.user_id === target.user_id) return false;
  if (target.role === 'admin') return false;
  if (hasPermission(actor, 'users:suspend_any')) return true;
  if (target.role === 'rider' && hasPermission(actor, 'riders:suspend_scoped')) {
    return true;
  }
  return false;
}

export function canAccessOrderForUser(
  user: Pick<UserAccount, 'user_id' | 'role' | 'status' | 'permission_overrides'> | null | undefined,
  order: { resident_id: number; merchant_id: number; delivery?: { rider_id: number | null; status: string } }
): boolean {
  if (!user) return false;
  if (hasPermission(user, 'orders:read_all') || hasPermission(user, 'deliveries:read_all')) {
    return true;
  }
  if (hasPermission(user, 'returns:read_oversight') || hasPermission(user, 'complaints:manage_cs')) {
    return true;
  }
  if (user.role === 'resident') return order.resident_id === user.user_id;
  if (user.role === 'merchant') return order.merchant_id === user.user_id;
  if (user.role === 'rider') {
    return (
      order.delivery?.rider_id === user.user_id ||
      order.delivery?.status === 'requested'
    );
  }
  return false;
}

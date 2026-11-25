import express, { type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  canTransitionOrderStatus,
  canEditPharmacyReview,
  getBarangayCenterCoords,
  isAtLeast18,
  isSafeImageOrDocUrl,
  isStrictGmailAddress,
  normalizePHPhoneNumber,
  validateAndNormalizePHPlateNumber,
  validateAndNormalizePrcLicense,
  validateCommentPrivacy,
  validateOlongapoCoordinates,
  validatePasswordStrength,
  validatePersonName,
  validateRegularPrice,
  validateReportStatusTransition,
  validateRiderRatingInput,
  validateSignInEmail,
  validateSignupEmail,
  validateStoreReviewInput,
} from '../src/utils/medexRules.ts';
import {
  canAdminCreateRole,
  canRegisterRolePublicly,
  getEffectivePermissions,
  hasPermission,
  isInternalAdminRole,
  type RbacPermission,
} from '../src/utils/rbac.ts';
import {
  buildUniqueReturnRefCode,
  canCustomerClaimCoupon,
  canEscalateProblemReportToCS,
  canRequestReturnRefund,
  canTransitionReturnRefundStatus,
  normalizeCouponCode,
  validateAndCalculateCouponDiscount,
} from '../src/utils/couponRules.ts';
import type {
  Coupon,
  CustomerCoupon,
  ReturnRefundReason,
  ReturnRefundStatus,
  RiderOperationalStatus,
  UserRole,
} from '../src/types/medex.ts';
import { validateOperatingHoursRange } from '../src/utils/realtimeReducers.ts';
import { extractBearerToken } from './paymongoService.ts';
import {
  consumeAuthRateLimit,
  hashPassword,
  invalidateUserTokens,
  revokeSessionToken,
  signSessionToken,
  toMySqlDateTime,
  validateUploadDataUrl,
  verifyPassword,
} from './authService.ts';
import {
  checkMySqlConnection,
  executeSql,
  getMySqlDiagnosticStatus,
  isMySqlConfigured,
  queryOne,
  queryRows,
  resolveAuthenticatedMedExUser,
  withTransaction,
  type AuthenticatedMedExUser,
} from './mysqlDb.ts';
import {
  attachRealtimeStream,
  emitPublicTableDelta,
  emitRealtimeSync,
} from './realtimeBus.ts';

const SAFE_USER_COLS =
  'user_id, role, phone_number, email, first_name, last_name, date_of_birth, status, status_reason, policy_accepted_at, policy_version, created_by_admin_id, department_label, created_at';

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
const PRODUCT_UPLOADS_DIR = path.resolve(UPLOADS_ROOT, 'products');
const RX_UPLOADS_DIR = path.resolve(UPLOADS_ROOT, 'prescriptions');
const MERCHANT_DOCS_UPLOADS_DIR = path.resolve(UPLOADS_ROOT, 'merchant-docs');
const RIDER_DOCS_UPLOADS_DIR = path.resolve(UPLOADS_ROOT, 'rider-docs');

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const RX_MIMES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
const MERCHANT_DOC_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const AUTHORITATIVE_DELIVERY_FEE = 45;

function safeConfinedPath(baseDir: string, fileName: string): string | null {
  const cleanName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '');
  if (!cleanName || cleanName !== fileName) return null;
  const resolved = path.resolve(baseDir, cleanName);
  const baseWithSep = baseDir.endsWith(path.sep) ? baseDir : `${baseDir}${path.sep}`;
  if (!resolved.startsWith(baseWithSep)) return null;
  return resolved;
}

async function saveUploadedDataUrl(
  kind: 'product' | 'prescription' | 'merchant_doc' | 'rider_doc',
  prefix: string,
  dataUrl: string
): Promise<{ ok: true; publicOrApiPath: string; fileName: string } | { ok: false; error: string }> {
  const allowed =
    kind === 'product'
      ? IMAGE_MIMES
      : kind === 'merchant_doc' || kind === 'rider_doc'
        ? MERCHANT_DOC_MIMES
        : RX_MIMES;
  const maxBytes = kind === 'product' ? 4 * 1024 * 1024 : 10 * 1024 * 1024;
  const parsed = validateUploadDataUrl(dataUrl, allowed, maxBytes);
  if (!parsed.ok) return parsed;

  const targetDir =
    kind === 'product'
      ? PRODUCT_UPLOADS_DIR
      : kind === 'merchant_doc'
        ? MERCHANT_DOCS_UPLOADS_DIR
        : kind === 'rider_doc'
          ? RIDER_DOCS_UPLOADS_DIR
          : RX_UPLOADS_DIR;
  await fs.mkdir(targetDir, { recursive: true });
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'file';
  const fileName = `${safePrefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${parsed.extension}`;
  const fullPath = safeConfinedPath(targetDir, fileName);
  if (!fullPath) return { ok: false, error: 'Invalid upload file path.' };

  await fs.writeFile(fullPath, parsed.buffer);
  const publicOrApiPath =
    kind === 'product'
      ? `/uploads/products/${fileName}`
      : kind === 'merchant_doc'
        ? `/api/uploads/merchant-docs/${fileName}`
        : kind === 'rider_doc'
          ? `/api/uploads/rider-docs/${fileName}`
          : `/api/uploads/prescriptions/${fileName}`;
  return { ok: true, publicOrApiPath, fileName };
}

function getMySqlErrorCode(err: unknown): { code?: string; errno?: number; message: string } {
  if (err && typeof err === 'object') {
    const e = err as { code?: string; errno?: number; message?: string };
    return { code: e.code, errno: e.errno, message: e.message || 'Database error' };
  }
  return { message: String(err || 'Database error') };
}

function sendInternalDbError(res: Response, context: string, err: unknown): Response {
  const e = getMySqlErrorCode(err);
  console.error(`[MedEx DB Error] (${context}):`, e.message);
  return res.status(500).json({ ok: false, error: 'Database operation failed. Please retry.' });
}

function redactPublicMerchantFields(row: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...row };
  delete clean.business_permit_url;
  delete clean.government_id_url;
  delete clean.business_permit_name;
  delete clean.government_id_name;
  return clean;
}

function isSafePinMatch(storedCode: string, submittedCode: string): boolean {
  const a = Buffer.from(storedCode.trim(), 'utf8');
  const b = Buffer.from(submittedCode.trim(), 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function getOptionalAuthUser(req: Request): Promise<AuthenticatedMedExUser | null> {
  const token = extractBearerToken(req.header('Authorization') || req.header('authorization'));
  if (!token) return null;
  return resolveAuthenticatedMedExUser(token);
}

async function requireAuthUser(
  req: Request,
  res: Response
): Promise<AuthenticatedMedExUser | null> {
  if (!(await checkMySqlConnection())) {
    res.status(503).json({
      ok: false,
      error: 'MySQL database is not connected. Start your MySQL server and verify .env settings.',
    });
    return null;
  }
  const user = await getOptionalAuthUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'Authentication required. Please sign in again.' });
    return null;
  }
  return user;
}

function userHasPerm(
  authUser: AuthenticatedMedExUser | null | undefined,
  permission: RbacPermission
): boolean {
  if (!authUser) return false;
  return hasPermission(
    {
      role: authUser.role,
      status: authUser.status,
      permission_overrides: authUser.permissionOverrides,
    },
    permission
  );
}

function parseNumArrayCol(val: unknown): number[] {
  if (Array.isArray(val)) return val.map(Number).filter((n) => Number.isFinite(n));
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isFinite(n)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapRawCouponRow(row: Record<string, unknown>): Coupon {
  return {
    coupon_id: Number(row.coupon_id),
    code: String(row.code || ''),
    title: String(row.title || ''),
    description: String(row.description || ''),
    discount_type: row.discount_type === 'percentage' ? 'percentage' : 'fixed',
    discount_value: Number(row.discount_value ?? 0),
    max_discount_amount:
      row.max_discount_amount !== null && row.max_discount_amount !== undefined
        ? Number(row.max_discount_amount)
        : null,
    min_purchase_amount: Number(row.min_purchase_amount ?? 0),
    usage_limit_total:
      row.usage_limit_total !== null && row.usage_limit_total !== undefined
        ? Number(row.usage_limit_total)
        : null,
    usage_limit_per_user: Math.max(1, Number(row.usage_limit_per_user ?? 1)),
    times_used: Number(row.times_used ?? 0),
    starts_at: String(row.starts_at || new Date().toISOString()),
    expires_at: String(row.expires_at || new Date().toISOString()),
    is_active: Boolean(row.is_active),
    target_segment: (row.target_segment as Coupon['target_segment']) || 'all',
    applicable_merchant_ids: parseNumArrayCol(row.applicable_merchant_ids),
    applicable_product_ids: parseNumArrayCol(row.applicable_product_ids),
    eligible_resident_ids: parseNumArrayCol(row.eligible_resident_ids),
    created_by_id: Number(row.created_by_id ?? 1),
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString()),
  };
}

async function notifyApprovedAdmins(
  title: string,
  message: string,
  notificationType: string
): Promise<void> {
  const nowSql = toMySqlDateTime(new Date());
  await executeSql(
    `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
     SELECT user_id, ?, ?, ?, 0, ?
     FROM users
     WHERE role = 'admin' AND status = 'approved'`,
    [title, message, notificationType, nowSql]
  );
}

export function createMedExRouter(): express.Router {
  const router = express.Router();

  // --------------------------------------------------------------------------
  // 1. REAL-TIME SERVER-SENT EVENTS (SSE) STREAM
  // --------------------------------------------------------------------------
  router.get('/realtime/events', (req, res) => {
    attachRealtimeStream(req, res);
  });

  // --------------------------------------------------------------------------
  // 2. AUTH & FIRST-RUN ADMIN PASSWORD BOOTSTRAP
  // --------------------------------------------------------------------------
  router.get('/auth/bootstrap-status', async (_req, res) => {
    const configured = isMySqlConfigured();
    const connected = configured ? await checkMySqlConnection() : false;
    let adminNeedsPasswordSetup = false;
    if (connected) {
      try {
        const adminRow = await queryOne<{ password_hash: string | null }>(
          `SELECT password_hash FROM users WHERE email = ? AND role = 'admin' LIMIT 1`,
          ['admin@medex.ph']
        );
        adminNeedsPasswordSetup = Boolean(adminRow && !adminRow.password_hash);
      } catch {
        adminNeedsPasswordSetup = false;
      }
    }
    return res.json({
      ok: true,
      mysqlConfigured: configured,
      mysqlConnected: connected,
      mysqlDiagnostic: getMySqlDiagnosticStatus(),
      adminNeedsPasswordSetup,
    });
  });

  router.post('/auth/claim-admin', async (req, res) => {
    if (!(await checkMySqlConnection())) {
      return res.status(503).json({ ok: false, error: 'MySQL database is not connected.' });
    }
    const rateCheck = consumeAuthRateLimit(`claim:${req.ip || 'unknown'}`, 5, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        error: `Too many setup attempts. Please wait ${rateCheck.retryAfterSeconds}s before retrying.`,
      });
    }
    const { email, password } = (req.body || {}) as { email?: string; password?: string };
    const cleanEmail = String(email || 'admin@medex.ph').trim().toLowerCase();
    const pwCheck = validatePasswordStrength(String(password || ''));
    if (!pwCheck.valid) {
      return res.status(400).json({ ok: false, error: pwCheck.error });
    }

    try {
      const adminRow = await queryOne<Record<string, unknown>>(
        `SELECT ${SAFE_USER_COLS}, password_hash
         FROM users
         WHERE email = ? AND role = 'admin' AND status = 'approved'
         LIMIT 1`,
        [cleanEmail]
      );
      if (!adminRow) {
        return res.status(404).json({ ok: false, error: 'Admin account not found in MySQL.' });
      }
      if (adminRow.password_hash) {
        return res.status(409).json({
          ok: false,
          error: 'Admin password is already initialized. Please sign in normally.',
        });
      }

      const hashed = hashPassword(String(password));
      await executeSql(
        `UPDATE users SET password_hash = ? WHERE user_id = ? AND password_hash IS NULL`,
        [hashed, Number(adminRow.user_id)]
      );

      const safeUser = { ...adminRow };
      delete safeUser.password_hash;
      const token = signSessionToken({
        userId: Number(adminRow.user_id),
        role: 'admin',
        email: cleanEmail,
      });

      return res.json({ ok: true, token, user: safeUser });
    } catch (err) {
      return sendInternalDbError(res, 'claim-admin', err);
    }
  });

  router.post('/auth/register', async (req, res) => {
    if (!(await checkMySqlConnection())) {
      return res.status(503).json({ ok: false, error: 'MySQL database is not connected.' });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const rawRole = String(body.role || '').trim();
    if (!canRegisterRolePublicly(rawRole)) {
      return res.status(403).json({
        ok: false,
        error: 'Public registration is restricted strictly to Customer, Store/Merchant, or Rider accounts.',
      });
    }
    const role = rawRole as 'resident' | 'merchant' | 'rider';

    const firstCheck = validatePersonName(String(body.first_name || ''), 'First Name');
    if (!firstCheck.valid) return res.status(400).json({ ok: false, error: firstCheck.error });

    const lastCheck = validatePersonName(String(body.last_name || ''), 'Last Name');
    if (!lastCheck.valid) return res.status(400).json({ ok: false, error: lastCheck.error });

    const emailCheck = validateSignupEmail(String(body.email || ''));
    if (!emailCheck.valid) return res.status(400).json({ ok: false, error: emailCheck.error });

    const pwCheck = validatePasswordStrength(String(body.password || ''));
    if (!pwCheck.valid) return res.status(400).json({ ok: false, error: pwCheck.error });

    const normalizedPhone = normalizePHPhoneNumber(String(body.phone_number || ''));
    if (!normalizedPhone) {
      return res.status(400).json({
        ok: false,
        error: 'Enter a valid Philippine mobile number (e.g., 09171234567 or +639171234567).',
      });
    }

    const dob = String(body.date_of_birth || '').slice(0, 10);
    if (!isAtLeast18(dob)) {
      return res.status(400).json({
        ok: false,
        error: 'Residents and partners must be at least 18 years old to register.',
      });
    }

    if (body.policy_accepted !== true) {
      return res.status(400).json({
        ok: false,
        error: 'You must review and acknowledge the MedEx Platform Policies before registering.',
      });
    }
    const policyVersion = String(body.policy_version || '1.0').slice(0, 32);

    const existingUser = await queryOne<{ user_id: number }>(
      `SELECT user_id FROM users WHERE LOWER(email) = ? OR phone_number = ? LIMIT 1`,
      [emailCheck.normalized, normalizedPhone]
    );
    if (existingUser) {
      return res.status(409).json({
        ok: false,
        error: 'Email/Phone Number is already registered. Account is already existing.',
      });
    }

    let normalizedShopName = '';
    let normalizedRph = '';
    let normalizedPrc = '';
    let businessPermitName: string | null = null;
    let businessPermitUrl: string | null = null;
    let governmentIdName: string | null = null;
    let governmentIdUrl: string | null = null;

    if (role === 'merchant') {
      normalizedShopName = String(body.shop_name || '').trim();
      if (!normalizedShopName) {
        return res.status(400).json({ ok: false, error: 'Please enter your pharmacy store name.' });
      }
      const rphCheck = validatePersonName(
        String(body.pharmacist_name || ''),
        'Licensed Pharmacist Name'
      );
      if (!rphCheck.valid) return res.status(400).json({ ok: false, error: rphCheck.error });
      normalizedRph = rphCheck.normalized;

      const prcCheck = validateAndNormalizePrcLicense(String(body.pharmacist_license_no || ''));
      if (!prcCheck.valid) return res.status(400).json({ ok: false, error: prcCheck.error });
      normalizedPrc = prcCheck.normalized;

      const existingPrc = await queryOne<{ merchant_id: number }>(
        `SELECT merchant_id FROM merchant_profiles WHERE UPPER(pharmacist_license_no) = ? LIMIT 1`,
        [normalizedPrc.toUpperCase()]
      );
      if (existingPrc) {
        return res.status(409).json({
          ok: false,
          error: 'PRC License Number is already registered to another pharmacy.',
        });
      }

      const rawPermit = String(body.business_permit_url || '').trim();
      const rawGovId = String(body.government_id_url || '').trim();
      if (!rawPermit) {
        return res.status(400).json({
          ok: false,
          error: 'A valid Business Permit document (JPG, PNG, WebP, or PDF) is required for merchant verification.',
        });
      }
      if (!rawGovId) {
        return res.status(400).json({
          ok: false,
          error: 'A valid Government-Issued ID document (JPG, PNG, WebP, or PDF) is required for merchant verification.',
        });
      }

      businessPermitName = String(body.business_permit_name || 'business-permit').slice(0, 255);
      governmentIdName = String(body.government_id_name || 'government-id').slice(0, 255);

      if (rawPermit.startsWith('data:')) {
        const savedPermit = await saveUploadedDataUrl('merchant_doc', 'permit', rawPermit);
        if (!savedPermit.ok) return res.status(400).json({ ok: false, error: savedPermit.error });
        businessPermitUrl = savedPermit.publicOrApiPath;
      } else {
        if (!isSafeImageOrDocUrl(rawPermit)) {
          return res.status(400).json({
            ok: false,
            error: 'Business Permit document must be a safe JPG, PNG, WebP, or PDF upload.',
          });
        }
        businessPermitUrl = rawPermit;
      }

      if (rawGovId.startsWith('data:')) {
        const savedGov = await saveUploadedDataUrl('merchant_doc', 'govid', rawGovId);
        if (!savedGov.ok) return res.status(400).json({ ok: false, error: savedGov.error });
        governmentIdUrl = savedGov.publicOrApiPath;
      } else {
        if (!isSafeImageOrDocUrl(rawGovId)) {
          return res.status(400).json({
            ok: false,
            error: 'Government-Issued ID document must be a safe JPG, PNG, WebP, or PDF upload.',
          });
        }
        governmentIdUrl = rawGovId;
      }
    }

    let normalizedPlate = '';
    const vehicleType = String(body.vehicle_type || 'Motorcycle').trim();
    let driverLicenseName: string | null = null;
    let driverLicenseUrl: string | null = null;
    let vehicleRegistrationName: string | null = null;
    let vehicleRegistrationUrl: string | null = null;

    if (role === 'rider') {
      const plateCheck = validateAndNormalizePHPlateNumber(
        String(body.plate_number || ''),
        vehicleType
      );
      if (!plateCheck.valid) return res.status(400).json({ ok: false, error: plateCheck.error });
      normalizedPlate = plateCheck.normalized;

      const existingPlate = await queryOne<{ rider_id: number }>(
        `SELECT rider_id FROM rider_profiles WHERE UPPER(plate_number) = ? LIMIT 1`,
        [normalizedPlate.toUpperCase()]
      );
      if (existingPlate) {
        return res.status(409).json({
          ok: false,
          error: 'LTO Plate Number is already registered to another rider.',
        });
      }

      const rawDriverLicense = String(body.driver_license_url || '').trim();
      const rawVehicleReg = String(body.vehicle_registration_url || '').trim();
      if (!rawDriverLicense) {
        return res.status(400).json({
          ok: false,
          error: "A valid Driver's License / Government ID document (JPG, PNG, WebP, or PDF) is required for rider verification.",
        });
      }
      if (!rawVehicleReg) {
        return res.status(400).json({
          ok: false,
          error: 'A valid Vehicle Registration Document (LTO OR/CR, JPG, PNG, WebP, or PDF) is required for rider verification.',
        });
      }

      driverLicenseName = String(body.driver_license_name || 'driver-license').slice(0, 255);
      vehicleRegistrationName = String(body.vehicle_registration_name || 'vehicle-registration').slice(0, 255);

      if (!rawDriverLicense.startsWith('data:')) {
        return res.status(400).json({
          ok: false,
          error: "Driver's License ID must be uploaded as a valid JPG, PNG, WebP, or PDF file.",
        });
      }
      const savedLicense = await saveUploadedDataUrl('rider_doc', 'license', rawDriverLicense);
      if (!savedLicense.ok) return res.status(400).json({ ok: false, error: savedLicense.error });
      driverLicenseUrl = savedLicense.publicOrApiPath;

      if (!rawVehicleReg.startsWith('data:')) {
        return res.status(400).json({
          ok: false,
          error: 'Vehicle Registration Document must be uploaded as a valid JPG, PNG, WebP, or PDF file.',
        });
      }
      const savedReg = await saveUploadedDataUrl('rider_doc', 'vehiclereg', rawVehicleReg);
      if (!savedReg.ok) return res.status(400).json({ ok: false, error: savedReg.error });
      vehicleRegistrationUrl = savedReg.publicOrApiPath;
    }

    const barangayId = Number(body.barangay_id) || 1;
    const street = String(body.street || '').trim();
    const landmark = String(body.landmark || '').trim() || null;
    if ((role === 'resident' || role === 'merchant') && !street) {
      return res.status(400).json({ ok: false, error: 'Street address is required.' });
    }

    const fallbackCoords = getBarangayCenterCoords(barangayId);
    let resolvedLat = fallbackCoords.lat;
    let resolvedLng = fallbackCoords.lng;
    if (typeof body.latitude === 'number' && typeof body.longitude === 'number') {
      const coordCheck = validateOlongapoCoordinates(body.latitude, body.longitude);
      if (!coordCheck.valid) {
        return res.status(400).json({ ok: false, error: coordCheck.error });
      }
      resolvedLat = coordCheck.lat;
      resolvedLng = coordCheck.lng;
    }

    const status = role === 'resident' ? 'approved' : 'pending';
    const passwordHash = hashPassword(String(body.password));
    const nowSql = toMySqlDateTime(new Date());

    try {
      const createdUser = await withTransaction(async (conn) => {
        const [userInsert] = await conn.execute<ResultSetHeader>(
          `INSERT INTO users (role, phone_number, email, password_hash, first_name, last_name, date_of_birth, status, policy_accepted_at, policy_version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            role,
            normalizedPhone,
            emailCheck.normalized,
            passwordHash,
            firstCheck.normalized,
            lastCheck.normalized,
            dob,
            status,
            nowSql,
            policyVersion,
            nowSql,
          ]
        );
        const newUserId = Number(userInsert.insertId);

        let addressId: number | null = null;
        if (street || role === 'merchant') {
          const recipientName =
            role === 'merchant'
              ? normalizedShopName
              : `${firstCheck.normalized} ${lastCheck.normalized}`;
          const [addrInsert] = await conn.execute<ResultSetHeader>(
            `INSERT INTO addresses (user_id, barangay_id, recipient_name, recipient_phone, street, landmark, latitude, longitude, is_primary, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [
              newUserId,
              barangayId,
              recipientName,
              normalizedPhone,
              street || 'Olongapo City Pharmacy',
              landmark,
              resolvedLat,
              resolvedLng,
              nowSql,
            ]
          );
          addressId = Number(addrInsert.insertId);
        }

        if (role === 'resident') {
          await conn.execute(
            `INSERT INTO household_flags (user_id, has_senior, has_pwd, has_young_child, has_pregnant_member)
             VALUES (?, 0, 0, 0, 0)`,
            [newUserId]
          );
        }

        if (role === 'merchant' && addressId) {
          await conn.execute(
            `INSERT INTO merchant_profiles (merchant_id, user_id, shop_name, shop_address_id, is_pharmacist, pharmacist_name, pharmacist_license_no, is_24_hours, is_temporarily_closed, contact_no, business_permit_name, business_permit_url, government_id_name, government_id_url)
             VALUES (?, ?, ?, ?, 1, ?, ?, 0, 0, ?, ?, ?, ?, ?)`,
            [
              newUserId,
              newUserId,
              normalizedShopName,
              addressId,
              normalizedRph,
              normalizedPrc,
              normalizedPhone,
              businessPermitName,
              businessPermitUrl,
              governmentIdName,
              governmentIdUrl,
            ]
          );

          for (let day = 0; day <= 6; day += 1) {
            await conn.execute(
              `INSERT INTO merchant_hours (merchant_id, day_of_week, opens_at, closes_at, is_closed)
               VALUES (?, ?, '08:00', '20:00', 0)`,
              [newUserId, day]
            );
          }
        }

        if (role === 'rider') {
          await conn.execute(
            `INSERT INTO rider_profiles (rider_id, user_id, vehicle_type, plate_number, is_online, rating, total_deliveries, driver_license_name, driver_license_url, vehicle_registration_name, vehicle_registration_url)
             VALUES (?, ?, ?, ?, 0, 5.00, 0, ?, ?, ?, ?)`,
            [
              newUserId,
              newUserId,
              vehicleType,
              normalizedPlate,
              driverLicenseName,
              driverLicenseUrl,
              vehicleRegistrationName,
              vehicleRegistrationUrl,
            ]
          );
        }

        if (role === 'merchant' || role === 'rider') {
          await conn.execute(
            `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
             SELECT user_id, ?, ?, 'System', 0, ?
             FROM users
             WHERE role = 'admin' AND status = 'approved'`,
            [
              `New ${role} registration`,
              `${firstCheck.normalized} ${lastCheck.normalized} registered (${status}) — verification documents attached.`,
              nowSql,
            ]
          );
        }

        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT ${SAFE_USER_COLS} FROM users WHERE user_id = ? LIMIT 1`,
          [newUserId]
        );
        return rows[0] as Record<string, unknown>;
      });

      const token = signSessionToken({
        userId: Number(createdUser.user_id),
        role,
        email: emailCheck.normalized,
      });

      emitRealtimeSync('inventory');
      return res.status(201).json({ ok: true, token, user: createdUser });
    } catch (err) {
      const e = getMySqlErrorCode(err);
      if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
        const lower = e.message.toLowerCase();
        if (lower.includes('prc') || lower.includes('pharmacist_license')) {
          return res.status(409).json({
            ok: false,
            error: 'PRC License Number is already registered to another pharmacy.',
          });
        }
        if (lower.includes('plate')) {
          return res.status(409).json({
            ok: false,
            error: 'LTO Plate Number is already registered to another rider.',
          });
        }
        return res.status(409).json({
          ok: false,
          error: 'Email/Phone Number is already registered. Account is already existing.',
        });
      }
      return sendInternalDbError(res, 'auth-register', err);
    }
  });

  router.post('/auth/login', async (req, res) => {
    if (!(await checkMySqlConnection())) {
      return res.status(503).json({ ok: false, error: 'MySQL database is not connected.' });
    }

    const { email, password } = (req.body || {}) as { email?: string; password?: string };
    const cleanEmail = String(email || '').trim().toLowerCase();
    const rawPassword = String(password || '');
    if (!cleanEmail || !rawPassword) {
      return res.status(400).json({ ok: false, error: 'Email and password are required.' });
    }
    const loginRate = consumeAuthRateLimit(
      `login:${req.ip || 'unknown'}:${cleanEmail}`,
      10,
      5 * 60 * 1000
    );
    if (!loginRate.allowed) {
      res.setHeader('Retry-After', String(loginRate.retryAfterSeconds));
      return res.status(429).json({
        ok: false,
        error: `Too many sign-in attempts. Please wait ${loginRate.retryAfterSeconds}s and try again.`,
      });
    }

    try {
      const userRow = await queryOne<Record<string, unknown>>(
        `SELECT ${SAFE_USER_COLS}, password_hash FROM users WHERE LOWER(email) = ? LIMIT 1`,
        [cleanEmail]
      );
      if (!userRow) {
        return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
      }

      const role = String(userRow.role) as UserRole;
      const isInternal = isInternalAdminRole(role);
      const emailCheck = validateSignInEmail(String(userRow.email || ''), {
        isAdminAccount: isInternal,
      });
      if (!isInternal && !isStrictGmailAddress(String(userRow.email || ''))) {
        return res.status(403).json({
          ok: false,
          error: 'Only @gmail.com accounts can sign in (non-Gmail access is restricted to Admin & Internal Staff).',
        });
      }
      if (!emailCheck.valid) {
        return res.status(403).json({ ok: false, error: emailCheck.error });
      }

      if (!userRow.password_hash) {
        if (role === 'admin') {
          return res.status(403).json({
            ok: false,
            error:
              'Admin password has not been initialized yet. Set ADMIN_INITIAL_PASSWORD in .env or use the Admin Password Setup button.',
          });
        }
        return res.status(401).json({
          ok: false,
          error: 'This seeded showcase profile does not have a login password. Create your own account via Sign Up.',
        });
      }

      if (!verifyPassword(rawPassword, String(userRow.password_hash))) {
        return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
      }

      if (userRow.status === 'suspended') {
        const reason = userRow.status_reason ? `: ${String(userRow.status_reason)}` : '.';
        return res.status(403).json({ ok: false, error: `Account suspended${reason}` });
      }
      if (userRow.status === 'rejected') {
        return res.status(403).json({ ok: false, error: 'Account application was rejected.' });
      }

      const safeUser = { ...userRow };
      delete safeUser.password_hash;

      const token = signSessionToken({
        userId: Number(userRow.user_id),
        role,
        email: String(userRow.email).toLowerCase(),
      });

      return res.json({ ok: true, token, user: safeUser });
    } catch (err) {
      return sendInternalDbError(res, 'auth-login', err);
    }
  });

  router.post('/auth/logout', (req, res) => {
    const token = extractBearerToken(req.header('Authorization') || req.header('authorization'));
    revokeSessionToken(token);
    return res.json({ ok: true });
  });

  // --------------------------------------------------------------------------
  // 3. STATE HYDRATION (ROLE-SCOPED & PRIVACY-SAFE)
  // --------------------------------------------------------------------------
  router.get('/state/inventory', async (req, res) => {
    if (!(await checkMySqlConnection())) {
      return res.status(503).json({ ok: false, error: 'MySQL database is not connected.' });
    }

    try {
      const authUser = await getOptionalAuthUser(req);
      const isAdmin = Boolean(authUser?.isApprovedAdmin);
      const canInspectAllInventory =
        isAdmin ||
        userHasPerm(authUser, 'stores:read_all') ||
        userHasPerm(authUser, 'inventory:read_oversight') ||
        userHasPerm(authUser, 'deliveries:read_all');
      const uid = authUser?.userId ?? -1;

      const [merchants, merchantHours, products, addresses, users] = await Promise.all([
        canInspectAllInventory
          ? queryRows(`SELECT * FROM merchant_profiles ORDER BY merchant_id ASC`)
          : queryRows(
              `SELECT mp.merchant_id, mp.user_id, mp.shop_name, mp.shop_address_id, mp.is_pharmacist,
                      mp.pharmacist_name, mp.pharmacist_license_no, mp.is_24_hours, mp.is_temporarily_closed,
                      mp.contact_no, mp.documents_verified_at, mp.documents_verified_by,
                      CASE WHEN mp.user_id = ? THEN mp.business_permit_name ELSE NULL END AS business_permit_name,
                      CASE WHEN mp.user_id = ? THEN mp.business_permit_url ELSE NULL END AS business_permit_url,
                      CASE WHEN mp.user_id = ? THEN mp.government_id_name ELSE NULL END AS government_id_name,
                      CASE WHEN mp.user_id = ? THEN mp.government_id_url ELSE NULL END AS government_id_url
               FROM merchant_profiles mp
               JOIN users u ON u.user_id = mp.user_id
               WHERE u.status = 'approved' OR mp.user_id = ?
               ORDER BY mp.merchant_id ASC`,
              [uid, uid, uid, uid, uid]
            ),
        canInspectAllInventory
          ? queryRows(`SELECT * FROM merchant_hours ORDER BY hours_id ASC`)
          : queryRows(
              `SELECT mh.*
               FROM merchant_hours mh
               JOIN users u ON u.user_id = mh.merchant_id
               WHERE u.status = 'approved' OR mh.merchant_id = ?
               ORDER BY mh.hours_id ASC`,
              [uid]
            ),
        isAdmin || userHasPerm(authUser, 'products:read_all')
          ? queryRows(`SELECT * FROM products ORDER BY product_id ASC`)
          : queryRows(
              `SELECT p.*
               FROM products p
               JOIN users u ON u.user_id = p.merchant_id
               WHERE (p.is_listed = 1 AND p.is_archived = 0 AND u.status = 'approved') OR p.merchant_id = ?
               ORDER BY p.product_id ASC`,
              [uid]
            ),
        isAdmin || userHasPerm(authUser, 'deliveries:read_all')
          ? queryRows(`SELECT * FROM addresses ORDER BY address_id ASC`)
          : queryRows(
              `SELECT DISTINCT a.*
               FROM addresses a
               LEFT JOIN merchant_profiles mp ON mp.shop_address_id = a.address_id
               LEFT JOIN users mu ON mu.user_id = mp.user_id
               WHERE a.user_id = ? OR (mp.merchant_id IS NOT NULL AND mu.status = 'approved')
               ORDER BY a.address_id ASC`,
              [uid]
            ),
        isAdmin
          ? queryRows(`SELECT ${SAFE_USER_COLS} FROM users ORDER BY user_id ASC`)
          : authUser
            ? queryRows(
                `SELECT ${SAFE_USER_COLS} FROM users WHERE user_id = ? ORDER BY user_id ASC`,
                [uid]
              )
            : Promise.resolve([]),
      ]);

      return res.json({
        ok: true,
        merchants,
        merchantHours,
        products,
        addresses,
        users,
      });
    } catch (err) {
      return sendInternalDbError(res, 'state-inventory', err);
    }
  });

  router.get('/state', async (req, res) => {
    if (!(await checkMySqlConnection())) {
      return res.status(503).json({ ok: false, error: 'MySQL database is not connected.' });
    }

    try {
      const authUser = await getOptionalAuthUser(req);
      const isAdmin = Boolean(authUser?.isApprovedAdmin);
      const canSeeAllStores =
        isAdmin ||
        userHasPerm(authUser, 'stores:read_all') ||
        userHasPerm(authUser, 'inventory:read_oversight') ||
        userHasPerm(authUser, 'deliveries:read_all') ||
        userHasPerm(authUser, 'feedback:read_all');
      const canSeeAllProducts = isAdmin || userHasPerm(authUser, 'products:read_all');
      const canSeeDeliveries = isAdmin || userHasPerm(authUser, 'deliveries:read_all');
      const canSeeRiders = isAdmin || userHasPerm(authUser, 'riders:read_all');
      const canSeeAllCoupons = isAdmin || userHasPerm(authUser, 'coupons:read_all');
      const canSeeRedemptions = isAdmin || userHasPerm(authUser, 'coupons:view_redemptions');
      const canSeeInvHistory = isAdmin || userHasPerm(authUser, 'inventory:read_history');
      const canSeeAllFeedback =
        isAdmin || userHasPerm(authUser, 'feedback:read_all') || userHasPerm(authUser, 'complaints:manage_cs');
      const canSeeReturnsOversight =
        isAdmin || userHasPerm(authUser, 'returns:read_oversight') || userHasPerm(authUser, 'returns:resolve_dispute');
      const uid = authUser?.userId ?? -1;

      const [
        barangays,
        categories,
        feedbackCategories,
        merchants,
        merchantHours,
        products,
        addresses,
        rawPharmacyReviews,
        deliveryRatings,
        coupons,
      ] = await Promise.all([
        queryRows(`SELECT * FROM barangays ORDER BY barangay_id ASC`),
        queryRows(`SELECT * FROM product_categories ORDER BY category_id ASC`),
        queryRows(`SELECT * FROM feedback_categories ORDER BY category_id ASC`),
        canSeeAllStores
          ? queryRows(`SELECT * FROM merchant_profiles ORDER BY merchant_id ASC`)
          : queryRows(
              `SELECT mp.merchant_id, mp.user_id, mp.shop_name, mp.shop_address_id, mp.is_pharmacist,
                      mp.pharmacist_name, mp.pharmacist_license_no, mp.is_24_hours, mp.is_temporarily_closed,
                      mp.contact_no, mp.documents_verified_at, mp.documents_verified_by,
                      CASE WHEN mp.user_id = ? THEN mp.business_permit_name ELSE NULL END AS business_permit_name,
                      CASE WHEN mp.user_id = ? THEN mp.business_permit_url ELSE NULL END AS business_permit_url,
                      CASE WHEN mp.user_id = ? THEN mp.government_id_name ELSE NULL END AS government_id_name,
                      CASE WHEN mp.user_id = ? THEN mp.government_id_url ELSE NULL END AS government_id_url
               FROM merchant_profiles mp
               JOIN users u ON u.user_id = mp.user_id
               WHERE u.status = 'approved' OR mp.user_id = ?
               ORDER BY mp.merchant_id ASC`,
              [uid, uid, uid, uid, uid]
            ),
        canSeeAllStores
          ? queryRows(`SELECT * FROM merchant_hours ORDER BY hours_id ASC`)
          : queryRows(
              `SELECT mh.*
               FROM merchant_hours mh
               JOIN users u ON u.user_id = mh.merchant_id
               WHERE u.status = 'approved' OR mh.merchant_id = ?
               ORDER BY mh.hours_id ASC`,
              [uid]
            ),
        canSeeAllProducts
          ? queryRows(`SELECT * FROM products ORDER BY product_id ASC`)
          : queryRows(
              `SELECT p.*
               FROM products p
               JOIN users u ON u.user_id = p.merchant_id
               WHERE (p.is_listed = 1 AND p.is_archived = 0 AND u.status = 'approved') OR p.merchant_id = ?
               ORDER BY p.product_id ASC`,
              [uid]
            ),
        isAdmin || canSeeDeliveries
          ? queryRows(`SELECT * FROM addresses ORDER BY address_id ASC`)
          : authUser?.role === 'rider' && authUser.status === 'approved'
            ? queryRows(
                `SELECT DISTINCT a.*
                 FROM addresses a
                 LEFT JOIN merchant_profiles mp ON mp.shop_address_id = a.address_id
                 LEFT JOIN users mu ON mu.user_id = mp.user_id
                 LEFT JOIN orders o ON o.address_id = a.address_id
                 LEFT JOIN deliveries d ON d.order_id = o.order_id
                 WHERE a.user_id = ?
                    OR (mp.merchant_id IS NOT NULL AND mu.status = 'approved')
                    OR (d.delivery_id IS NOT NULL AND (d.rider_id = ? OR d.status = 'requested'))
                 ORDER BY a.address_id ASC`,
                [uid, uid]
              )
            : queryRows(
                `SELECT DISTINCT a.*
                 FROM addresses a
                 LEFT JOIN merchant_profiles mp ON mp.shop_address_id = a.address_id
                 LEFT JOIN users mu ON mu.user_id = mp.user_id
                 WHERE a.user_id = ? OR (mp.merchant_id IS NOT NULL AND mu.status = 'approved')
                 ORDER BY a.address_id ASC`,
                [uid]
              ),
        canSeeAllFeedback
          ? queryRows(
              `SELECT pr.*, u.first_name AS _rev_first_name, u.last_name AS _rev_last_name
               FROM pharmacy_reviews pr
               LEFT JOIN users u ON u.user_id = pr.resident_id
               ORDER BY pr.created_at DESC`
            )
          : queryRows(
              `SELECT ppr.*,
                      CASE WHEN ppr.is_anonymous = 1 THEN NULL ELSE u.first_name END AS _rev_first_name,
                      CASE WHEN ppr.is_anonymous = 1 THEN NULL ELSE u.last_name END AS _rev_last_name
               FROM public_pharmacy_reviews ppr
               LEFT JOIN users u ON u.user_id = ppr.resident_id
               ORDER BY ppr.created_at DESC`
            ),
        queryRows(`SELECT * FROM public_delivery_ratings ORDER BY created_at DESC`),
        canSeeAllCoupons
          ? queryRows(`SELECT * FROM coupons ORDER BY created_at DESC`)
          : queryRows(
              `SELECT * FROM coupons WHERE is_active = 1 AND expires_at >= NOW() ORDER BY created_at DESC`
            ),
      ]);

      const pharmacyReviews = rawPharmacyReviews.map((row) => {
        const { _rev_first_name, _rev_last_name, ...rest } = row as Record<string, unknown>;
        const isAnon = Boolean(rest.is_anonymous);
        let reviewer_display_name = 'Verified Resident (Anonymous)';
        if (!isAnon && _rev_first_name) {
          const first = String(_rev_first_name).trim() || 'Resident';
          const lastInitial = String(_rev_last_name || '')
            .trim()
            .charAt(0)
            .toUpperCase();
          reviewer_display_name = lastInitial ? `${first} ${lastInitial}.` : first;
        }
        return {
          ...rest,
          reviewer_display_name,
        };
      });

      if (!authUser) {
        return res.json({
          ok: true,
          currentAuthUserId: null,
          barangays,
          categories,
          feedbackCategories,
          merchants,
          merchantHours,
          products,
          addresses,
          pharmacyReviews,
          deliveryRatings,
          coupons,
          customerCoupons: [],
          couponRedemptions: [],
          inventoryMovements: [],
          returnRequests: [],
          users: [],
          householdFlags: [],
          emergencyContacts: [],
          alerts: [],
          alertVerifications: [],
          riderProfiles: [],
          orders: [],
          orderItems: [],
          orderStatusHistory: [],
          prescriptions: [],
          payments: [],
          deliveries: [],
          riderEarnings: [],
          problemReports: [],
          problemReportStatusHistory: [],
          notifications: [],
          auditLogs: [],
        });
      }

      const isApprovedRider = authUser.role === 'rider' && authUser.status === 'approved';
      const isApprovedMerchant = authUser.role === 'merchant' && authUser.status === 'approved';

      // Determine safe user rows per role
      const canSeeStoreOwners =
        canSeeAllStores || isAdmin || canSeeRiders || canSeeAllFeedback;

      const [
        rawUsers,
        userOverrides,
        householdFlags,
        emergencyContacts,
        alerts,
        alertVerifications,
        riderProfiles,
        orders,
        riderEarnings,
        problemReports,
        notifications,
        auditLogs,
        customerCoupons,
        couponRedemptions,
        inventoryMovements,
        returnRequests,
      ] = await Promise.all([
        isAdmin
          ? queryRows(`SELECT ${SAFE_USER_COLS} FROM users ORDER BY user_id ASC`)
          : canSeeRiders
            ? queryRows(
                `SELECT ${SAFE_USER_COLS} FROM users WHERE user_id = ? OR role = 'rider' OR role = 'merchant' ORDER BY user_id ASC`,
                [uid]
              )
            : canSeeStoreOwners
              ? queryRows(
                  `SELECT ${SAFE_USER_COLS} FROM users WHERE user_id = ? OR role = 'merchant' ORDER BY user_id ASC`,
                  [uid]
                )
              : queryRows(`SELECT ${SAFE_USER_COLS} FROM users WHERE user_id = ?`, [uid]),
        isAdmin
          ? queryRows(`SELECT user_id, permission_code, effect FROM user_permission_overrides`)
          : queryRows(
              `SELECT user_id, permission_code, effect FROM user_permission_overrides WHERE user_id = ?`,
              [uid]
            ),
        isAdmin
          ? queryRows(`SELECT * FROM household_flags`)
          : queryRows(`SELECT * FROM household_flags WHERE user_id = ?`, [uid]),
        isAdmin
          ? queryRows(`SELECT * FROM emergency_contacts ORDER BY contact_id ASC`)
          : queryRows(
              `SELECT * FROM emergency_contacts WHERE user_id = ? ORDER BY contact_id ASC`,
              [uid]
            ),
        isAdmin
          ? queryRows(`SELECT * FROM emergency_alerts ORDER BY created_at DESC`)
          : queryRows(
              `SELECT * FROM emergency_alerts WHERE user_id = ? ORDER BY created_at DESC`,
              [uid]
            ),
        isAdmin
          ? queryRows(`SELECT * FROM alert_verifications`)
          : queryRows(
              `SELECT av.*
               FROM alert_verifications av
               JOIN emergency_alerts ea ON ea.alert_id = av.alert_id
               WHERE ea.user_id = ?`,
              [uid]
            ),
        canSeeRiders
          ? queryRows(`SELECT * FROM rider_profiles`)
          : isApprovedRider
            ? queryRows(`SELECT * FROM rider_profiles WHERE user_id = ?`, [uid])
            : Promise.resolve([]),
        isAdmin || canSeeDeliveries || canSeeReturnsOversight || canSeeAllFeedback
          ? queryRows(`SELECT * FROM orders ORDER BY placed_at DESC`)
          : isApprovedRider
            ? queryRows(
                `SELECT DISTINCT o.*
                 FROM orders o
                 LEFT JOIN deliveries d ON d.order_id = o.order_id
                 WHERE o.resident_id = ?
                    OR (d.delivery_id IS NOT NULL AND (d.rider_id = ? OR d.status = 'requested'))
                 ORDER BY o.placed_at DESC`,
                [uid, uid]
              )
            : isApprovedMerchant
              ? queryRows(
                  `SELECT * FROM orders WHERE resident_id = ? OR merchant_id = ? ORDER BY placed_at DESC`,
                  [uid, uid]
                )
              : queryRows(`SELECT * FROM orders WHERE resident_id = ? ORDER BY placed_at DESC`, [uid]),
        isAdmin || canSeeRiders
          ? queryRows(`SELECT * FROM rider_earnings ORDER BY created_at DESC`)
          : queryRows(
              `SELECT * FROM rider_earnings WHERE rider_id = ? ORDER BY created_at DESC`,
              [uid]
            ),
        canSeeAllFeedback
          ? queryRows(`SELECT * FROM problem_reports ORDER BY created_at DESC`)
          : isApprovedMerchant
            ? queryRows(
                `SELECT * FROM problem_reports WHERE user_id = ? OR merchant_id = ? ORDER BY created_at DESC`,
                [uid, uid]
              )
            : queryRows(
                `SELECT * FROM problem_reports WHERE user_id = ? ORDER BY created_at DESC`,
                [uid]
              ),
        isAdmin
          ? queryRows(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 200`)
          : queryRows(
              `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
              [uid]
            ),
        userHasPerm(authUser, 'audit_logs:read')
          ? queryRows(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200`)
          : Promise.resolve([]),
        canSeeAllCoupons
          ? queryRows(`SELECT * FROM customer_coupons ORDER BY claimed_at DESC`)
          : queryRows(
              `SELECT * FROM customer_coupons WHERE resident_id = ? ORDER BY claimed_at DESC`,
              [uid]
            ),
        canSeeRedemptions
          ? queryRows(`SELECT * FROM coupon_redemptions ORDER BY created_at DESC LIMIT 300`)
          : Promise.resolve([]),
        canSeeInvHistory
          ? queryRows(`SELECT * FROM inventory_movements ORDER BY created_at DESC LIMIT 300`)
          : isApprovedMerchant
            ? queryRows(
                `SELECT * FROM inventory_movements WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 200`,
                [uid]
              )
            : Promise.resolve([]),
        canSeeReturnsOversight
          ? queryRows(`SELECT * FROM return_refund_requests ORDER BY created_at DESC`)
          : isApprovedMerchant
            ? queryRows(
                `SELECT * FROM return_refund_requests WHERE merchant_id = ? OR resident_id = ? ORDER BY created_at DESC`,
                [uid, uid]
              )
            : queryRows(
                `SELECT * FROM return_refund_requests WHERE resident_id = ? ORDER BY created_at DESC`,
                [uid]
              ),
      ]);

      const overridesByUser = new Map<number, { grant: string[]; revoke: string[] }>();
      for (const ov of userOverrides) {
        const uId = Number(ov.user_id);
        const entry = overridesByUser.get(uId) || { grant: [], revoke: [] };
        if (ov.effect === 'grant') entry.grant.push(String(ov.permission_code));
        if (ov.effect === 'revoke') entry.revoke.push(String(ov.permission_code));
        overridesByUser.set(uId, entry);
      }
      const users = rawUsers.map((u) => {
        const uId = Number(u.user_id);
        return {
          ...u,
          permission_overrides: overridesByUser.get(uId) || { grant: [], revoke: [] },
        };
      });

      const orderIds = orders.map((o) => Number(o.order_id)).filter((n) => Number.isFinite(n));
      let orderItems: Record<string, unknown>[] = [];
      let orderStatusHistory: Record<string, unknown>[] = [];
      let prescriptions: Record<string, unknown>[] = [];
      let payments: Record<string, unknown>[] = [];
      let deliveries: Record<string, unknown>[] = [];

      if (orderIds.length > 0) {
        const placeholders = orderIds.map(() => '?').join(',');
        const residentIdByOrderId = new Map<number, number>(
          orders.map((o) => [Number(o.order_id), Number(o.resident_id)])
        );
        const [rawItems, rawHist, rawPrescriptions, rawPayments, rawDeliveries] = await Promise.all([
          queryRows(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, orderIds),
          queryRows(
            `SELECT * FROM order_status_history WHERE order_id IN (${placeholders}) ORDER BY created_at ASC`,
            orderIds
          ),
          isAdmin
            ? queryRows(`SELECT * FROM prescriptions WHERE order_id IN (${placeholders})`, orderIds)
            : queryRows(
                `SELECT * FROM prescriptions WHERE order_id IN (${placeholders}) AND (resident_id = ? OR merchant_id = ?)`,
                [...orderIds, uid, uid]
              ),
          queryRows(`SELECT * FROM payments WHERE order_id IN (${placeholders})`, orderIds),
          queryRows(`SELECT * FROM deliveries WHERE order_id IN (${placeholders})`, orderIds),
        ]);
        orderItems = rawItems;
        orderStatusHistory = rawHist;
        prescriptions = rawPrescriptions;
        payments = rawPayments;
        deliveries = rawDeliveries.map((d) => {
          const orderOwnerId = residentIdByOrderId.get(Number(d.order_id));
          if (isAdmin || orderOwnerId === uid) {
            return d;
          }
          return { ...d, confirmation_code: '****' };
        });
      }

      const reportIds = problemReports
        .map((r) => Number(r.report_id))
        .filter((n) => Number.isFinite(n));
      const problemReportStatusHistory =
        reportIds.length > 0
          ? await queryRows(
              `SELECT * FROM problem_report_status_history WHERE report_id IN (${reportIds
                .map(() => '?')
                .join(',')}) ORDER BY created_at ASC`,
              reportIds
            )
          : [];

      return res.json({
        ok: true,
        currentAuthUserId: authUser.userId,
        barangays,
        categories,
        feedbackCategories,
        merchants,
        merchantHours,
        products,
        addresses,
        pharmacyReviews,
        deliveryRatings,
        coupons,
        customerCoupons,
        couponRedemptions,
        inventoryMovements,
        returnRequests,
        users,
        householdFlags,
        emergencyContacts,
        alerts,
        alertVerifications,
        riderProfiles,
        orders,
        orderItems,
        orderStatusHistory,
        prescriptions,
        payments,
        deliveries,
        riderEarnings,
        problemReports,
        problemReportStatusHistory,
        notifications,
        auditLogs,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  // --------------------------------------------------------------------------
  // 4. PROTECTED PRESCRIPTION FILE ACCESS
  // --------------------------------------------------------------------------
  router.get('/uploads/prescriptions/:fileName', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const fullPath = safeConfinedPath(RX_UPLOADS_DIR, req.params.fileName);
    if (!fullPath) return res.status(400).json({ ok: false, error: 'Invalid file name.' });

    const rxRow = await queryOne<{ resident_id: number; merchant_id: number }>(
      `SELECT resident_id, merchant_id FROM prescriptions WHERE storage_path = ? LIMIT 1`,
      [req.params.fileName]
    );
    if (
      !rxRow ||
      (!authUser.isApprovedAdmin &&
        rxRow.resident_id !== authUser.userId &&
        rxRow.merchant_id !== authUser.userId)
    ) {
      return res.status(403).json({ ok: false, error: 'Not authorized to view this prescription.' });
    }
    return res.sendFile(fullPath);
  });

  router.get('/uploads/merchant-docs/:fileName', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const fullPath = safeConfinedPath(MERCHANT_DOCS_UPLOADS_DIR, req.params.fileName);
    if (!fullPath) return res.status(400).json({ ok: false, error: 'Invalid file name.' });

    const expectedApiPath = `/api/uploads/merchant-docs/${path.basename(fullPath)}`;
    const ownerRow = await queryOne<{ user_id: number }>(
      `SELECT user_id FROM merchant_profiles WHERE business_permit_url = ? OR government_id_url = ? LIMIT 1`,
      [expectedApiPath, expectedApiPath]
    );
    if (!ownerRow || (!authUser.isApprovedAdmin && ownerRow.user_id !== authUser.userId)) {
      return res.status(403).json({
        ok: false,
        error: 'Not authorized to view this merchant verification document.',
      });
    }
    return res.sendFile(fullPath);
  });

  router.get('/uploads/rider-docs/:fileName', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const fullPath = safeConfinedPath(RIDER_DOCS_UPLOADS_DIR, req.params.fileName);
    if (!fullPath) return res.status(400).json({ ok: false, error: 'Invalid file name.' });

    const expectedApiPath = `/api/uploads/rider-docs/${path.basename(fullPath)}`;
    const ownerRow = await queryOne<{ user_id: number }>(
      `SELECT user_id FROM rider_profiles WHERE driver_license_url = ? OR vehicle_registration_url = ? LIMIT 1`,
      [expectedApiPath, expectedApiPath]
    );
    if (!ownerRow || (!authUser.isApprovedAdmin && ownerRow.user_id !== authUser.userId)) {
      return res.status(403).json({
        ok: false,
        error: 'Not authorized to view this rider verification document.',
      });
    }
    return res.sendFile(fullPath);
  });

  // --------------------------------------------------------------------------
  // 5. USER PROFILE, ADDRESSES, HOUSEHOLD FLAGS, EMERGENCY CONTACTS
  // --------------------------------------------------------------------------
  router.put('/users/me/profile', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const { first_name, last_name, phone_number } = (req.body || {}) as Record<string, string>;
    const firstCheck = validatePersonName(String(first_name || ''), 'First Name');
    if (!firstCheck.valid) return res.status(400).json({ ok: false, error: firstCheck.error });
    const lastCheck = validatePersonName(String(last_name || ''), 'Last Name');
    if (!lastCheck.valid) return res.status(400).json({ ok: false, error: lastCheck.error });
    const phone = normalizePHPhoneNumber(String(phone_number || ''));
    if (!phone) return res.status(400).json({ ok: false, error: 'Invalid Philippine phone number.' });

    try {
      await executeSql(
        `UPDATE users SET first_name = ?, last_name = ?, phone_number = ? WHERE user_id = ?`,
        [firstCheck.normalized, lastCheck.normalized, phone, authUser.userId]
      );
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  router.post('/addresses', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const body = (req.body || {}) as Record<string, unknown>;
    const targetUserId = authUser.isApprovedAdmin && body.user_id ? Number(body.user_id) : authUser.userId;

    try {
      const saved = await withTransaction(async (conn) => {
        if (body.is_primary) {
          await conn.execute(`UPDATE addresses SET is_primary = 0 WHERE user_id = ?`, [targetUserId]);
        }
        const [ins] = await conn.execute<ResultSetHeader>(
          `INSERT INTO addresses (user_id, barangay_id, recipient_name, recipient_phone, street, landmark, delivery_instructions, latitude, longitude, is_primary, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            targetUserId,
            Number(body.barangay_id) || 1,
            String(body.recipient_name || ''),
            String(body.recipient_phone || ''),
            String(body.street || ''),
            body.landmark ? String(body.landmark) : null,
            body.delivery_instructions ? String(body.delivery_instructions) : null,
            Number(body.latitude),
            Number(body.longitude),
            body.is_primary ? 1 : 0,
            toMySqlDateTime(String(body.created_at || '')) || toMySqlDateTime(new Date()),
          ]
        );
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM addresses WHERE address_id = ? LIMIT 1`,
          [ins.insertId]
        );
        return rows[0] as Record<string, unknown>;
      });

      emitRealtimeSync('inventory');
      return res.status(201).json({ ok: true, address: saved });
    } catch (err) {
      return res.status(500).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  router.put('/addresses/:id', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const addressId = Number(req.params.id);
    const body = (req.body || {}) as Record<string, unknown>;

    try {
      const existing = await queryOne<{ user_id: number }>(
        `SELECT user_id FROM addresses WHERE address_id = ? LIMIT 1`,
        [addressId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Address not found.' });
      if (!authUser.isApprovedAdmin && existing.user_id !== authUser.userId) {
        return res.status(403).json({ ok: false, error: 'Not authorized to edit this address.' });
      }

      const saved = await withTransaction(async (conn) => {
        if (body.is_primary) {
          await conn.execute(`UPDATE addresses SET is_primary = 0 WHERE user_id = ?`, [existing.user_id]);
        }
        await conn.execute(
          `UPDATE addresses
           SET barangay_id = ?, recipient_name = ?, recipient_phone = ?, street = ?, landmark = ?,
               delivery_instructions = ?, latitude = ?, longitude = ?, is_primary = ?
           WHERE address_id = ?`,
          [
            Number(body.barangay_id) || 1,
            String(body.recipient_name || ''),
            String(body.recipient_phone || ''),
            String(body.street || ''),
            body.landmark ? String(body.landmark) : null,
            body.delivery_instructions ? String(body.delivery_instructions) : null,
            Number(body.latitude),
            Number(body.longitude),
            body.is_primary ? 1 : 0,
            addressId,
          ]
        );
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM addresses WHERE address_id = ? LIMIT 1`,
          [addressId]
        );
        return rows[0] as Record<string, unknown>;
      });

      emitRealtimeSync('inventory');
      return res.json({ ok: true, address: saved });
    } catch (err) {
      return res.status(500).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  router.delete('/addresses/:id', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const addressId = Number(req.params.id);
    try {
      const existing = await queryOne<{ user_id: number }>(
        `SELECT user_id FROM addresses WHERE address_id = ? LIMIT 1`,
        [addressId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Address not found.' });
      if (!authUser.isApprovedAdmin && existing.user_id !== authUser.userId) {
        return res.status(403).json({ ok: false, error: 'Not authorized.' });
      }
      await executeSql(`DELETE FROM addresses WHERE address_id = ?`, [addressId]);
      emitRealtimeSync('inventory');
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  router.post('/addresses/:id/primary', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const addressId = Number(req.params.id);
    try {
      const existing = await queryOne<{ user_id: number }>(
        `SELECT user_id FROM addresses WHERE address_id = ? LIMIT 1`,
        [addressId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Address not found.' });
      if (!authUser.isApprovedAdmin && existing.user_id !== authUser.userId) {
        return res.status(403).json({ ok: false, error: 'Not authorized.' });
      }
      await withTransaction(async (conn) => {
        await conn.execute(`UPDATE addresses SET is_primary = 0 WHERE user_id = ?`, [existing.user_id]);
        await conn.execute(`UPDATE addresses SET is_primary = 1 WHERE address_id = ?`, [addressId]);
      });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  router.put('/household-flags', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const body = (req.body || {}) as Record<string, unknown>;
    try {
      await executeSql(
        `INSERT INTO household_flags (user_id, has_senior, has_pwd, has_young_child, has_pregnant_member)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           has_senior = VALUES(has_senior),
           has_pwd = VALUES(has_pwd),
           has_young_child = VALUES(has_young_child),
           has_pregnant_member = VALUES(has_pregnant_member)`,
        [
          authUser.userId,
          body.has_senior ? 1 : 0,
          body.has_pwd ? 1 : 0,
          body.has_young_child ? 1 : 0,
          body.has_pregnant_member ? 1 : 0,
        ]
      );
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  router.post('/emergency-contacts', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const body = (req.body || {}) as Record<string, unknown>;
    try {
      const ins = await executeSql(
        `INSERT INTO emergency_contacts (user_id, contact_name, relationship, phone_number, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          authUser.userId,
          String(body.contact_name || ''),
          String(body.relationship || ''),
          String(body.phone_number || ''),
          toMySqlDateTime(String(body.created_at || '')) || toMySqlDateTime(new Date()),
        ]
      );
      const saved = await queryOne(`SELECT * FROM emergency_contacts WHERE contact_id = ? LIMIT 1`, [
        ins.insertId,
      ]);
      return res.status(201).json({ ok: true, contact: saved });
    } catch (err) {
      return res.status(500).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  router.put('/emergency-contacts/:id', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const contactId = Number(req.params.id);
    const body = (req.body || {}) as Record<string, unknown>;
    try {
      const existing = await queryOne<{ user_id: number }>(
        `SELECT user_id FROM emergency_contacts WHERE contact_id = ? LIMIT 1`,
        [contactId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Contact not found.' });
      if (!authUser.isApprovedAdmin && existing.user_id !== authUser.userId) {
        return res.status(403).json({ ok: false, error: 'Not authorized.' });
      }
      await executeSql(
        `UPDATE emergency_contacts SET contact_name = ?, relationship = ?, phone_number = ? WHERE contact_id = ?`,
        [
          String(body.contact_name || ''),
          String(body.relationship || ''),
          String(body.phone_number || ''),
          contactId,
        ]
      );
      const saved = await queryOne(`SELECT * FROM emergency_contacts WHERE contact_id = ? LIMIT 1`, [
        contactId,
      ]);
      return res.json({ ok: true, contact: saved });
    } catch (err) {
      return res.status(500).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  router.delete('/emergency-contacts/:id', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const contactId = Number(req.params.id);
    try {
      const existing = await queryOne<{ user_id: number }>(
        `SELECT user_id FROM emergency_contacts WHERE contact_id = ? LIMIT 1`,
        [contactId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Contact not found.' });
      if (!authUser.isApprovedAdmin && existing.user_id !== authUser.userId) {
        return res.status(403).json({ ok: false, error: 'Not authorized.' });
      }
      await executeSql(`DELETE FROM emergency_contacts WHERE contact_id = ?`, [contactId]);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  // --------------------------------------------------------------------------
  // 6. MERCHANTS, HOURS & PRODUCTS (REAL-TIME DELTA BROADCAST)
  // --------------------------------------------------------------------------
  router.post('/merchants/profile', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const body = (req.body || {}) as Record<string, unknown>;
    const targetUserId = authUser.isApprovedAdmin && body.userId ? Number(body.userId) : authUser.userId;

    const rphCheck = validatePersonName(String(body.pharmacist_name || ''), 'Licensed Pharmacist Name');
    if (!rphCheck.valid) return res.status(400).json({ ok: false, error: rphCheck.error });
    const prcCheck = validateAndNormalizePrcLicense(String(body.pharmacist_license_no || ''));
    if (!prcCheck.valid) return res.status(400).json({ ok: false, error: prcCheck.error });
    const normalizedContactNo = body.contact_no
      ? normalizePHPhoneNumber(String(body.contact_no))
      : null;
    if (body.contact_no && !normalizedContactNo) {
      return res.status(400).json({ ok: false, error: 'Enter a valid Philippine pharmacy contact number.' });
    }
    const coordCheck = validateOlongapoCoordinates(Number(body.latitude), Number(body.longitude));
    if (!coordCheck.valid) {
      return res.status(400).json({ ok: false, error: coordCheck.error });
    }

    const existingPrc = await queryOne<{ merchant_id: number }>(
      `SELECT merchant_id FROM merchant_profiles WHERE UPPER(pharmacist_license_no) = ? AND merchant_id <> ? LIMIT 1`,
      [prcCheck.normalized.toUpperCase(), targetUserId]
    );
    if (existingPrc) {
      return res.status(409).json({
        ok: false,
        error: 'PRC License Number is already registered to another pharmacy.',
      });
    }

    let permitName: string | null = body.business_permit_name ? String(body.business_permit_name).slice(0, 255) : null;
    let permitUrl: string | null = null;
    if (typeof body.business_permit_url === 'string' && body.business_permit_url.trim()) {
      const rawPermitUrl = body.business_permit_url.trim();
      if (rawPermitUrl.startsWith('data:')) {
        const saved = await saveUploadedDataUrl('merchant_doc', `permit-u${targetUserId}`, rawPermitUrl);
        if (!saved.ok) return res.status(400).json({ ok: false, error: saved.error });
        permitUrl = saved.publicOrApiPath;
      } else if (!isSafeImageOrDocUrl(rawPermitUrl)) {
        return res.status(400).json({ ok: false, error: 'Invalid Business Permit URL format.' });
      } else {
        permitUrl = rawPermitUrl;
      }
    }

    let govIdName: string | null = body.government_id_name ? String(body.government_id_name).slice(0, 255) : null;
    let govIdUrl: string | null = null;
    if (typeof body.government_id_url === 'string' && body.government_id_url.trim()) {
      const rawGovIdUrl = body.government_id_url.trim();
      if (rawGovIdUrl.startsWith('data:')) {
        const saved = await saveUploadedDataUrl('merchant_doc', `govid-u${targetUserId}`, rawGovIdUrl);
        if (!saved.ok) return res.status(400).json({ ok: false, error: saved.error });
        govIdUrl = saved.publicOrApiPath;
      } else if (!isSafeImageOrDocUrl(rawGovIdUrl)) {
        return res.status(400).json({ ok: false, error: 'Invalid Government ID URL format.' });
      } else {
        govIdUrl = rawGovIdUrl;
      }
    }

    try {
      const result = await withTransaction(async (conn) => {
        const existingAddressId = Number(body.existingAddressId) || 0;
        let addrId = 0;

        if (existingAddressId > 0) {
          const [checkRows] = await conn.query<RowDataPacket[]>(
            `SELECT address_id FROM addresses WHERE address_id = ? AND user_id = ? LIMIT 1`,
            [existingAddressId, targetUserId]
          );
          if (checkRows.length > 0) {
            await conn.execute(
              `UPDATE addresses
               SET barangay_id = ?, recipient_name = ?, recipient_phone = ?, street = ?, landmark = ?, latitude = ?, longitude = ?, is_primary = 1
               WHERE address_id = ?`,
              [
                Number(body.barangay_id) || 1,
                String(body.shop_name || ''),
                String(body.contact_no || ''),
                String(body.street || ''),
                body.landmark ? String(body.landmark) : null,
                Number(body.latitude),
                Number(body.longitude),
                existingAddressId,
              ]
            );
            addrId = existingAddressId;
          }
        }

        if (!addrId) {
          const [insAddr] = await conn.execute<ResultSetHeader>(
            `INSERT INTO addresses (user_id, barangay_id, recipient_name, recipient_phone, street, landmark, latitude, longitude, is_primary, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [
              targetUserId,
              Number(body.barangay_id) || 1,
              String(body.shop_name || ''),
              String(body.contact_no || ''),
              String(body.street || ''),
              body.landmark ? String(body.landmark) : null,
              Number(body.latitude),
              Number(body.longitude),
              toMySqlDateTime(new Date()),
            ]
          );
          addrId = Number(insAddr.insertId);
        }

        await conn.execute(
          `INSERT INTO merchant_profiles (merchant_id, user_id, shop_name, shop_address_id, is_pharmacist, pharmacist_name, pharmacist_license_no, is_24_hours, is_temporarily_closed, contact_no, business_permit_name, business_permit_url, government_id_name, government_id_url)
           VALUES (?, ?, ?, ?, 1, ?, ?, 0, 0, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             shop_name = VALUES(shop_name),
             shop_address_id = VALUES(shop_address_id),
             pharmacist_name = VALUES(pharmacist_name),
             pharmacist_license_no = VALUES(pharmacist_license_no),
             contact_no = VALUES(contact_no),
             business_permit_name = COALESCE(VALUES(business_permit_name), business_permit_name),
             business_permit_url = COALESCE(VALUES(business_permit_url), business_permit_url),
             government_id_name = COALESCE(VALUES(government_id_name), government_id_name),
             government_id_url = COALESCE(VALUES(government_id_url), government_id_url)`,
          [
            targetUserId,
            targetUserId,
            String(body.shop_name || ''),
            addrId,
            rphCheck.normalized,
            prcCheck.normalized,
            String(body.contact_no || ''),
            permitName,
            permitUrl,
            govIdName,
            govIdUrl,
          ]
        );

        for (let day = 0; day <= 6; day += 1) {
          await conn.execute(
            `INSERT IGNORE INTO merchant_hours (merchant_id, day_of_week, opens_at, closes_at, is_closed)
             VALUES (?, ?, '08:00', '20:00', 0)`,
            [targetUserId, day]
          );
        }

        const [addrRows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM addresses WHERE address_id = ? LIMIT 1`,
          [addrId]
        );
        const [mpRows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM merchant_profiles WHERE merchant_id = ? LIMIT 1`,
          [targetUserId]
        );
        const [hrRows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM merchant_hours WHERE merchant_id = ? ORDER BY day_of_week ASC`,
          [targetUserId]
        );
        return { address: addrRows[0], merchant: mpRows[0], hours: hrRows };
      });

      const publicMerchantDelta = redactPublicMerchantFields(result.merchant as Record<string, unknown>);
      emitPublicTableDelta('merchant_profiles', 'UPDATE', publicMerchantDelta, null);
      emitRealtimeSync('inventory');
      return res.json({ ok: true, ...result });
    } catch (err) {
      return sendInternalDbError(res, 'merchants-profile', err);
    }
  });

  router.patch('/merchants/:id/flags', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const merchantId = Number(req.params.id);
    if (
      !authUser.isApprovedAdmin &&
      (authUser.userId !== merchantId || authUser.status !== 'approved')
    ) {
      return res.status(403).json({ ok: false, error: 'Not authorized to update this store.' });
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];

    if (typeof body.is_24_hours === 'boolean') {
      sets.push('is_24_hours = ?');
      params.push(body.is_24_hours ? 1 : 0);
    }
    if (typeof body.is_temporarily_closed === 'boolean') {
      sets.push('is_temporarily_closed = ?');
      params.push(body.is_temporarily_closed ? 1 : 0);
    }
    if (typeof body.shop_name === 'string' && body.shop_name.trim()) {
      sets.push('shop_name = ?');
      params.push(body.shop_name.trim());
    }
    if (typeof body.contact_no === 'string' && body.contact_no.trim()) {
      const normalized = normalizePHPhoneNumber(body.contact_no.trim());
      if (!normalized) {
        return res.status(400).json({ ok: false, error: 'Invalid Philippine pharmacy contact number.' });
      }
      sets.push('contact_no = ?');
      params.push(normalized);
    }
    if (typeof body.shop_address_id === 'number' && body.shop_address_id > 0) {
      const addrCheck = await queryOne<{ user_id: number }>(
        `SELECT user_id FROM addresses WHERE address_id = ? LIMIT 1`,
        [body.shop_address_id]
      );
      if (!addrCheck || (addrCheck.user_id !== merchantId && !authUser.isApprovedAdmin)) {
        return res.status(403).json({ ok: false, error: 'Store address does not belong to this pharmacy.' });
      }
      sets.push('shop_address_id = ?');
      params.push(body.shop_address_id);
    }

    if (sets.length === 0) {
      return res.status(400).json({ ok: false, error: 'No valid merchant fields provided.' });
    }

    try {
      params.push(merchantId);
      await executeSql(`UPDATE merchant_profiles SET ${sets.join(', ')} WHERE merchant_id = ?`, params);
      const updated = await queryOne<Record<string, unknown>>(
        `SELECT * FROM merchant_profiles WHERE merchant_id = ? LIMIT 1`,
        [merchantId]
      );
      if (updated) {
        emitPublicTableDelta('merchant_profiles', 'UPDATE', redactPublicMerchantFields(updated), null);
      }
      return res.json({ ok: true, merchant: updated });
    } catch (err) {
      return sendInternalDbError(res, 'merchants-flags', err);
    }
  });

  router.put('/merchants/:id/hours', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const merchantId = Number(req.params.id);
    if (
      !authUser.isApprovedAdmin &&
      (authUser.userId !== merchantId || authUser.status !== 'approved')
    ) {
      return res.status(403).json({ ok: false, error: 'Not authorized to edit store hours.' });
    }
    const rows = Array.isArray((req.body as { rows?: unknown[] })?.rows)
      ? ((req.body as { rows: Array<Record<string, unknown>> }).rows)
      : [];
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'Operating hours rows are required.' });
    }

    for (const r of rows) {
      const dow = Number(r.day_of_week);
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
        return res.status(400).json({ ok: false, error: 'Day of week must be between 0 (Sun) and 6 (Sat).' });
      }
      const check = validateOperatingHoursRange(
        String(r.opens_at || ''),
        String(r.closes_at || ''),
        Boolean(r.is_closed)
      );
      if (!check.valid) return res.status(400).json({ ok: false, error: check.error });
    }

    try {
      const savedHours = await withTransaction(async (conn) => {
        for (const r of rows) {
          await conn.execute(
            `INSERT INTO merchant_hours (merchant_id, day_of_week, opens_at, closes_at, is_closed)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               opens_at = VALUES(opens_at),
               closes_at = VALUES(closes_at),
               is_closed = VALUES(is_closed)`,
            [
              merchantId,
              Number(r.day_of_week),
              String(r.opens_at || '08:00'),
              String(r.closes_at || '20:00'),
              r.is_closed ? 1 : 0,
            ]
          );
        }
        const [out] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM merchant_hours WHERE merchant_id = ? ORDER BY day_of_week ASC`,
          [merchantId]
        );
        return out as Record<string, unknown>[];
      });

      for (const h of savedHours) {
        emitPublicTableDelta('merchant_hours', 'UPDATE', h, null);
      }
      return res.json({ ok: true, hours: savedHours });
    } catch (err) {
      return sendInternalDbError(res, 'merchants-hours', err);
    }
  });

  router.post('/products', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const body = (req.body || {}) as Record<string, unknown>;
    const merchantId = authUser.isApprovedAdmin && body.merchant_id
      ? Number(body.merchant_id)
      : authUser.userId;

    if (!authUser.isApprovedAdmin && (authUser.role !== 'merchant' || authUser.status !== 'approved')) {
      return res.status(403).json({
        ok: false,
        error: 'Only approved pharmacy merchants can add products.',
      });
    }

    const prodName = String(body.name || '').trim();
    if (!prodName) {
      return res.status(400).json({ ok: false, error: 'Product name is required.' });
    }
    const priceCheck = validateRegularPrice(Number(body.regular_price));
    if (!priceCheck.valid) {
      return res.status(400).json({ ok: false, error: priceCheck.error });
    }

    let imagePath = String(body.image_path || '').trim();
    const uploadedImageDataUrl =
      typeof body.uploadedImageDataUrl === 'string' ? body.uploadedImageDataUrl : undefined;
    if (uploadedImageDataUrl && uploadedImageDataUrl.startsWith('data:')) {
      const savedImg = await saveUploadedDataUrl(
        'product',
        `m${merchantId}`,
        uploadedImageDataUrl
      );
      if (!savedImg.ok) {
        return res.status(400).json({ ok: false, error: savedImg.error });
      }
      imagePath = savedImg.publicOrApiPath;
    } else if (imagePath && !isSafeImageOrDocUrl(imagePath)) {
      return res.status(400).json({ ok: false, error: 'Invalid product image path or URL.' });
    }

    try {
      const ins = await executeSql(
        `INSERT INTO products (merchant_id, category_id, name, dosage_strength, description, image_path, unit, purchase_limit, is_listed, requires_prescription, regular_price, stock_quantity, low_stock_threshold, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          merchantId,
          Number(body.category_id) || 1,
          prodName,
          body.dosage_strength ? String(body.dosage_strength).trim() : null,
          String(body.description || ''),
          imagePath,
          String(body.unit || 'unit'),
          Math.max(1, Number(body.purchase_limit) || 5),
          body.is_listed === false ? 0 : 1,
          body.requires_prescription ? 1 : 0,
          Number(body.regular_price),
          Math.max(0, Number(body.stock_quantity) || 0),
          Math.max(0, Number(body.low_stock_threshold) || 10),
          toMySqlDateTime(new Date()),
        ]
      );
      const created = await queryOne<Record<string, unknown>>(
        `SELECT * FROM products WHERE product_id = ? LIMIT 1`,
        [ins.insertId]
      );
      if (created) {
        if (created.is_listed && !created.is_archived) {
          emitPublicTableDelta('products', 'INSERT', created, null);
        }
        const stockQty = Number(created.stock_quantity ?? 0);
        const lowThreshold = Number(created.low_stock_threshold ?? 10);
        await executeSql(
          `INSERT INTO inventory_movements (product_id, merchant_id, product_name, actor_id, actor_name, actor_role, movement_type, quantity_delta, stock_before, stock_after, reference_order_id, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'initial_stock', ?, 0, ?, NULL, ?, ?)`,
          [
            Number(created.product_id),
            merchantId,
            String(created.name),
            authUser.userId,
            `${authUser.firstName} ${authUser.lastName}`,
            authUser.role,
            stockQty,
            stockQty,
            'Initial product catalog listing',
            toMySqlDateTime(new Date()),
          ]
        );
        if (!created.is_archived && stockQty <= lowThreshold) {
          await executeSql(
            `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
             VALUES (?, ?, ?, 'System', 0, ?)`,
            [
              merchantId,
              stockQty <= 0 ? `Out of stock: ${String(created.name)}` : `Low stock alert: ${String(created.name)}`,
              `${String(created.name)} currently has ${stockQty} unit(s) left (alert threshold: ${lowThreshold}). Please restock soon.`,
              toMySqlDateTime(new Date()),
            ]
          );
          emitRealtimeSync('full');
        }
      }
      return res.status(201).json({ ok: true, product: created });
    } catch (err) {
      return sendInternalDbError(res, 'products-create', err);
    }
  });

  router.put('/products/:id', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const productId = Number(req.params.id);
    const body = (req.body || {}) as Record<string, unknown>;

    const prodName = String(body.name || '').trim();
    if (!prodName) {
      return res.status(400).json({ ok: false, error: 'Product name is required.' });
    }
    const priceCheck = validateRegularPrice(Number(body.regular_price));
    if (!priceCheck.valid) {
      return res.status(400).json({ ok: false, error: priceCheck.error });
    }

    try {
      const existing = await queryOne<{ merchant_id: number; image_path: string; stock_quantity: number }>(
        `SELECT merchant_id, image_path, stock_quantity FROM products WHERE product_id = ? LIMIT 1`,
        [productId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Product not found.' });
      if (
        !authUser.isApprovedAdmin &&
        (existing.merchant_id !== authUser.userId || authUser.status !== 'approved')
      ) {
        return res.status(403).json({ ok: false, error: 'Not authorized to update this product.' });
      }

      let imagePath = String(body.image_path ?? existing.image_path ?? '').trim();
      const uploadedImageDataUrl =
        typeof body.uploadedImageDataUrl === 'string' ? body.uploadedImageDataUrl : undefined;
      if (uploadedImageDataUrl && uploadedImageDataUrl.startsWith('data:')) {
        const savedImg = await saveUploadedDataUrl(
          'product',
          `m${existing.merchant_id}-p${productId}`,
          uploadedImageDataUrl
        );
        if (!savedImg.ok) {
          return res.status(400).json({ ok: false, error: savedImg.error });
        }
        imagePath = savedImg.publicOrApiPath;
      } else if (imagePath && !isSafeImageOrDocUrl(imagePath)) {
        return res.status(400).json({ ok: false, error: 'Invalid product image path or URL.' });
      }

      const nextStock = Math.max(0, Number(body.stock_quantity) || 0);
      const prevStock = Number(existing.stock_quantity ?? 0);
      const nowSql = toMySqlDateTime(new Date());

      await executeSql(
        `UPDATE products
         SET category_id = ?, name = ?, dosage_strength = ?, description = ?, image_path = ?,
             unit = ?, purchase_limit = ?, is_listed = ?, requires_prescription = ?,
             regular_price = ?, stock_quantity = ?, low_stock_threshold = ?, updated_at = ?
         WHERE product_id = ?`,
        [
          Number(body.category_id) || 1,
          prodName,
          body.dosage_strength ? String(body.dosage_strength).trim() : null,
          String(body.description || ''),
          imagePath,
          String(body.unit || 'unit'),
          Math.max(1, Number(body.purchase_limit) || 5),
          body.is_listed === false ? 0 : 1,
          body.requires_prescription ? 1 : 0,
          Number(body.regular_price),
          nextStock,
          Math.max(0, Number(body.low_stock_threshold) || 10),
          nowSql,
          productId,
        ]
      );

      const updated = await queryOne<Record<string, unknown>>(
        `SELECT * FROM products WHERE product_id = ? LIMIT 1`,
        [productId]
      );
      if (updated) {
        if (updated.is_listed && !updated.is_archived) {
          emitPublicTableDelta('products', 'UPDATE', updated, null);
        } else {
          emitPublicTableDelta('products', 'DELETE', null, { product_id: productId });
        }
        if (nextStock !== prevStock) {
          const delta = nextStock - prevStock;
          await executeSql(
            `INSERT INTO inventory_movements (product_id, merchant_id, product_name, actor_id, actor_name, actor_role, movement_type, quantity_delta, stock_before, stock_after, reference_order_id, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
            [
              productId,
              existing.merchant_id,
              String(updated.name),
              authUser.userId,
              `${authUser.firstName} ${authUser.lastName}`,
              authUser.role,
              delta > 0 ? 'restock' : 'manual_adjustment',
              delta,
              prevStock,
              nextStock,
              delta > 0 ? 'Merchant restocked inventory' : 'Merchant adjusted stock count',
              nowSql,
            ]
          );
        }
        const stockQty = Number(updated.stock_quantity ?? 0);
        const lowThreshold = Number(updated.low_stock_threshold ?? 10);
        if (!updated.is_archived && stockQty <= lowThreshold) {
          await executeSql(
            `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
             VALUES (?, ?, ?, 'System', 0, ?)`,
            [
              existing.merchant_id,
              stockQty <= 0 ? `Out of stock: ${String(updated.name)}` : `Low stock alert: ${String(updated.name)}`,
              `${String(updated.name)} is running low with ${stockQty} unit(s) remaining (threshold: ${lowThreshold}).`,
              nowSql,
            ]
          );
          emitRealtimeSync('full');
        }
      }
      return res.json({ ok: true, product: updated });
    } catch (err) {
      return sendInternalDbError(res, 'products-update', err);
    }
  });

  // Archive historical product record instead of permanently deleting it
  router.delete('/products/:id', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const productId = Number(req.params.id);

    try {
      const existing = await queryOne<{ merchant_id: number }>(
        `SELECT merchant_id FROM products WHERE product_id = ? LIMIT 1`,
        [productId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Product not found.' });
      if (
        !authUser.isApprovedAdmin &&
        (existing.merchant_id !== authUser.userId || authUser.status !== 'approved')
      ) {
        return res.status(403).json({ ok: false, error: 'Not authorized to archive this product.' });
      }

      const nowSql = toMySqlDateTime(new Date());
      await executeSql(
        `UPDATE products SET is_archived = 1, is_listed = 0, archived_at = ?, updated_at = ? WHERE product_id = ?`,
        [nowSql, nowSql, productId]
      );
      const updated = await queryOne<Record<string, unknown>>(
        `SELECT * FROM products WHERE product_id = ? LIMIT 1`,
        [productId]
      );
      if (updated) {
        emitPublicTableDelta('products', 'UPDATE', updated, null);
      }
      return res.json({ ok: true, archived: true, unlistedInstead: true, product: updated });
    } catch (err) {
      return res.status(500).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  router.post('/products/:id/restore', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const productId = Number(req.params.id);

    try {
      const existing = await queryOne<{ merchant_id: number }>(
        `SELECT merchant_id FROM products WHERE product_id = ? LIMIT 1`,
        [productId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Product not found.' });
      if (
        !authUser.isApprovedAdmin &&
        (existing.merchant_id !== authUser.userId || authUser.status !== 'approved')
      ) {
        return res.status(403).json({ ok: false, error: 'Not authorized to restore this product.' });
      }

      const nowSql = toMySqlDateTime(new Date());
      await executeSql(
        `UPDATE products SET is_archived = 0, archived_at = NULL, is_listed = 1, updated_at = ? WHERE product_id = ?`,
        [nowSql, productId]
      );
      const updated = await queryOne<Record<string, unknown>>(
        `SELECT * FROM products WHERE product_id = ? LIMIT 1`,
        [productId]
      );
      if (updated) {
        emitPublicTableDelta('products', 'UPDATE', updated, null);
      }
      return res.json({ ok: true, product: updated });
    } catch (err) {
      return res.status(500).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  // --------------------------------------------------------------------------
  // 7. ORDERS, ATOMIC STOCK RESERVATION, CANCELLATION, RX, PAYMENTS, DELIVERY
  // --------------------------------------------------------------------------
  router.post('/orders', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (
      !authUser.isApprovedAdmin &&
      (authUser.status !== 'approved' || !userHasPerm(authUser, 'orders:place'))
    ) {
      return res.status(403).json({
        ok: false,
        error: 'Only approved customer accounts can place medicine orders.',
      });
    }

    const order = (req.body || {}) as Record<string, unknown>;
    const rawItems = Array.isArray(order.items) ? (order.items as Array<Record<string, unknown>>) : [];
    if (rawItems.length === 0) {
      return res.status(400).json({ ok: false, error: 'Order must contain at least one item.' });
    }

    // Aggregate quantities per product_id sorted ascending to prevent purchase-limit splitting or lock deadlocks
    const qtyByProductId = new Map<number, number>();
    for (const it of rawItems) {
      const pid = Number(it.product_id);
      const qty = Number(it.quantity);
      if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ ok: false, error: 'Invalid product quantity in order.' });
      }
      qtyByProductId.set(pid, (qtyByProductId.get(pid) || 0) + qty);
    }
    const aggregatedEntries = Array.from(qtyByProductId.entries()).sort((a, b) => a[0] - b[0]);

    const paymentInput = (order.payment || {}) as Record<string, unknown>;
    const rxInput = order.prescription as Record<string, unknown> | undefined;
    const nowSql = toMySqlDateTime(new Date());

    // Pre-save prescription file if data URL provided and validate URL strictly
    let rxStoragePath: string | null = null;
    let rxPreviewUrl = rxInput ? String(rxInput.file_preview_url || '').trim() : '';
    if (rxInput) {
      if (!rxPreviewUrl) {
        return res.status(400).json({ ok: false, error: 'Prescription attachment is required.' });
      }
      if (rxPreviewUrl.startsWith('data:')) {
        const savedRx = await saveUploadedDataUrl('prescription', `u${authUser.userId}`, rxPreviewUrl);
        if (!savedRx.ok) {
          return res.status(400).json({ ok: false, error: savedRx.error });
        }
        rxStoragePath = savedRx.fileName;
        rxPreviewUrl = savedRx.publicOrApiPath;
      } else if (!isSafeImageOrDocUrl(rxPreviewUrl)) {
        return res.status(400).json({ ok: false, error: 'Invalid prescription attachment URL.' });
      }
    }

    try {
      const bundle = await withTransaction(async (conn) => {
        const merchantId = Number(order.merchant_id);
        const [merchantRows] = await conn.query<RowDataPacket[]>(
          `SELECT mp.merchant_id
           FROM merchant_profiles mp
           JOIN users u ON u.user_id = mp.user_id
           WHERE mp.merchant_id = ? AND u.role = 'merchant' AND u.status = 'approved'
           LIMIT 1`,
          [merchantId]
        );
        if (merchantRows.length === 0) {
          throw Object.assign(
            new Error('Selected pharmacy store is unavailable or not yet verified.'),
            { statusCode: 400 }
          );
        }

        const addressId = Number(order.address_id);
        const [addrRows] = await conn.query<RowDataPacket[]>(
          `SELECT user_id FROM addresses WHERE address_id = ? LIMIT 1`,
          [addressId]
        );
        if (addrRows.length === 0) {
          throw Object.assign(new Error('Delivery address not found.'), { statusCode: 404 });
        }
        if (!authUser.isApprovedAdmin && Number(addrRows[0].user_id) !== authUser.userId) {
          throw Object.assign(new Error('Not authorized to use the selected delivery address.'), {
            statusCode: 403,
          });
        }

        const alertId = order.alert_id ? Number(order.alert_id) : null;
        if (alertId) {
          const [alertRows] = await conn.query<RowDataPacket[]>(
            `SELECT user_id FROM emergency_alerts WHERE alert_id = ? LIMIT 1`,
            [alertId]
          );
          if (alertRows.length === 0) {
            throw Object.assign(new Error('Referenced emergency alert was not found.'), { statusCode: 404 });
          }
          if (!authUser.isApprovedAdmin && Number(alertRows[0].user_id) !== authUser.userId) {
            throw Object.assign(new Error('Not authorized to link this emergency alert.'), {
              statusCode: 403,
            });
          }
        }

        let computedSubtotal = 0;
        let hasRxItem = false;
        const authoritativeItems: Array<{
          product_id: number;
          merchant_id: number;
          product_name: string;
          unit: string;
          requires_prescription: number;
          unit_price: number;
          quantity: number;
          stock_before: number;
          stock_after: number;
        }> = [];
        const updatedProducts: Record<string, unknown>[] = [];

        for (const [pid, qty] of aggregatedEntries) {
          const [prodRows] = await conn.query<RowDataPacket[]>(
            `SELECT * FROM products WHERE product_id = ? FOR UPDATE`,
            [pid]
          );
          const prod = prodRows[0];
          if (!prod) {
            throw Object.assign(new Error(`Product #${pid} no longer exists.`), { statusCode: 404 });
          }
          if (Number(prod.merchant_id) !== merchantId) {
            throw Object.assign(
              new Error('Order item merchant does not match the selected pharmacy order.'),
              { statusCode: 400 }
            );
          }
          if (!prod.is_listed || prod.is_archived) {
            throw Object.assign(new Error(`${prod.name} is no longer available.`), { statusCode: 400 });
          }
          if (qty > Math.max(1, Number(prod.purchase_limit))) {
            throw Object.assign(
              new Error(`Purchase limit for ${prod.name} is ${prod.purchase_limit} per order.`),
              { statusCode: 400 }
            );
          }
          const stockBefore = Number(prod.stock_quantity);
          if (stockBefore < qty) {
            throw Object.assign(
              new Error(`${prod.name} only has ${stockBefore} left in stock.`),
              { statusCode: 409 }
            );
          }

          await conn.execute(
            `UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE product_id = ?`,
            [qty, nowSql, pid]
          );
          const [refreshed] = await conn.query<RowDataPacket[]>(
            `SELECT * FROM products WHERE product_id = ? LIMIT 1`,
            [pid]
          );
          if (refreshed[0]) {
            const refreshedProd = refreshed[0] as Record<string, unknown>;
            updatedProducts.push(refreshedProd);
            const remaining = Number(refreshedProd.stock_quantity ?? 0);
            const threshold = Number(refreshedProd.low_stock_threshold ?? 10);
            if (remaining <= threshold) {
              await conn.execute(
                `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
                 VALUES (?, ?, ?, 'System', 0, ?)`,
                [
                  merchantId,
                  remaining <= 0
                    ? `Out of stock: ${String(refreshedProd.name)}`
                    : `Low stock alert: ${String(refreshedProd.name)}`,
                  `After an order deduction, ${String(refreshedProd.name)} has ${remaining} unit(s) remaining (low-stock threshold: ${threshold}).`,
                  nowSql,
                ]
              );
            }
          }

          const unitPrice = Number(prod.regular_price);
          computedSubtotal = Math.round((computedSubtotal + unitPrice * qty) * 100) / 100;
          if (prod.requires_prescription) hasRxItem = true;

          authoritativeItems.push({
            product_id: pid,
            merchant_id: Number(prod.merchant_id),
            product_name: String(prod.name),
            unit: String(prod.unit),
            requires_prescription: prod.requires_prescription ? 1 : 0,
            unit_price: unitPrice,
            quantity: qty,
            stock_before: stockBefore,
            stock_after: stockBefore - qty,
          });
        }

        if (hasRxItem && !rxInput) {
          throw Object.assign(
            new Error('A valid prescription attachment is required for prescription medicine items.'),
            { statusCode: 400 }
          );
        }

        // Strict server-side coupon validation and discount computation
        const requestedCouponCode = order.coupon_code ? normalizeCouponCode(String(order.coupon_code)) : '';
        let appliedCouponId: number | null = null;
        let appliedCouponCode: string | null = null;
        let discountAmount = 0;

        if (requestedCouponCode) {
          const [couponRows] = await conn.query<RowDataPacket[]>(
            `SELECT * FROM coupons WHERE UPPER(code) = ? FOR UPDATE`,
            [requestedCouponCode]
          );
          const couponRow = couponRows[0] as Record<string, unknown> | undefined;
          if (!couponRow) {
            throw Object.assign(new Error(`Coupon code "${requestedCouponCode}" was not found.`), {
              statusCode: 400,
              couponFailure: { couponId: null, couponCode: requestedCouponCode },
            });
          }
          const coupon = mapRawCouponRow(couponRow);
          const [prevOrdersRows] = await conn.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS cnt FROM orders WHERE resident_id = ? AND status <> 'cancelled'`,
            [authUser.userId]
          );
          const residentPreviousOrdersCount = Number(prevOrdersRows[0]?.cnt ?? 0);

          const [usageRows] = await conn.query<RowDataPacket[]>(
            `SELECT COUNT(*) AS cnt FROM coupon_redemptions WHERE coupon_id = ? AND resident_id = ? AND status = 'redeemed'`,
            [coupon.coupon_id, authUser.userId]
          );
          const residentCouponUsageCount = Number(usageRows[0]?.cnt ?? 0);

          const [claimRows] = await conn.query<RowDataPacket[]>(
            `SELECT * FROM customer_coupons WHERE coupon_id = ? AND resident_id = ? LIMIT 1`,
            [coupon.coupon_id, authUser.userId]
          );
          const claimRow = claimRows[0] as CustomerCoupon | undefined;

          const check = validateAndCalculateCouponDiscount({
            coupon,
            residentId: authUser.userId,
            merchantId,
            cartItems: authoritativeItems.map((i) => ({
              product_id: i.product_id,
              quantity: i.quantity,
              unit_price: i.unit_price,
            })),
            subtotal: computedSubtotal,
            customerClaim: claimRow ?? null,
            residentPreviousOrdersCount,
            residentCouponUsageCount,
          });
          if (!check.valid) {
            throw Object.assign(new Error(check.reason || 'Coupon is not eligible for this order.'), {
              statusCode: 400,
              couponFailure: { couponId: coupon.coupon_id, couponCode: coupon.code },
            });
          }
          appliedCouponId = coupon.coupon_id;
          appliedCouponCode = coupon.code;
          discountAmount = check.discountAmount;
        }

        const deliveryFee = AUTHORITATIVE_DELIVERY_FEE;
        const totalAmount = Math.max(
          0,
          Math.round((computedSubtotal - discountAmount + deliveryFee) * 100) / 100
        );
        const requestedStatus = String(order.status || 'placed');
        const effectiveStatus = hasRxItem
          ? 'awaiting_prescription_review'
          : paymentInput.method === 'GCash'
            ? 'pending'
            : requestedStatus === 'pending'
              ? 'pending'
              : 'placed';

        const [ordIns] = await conn.execute<ResultSetHeader>(
          `INSERT INTO orders (order_code, idempotency_key, resident_id, merchant_id, alert_id, address_id, delivery_address_snapshot, recipient_name, recipient_phone, rider_note, subtotal, delivery_fee, coupon_id, coupon_code, discount_amount, total_amount, status, placed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            String(order.order_code || `MDX-ORD-${Date.now()}`),
            String(order.idempotency_key || `ord-${authUser.userId}-${Date.now()}`),
            authUser.userId,
            merchantId,
            alertId,
            addressId,
            String(order.delivery_address_snapshot || ''),
            String(order.recipient_name || ''),
            String(order.recipient_phone || ''),
            order.rider_note ? String(order.rider_note) : null,
            computedSubtotal,
            deliveryFee,
            appliedCouponId,
            appliedCouponCode,
            discountAmount,
            totalAmount,
            effectiveStatus,
            nowSql,
          ]
        );
        const realOrderId = Number(ordIns.insertId);
        const realOrderCode = String(order.order_code || `MDX-ORD-${realOrderId}`);

        for (const it of authoritativeItems) {
          await conn.execute(
            `INSERT INTO order_items (order_id, product_id, merchant_id, product_name, unit, requires_prescription, unit_price, quantity)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              realOrderId,
              it.product_id,
              it.merchant_id,
              it.product_name,
              it.unit,
              it.requires_prescription,
              it.unit_price,
              it.quantity,
            ]
          );
          await conn.execute(
            `INSERT INTO inventory_movements (product_id, merchant_id, product_name, actor_id, actor_name, actor_role, movement_type, quantity_delta, stock_before, stock_after, reference_order_id, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'sale_deduction', ?, ?, ?, ?, ?, ?)`,
            [
              it.product_id,
              it.merchant_id,
              it.product_name,
              authUser.userId,
              `${authUser.firstName} ${authUser.lastName}`,
              authUser.role,
              -it.quantity,
              it.stock_before,
              it.stock_after,
              realOrderId,
              `Reserved for order ${realOrderCode}`,
              nowSql,
            ]
          );
        }

        if (appliedCouponId && appliedCouponCode) {
          await conn.execute(`UPDATE coupons SET times_used = times_used + 1 WHERE coupon_id = ?`, [
            appliedCouponId,
          ]);
          await conn.execute(
            `INSERT INTO customer_coupons (coupon_id, resident_id, status, claimed_at, used_at, order_id)
             VALUES (?, ?, 'used', ?, ?, ?)
             ON DUPLICATE KEY UPDATE status = 'used', used_at = VALUES(used_at), order_id = VALUES(order_id)`,
            [appliedCouponId, authUser.userId, nowSql, nowSql, realOrderId]
          );
          await conn.execute(
            `INSERT INTO coupon_redemptions (coupon_id, coupon_code, resident_id, order_id, discount_amount, status, failure_reason, created_at)
             VALUES (?, ?, ?, ?, ?, 'redeemed', NULL, ?)`,
            [appliedCouponId, appliedCouponCode, authUser.userId, realOrderId, discountAmount, nowSql]
          );
        }

        await conn.execute(
          `INSERT INTO order_status_history (order_id, status, note, created_at)
           VALUES (?, ?, ?, ?)`,
          [
            realOrderId,
            effectiveStatus,
            hasRxItem
              ? 'Order placed; awaiting pharmacist prescription verification'
              : 'Order placed',
            nowSql,
          ]
        );

        await conn.execute(
          `INSERT INTO payments (order_id, method, idempotency_key, receipt_number, amount, amount_collected, is_flagged, failure_reason, status, gateway_reference, is_simulated_sandbox, paid_at, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, 0, NULL, 'pending', NULL, ?, NULL, ?)`,
          [
            realOrderId,
            paymentInput.method === 'GCash' ? 'GCash' : 'COD',
            String(paymentInput.idempotency_key || `pay-${realOrderId}-${Date.now()}`),
            String(paymentInput.receipt_number || `RCP-2026-${realOrderId}`),
            totalAmount,
            paymentInput.is_simulated_sandbox ? 1 : 0,
            nowSql,
          ]
        );

        if (rxInput) {
          await conn.execute(
            `INSERT INTO prescriptions (order_id, resident_id, merchant_id, patient_name, doctor_name, license_no, date_issued, valid_until, file_name, file_type, file_preview_url, storage_path, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?)`,
            [
              realOrderId,
              authUser.userId,
              merchantId,
              String(rxInput.patient_name || ''),
              String(rxInput.doctor_name || ''),
              String(rxInput.license_no || ''),
              String(rxInput.date_issued || '').slice(0, 10),
              rxInput.valid_until ? String(rxInput.valid_until).slice(0, 10) : null,
              String(rxInput.file_name || 'prescription.png'),
              ['jpg', 'png', 'pdf'].includes(String(rxInput.file_type))
                ? String(rxInput.file_type)
                : 'png',
              rxPreviewUrl,
              rxStoragePath,
              nowSql,
            ]
          );
        }

        // Persistent notifications for merchant & resident
        await conn.execute(
          `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
           VALUES (?, ?, ?, ?, 0, ?), (?, ?, ?, 'Order', 0, ?)`,
          [
            merchantId,
            `New order ${realOrderCode}`,
            rxInput
              ? 'Prescription verification required before preparation.'
              : 'New medicine order received.',
            rxInput ? 'Prescription' : 'Order',
            nowSql,
            authUser.userId,
            `Order ${realOrderCode} placed`,
            `Total: ₱${totalAmount.toFixed(2)} via ${paymentInput.method === 'GCash' ? 'GCash' : 'COD'}${discountAmount > 0 ? ` (Promo saved ₱${discountAmount.toFixed(2)})` : ''}.`,
            nowSql,
          ]
        );

        const [orderRows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM orders WHERE order_id = ? LIMIT 1`,
          [realOrderId]
        );
        const [itemRows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM order_items WHERE order_id = ?`,
          [realOrderId]
        );
        const [histRows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC`,
          [realOrderId]
        );
        const [payRows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM payments WHERE order_id = ? LIMIT 1`,
          [realOrderId]
        );
        const [rxRows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM prescriptions WHERE order_id = ? LIMIT 1`,
          [realOrderId]
        );

        return {
          orderRow: orderRows[0],
          items: itemRows,
          history: histRows,
          payment: payRows[0],
          prescription: rxRows[0] || undefined,
          updatedProducts,
        };
      });

      for (const p of bundle.updatedProducts) {
        emitPublicTableDelta('products', 'UPDATE', p, null);
      }
      emitRealtimeSync('full');

      return res.status(201).json({
        ok: true,
        orderRow: bundle.orderRow,
        items: bundle.items,
        history: bundle.history,
        payment: bundle.payment,
        prescription: bundle.prescription,
      });
    } catch (err) {
      const typedErr = err as { statusCode?: number; couponFailure?: { couponId: number | null; couponCode: string } };
      if (typedErr?.couponFailure) {
        try {
          await executeSql(
            `INSERT INTO coupon_redemptions (coupon_id, coupon_code, resident_id, order_id, discount_amount, status, failure_reason, created_at)
             VALUES (?, ?, ?, NULL, 0, 'failed', ?, ?)`,
            [
              typedErr.couponFailure.couponId,
              typedErr.couponFailure.couponCode,
              authUser.userId,
              getMySqlErrorCode(err).message,
              nowSql,
            ]
          );
        } catch {
          // non-fatal audit write
        }
      }
      const statusCode = typedErr?.statusCode;
      if (statusCode && statusCode >= 400 && statusCode < 500) {
        return res.status(statusCode).json({ ok: false, error: getMySqlErrorCode(err).message });
      }
      return sendInternalDbError(res, 'orders-create', err);
    }
  });

  router.post('/orders/:id/cancel', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid order ID.' });
    }
    const reason =
      String((req.body as { reason?: string })?.reason || '').trim().slice(0, 300) ||
      'Cancelled by resident; reserved stock released';
    const nowSql = toMySqlDateTime(new Date());

    try {
      const restoredProducts = await withTransaction(async (conn) => {
        const [ordRows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM orders WHERE order_id = ? FOR UPDATE`,
          [orderId]
        );
        const ord = ordRows[0];
        if (!ord) throw Object.assign(new Error('Order not found.'), { statusCode: 404 });

        const allowed =
          Number(ord.resident_id) === authUser.userId ||
          (Number(ord.merchant_id) === authUser.userId && authUser.status === 'approved') ||
          authUser.isApprovedAdmin;
        if (!allowed) {
          throw Object.assign(new Error('Not authorized to cancel this order.'), { statusCode: 403 });
        }

        if (
          ['ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled'].includes(
            String(ord.status)
          )
        ) {
          throw Object.assign(
            new Error('Order can no longer be cancelled after preparation/pickup.'),
            { statusCode: 400 }
          );
        }

        await conn.execute(
          `UPDATE orders SET status = 'cancelled', cancel_reason = ? WHERE order_id = ?`,
          [reason, orderId]
        );

        const [items] = await conn.query<RowDataPacket[]>(
          `SELECT product_id, product_name, merchant_id, quantity FROM order_items WHERE order_id = ?`,
          [orderId]
        );
        const updated: Record<string, unknown>[] = [];
        for (const it of items) {
          const [beforeRows] = await conn.query<RowDataPacket[]>(
            `SELECT stock_quantity FROM products WHERE product_id = ? LIMIT 1`,
            [Number(it.product_id)]
          );
          const beforeQty = Number(beforeRows[0]?.stock_quantity ?? 0);
          await conn.execute(
            `UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE product_id = ?`,
            [Number(it.quantity), nowSql, Number(it.product_id)]
          );
          const [refreshed] = await conn.query<RowDataPacket[]>(
            `SELECT * FROM products WHERE product_id = ? LIMIT 1`,
            [Number(it.product_id)]
          );
          if (refreshed[0]) updated.push(refreshed[0] as Record<string, unknown>);
          await conn.execute(
            `INSERT INTO inventory_movements (product_id, merchant_id, product_name, actor_id, actor_name, actor_role, movement_type, quantity_delta, stock_before, stock_after, reference_order_id, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'cancel_restock', ?, ?, ?, ?, ?, ?)`,
            [
              Number(it.product_id),
              Number(it.merchant_id),
              String(it.product_name || 'Product'),
              authUser.userId,
              `${authUser.firstName} ${authUser.lastName}`,
              authUser.role,
              Number(it.quantity),
              beforeQty,
              beforeQty + Number(it.quantity),
              orderId,
              `Order cancelled: ${reason}`,
              nowSql,
            ]
          );
        }

        await conn.execute(
          `INSERT INTO order_status_history (order_id, status, note, created_at)
           VALUES (?, 'cancelled', ?, ?)`,
          [orderId, reason, nowSql]
        );
        return updated;
      });

      for (const p of restoredProducts) {
        emitPublicTableDelta('products', 'UPDATE', p, null);
      }
      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode || 500;
      if (statusCode >= 500) {
        return sendInternalDbError(res, 'orders.cancel', err);
      }
      return res.status(statusCode).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  // Return an undelivered ("Customer Not Home") package back to pharmacy, cancel order, and atomically restore stock
  router.post('/orders/:id/return-failed', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid order ID.' });
    }
    const reason =
      String((req.body as { reason?: string })?.reason || '').trim().slice(0, 300) ||
      'Customer not home — undelivered medicines returned to pharmacy and stock restored';

    try {
      const restoredProducts = await withTransaction(async (conn) => {
        const [ordRows] = await conn.query<RowDataPacket[]>(
          `SELECT order_id, order_code, resident_id, merchant_id, status
           FROM orders
           WHERE order_id = ?
           FOR UPDATE`,
          [orderId]
        );
        const ord = ordRows[0];
        if (!ord) {
          throw Object.assign(new Error('Order not found.'), { statusCode: 404 });
        }

        const [delivRows] = await conn.query<RowDataPacket[]>(
          `SELECT delivery_id, rider_id, status
           FROM deliveries
           WHERE order_id = ?
           FOR UPDATE`,
          [orderId]
        );
        const deliv = delivRows[0];

        const allowed =
          authUser.isApprovedAdmin ||
          (Number(ord.merchant_id) === authUser.userId && authUser.status === 'approved') ||
          (authUser.role === 'rider' &&
            authUser.status === 'approved' &&
            Number(deliv?.rider_id) === authUser.userId);
        if (!allowed) {
          throw Object.assign(
            new Error('Only the assigned rider, pharmacy, or Admin can return this delivery.'),
            { statusCode: 403 }
          );
        }

        if (ord.status === 'delivered' || ord.status === 'cancelled') {
          throw Object.assign(new Error('Order is already finalized.'), { statusCode: 400 });
        }
        if (!deliv || deliv.status !== 'not_home') {
          throw Object.assign(
            new Error('Order must be marked Customer Not Home before returning to pharmacy.'),
            { statusCode: 400 }
          );
        }

        const nowSql = toMySqlDateTime(new Date());
        await conn.execute(
          `UPDATE deliveries SET status = 'failed', failure_reason = ? WHERE delivery_id = ?`,
          [reason, Number(deliv.delivery_id)]
        );
        await conn.execute(
          `UPDATE orders SET status = 'cancelled', cancel_reason = ? WHERE order_id = ?`,
          [reason, orderId]
        );

        const [items] = await conn.query<RowDataPacket[]>(
          `SELECT product_id, product_name, merchant_id, quantity FROM order_items WHERE order_id = ?`,
          [orderId]
        );
        const updated: Record<string, unknown>[] = [];
        for (const it of items) {
          const [beforeRows] = await conn.query<RowDataPacket[]>(
            `SELECT stock_quantity FROM products WHERE product_id = ? LIMIT 1`,
            [Number(it.product_id)]
          );
          const beforeQty = Number(beforeRows[0]?.stock_quantity ?? 0);
          await conn.execute(
            `UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE product_id = ?`,
            [Number(it.quantity), nowSql, Number(it.product_id)]
          );
          const [refreshed] = await conn.query<RowDataPacket[]>(
            `SELECT * FROM products WHERE product_id = ? LIMIT 1`,
            [Number(it.product_id)]
          );
          if (refreshed[0]) updated.push(refreshed[0] as Record<string, unknown>);
          await conn.execute(
            `INSERT INTO inventory_movements (product_id, merchant_id, product_name, actor_id, actor_name, actor_role, movement_type, quantity_delta, stock_before, stock_after, reference_order_id, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'return_restock', ?, ?, ?, ?, ?, ?)`,
            [
              Number(it.product_id),
              Number(it.merchant_id),
              String(it.product_name || 'Product'),
              authUser.userId,
              `${authUser.firstName} ${authUser.lastName}`,
              authUser.role,
              Number(it.quantity),
              beforeQty,
              beforeQty + Number(it.quantity),
              orderId,
              `Failed delivery returned to pharmacy: ${reason}`,
              nowSql,
            ]
          );
        }

        await conn.execute(
          `INSERT INTO order_status_history (order_id, status, note, created_at)
           VALUES (?, 'cancelled', ?, ?)`,
          [orderId, `Returned to Pharmacy: ${reason}`, nowSql]
        );

        const orderCode = String(ord.order_code || `MDX-${orderId}`);
        await conn.execute(
          `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
           VALUES (?, ?, ?, 'Delivery', 0, ?)`,
          [
            Number(ord.resident_id),
            `Order ${orderCode} Returned to Pharmacy`,
            `${reason}. Please place a new order when someone is available to receive it.`,
            nowSql,
          ]
        );
        await conn.execute(
          `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
           VALUES (?, ?, ?, 'Order', 0, ?)`,
          [
            Number(ord.merchant_id),
            `Returned Order ${orderCode} — Stock Restored`,
            `${reason}. Medicine quantities have been automatically returned to your inventory.`,
            nowSql,
          ]
        );

        return updated;
      });

      for (const p of restoredProducts) {
        emitPublicTableDelta('products', 'UPDATE', p, null);
      }
      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode || 500;
      if (statusCode >= 500) {
        return sendInternalDbError(res, 'orders.return-failed', err);
      }
      return res.status(statusCode).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  router.patch('/orders/:id/status', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid order ID.' });
    }
    const { status, note, cancel_reason } = (req.body || {}) as Record<string, string | undefined>;
    if (!status) return res.status(400).json({ ok: false, error: 'Status is required.' });

    try {
      await withTransaction(async (conn) => {
        const [ordRows] = await conn.query<RowDataPacket[]>(
          `SELECT resident_id, merchant_id, status FROM orders WHERE order_id = ? FOR UPDATE`,
          [orderId]
        );
        const ord = ordRows[0] as { resident_id: number; merchant_id: number; status: string } | undefined;
        if (!ord) throw Object.assign(new Error('Order not found.'), { statusCode: 404 });

        const [delivRows] = await conn.query<RowDataPacket[]>(
          `SELECT rider_id FROM deliveries WHERE order_id = ? FOR UPDATE`,
          [orderId]
        );
        const deliv = delivRows[0] as { rider_id: number | null } | undefined;

        const [rxRows] = await conn.query<RowDataPacket[]>(
          `SELECT status FROM prescriptions WHERE order_id = ? LIMIT 1`,
          [orderId]
        );
        const rx = rxRows[0] as { status: string } | undefined;

        const canManageDispatch = userHasPerm(authUser, 'deliveries:assign_rider');
        const isAssignedRider =
          authUser.role === 'rider' &&
          authUser.status === 'approved' &&
          Number(deliv?.rider_id) === authUser.userId;

        const allowed =
          authUser.isApprovedAdmin ||
          canManageDispatch ||
          Number(ord.resident_id) === authUser.userId ||
          (Number(ord.merchant_id) === authUser.userId && authUser.status === 'approved') ||
          isAssignedRider;
        if (!allowed) {
          throw Object.assign(new Error('Not authorized to update this order.'), { statusCode: 403 });
        }

        if (status === 'delivered' && !authUser.isApprovedAdmin && !canManageDispatch) {
          throw Object.assign(
            new Error('Completing delivery requires verifying the 4-digit resident confirmation PIN.'),
            { statusCode: 403 }
          );
        }

        const transition = canTransitionOrderStatus(String(ord.status), status, authUser.role, {
          prescriptionStatus: rx?.status ?? null,
          isAssignedRider,
          canManageDispatch,
        });
        if (!transition.allowed) {
          throw Object.assign(new Error(transition.reason || 'Invalid order status transition.'), {
            statusCode: 400,
          });
        }

        if (cancel_reason !== undefined) {
          await conn.execute(`UPDATE orders SET status = ?, cancel_reason = ? WHERE order_id = ?`, [
            status,
            String(cancel_reason).slice(0, 300),
            orderId,
          ]);
        } else {
          await conn.execute(`UPDATE orders SET status = ? WHERE order_id = ?`, [status, orderId]);
        }
        await conn.execute(
          `INSERT INTO order_status_history (order_id, status, note, created_at) VALUES (?, ?, ?, ?)`,
          [orderId, status, note ? String(note).slice(0, 300) : null, toMySqlDateTime(new Date())]
        );
      });

      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode || 500;
      if (statusCode >= 500) {
        return sendInternalDbError(res, 'orders.status', err);
      }
      return res.status(statusCode).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  router.post('/orders/:id/prescription/review', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid order ID.' });
    }
    const { decision, reviewerName, rejectReason, remarks } = (req.body || {}) as Record<
      string,
      string | undefined
    >;
    if (decision !== 'approved' && decision !== 'rejected') {
      return res.status(400).json({ ok: false, error: 'Decision must be approved or rejected.' });
    }

    try {
      const rx = await queryOne<{ merchant_id: number }>(
        `SELECT merchant_id FROM prescriptions WHERE order_id = ? LIMIT 1`,
        [orderId]
      );
      if (!rx) return res.status(404).json({ ok: false, error: 'Prescription not found.' });
      if (
        !authUser.isApprovedAdmin &&
        !(rx.merchant_id === authUser.userId && authUser.status === 'approved')
      ) {
        return res.status(403).json({ ok: false, error: 'Only the assigned pharmacy can review Rx.' });
      }

      await executeSql(
        `UPDATE prescriptions
         SET status = ?, reviewed_by = ?, reviewed_at = ?, reject_reason = ?, remarks = ?
         WHERE order_id = ?`,
        [
          decision,
          (reviewerName || `${authUser.firstName} ${authUser.lastName}`).slice(0, 120),
          toMySqlDateTime(new Date()),
          decision === 'rejected' && rejectReason ? String(rejectReason).slice(0, 255) : null,
          decision === 'rejected' && remarks ? String(remarks).slice(0, 500) : null,
          orderId,
        ]
      );
      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'orders.prescription.review', err);
    }
  });

  router.put('/orders/:id/prescription', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid order ID.' });
    }
    const rx = (req.body || {}) as Record<string, unknown>;

    try {
      const ord = await queryOne<{ resident_id: number; merchant_id: number; status: string }>(
        `SELECT resident_id, merchant_id, status FROM orders WHERE order_id = ? LIMIT 1`,
        [orderId]
      );
      if (!ord) return res.status(404).json({ ok: false, error: 'Order not found.' });
      if (!authUser.isApprovedAdmin && ord.resident_id !== authUser.userId) {
        return res.status(403).json({ ok: false, error: 'Not authorized to re-upload Rx.' });
      }
      if (ord.status === 'delivered' || ord.status === 'cancelled') {
        return res.status(400).json({ ok: false, error: 'Finalized orders cannot update prescription proof.' });
      }

      let storagePath: string | null = null;
      let previewUrl = String(rx.file_preview_url || '').trim();
      if (!previewUrl) {
        return res.status(400).json({ ok: false, error: 'Prescription document proof is required.' });
      }
      if (previewUrl.startsWith('data:')) {
        const savedRx = await saveUploadedDataUrl('prescription', `u${authUser.userId}-o${orderId}`, previewUrl);
        if (!savedRx.ok) {
          return res.status(400).json({ ok: false, error: savedRx.error });
        }
        storagePath = savedRx.fileName;
        previewUrl = savedRx.publicOrApiPath;
      } else if (!isSafeImageOrDocUrl(previewUrl)) {
        return res.status(400).json({ ok: false, error: 'Invalid or unsafe prescription document URL.' });
      }

      const nowSql = toMySqlDateTime(new Date());
      await withTransaction(async (conn) => {
        await conn.execute(
          `UPDATE orders SET status = 'awaiting_prescription_review' WHERE order_id = ?`,
          [orderId]
        );
        await conn.execute(
          `INSERT INTO order_status_history (order_id, status, note, created_at)
           VALUES (?, 'awaiting_prescription_review', 'New prescription document uploaded by resident', ?)`,
          [orderId, nowSql]
        );
        await conn.execute(
          `INSERT INTO prescriptions (order_id, resident_id, merchant_id, patient_name, doctor_name, license_no, date_issued, valid_until, file_name, file_type, file_preview_url, storage_path, status, reject_reason, remarks, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', NULL, NULL, ?)
           ON DUPLICATE KEY UPDATE
             patient_name = VALUES(patient_name),
             doctor_name = VALUES(doctor_name),
             license_no = VALUES(license_no),
             date_issued = VALUES(date_issued),
             valid_until = VALUES(valid_until),
             file_name = VALUES(file_name),
             file_type = VALUES(file_type),
             file_preview_url = VALUES(file_preview_url),
             storage_path = VALUES(storage_path),
             status = 'pending_review',
             reject_reason = NULL,
             remarks = NULL`,
          [
            orderId,
            ord.resident_id,
            ord.merchant_id,
            String(rx.patient_name || '').trim().slice(0, 140),
            String(rx.doctor_name || '').trim().slice(0, 140),
            String(rx.license_no || '').trim().slice(0, 60),
            String(rx.date_issued || '').slice(0, 10),
            rx.valid_until ? String(rx.valid_until).slice(0, 10) : null,
            String(rx.file_name || 'prescription.png').slice(0, 255),
            ['jpg', 'png', 'pdf'].includes(String(rx.file_type)) ? String(rx.file_type) : 'png',
            previewUrl,
            storagePath,
            nowSql,
          ]
        );
      });

      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'orders.prescription.update', err);
    }
  });

  router.put('/orders/:id/delivery', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid order ID.' });
    }
    const d = (req.body || {}) as Record<string, unknown>;
    const validDeliveryStatuses = ['requested', 'assigned', 'picked_up', 'delivered', 'not_home', 'failed'];
    const nextStatus = String(d.status || 'requested');
    if (!validDeliveryStatuses.includes(nextStatus)) {
      return res.status(400).json({ ok: false, error: 'Invalid delivery status.' });
    }

    try {
      const ord = await queryOne<{ merchant_id: number; resident_id: number }>(
        `SELECT merchant_id, resident_id FROM orders WHERE order_id = ? LIMIT 1`,
        [orderId]
      );
      if (!ord) return res.status(404).json({ ok: false, error: 'Order not found.' });

      const canManageDispatch = userHasPerm(authUser, 'deliveries:assign_rider');
      const isStoreOwner = Number(ord.merchant_id) === authUser.userId && authUser.status === 'approved';
      const isApprovedRider = authUser.role === 'rider' && authUser.status === 'approved';
      const isAllowed = authUser.isApprovedAdmin || canManageDispatch || isStoreOwner || isApprovedRider;
      if (!isAllowed) {
        return res.status(403).json({ ok: false, error: 'Not authorized to update delivery.' });
      }

      if (isApprovedRider && !authUser.isApprovedAdmin && !canManageDispatch) {
        const riderProf = await queryOne<{ operational_status: string | null }>(
          `SELECT operational_status FROM rider_profiles WHERE user_id = ? LIMIT 1`,
          [authUser.userId]
        );
        if (riderProf?.operational_status === 'suspended') {
          return res.status(403).json({ ok: false, error: 'Suspended riders cannot update deliveries.' });
        }
      }

      if (nextStatus === 'delivered' && !authUser.isApprovedAdmin && !canManageDispatch) {
        return res.status(403).json({
          ok: false,
          error: 'Delivery completion requires verifying the 4-digit resident PIN.',
        });
      }

      const prevDelivery = await queryOne<{ delivery_id: number; status: string; rider_id: number | null }>(
        `SELECT delivery_id, status, rider_id FROM deliveries WHERE order_id = ? LIMIT 1`,
        [orderId]
      );

      if (
        prevDelivery &&
        prevDelivery.rider_id !== null &&
        Number(prevDelivery.rider_id) !== authUser.userId &&
        prevDelivery.status !== 'requested' &&
        !authUser.isApprovedAdmin &&
        !canManageDispatch &&
        !isStoreOwner
      ) {
        return res.status(403).json({ ok: false, error: 'This delivery is assigned to another rider.' });
      }

      const declinedJson = JSON.stringify(
        Array.isArray(d.declined_by_rider_ids) ? d.declined_by_rider_ids.map(Number) : []
      );
      let riderId = d.rider_id !== null && d.rider_id !== undefined ? Number(d.rider_id) : null;
      if (isApprovedRider && !authUser.isApprovedAdmin && !canManageDispatch && nextStatus === 'assigned') {
        riderId = authUser.userId;
      }

      const serverGeneratedCode = String(crypto.randomInt(1000, 10000));
      const safeAttempts = authUser.isApprovedAdmin ? Number(d.code_attempts || 0) : Number(prevDelivery ? 0 : 0);

      await executeSql(
        `INSERT INTO deliveries (order_id, rider_id, pickup_merchant_id, status, failure_reason, assigned_at, picked_up_at, delivered_at, requested_at, confirmation_code, code_attempts, is_flagged_for_admin, rider_lat, rider_lng, declined_by_rider_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           rider_id = VALUES(rider_id),
           status = VALUES(status),
           failure_reason = VALUES(failure_reason),
           assigned_at = VALUES(assigned_at),
           picked_up_at = VALUES(picked_up_at),
           delivered_at = VALUES(delivered_at),
           rider_lat = VALUES(rider_lat),
           rider_lng = VALUES(rider_lng),
           declined_by_rider_ids = VALUES(declined_by_rider_ids)`,
        [
          orderId,
          riderId,
          Number(ord.merchant_id),
          nextStatus,
          d.failure_reason ? String(d.failure_reason).slice(0, 300) : null,
          toMySqlDateTime(d.assigned_at as string | null),
          toMySqlDateTime(d.picked_up_at as string | null),
          toMySqlDateTime(d.delivered_at as string | null),
          toMySqlDateTime(d.requested_at as string | null) || toMySqlDateTime(new Date()),
          serverGeneratedCode,
          safeAttempts,
          d.is_flagged_for_admin ? 1 : 0,
          d.rider_lat !== null && d.rider_lat !== undefined ? Number(d.rider_lat) : null,
          d.rider_lng !== null && d.rider_lng !== undefined ? Number(d.rider_lng) : null,
          declinedJson,
        ]
      );

      if (nextStatus === 'delivered' && riderId && prevDelivery?.status !== 'delivered') {
        await executeSql(
          `UPDATE rider_profiles SET total_deliveries = total_deliveries + 1 WHERE user_id = ?`,
          [riderId]
        );
      }

      if (nextStatus === 'not_home' && prevDelivery?.status !== 'not_home') {
        const ordMeta = await queryOne<{ order_code: string; status: string }>(
          `SELECT order_code, status FROM orders WHERE order_id = ? LIMIT 1`,
          [orderId]
        );
        const nowSql = toMySqlDateTime(new Date());
        const reason = d.failure_reason ? String(d.failure_reason).slice(0, 300) : 'Resident not home upon arrival';
        const code = ordMeta?.order_code || `MDX-${orderId}`;
        await executeSql(
          `INSERT INTO order_status_history (order_id, status, note, created_at)
           VALUES (?, ?, ?, ?)`,
          [orderId, ordMeta?.status || 'out_for_delivery', `Customer Not Home: ${reason}`, nowSql]
        );
        await executeSql(
          `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
           VALUES (?, ?, ?, 'Delivery', 0, ?)`,
          [
            ord.resident_id,
            `Delivery Attempt Failed (${code})`,
            `Your rider marked you Not Home (${reason}). The rider can retry delivery or return the medicines to the pharmacy.`,
            nowSql,
          ]
        );
        await executeSql(
          `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
           VALUES (?, ?, ?, 'Delivery', 0, ?)`,
          [
            ord.merchant_id,
            `Customer Not Home (${code})`,
            `Rider reported an unsuccessful delivery attempt (${reason}). You can confirm return & restock once medicines come back.`,
            nowSql,
          ]
        );
      }

      const saved = await queryOne<{ delivery_id: number }>(
        `SELECT delivery_id FROM deliveries WHERE order_id = ? LIMIT 1`,
        [orderId]
      );
      emitRealtimeSync('full');
      return res.json({ ok: true, deliveryId: saved ? Number(saved.delivery_id) : undefined });
    } catch (err) {
      return sendInternalDbError(res, 'orders.delivery.upsert', err);
    }
  });

  router.post('/orders/:id/delivery/verify-code', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid order ID.' });
    }
    const submittedCode = String((req.body as { code?: string })?.code || '').trim();
    if (!submittedCode) {
      return res.status(400).json({ ok: false, error: 'Confirmation PIN code is required.' });
    }

    try {
      const outcome = await withTransaction(async (conn) => {
        const [ordRows] = await conn.query<RowDataPacket[]>(
          `SELECT order_id, order_code, resident_id, merchant_id, status, delivery_fee FROM orders WHERE order_id = ? FOR UPDATE`,
          [orderId]
        );
        const ord = ordRows[0] as
          | {
              order_id: number;
              order_code: string;
              resident_id: number;
              merchant_id: number;
              status: string;
              delivery_fee: number;
            }
          | undefined;
        if (!ord) throw Object.assign(new Error('Order not found.'), { statusCode: 404 });

        const [delivRows] = await conn.query<RowDataPacket[]>(
          `SELECT delivery_id, rider_id, status, confirmation_code, code_attempts, is_flagged_for_admin
           FROM deliveries WHERE order_id = ? FOR UPDATE`,
          [orderId]
        );
        const deliv = delivRows[0] as
          | {
              delivery_id: number;
              rider_id: number | null;
              status: string;
              confirmation_code: string;
              code_attempts: number;
              is_flagged_for_admin: number;
            }
          | undefined;
        if (!deliv) throw Object.assign(new Error('Delivery record not found.'), { statusCode: 404 });

        const isAssignedRider =
          authUser.role === 'rider' &&
          authUser.status === 'approved' &&
          Number(deliv.rider_id) === authUser.userId;
        if (!authUser.isApprovedAdmin && !isAssignedRider) {
          throw Object.assign(
            new Error('Only the assigned approved rider can verify the delivery confirmation PIN.'),
            { statusCode: 403 }
          );
        }

        if (isAssignedRider) {
          const [riderProfRows] = await conn.query<RowDataPacket[]>(
            `SELECT operational_status FROM rider_profiles WHERE user_id = ? LIMIT 1`,
            [authUser.userId]
          );
          if (riderProfRows[0]?.operational_status === 'suspended') {
            throw Object.assign(
              new Error('Your rider dispatch availability is currently suspended.'),
              { statusCode: 403 }
            );
          }
        }

        if (ord.status === 'delivered' || ord.status === 'cancelled' || deliv.status === 'delivered') {
          throw Object.assign(new Error('Delivery is already finalized.'), { statusCode: 400 });
        }

        const [payRows] = await conn.query<RowDataPacket[]>(
          `SELECT method, status FROM payments WHERE order_id = ? LIMIT 1`,
          [orderId]
        );
        const pay = payRows[0] as { method: string; status: string } | undefined;
        if (pay?.method === 'COD' && pay?.status !== 'collected') {
          throw Object.assign(
            new Error('Record COD cash collection before entering the 4-digit code.'),
            { statusCode: 400 }
          );
        }

        const nowSql = toMySqlDateTime(new Date());
        if (!isSafePinMatch(String(deliv.confirmation_code || ''), submittedCode)) {
          const nextAttempts = Number(deliv.code_attempts || 0) + 1;
          const flagged = nextAttempts >= 3 || Boolean(deliv.is_flagged_for_admin);
          await conn.execute(
            `UPDATE deliveries SET code_attempts = ?, is_flagged_for_admin = ? WHERE delivery_id = ?`,
            [nextAttempts, flagged ? 1 : 0, deliv.delivery_id]
          );
          if (nextAttempts === 3) {
            await conn.execute(
              `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
               SELECT user_id, ?, ?, 'Delivery', 0, ?
               FROM users WHERE role = 'admin' AND status = 'approved'`,
              [
                `3 Failed Delivery Code Attempts (${ord.order_code})`,
                'Rider entered wrong confirmation code 3 times. Flagged for admin review.',
                nowSql,
              ]
            );
          }
          return { matched: false as const, attempts: nextAttempts, flagged };
        }

        await conn.execute(
          `UPDATE deliveries SET status = 'delivered', delivered_at = ? WHERE delivery_id = ?`,
          [nowSql, deliv.delivery_id]
        );
        await conn.execute(`UPDATE orders SET status = 'delivered' WHERE order_id = ?`, [orderId]);
        await conn.execute(
          `INSERT INTO order_status_history (order_id, status, note, created_at)
           VALUES (?, 'delivered', 'Confirmed via 4-digit resident code', ?)`,
          [orderId, nowSql]
        );

        const riderId = Number(deliv.rider_id || authUser.userId);
        const deliveryFee = Number(ord.delivery_fee || AUTHORITATIVE_DELIVERY_FEE);
        await conn.execute(
          `UPDATE rider_profiles
           SET total_deliveries = total_deliveries + 1,
               operational_status = CASE WHEN operational_status = 'suspended' THEN 'suspended' ELSE 'available' END
           WHERE user_id = ?`,
          [riderId]
        );
        await conn.execute(
          `INSERT IGNORE INTO rider_earnings (rider_id, delivery_id, order_code, amount, payout_status, created_at)
           VALUES (?, ?, ?, ?, 'pending', ?)`,
          [riderId, deliv.delivery_id, ord.order_code, deliveryFee, nowSql]
        );

        return {
          matched: true as const,
          attempts: Number(deliv.code_attempts || 0),
          flagged: false,
          deliveryFee,
        };
      });

      emitRealtimeSync('full');
      if (!outcome.matched) {
        return res.status(400).json({
          ok: false,
          error: outcome.flagged
            ? 'Incorrect code (3rd attempt). Delivery flagged for Admin review.'
            : `Incorrect 4-digit code. Attempt ${outcome.attempts} of 3.`,
          attempts: outcome.attempts,
          flagged: outcome.flagged,
        });
      }

      return res.json({
        ok: true,
        attempts: outcome.attempts,
        flagged: false,
        deliveryFee: outcome.deliveryFee,
      });
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode || 500;
      if (statusCode >= 500) {
        return sendInternalDbError(res, 'orders.delivery.verify-code', err);
      }
      return res.status(statusCode).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  router.patch('/orders/:id/payment', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid order ID.' });
    }
    const p = (req.body || {}) as Record<string, unknown>;

    try {
      const existing = await queryOne<{ status: string; method: string }>(
        `SELECT status, method FROM payments WHERE order_id = ? LIMIT 1`,
        [orderId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Payment record not found.' });

      const nextStatus = String(p.status || existing.status);
      if (!['pending', 'paid', 'collected', 'failed'].includes(nextStatus)) {
        return res.status(400).json({ ok: false, error: 'Invalid payment status.' });
      }
      const nextMethod = p.method === 'GCash' ? 'GCash' : 'COD';

      if (!authUser.isApprovedAdmin && nextStatus !== existing.status) {
        if (nextStatus === 'paid') {
          return res.status(403).json({
            ok: false,
            error: 'GCash payment confirmation must be verified by the MedEx payment server.',
          });
        }
        if (nextStatus === 'collected') {
          const deliv = await queryOne<{ rider_id: number | null }>(
            `SELECT rider_id FROM deliveries WHERE order_id = ? LIMIT 1`,
            [orderId]
          );
          if (
            !(
              nextMethod === 'COD' &&
              authUser.role === 'rider' &&
              authUser.status === 'approved' &&
              deliv?.rider_id === authUser.userId
            )
          ) {
            return res.status(403).json({
              ok: false,
              error: 'Only the assigned approved rider can mark a COD payment as collected.',
            });
          }
        }
      }

      await executeSql(
        `UPDATE payments
         SET method = ?, amount_collected = ?, is_flagged = ?, failure_reason = ?, status = ?,
             gateway_reference = ?, is_simulated_sandbox = ?, paid_at = ?
         WHERE order_id = ?`,
        [
          nextMethod,
          p.amount_collected !== null && p.amount_collected !== undefined
            ? Number(p.amount_collected)
            : null,
          p.is_flagged ? 1 : 0,
          p.failure_reason ? String(p.failure_reason).slice(0, 300) : null,
          nextStatus,
          p.gateway_reference ? String(p.gateway_reference).slice(0, 120) : null,
          p.is_simulated_sandbox ? 1 : 0,
          toMySqlDateTime(p.paid_at as string | null),
          orderId,
        ]
      );
      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'orders.payment.update', err);
    }
  });

  // --------------------------------------------------------------------------
  // 8. RIDERS, RATINGS, REVIEWS, REPORTS, ALERTS, ADMIN, NOTIFICATIONS
  // --------------------------------------------------------------------------
  router.post('/riders/profile', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const body = (req.body || {}) as Record<string, unknown>;
    const targetUserId = authUser.isApprovedAdmin && body.userId ? Number(body.userId) : authUser.userId;
    const vehicleType = String(body.vehicle_type || 'Motorcycle').trim();
    const plateCheck = validateAndNormalizePHPlateNumber(String(body.plate_number || ''), vehicleType);
    if (!plateCheck.valid) return res.status(400).json({ ok: false, error: plateCheck.error });

    const rawLicense = String(body.driver_license_url || '').trim();
    const rawReg = String(body.vehicle_registration_url || '').trim();
    let driverLicenseName: string | null = body.driver_license_name
      ? String(body.driver_license_name).slice(0, 255)
      : null;
    let driverLicenseUrl: string | null = null;
    let vehicleRegistrationName: string | null = body.vehicle_registration_name
      ? String(body.vehicle_registration_name).slice(0, 255)
      : null;
    let vehicleRegistrationUrl: string | null = null;

    if (rawLicense.startsWith('data:')) {
      const saved = await saveUploadedDataUrl('rider_doc', 'license', rawLicense);
      if (!saved.ok) return res.status(400).json({ ok: false, error: saved.error });
      driverLicenseUrl = saved.publicOrApiPath;
    } else if (rawLicense && !isSafeImageOrDocUrl(rawLicense)) {
      return res.status(400).json({ ok: false, error: 'Invalid driver license document URL.' });
    } else if (rawLicense) {
      driverLicenseUrl = rawLicense;
    }
    if (rawReg.startsWith('data:')) {
      const saved = await saveUploadedDataUrl('rider_doc', 'vehiclereg', rawReg);
      if (!saved.ok) return res.status(400).json({ ok: false, error: saved.error });
      vehicleRegistrationUrl = saved.publicOrApiPath;
    } else if (rawReg && !isSafeImageOrDocUrl(rawReg)) {
      return res.status(400).json({ ok: false, error: 'Invalid vehicle registration document URL.' });
    } else if (rawReg) {
      vehicleRegistrationUrl = rawReg;
    }

    try {
      await executeSql(
        `INSERT INTO rider_profiles (rider_id, user_id, vehicle_type, plate_number, is_online, rating, total_deliveries, driver_license_name, driver_license_url, vehicle_registration_name, vehicle_registration_url)
         VALUES (?, ?, ?, ?, 0, 5.00, 0, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           vehicle_type = VALUES(vehicle_type),
           plate_number = VALUES(plate_number),
           driver_license_name = COALESCE(VALUES(driver_license_name), driver_license_name),
           driver_license_url = COALESCE(VALUES(driver_license_url), driver_license_url),
           vehicle_registration_name = COALESCE(VALUES(vehicle_registration_name), vehicle_registration_name),
           vehicle_registration_url = COALESCE(VALUES(vehicle_registration_url), vehicle_registration_url)`,
        [
          targetUserId,
          targetUserId,
          vehicleType,
          plateCheck.normalized,
          driverLicenseName,
          driverLicenseUrl,
          vehicleRegistrationName,
          vehicleRegistrationUrl,
        ]
      );
      const saved = await queryOne(`SELECT * FROM rider_profiles WHERE rider_id = ? LIMIT 1`, [
        targetUserId,
      ]);
      emitRealtimeSync('full');
      return res.json({ ok: true, riderProfile: saved });
    } catch (err) {
      return sendInternalDbError(res, 'riders.profile.save', err);
    }
  });

  router.patch('/riders/me/online', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!authUser.isApprovedAdmin && (authUser.role !== 'rider' || authUser.status !== 'approved')) {
      return res.status(403).json({ ok: false, error: 'Approved rider account required.' });
    }
    const isOnline = Boolean((req.body as { is_online?: boolean })?.is_online);
    try {
      const prof = await queryOne<{ operational_status: string | null }>(
        `SELECT operational_status FROM rider_profiles WHERE user_id = ? LIMIT 1`,
        [authUser.userId]
      );
      if (isOnline && prof?.operational_status === 'suspended') {
        return res.status(403).json({
          ok: false,
          error: 'Suspended riders cannot go online until reinstated by Delivery Management.',
        });
      }
      await executeSql(
        `UPDATE rider_profiles
         SET is_online = ?,
             operational_status = CASE
               WHEN operational_status IN ('assigned', 'on_delivery', 'suspended') THEN operational_status
               ELSE ?
             END
         WHERE user_id = ?`,
        [isOnline ? 1 : 0, isOnline ? 'available' : 'inactive', authUser.userId]
      );
      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'riders.me.online', err);
    }
  });

  router.patch('/riders/:id/vehicle', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const riderId = Number(req.params.id);
    if (!authUser.isApprovedAdmin && authUser.userId !== riderId) {
      return res.status(403).json({ ok: false, error: 'Not authorized.' });
    }
    const { vehicle_type, plate_number } = (req.body || {}) as Record<string, string>;
    const plateCheck = validateAndNormalizePHPlateNumber(String(plate_number || ''), vehicle_type);
    if (!plateCheck.valid) return res.status(400).json({ ok: false, error: plateCheck.error });
    try {
      await executeSql(
        `UPDATE rider_profiles SET vehicle_type = ?, plate_number = ? WHERE rider_id = ?`,
        [String(vehicle_type || 'Motorcycle'), plateCheck.normalized, riderId]
      );
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'riders.vehicle.update', err);
    }
  });

  router.post('/riders/earnings', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!authUser.isApprovedAdmin) {
      return res.status(403).json({
        ok: false,
        error: 'Only approved administrators can manually adjust rider earnings.',
      });
    }
    const e = (req.body || {}) as Record<string, unknown>;
    const riderId = Number(e.rider_id);
    const deliveryId = Number(e.delivery_id);
    const amount = Number(e.amount);
    if (!Number.isInteger(riderId) || riderId <= 0 || !Number.isInteger(deliveryId) || deliveryId <= 0) {
      return res.status(400).json({ ok: false, error: 'Valid rider_id and delivery_id are required.' });
    }
    if (!Number.isFinite(amount) || amount < 0 || amount > 50000) {
      return res.status(400).json({ ok: false, error: 'Invalid earning amount.' });
    }
    try {
      const deliv = await queryOne<{ delivery_id: number }>(
        `SELECT delivery_id FROM deliveries WHERE delivery_id = ? LIMIT 1`,
        [deliveryId]
      );
      if (!deliv) return res.status(404).json({ ok: false, error: 'Referenced delivery not found.' });
      await executeSql(
        `INSERT INTO rider_earnings (rider_id, delivery_id, order_code, amount, payout_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE amount = VALUES(amount), payout_status = VALUES(payout_status)`,
        [
          riderId,
          deliveryId,
          String(e.order_code || '').slice(0, 40),
          amount,
          e.payout_status === 'paid' ? 'paid' : 'pending',
          toMySqlDateTime(String(e.created_at || '')) || toMySqlDateTime(new Date()),
        ]
      );
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'riders.earnings.upsert', err);
    }
  });

  router.post('/ratings/delivery', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const r = (req.body || {}) as Record<string, unknown>;
    const orderId = Number(r.order_id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ ok: false, error: 'Valid order ID is required.' });
    }
    const stars = Number(r.stars);
    const comment = String(r.comment || '');
    const ratingCheck = validateRiderRatingInput({ stars, comment });
    if (!ratingCheck.valid) {
      return res.status(400).json({ ok: false, error: ratingCheck.error || 'Invalid rider rating.' });
    }
    const tags = Array.isArray(r.tags) ? r.tags.map((t) => String(t).slice(0, 60)).slice(0, 10) : [];

    try {
      const ord = await queryOne<{ resident_id: number; status: string }>(
        `SELECT resident_id, status FROM orders WHERE order_id = ? LIMIT 1`,
        [orderId]
      );
      if (
        !authUser.isApprovedAdmin &&
        (!ord || ord.resident_id !== authUser.userId || ord.status !== 'delivered')
      ) {
        return res.status(403).json({
          ok: false,
          error: 'Only delivered orders can be rated by the ordering resident.',
        });
      }

      const deliv = await queryOne<{ delivery_id: number; rider_id: number | null; status: string }>(
        `SELECT delivery_id, rider_id, status FROM deliveries WHERE order_id = ? LIMIT 1`,
        [orderId]
      );
      if (!deliv || !deliv.rider_id || deliv.status !== 'delivered') {
        return res.status(400).json({ ok: false, error: 'Delivered courier record not found for order.' });
      }
      const riderId = Number(deliv.rider_id);
      const deliveryId = Number(deliv.delivery_id);

      await executeSql(
        `INSERT INTO delivery_ratings (delivery_id, order_id, resident_id, rider_id, stars, tags, comment, is_anonymous, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE stars = VALUES(stars), tags = VALUES(tags), comment = VALUES(comment), is_anonymous = VALUES(is_anonymous)`,
        [
          deliveryId,
          orderId,
          authUser.userId,
          riderId,
          Math.min(5, Math.max(1, Math.round(stars))),
          JSON.stringify(tags),
          comment.trim().slice(0, 500),
          r.is_anonymous ? 1 : 0,
          toMySqlDateTime(String(r.created_at || '')) || toMySqlDateTime(new Date()),
        ]
      );

      await executeSql(
        `UPDATE rider_profiles
         SET rating = COALESCE((SELECT ROUND(AVG(stars), 2) FROM delivery_ratings WHERE rider_id = ?), 5.00)
         WHERE user_id = ?`,
        [riderId, riderId]
      );

      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'ratings.delivery.create', err);
    }
  });

  router.post('/reviews/pharmacy', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const rev = (req.body || {}) as Record<string, unknown>;
    const orderId = Number(rev.order_id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ ok: false, error: 'Valid order ID is required.' });
    }
    const rating = Number(rev.rating);
    const tags = Array.isArray(rev.tags) ? rev.tags.map((t) => String(t).slice(0, 60)).slice(0, 10) : [];
    const comment = String(rev.comment || '');
    const revCheck = validateStoreReviewInput({ stars: rating, tags, comment });
    if (!revCheck.valid) {
      return res.status(400).json({ ok: false, error: revCheck.error || 'Invalid pharmacy review.' });
    }

    try {
      const ord = await queryOne<{ resident_id: number; merchant_id: number; status: string }>(
        `SELECT resident_id, merchant_id, status FROM orders WHERE order_id = ? LIMIT 1`,
        [orderId]
      );
      if (
        !authUser.isApprovedAdmin &&
        (!ord || ord.resident_id !== authUser.userId || ord.status !== 'delivered')
      ) {
        return res.status(403).json({
          ok: false,
          error: 'Only delivered orders can be reviewed by the ordering resident.',
        });
      }

      const nowSql = toMySqlDateTime(new Date());
      await executeSql(
        `INSERT INTO pharmacy_reviews (order_id, resident_id, merchant_id, rating, tags, comment, is_anonymous, status, idempotency_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'visible', ?, ?, ?)
         ON DUPLICATE KEY UPDATE rating = VALUES(rating), tags = VALUES(tags), comment = VALUES(comment), is_anonymous = VALUES(is_anonymous), updated_at = VALUES(updated_at)`,
        [
          orderId,
          ord ? Number(ord.resident_id) : authUser.userId,
          Number(ord?.merchant_id || rev.merchant_id),
          Math.min(5, Math.max(1, Math.round(rating))),
          JSON.stringify(tags),
          comment.trim().slice(0, 500),
          rev.is_anonymous ? 1 : 0,
          String(rev.idempotency_key || `rev-${orderId}-${Date.now()}`).slice(0, 100),
          nowSql,
          nowSql,
        ]
      );
      const saved = await queryOne(`SELECT * FROM pharmacy_reviews WHERE order_id = ? LIMIT 1`, [orderId]);
      emitRealtimeSync('full');
      return res.status(201).json({ ok: true, review: saved });
    } catch (err) {
      return sendInternalDbError(res, 'reviews.pharmacy.create', err);
    }
  });

  router.put('/reviews/pharmacy/:id', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const reviewId = Number(req.params.id);
    if (!Number.isInteger(reviewId) || reviewId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid review ID.' });
    }
    const rev = (req.body || {}) as Record<string, unknown>;
    try {
      const existing = await queryOne<{
        resident_id: number;
        merchant_id: number;
        status: string;
        created_at: string;
      }>(
        `SELECT resident_id, merchant_id, status, created_at FROM pharmacy_reviews WHERE review_id = ? LIMIT 1`,
        [reviewId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Review not found.' });

      const canModerate = authUser.isApprovedAdmin || userHasPerm(authUser, 'feedback:moderate');
      const isResidentOwner = Number(existing.resident_id) === authUser.userId;
      const isStoreOwner = Number(existing.merchant_id) === authUser.userId && authUser.status === 'approved';
      if (!canModerate && !isResidentOwner && !isStoreOwner) {
        return res.status(403).json({ ok: false, error: 'Not authorized.' });
      }

      const nowSql = toMySqlDateTime(new Date());
      if (canModerate) {
        const nextStatus = rev.status === 'hidden' ? 'hidden' : 'visible';
        await executeSql(
          `UPDATE pharmacy_reviews
           SET status = ?, moderation_reason = ?, moderated_by = ?, moderated_at = ?, updated_at = ?
           WHERE review_id = ?`,
          [
            nextStatus,
            rev.moderation_reason ? String(rev.moderation_reason).slice(0, 300) : null,
            nextStatus === 'hidden' ? authUser.userId : null,
            nextStatus === 'hidden' ? nowSql : null,
            nowSql,
            reviewId,
          ]
        );
      } else if (isStoreOwner && !isResidentOwner) {
        const reply = String(rev.merchant_reply || '').trim();
        const replyCheck = validateCommentPrivacy(reply, 500);
        if (!replyCheck.valid) {
          return res.status(400).json({ ok: false, error: replyCheck.error || 'Invalid pharmacy reply.' });
        }
        await executeSql(
          `UPDATE pharmacy_reviews SET merchant_reply = ?, replied_at = ?, updated_at = ? WHERE review_id = ?`,
          [reply, nowSql, nowSql, reviewId]
        );
      } else {
        if (existing.status === 'hidden') {
          return res.status(403).json({ ok: false, error: 'Hidden reviews cannot be edited.' });
        }
        if (!canEditPharmacyReview(existing.created_at)) {
          return res.status(400).json({
            ok: false,
            error: 'Reviews can only be edited within 24 hours of posting.',
          });
        }
        const rating = Number(rev.rating);
        const tags = Array.isArray(rev.tags) ? rev.tags.map((t) => String(t).slice(0, 60)).slice(0, 10) : [];
        const comment = String(rev.comment || '');
        const revCheck = validateStoreReviewInput({ stars: rating, tags, comment });
        if (!revCheck.valid) {
          return res.status(400).json({ ok: false, error: revCheck.error || 'Invalid review input.' });
        }
        await executeSql(
          `UPDATE pharmacy_reviews
           SET rating = ?, tags = ?, comment = ?, is_anonymous = ?, updated_at = ?
           WHERE review_id = ?`,
          [
            Math.min(5, Math.max(1, Math.round(rating))),
            JSON.stringify(tags),
            comment.trim().slice(0, 500),
            rev.is_anonymous ? 1 : 0,
            nowSql,
            reviewId,
          ]
        );
      }

      const saved = await queryOne(`SELECT * FROM pharmacy_reviews WHERE review_id = ? LIMIT 1`, [
        reviewId,
      ]);
      emitRealtimeSync('full');
      return res.json({ ok: true, review: saved });
    } catch (err) {
      return sendInternalDbError(res, 'reviews.pharmacy.update', err);
    }
  });

  router.post('/reports', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const report = (req.body || {}) as Record<string, unknown>;
    const description = String(report.description || '').trim();
    if (!description) {
      return res.status(400).json({ ok: false, error: 'Report description is required.' });
    }
    const privacyCheck = validateCommentPrivacy(description, 1000);
    if (!privacyCheck.valid) {
      return res.status(400).json({ ok: false, error: privacyCheck.error || 'Invalid report description.' });
    }
    const nowSql = toMySqlDateTime(new Date());

    try {
      let merchantId: number | null = report.merchant_id ? Number(report.merchant_id) : null;
      const orderId: number | null = report.order_id ? Number(report.order_id) : null;
      if (orderId) {
        const ord = await queryOne<{ resident_id: number; merchant_id: number }>(
          `SELECT resident_id, merchant_id FROM orders WHERE order_id = ? LIMIT 1`,
          [orderId]
        );
        if (!ord) return res.status(404).json({ ok: false, error: 'Referenced order not found.' });
        if (
          !authUser.isApprovedAdmin &&
          Number(ord.resident_id) !== authUser.userId &&
          Number(ord.merchant_id) !== authUser.userId
        ) {
          return res.status(403).json({ ok: false, error: 'Not authorized to report this order.' });
        }
        if (!merchantId) merchantId = Number(ord.merchant_id);
      }

      const reportId = await withTransaction(async (conn) => {
        const [ins] = await conn.execute<ResultSetHeader>(
          `INSERT INTO problem_reports (reference_code, idempotency_key, user_id, source, order_id, merchant_id, product_id, search_id, category_code, category_label, description, is_anonymous, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
          [
            String(report.reference_code || `RPT-${Date.now()}`).slice(0, 40),
            String(report.idempotency_key || `rpt-${authUser.userId}-${Date.now()}`).slice(0, 100),
            authUser.userId,
            ['order', 'locator', 'app'].includes(String(report.source)) ? String(report.source) : 'app',
            orderId,
            merchantId,
            report.product_id ? Number(report.product_id) : null,
            report.search_id ? String(report.search_id).slice(0, 80) : null,
            String(report.category_code || 'other').slice(0, 60),
            String(report.category_label || 'Other').slice(0, 120),
            description,
            report.is_anonymous ? 1 : 0,
            nowSql,
            nowSql,
          ]
        );
        const newId = Number(ins.insertId);
        const hist = Array.isArray(report.status_history)
          ? (report.status_history[0] as Record<string, unknown> | undefined)
          : undefined;
        await conn.execute(
          `INSERT INTO problem_report_status_history (report_id, status, changed_by_id, changed_by_name, changed_by_role, note, created_at)
           VALUES (?, 'open', ?, ?, ?, ?, ?)`,
          [
            newId,
            authUser.userId,
            String(hist?.changed_by_name || `${authUser.firstName} ${authUser.lastName}`).slice(0, 120),
            authUser.role,
            hist?.note ? String(hist.note).slice(0, 500) : null,
            nowSql,
          ]
        );
        return newId;
      });

      if (report.source === 'app') {
        await notifyApprovedAdmins(
          `New App Feedback ${String(report.reference_code || '').slice(0, 40)}`,
          `${String(report.category_label || 'Feedback').slice(0, 80)} submitted.`,
          'Feedback'
        );
      }
      emitRealtimeSync('full');
      return res.status(201).json({ ok: true, reportId });
    } catch (err) {
      return sendInternalDbError(res, 'reports.create', err);
    }
  });

  router.patch('/reports/:id/status', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid report ID.' });
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const nowSql = toMySqlDateTime(String(body.updatedAt || '')) || toMySqlDateTime(new Date());
    const nextStatus = String(body.status || 'acknowledged');

    if (body.resolutionNote) {
      const check = validateCommentPrivacy(String(body.resolutionNote), 800);
      if (!check.valid) return res.status(400).json({ ok: false, error: check.error || 'Invalid resolution note.' });
    }
    if (body.note) {
      const check = validateCommentPrivacy(String(body.note), 500);
      if (!check.valid) return res.status(400).json({ ok: false, error: check.error || 'Invalid status note.' });
    }

    try {
      const existing = await queryOne<{
        user_id: number;
        merchant_id: number | null;
        status: string;
        store_responded_at: string | null;
      }>(
        `SELECT user_id, merchant_id, status, store_responded_at FROM problem_reports WHERE report_id = ? LIMIT 1`,
        [reportId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Report not found.' });
      const canManageCs = userHasPerm(authUser, 'complaints:manage_cs');
      const isStoreOwner = existing.merchant_id === authUser.userId && authUser.status === 'approved';
      const allowed = authUser.isApprovedAdmin || canManageCs || isStoreOwner;
      if (!allowed) return res.status(403).json({ ok: false, error: 'Not authorized.' });

      const transition = validateReportStatusTransition(existing.status, nextStatus, authUser.role, {
        canManageCustomerService: canManageCs,
        isStoreOwner,
      });
      if (!transition.allowed) {
        return res.status(400).json({ ok: false, error: transition.reason || 'Invalid status transition.' });
      }

      const adminNotesVal =
        authUser.isApprovedAdmin && body.adminNotes !== undefined ? String(body.adminNotes).slice(0, 1000) : null;
      const csNotesVal =
        (authUser.isApprovedAdmin || canManageCs) && body.csNotes !== undefined
          ? String(body.csNotes).slice(0, 1000)
          : null;
      const categoryTagVal =
        (authUser.isApprovedAdmin || canManageCs) && body.categoryTag !== undefined
          ? String(body.categoryTag).slice(0, 80)
          : null;

      await withTransaction(async (conn) => {
        await conn.execute(
          `UPDATE problem_reports
           SET status = ?,
               resolution_note = COALESCE(?, resolution_note),
               resolved_at = COALESCE(?, resolved_at),
               admin_notes = COALESCE(?, admin_notes),
               cs_notes = COALESCE(?, cs_notes),
               category_tag = COALESCE(?, category_tag),
               store_responded_at = COALESCE(?, store_responded_at),
               updated_at = ?
           WHERE report_id = ?`,
          [
            nextStatus,
            body.resolutionNote ? String(body.resolutionNote).trim().slice(0, 800) : null,
            toMySqlDateTime(body.resolvedAt as string | null),
            adminNotesVal,
            csNotesVal,
            categoryTagVal,
            isStoreOwner && !existing.store_responded_at ? nowSql : null,
            nowSql,
            reportId,
          ]
        );
        await conn.execute(
          `INSERT INTO problem_report_status_history (report_id, status, changed_by_id, changed_by_name, changed_by_role, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            reportId,
            nextStatus,
            authUser.userId,
            `${authUser.firstName} ${authUser.lastName}`,
            authUser.role,
            body.note ? String(body.note).trim().slice(0, 500) : null,
            nowSql,
          ]
        );
      });
      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'reports.status.update', err);
    }
  });

  router.post('/reports/:id/escalate', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid report ID.' });
    }
    const reason = String((req.body as { reason?: string })?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ ok: false, error: 'Please explain why you are escalating this report to Customer Service.' });
    }
    const reasonCheck = validateCommentPrivacy(reason, 600);
    if (!reasonCheck.valid) {
      return res.status(400).json({ ok: false, error: reasonCheck.error || 'Invalid escalation reason.' });
    }
    try {
      const existing = await queryOne<{ user_id: number; status: string; reference_code: string }>(
        `SELECT user_id, status, reference_code FROM problem_reports WHERE report_id = ? LIMIT 1`,
        [reportId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Report not found.' });
      const check = canEscalateProblemReportToCS(
        { user_id: Number(existing.user_id), status: existing.status as 'open' },
        authUser.userId,
        authUser.role
      );
      if (!check.ok) {
        return res.status(403).json({ ok: false, error: check.error });
      }
      const nowSql = toMySqlDateTime(new Date());
      await withTransaction(async (conn) => {
        await conn.execute(
          `UPDATE problem_reports
           SET status = 'escalated', escalated_at = ?, escalated_by_id = ?, escalated_reason = ?, updated_at = ?
           WHERE report_id = ?`,
          [nowSql, authUser.userId, reason, nowSql, reportId]
        );
        await conn.execute(
          `INSERT INTO problem_report_status_history (report_id, status, changed_by_id, changed_by_name, changed_by_role, note, created_at)
           VALUES (?, 'escalated', ?, ?, ?, ?, ?)`,
          [
            reportId,
            authUser.userId,
            `${authUser.firstName} ${authUser.lastName}`,
            authUser.role,
            `Escalated to Customer Service: ${reason}`,
            nowSql,
          ]
        );
        await conn.execute(
          `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
           SELECT user_id, ?, ?, 'Feedback', 0, ?
           FROM users WHERE role IN ('customer_service', 'admin') AND status = 'approved'`,
          [
            `Escalated Complaint ${existing.reference_code}`,
            `Customer escalated ticket ${existing.reference_code} to Customer Service: ${reason}`,
            nowSql,
          ]
        );
      });
      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'reports.escalate', err);
    }
  });

  router.post('/alerts', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const alert = (req.body || {}) as Record<string, unknown>;
    const nowSql = toMySqlDateTime(String(alert.created_at || '')) || toMySqlDateTime(new Date());
    const addressId = Number(alert.address_id);
    const lat = Number(alert.latitude);
    const lng = Number(alert.longitude);
    const nextStatus = String(alert.status || 'submitted');
    if (!['submitted', 'queued_offline', 'cancelled'].includes(nextStatus)) {
      return res.status(400).json({ ok: false, error: 'Invalid emergency alert status.' });
    }
    const coordCheck = validateOlongapoCoordinates(lat, lng);
    if (!coordCheck.valid) {
      return res.status(400).json({ ok: false, error: coordCheck.error || 'Alert coordinates must be within Olongapo City.' });
    }

    try {
      if (Number.isInteger(addressId) && addressId > 0 && !authUser.isApprovedAdmin) {
        const addr = await queryOne<{ user_id: number }>(
          `SELECT user_id FROM addresses WHERE address_id = ? LIMIT 1`,
          [addressId]
        );
        if (!addr || Number(addr.user_id) !== authUser.userId) {
          return res.status(403).json({ ok: false, error: 'Selected emergency address does not belong to you.' });
        }
      }

      await executeSql(
        `INSERT INTO emergency_alerts (reference_code, idempotency_key, user_id, category, handoff_mode, address_id, address_snapshot, barangay_name, latitude, longitude, status, created_at, cancelled_at)
         VALUES (?, ?, ?, '911_general', ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), handoff_mode = VALUES(handoff_mode), cancelled_at = VALUES(cancelled_at)`,
        [
          String(alert.reference_code || `EMG-${Date.now()}`).slice(0, 40),
          String(alert.idempotency_key || `emg-${authUser.userId}-${Date.now()}`).slice(0, 100),
          authUser.userId,
          alert.handoff_mode ? String(alert.handoff_mode).slice(0, 40) : null,
          addressId,
          String(alert.address_snapshot || '').slice(0, 500),
          String(alert.barangay_name || '').slice(0, 120),
          lat,
          lng,
          nextStatus,
          nowSql,
          toMySqlDateTime(alert.cancelled_at as string | null),
        ]
      );
      const saved = await queryOne<{ alert_id: number }>(
        `SELECT alert_id FROM emergency_alerts WHERE idempotency_key = ? LIMIT 1`,
        [String(alert.idempotency_key)]
      );
      if (nextStatus === 'submitted') {
        await notifyApprovedAdmins(
          'New 911 Emergency SOS Alert',
          `Alert ${String(alert.reference_code || '').slice(0, 40)} triggered from Brgy. ${String(alert.barangay_name || '').slice(0, 80)}.`,
          'Alert'
        );
      }
      emitRealtimeSync('full');
      return res.status(201).json({ ok: true, alertId: saved ? Number(saved.alert_id) : undefined });
    } catch (err) {
      return sendInternalDbError(res, 'alerts.create', err);
    }
  });

  router.patch('/alerts/:id', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const alertId = Number(req.params.id);
    if (!Number.isInteger(alertId) || alertId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid alert ID.' });
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const nextStatus = String(body.status || 'cancelled');
    if (!['submitted', 'cancelled', 'queued_offline'].includes(nextStatus)) {
      return res.status(400).json({ ok: false, error: 'Invalid emergency alert status.' });
    }
    try {
      const existing = await queryOne<{ user_id: number }>(
        `SELECT user_id FROM emergency_alerts WHERE alert_id = ? LIMIT 1`,
        [alertId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Alert not found.' });
      if (!authUser.isApprovedAdmin && existing.user_id !== authUser.userId) {
        return res.status(403).json({ ok: false, error: 'Not authorized.' });
      }
      await executeSql(
        `UPDATE emergency_alerts SET status = ?, cancelled_at = ? WHERE alert_id = ?`,
        [nextStatus, toMySqlDateTime(body.cancelled_at as string | null), alertId]
      );
      emitRealtimeSync('full');
      return res.json({ ok: true, alertId });
    } catch (err) {
      return sendInternalDbError(res, 'alerts.update', err);
    }
  });

  router.post('/alerts/:id/verify', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!authUser.isApprovedAdmin) {
      return res.status(403).json({ ok: false, error: 'Admin access required.' });
    }
    const alertId = Number(req.params.id);
    if (!Number.isInteger(alertId) || alertId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid alert ID.' });
    }
    const { decision, verifierName, notes } = (req.body || {}) as Record<string, string>;
    const cleanDecision = decision || 'genuine';
    if (!['genuine', 'false_alarm', 'accidental_press'].includes(cleanDecision)) {
      return res.status(400).json({ ok: false, error: 'Invalid verification decision.' });
    }
    try {
      await withTransaction(async (conn) => {
        await conn.execute(`UPDATE emergency_alerts SET status = 'verified' WHERE alert_id = ?`, [
          alertId,
        ]);
        await conn.execute(
          `INSERT INTO alert_verifications (alert_id, decision, verified_by_id, verified_by_name, notes, verified_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE decision = VALUES(decision), notes = VALUES(notes), verified_at = VALUES(verified_at)`,
          [
            alertId,
            cleanDecision,
            authUser.userId,
            (verifierName || `${authUser.firstName} ${authUser.lastName}`).slice(0, 120),
            (notes || '').slice(0, 500),
            toMySqlDateTime(new Date()),
          ]
        );
      });
      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'alerts.verify', err);
    }
  });

  router.patch('/admin/users/:id/status', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!authUser.isApprovedAdmin) {
      return res.status(403).json({ ok: false, error: 'Only approved administrators can change account status.' });
    }
    const targetUserId = Number(req.params.id);
    const { status, reason, documentsVerified } = (req.body || {}) as {
      status?: string;
      reason?: string;
      documentsVerified?: boolean;
    };
    if (!['pending', 'approved', 'rejected', 'suspended'].includes(String(status))) {
      return res.status(400).json({ ok: false, error: 'Invalid account status.' });
    }
    try {
      const targetUser = await queryOne<{ role: string }>(
        `SELECT role FROM users WHERE user_id = ? LIMIT 1`,
        [targetUserId]
      );
      if (targetUser?.role === 'merchant' && status === 'approved') {
        if (documentsVerified === false) {
          return res.status(400).json({
            ok: false,
            error:
              'Admin must confirm Business Permit and Government-Issued ID verification before approving a merchant.',
          });
        }
        await executeSql(
          `UPDATE merchant_profiles SET documents_verified_at = ?, documents_verified_by = ? WHERE user_id = ?`,
          [toMySqlDateTime(new Date()), authUser.userId, targetUserId]
        );
      }

      if (targetUser?.role === 'rider' && status === 'approved') {
        if (documentsVerified === false) {
          return res.status(400).json({
            ok: false,
            error:
              "Admin must confirm Driver's License ID and Vehicle Registration Document verification before approving a rider.",
          });
        }
        await executeSql(
          `UPDATE rider_profiles SET documents_verified_at = ?, documents_verified_by = ? WHERE user_id = ?`,
          [toMySqlDateTime(new Date()), authUser.userId, targetUserId]
        );
      }

      await executeSql(`UPDATE users SET status = ?, status_reason = ? WHERE user_id = ?`, [
        status,
        reason ? String(reason).slice(0, 300) : null,
        targetUserId,
      ]);
      if (status !== 'approved') {
        invalidateUserTokens(targetUserId);
      }
      emitRealtimeSync('inventory');
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'admin.users.status', err);
    }
  });

  router.patch('/admin/users/:id/role', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!authUser.isApprovedAdmin) {
      return res.status(403).json({ ok: false, error: 'Only approved administrators can change account roles.' });
    }
    const targetUserId = Number(req.params.id);
    const { role } = (req.body || {}) as { role?: string };
    const allowedRoles: UserRole[] = [
      'resident',
      'merchant',
      'rider',
      'admin',
      'delivery_manager',
      'coupon_handler',
      'inventory_manager',
      'customer_service',
    ];
    if (!allowedRoles.includes(String(role) as UserRole)) {
      return res.status(400).json({ ok: false, error: 'Invalid account role.' });
    }
    try {
      await executeSql(`UPDATE users SET role = ? WHERE user_id = ?`, [role, targetUserId]);
      invalidateUserTokens(targetUserId);
      emitRealtimeSync('inventory');
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'admin.users.role', err);
    }
  });

  // --------------------------------------------------------------------------
  // 9. ADMIN INTERNAL DEPARTMENT ACCOUNTS & PERMISSION OVERRIDES
  // --------------------------------------------------------------------------
  router.post('/admin/internal-accounts', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!userHasPerm(authUser, 'internal_accounts:create')) {
      return res.status(403).json({ ok: false, error: 'Only Global Admin can create internal department accounts.' });
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const role = String(body.role || '').trim();
    if (!canAdminCreateRole(authUser, role)) {
      return res.status(400).json({
        ok: false,
        error: 'Internal role must be delivery_manager, coupon_handler, inventory_manager, or customer_service.',
      });
    }

    const firstCheck = validatePersonName(String(body.first_name || ''), 'First Name');
    if (!firstCheck.valid) return res.status(400).json({ ok: false, error: firstCheck.error });
    const lastCheck = validatePersonName(String(body.last_name || ''), 'Last Name');
    if (!lastCheck.valid) return res.status(400).json({ ok: false, error: lastCheck.error });

    const cleanEmail = String(body.email || '').trim().toLowerCase();
    const emailCheck = validateSignInEmail(cleanEmail, { isAdminAccount: true });
    if (!emailCheck.valid) return res.status(400).json({ ok: false, error: emailCheck.error });

    const pwCheck = validatePasswordStrength(String(body.password || ''));
    if (!pwCheck.valid) return res.status(400).json({ ok: false, error: pwCheck.error });

    const phone = normalizePHPhoneNumber(String(body.phone_number || ''));
    if (!phone) {
      return res.status(400).json({ ok: false, error: 'Enter a valid Philippine mobile number.' });
    }

    const dob = String(body.date_of_birth || '1992-01-01').slice(0, 10);
    if (!isAtLeast18(dob)) {
      return res.status(400).json({ ok: false, error: 'Staff accounts must be at least 18 years old.' });
    }

    const grantList = Array.isArray(body.grant_permissions) ? body.grant_permissions.map(String) : [];
    const departmentLabel = body.department_label ? String(body.department_label).trim() : role;
    const nowSql = toMySqlDateTime(new Date());

    try {
      const created = await withTransaction(async (conn) => {
        const [ins] = await conn.execute<ResultSetHeader>(
          `INSERT INTO users (role, phone_number, email, password_hash, first_name, last_name, date_of_birth, status, created_by_admin_id, department_label, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)`,
          [
            role,
            phone,
            cleanEmail,
            hashPassword(String(body.password)),
            firstCheck.normalized,
            lastCheck.normalized,
            dob,
            authUser.userId,
            departmentLabel,
            nowSql,
          ]
        );
        const newId = Number(ins.insertId);
        for (const permCode of grantList) {
          await conn.execute(
            `INSERT INTO user_permission_overrides (user_id, permission_code, effect, granted_by_admin_id, created_at)
             VALUES (?, ?, 'grant', ?, ?)
             ON DUPLICATE KEY UPDATE effect = 'grant', granted_by_admin_id = VALUES(granted_by_admin_id)`,
            [newId, permCode, authUser.userId, nowSql]
          );
        }
        await conn.execute(
          `INSERT INTO audit_logs (user_id, actor_name, action, entity, entity_id, before_after, created_at)
           VALUES (?, ?, 'CREATE_INTERNAL_ACCOUNT', 'user', ?, ?, ?)`,
          [
            authUser.userId,
            `${authUser.firstName} ${authUser.lastName}`,
            String(newId),
            `Created internal ${role} account for ${cleanEmail}`,
            nowSql,
          ]
        );
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT ${SAFE_USER_COLS} FROM users WHERE user_id = ? LIMIT 1`,
          [newId]
        );
        return { ...(rows[0] as Record<string, unknown>), permission_overrides: { grant: grantList, revoke: [] } };
      });
      emitRealtimeSync('full');
      return res.status(201).json({ ok: true, user: created });
    } catch (err) {
      const e = getMySqlErrorCode(err);
      if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
        return res.status(409).json({ ok: false, error: 'Email or phone number is already registered.' });
      }
      return sendInternalDbError(res, 'admin.internal-accounts.create', err);
    }
  });

  router.patch('/admin/internal-accounts/:id/permissions', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!userHasPerm(authUser, 'internal_accounts:manage_permissions')) {
      return res.status(403).json({ ok: false, error: 'Global Admin permission required.' });
    }
    const targetId = Number(req.params.id);
    const body = (req.body || {}) as { grant?: string[]; revoke?: string[] };
    const grants = Array.isArray(body.grant) ? body.grant.map(String) : [];
    const revokes = Array.isArray(body.revoke) ? body.revoke.map(String) : [];
    const nowSql = toMySqlDateTime(new Date());

    try {
      await withTransaction(async (conn) => {
        await conn.execute(`DELETE FROM user_permission_overrides WHERE user_id = ?`, [targetId]);
        for (const p of grants) {
          await conn.execute(
            `INSERT INTO user_permission_overrides (user_id, permission_code, effect, granted_by_admin_id, created_at)
             VALUES (?, ?, 'grant', ?, ?)`,
            [targetId, p, authUser.userId, nowSql]
          );
        }
        for (const p of revokes) {
          await conn.execute(
            `INSERT INTO user_permission_overrides (user_id, permission_code, effect, granted_by_admin_id, created_at)
             VALUES (?, ?, 'revoke', ?, ?)`,
            [targetId, p, authUser.userId, nowSql]
          );
        }
        await conn.execute(
          `INSERT INTO audit_logs (user_id, actor_name, action, entity, entity_id, before_after, created_at)
           VALUES (?, ?, 'UPDATE_PERMISSIONS', 'user', ?, ?, ?)`,
          [
            authUser.userId,
            `${authUser.firstName} ${authUser.lastName}`,
            String(targetId),
            `grants=[${grants.join(',')}], revokes=[${revokes.join(',')}]`,
            nowSql,
          ]
        );
      });
      invalidateUserTokens(targetId);
      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'admin.internal-accounts.permissions', err);
    }
  });

  // --------------------------------------------------------------------------
  // 10. DELIVERY MANAGEMENT & RIDER OPERATIONS
  // --------------------------------------------------------------------------
  router.post('/delivery-management/deliveries/:orderId/assign', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!userHasPerm(authUser, 'deliveries:assign_rider')) {
      return res.status(403).json({ ok: false, error: 'Delivery Management permission required to assign riders.' });
    }
    const orderId = Number(req.params.orderId);
    const riderId = Number((req.body as { riderId?: number })?.riderId);
    if (!Number.isInteger(riderId) || riderId <= 0) {
      return res.status(400).json({ ok: false, error: 'A valid rider ID is required.' });
    }

    try {
      await withTransaction(async (conn) => {
        const [ordRows] = await conn.query<RowDataPacket[]>(
          `SELECT order_id, order_code, merchant_id, status FROM orders WHERE order_id = ? LIMIT 1`,
          [orderId]
        );
        const ord = ordRows[0];
        if (!ord) throw Object.assign(new Error('Order not found.'), { statusCode: 404 });
        if (ord.status === 'delivered' || ord.status === 'cancelled') {
          throw Object.assign(new Error('Finalized orders cannot be assigned.'), { statusCode: 400 });
        }

        const [riderRows] = await conn.query<RowDataPacket[]>(
          `SELECT u.user_id, u.status, u.first_name, u.last_name, rp.operational_status
           FROM users u
           JOIN rider_profiles rp ON rp.user_id = u.user_id
           WHERE u.user_id = ? AND u.role = 'rider' LIMIT 1`,
          [riderId]
        );
        const rider = riderRows[0];
        if (!rider) throw Object.assign(new Error('Rider profile not found.'), { statusCode: 404 });
        if (rider.status !== 'approved' || rider.operational_status === 'suspended' || rider.operational_status === 'inactive') {
          throw Object.assign(
            new Error('Rider is not eligible for assignment (must be approved and active/available).'),
            { statusCode: 400 }
          );
        }

        const nowSql = toMySqlDateTime(new Date());
        const [existingDeliv] = await conn.query<RowDataPacket[]>(
          `SELECT delivery_id, confirmation_code FROM deliveries WHERE order_id = ? LIMIT 1`,
          [orderId]
        );
        const code = existingDeliv[0]?.confirmation_code
          ? String(existingDeliv[0].confirmation_code)
          : String(Math.floor(1000 + Math.random() * 9000));

        await conn.execute(
          `INSERT INTO deliveries (order_id, rider_id, pickup_merchant_id, status, assigned_at, requested_at, confirmation_code, code_attempts, is_flagged_for_admin, declined_by_rider_ids)
           VALUES (?, ?, ?, 'assigned', ?, ?, ?, 0, 0, '[]')
           ON DUPLICATE KEY UPDATE rider_id = VALUES(rider_id), status = 'assigned', assigned_at = VALUES(assigned_at)`,
          [orderId, riderId, Number(ord.merchant_id), nowSql, nowSql, code]
        );

        await conn.execute(
          `UPDATE rider_profiles SET operational_status = 'assigned', is_online = 1 WHERE user_id = ?`,
          [riderId]
        );
        await conn.execute(
          `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
           VALUES (?, ?, ?, 'Delivery', 0, ?)`,
          [
            riderId,
            `Delivery Assigned: ${String(ord.order_code)}`,
            `Delivery Management assigned you to ${String(ord.order_code)}. Proceed to pharmacy pickup.`,
            nowSql,
          ]
        );
        await conn.execute(
          `INSERT INTO audit_logs (user_id, actor_name, action, entity, entity_id, before_after, created_at)
           VALUES (?, ?, 'ASSIGN_RIDER', 'delivery', ?, ?, ?)`,
          [
            authUser.userId,
            `${authUser.firstName} ${authUser.lastName}`,
            String(orderId),
            `Assigned rider #${riderId} (${rider.first_name} ${rider.last_name})`,
            nowSql,
          ]
        );
      });
      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode || 500;
      if (statusCode >= 500) {
        return sendInternalDbError(res, 'delivery-management.assign', err);
      }
      return res.status(statusCode).json({ ok: false, error: getMySqlErrorCode(err).message });
    }
  });

  router.patch('/delivery-management/riders/:riderId/operational-status', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!userHasPerm(authUser, 'riders:manage_operational_status')) {
      return res.status(403).json({ ok: false, error: 'Delivery Management permission required.' });
    }
    const riderId = Number(req.params.riderId);
    const { operationalStatus, reason } = (req.body || {}) as {
      operationalStatus?: RiderOperationalStatus;
      reason?: string;
    };
    const validStatuses: RiderOperationalStatus[] = [
      'active',
      'available',
      'assigned',
      'on_delivery',
      'suspended',
      'inactive',
    ];
    if (!operationalStatus || !validStatuses.includes(operationalStatus)) {
      return res.status(400).json({ ok: false, error: 'Invalid rider operational status.' });
    }
    if (
      operationalStatus === 'suspended' &&
      !userHasPerm(authUser, 'riders:suspend_scoped') &&
      !userHasPerm(authUser, 'users:suspend_any')
    ) {
      return res.status(403).json({ ok: false, error: 'Rider suspension permission required.' });
    }

    try {
      const riderUser = await queryOne<{ role: string; status: string }>(
        `SELECT role, status FROM users WHERE user_id = ? LIMIT 1`,
        [riderId]
      );
      if (!riderUser || riderUser.role !== 'rider') {
        return res.status(404).json({ ok: false, error: 'Rider account not found.' });
      }
      const nowSql = toMySqlDateTime(new Date());
      await withTransaction(async (conn) => {
        const nextOnline =
          operationalStatus === 'suspended' || operationalStatus === 'inactive' ? 0 : 1;
        await conn.execute(
          `UPDATE rider_profiles SET operational_status = ?, is_online = ? WHERE user_id = ?`,
          [operationalStatus, nextOnline, riderId]
        );
        if (operationalStatus === 'suspended') {
          await conn.execute(`UPDATE users SET status = 'suspended', status_reason = ? WHERE user_id = ?`, [
            reason || 'Suspended by Delivery Management',
            riderId,
          ]);
        } else if (riderUser.status === 'suspended' && (operationalStatus === 'active' || operationalStatus === 'available')) {
          await conn.execute(`UPDATE users SET status = 'approved', status_reason = NULL WHERE user_id = ?`, [
            riderId,
          ]);
        }
        await conn.execute(
          `INSERT INTO audit_logs (user_id, actor_name, action, entity, entity_id, before_after, created_at)
           VALUES (?, ?, 'RIDER_OPERATIONAL_STATUS', 'rider', ?, ?, ?)`,
          [
            authUser.userId,
            `${authUser.firstName} ${authUser.lastName}`,
            String(riderId),
            `operational_status=${operationalStatus}${reason ? ` (${reason})` : ''}`,
            nowSql,
          ]
        );
      });
      if (operationalStatus === 'suspended') {
        invalidateUserTokens(riderId);
      }
      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'delivery-management.riders.status', err);
    }
  });

  // --------------------------------------------------------------------------
  // 11. COUPON HANDLER & CUSTOMER COUPON ROUTES
  // --------------------------------------------------------------------------
  router.post('/coupons', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!userHasPerm(authUser, 'coupons:create')) {
      return res.status(403).json({ ok: false, error: 'Coupon Handler permission required.' });
    }
    const b = (req.body || {}) as Record<string, unknown>;
    const code = normalizeCouponCode(String(b.code || ''));
    if (!code || code.length < 3 || code.length > 40) {
      return res.status(400).json({ ok: false, error: 'Coupon code must be 3–40 characters.' });
    }
    const discountType = b.discount_type === 'percentage' ? 'percentage' : 'fixed';
    const discountValue = Number(b.discount_value);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return res.status(400).json({ ok: false, error: 'Discount value must be greater than zero.' });
    }
    if (discountType === 'percentage' && discountValue > 100) {
      return res.status(400).json({ ok: false, error: 'Percentage coupon discount cannot exceed 100%.' });
    }
    const nowSql = toMySqlDateTime(new Date());
    const startsSql = toMySqlDateTime(String(b.starts_at || '')) || nowSql;
    const expiresSql =
      toMySqlDateTime(String(b.expires_at || '')) || toMySqlDateTime(new Date(Date.now() + 30 * 86400000));
    if (startsSql && expiresSql && startsSql > expiresSql) {
      return res.status(400).json({ ok: false, error: 'Coupon start date cannot be after expiration date.' });
    }
    try {
      const ins = await executeSql(
        `INSERT INTO coupons (code, title, description, discount_type, discount_value, max_discount_amount, min_purchase_amount, usage_limit_total, usage_limit_per_user, times_used, starts_at, expires_at, is_active, target_segment, applicable_merchant_ids, applicable_product_ids, eligible_resident_ids, created_by_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          code,
          String(b.title || code).trim().slice(0, 140),
          String(b.description || '').trim().slice(0, 400),
          discountType,
          discountValue,
          b.max_discount_amount ? Number(b.max_discount_amount) : null,
          Math.max(0, Number(b.min_purchase_amount) || 0),
          b.usage_limit_total ? Number(b.usage_limit_total) : null,
          Math.max(1, Number(b.usage_limit_per_user) || 1),
          startsSql,
          expiresSql,
          b.is_active === false ? 0 : 1,
          String(b.target_segment || 'all'),
          JSON.stringify(Array.isArray(b.applicable_merchant_ids) ? b.applicable_merchant_ids.map(Number) : []),
          JSON.stringify(Array.isArray(b.applicable_product_ids) ? b.applicable_product_ids.map(Number) : []),
          JSON.stringify(Array.isArray(b.eligible_resident_ids) ? b.eligible_resident_ids.map(Number) : []),
          authUser.userId,
          nowSql,
          nowSql,
        ]
      );
      const saved = await queryOne(`SELECT * FROM coupons WHERE coupon_id = ? LIMIT 1`, [ins.insertId]);
      emitRealtimeSync('full');
      return res.status(201).json({ ok: true, coupon: saved });
    } catch (err) {
      const e = getMySqlErrorCode(err);
      if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
        return res.status(409).json({ ok: false, error: `Coupon code ${code} already exists.` });
      }
      return sendInternalDbError(res, 'coupons.create', err);
    }
  });

  router.put('/coupons/:id', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!userHasPerm(authUser, 'coupons:update')) {
      return res.status(403).json({ ok: false, error: 'Coupon Handler permission required.' });
    }
    const couponId = Number(req.params.id);
    if (!Number.isInteger(couponId) || couponId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid coupon ID.' });
    }
    const b = (req.body || {}) as Record<string, unknown>;
    const code = normalizeCouponCode(String(b.code || ''));
    if (!code || code.length < 3 || code.length > 40) {
      return res.status(400).json({ ok: false, error: 'Coupon code must be 3–40 characters.' });
    }
    const discountType = b.discount_type === 'percentage' ? 'percentage' : 'fixed';
    const discountValue = Number(b.discount_value);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return res.status(400).json({ ok: false, error: 'Discount value must be greater than zero.' });
    }
    if (discountType === 'percentage' && discountValue > 100) {
      return res.status(400).json({ ok: false, error: 'Percentage coupon discount cannot exceed 100%.' });
    }
    const startsSql = toMySqlDateTime(b.starts_at as string | null);
    const expiresSql = toMySqlDateTime(b.expires_at as string | null);
    if (startsSql && expiresSql && startsSql > expiresSql) {
      return res.status(400).json({ ok: false, error: 'Coupon start date cannot be after expiration date.' });
    }
    const nowSql = toMySqlDateTime(new Date());
    try {
      const upd = await executeSql(
        `UPDATE coupons
         SET code = ?, title = ?, description = ?, discount_type = ?, discount_value = ?,
             max_discount_amount = ?, min_purchase_amount = ?, usage_limit_total = ?,
             usage_limit_per_user = ?, starts_at = COALESCE(?, starts_at), expires_at = COALESCE(?, expires_at),
             is_active = ?, target_segment = ?, applicable_merchant_ids = ?, applicable_product_ids = ?,
             eligible_resident_ids = ?, updated_at = ?
         WHERE coupon_id = ?`,
        [
          code,
          String(b.title || '').trim().slice(0, 140),
          String(b.description || '').trim().slice(0, 400),
          discountType,
          discountValue,
          b.max_discount_amount ? Number(b.max_discount_amount) : null,
          Math.max(0, Number(b.min_purchase_amount) || 0),
          b.usage_limit_total ? Number(b.usage_limit_total) : null,
          Math.max(1, Number(b.usage_limit_per_user) || 1),
          startsSql,
          expiresSql,
          b.is_active === false ? 0 : 1,
          String(b.target_segment || 'all'),
          JSON.stringify(Array.isArray(b.applicable_merchant_ids) ? b.applicable_merchant_ids.map(Number) : []),
          JSON.stringify(Array.isArray(b.applicable_product_ids) ? b.applicable_product_ids.map(Number) : []),
          JSON.stringify(Array.isArray(b.eligible_resident_ids) ? b.eligible_resident_ids.map(Number) : []),
          nowSql,
          couponId,
        ]
      );
      if (!upd.affectedRows) {
        return res.status(404).json({ ok: false, error: 'Coupon not found.' });
      }
      const saved = await queryOne(`SELECT * FROM coupons WHERE coupon_id = ? LIMIT 1`, [couponId]);
      emitRealtimeSync('full');
      return res.json({ ok: true, coupon: saved });
    } catch (err) {
      const e = getMySqlErrorCode(err);
      if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
        return res.status(409).json({ ok: false, error: `Coupon code ${code} already exists.` });
      }
      return sendInternalDbError(res, 'coupons.update', err);
    }
  });

  router.delete('/coupons/:id', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!userHasPerm(authUser, 'coupons:delete')) {
      return res.status(403).json({ ok: false, error: 'Coupon Handler permission required.' });
    }
    const couponId = Number(req.params.id);
    if (!Number.isInteger(couponId) || couponId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid coupon ID.' });
    }
    try {
      const del = await executeSql(`DELETE FROM coupons WHERE coupon_id = ?`, [couponId]);
      if (!del.affectedRows) {
        return res.status(404).json({ ok: false, error: 'Coupon not found.' });
      }
      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'coupons.delete', err);
    }
  });

  router.post('/coupons/claim', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!userHasPerm(authUser, 'coupons:claim')) {
      return res.status(403).json({ ok: false, error: 'Only Customer accounts can claim promo coupons.' });
    }
    const couponId = Number((req.body as { couponId?: number })?.couponId);
    try {
      const row = await queryOne<Record<string, unknown>>(
        `SELECT * FROM coupons WHERE coupon_id = ? LIMIT 1`,
        [couponId]
      );
      if (!row) return res.status(404).json({ ok: false, error: 'Coupon not found.' });
      const coupon = mapRawCouponRow(row);
      const claims = await queryRows<CustomerCoupon>(
        `SELECT * FROM customer_coupons WHERE resident_id = ?`,
        [authUser.userId]
      );
      const prevOrdRow = await queryOne<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM orders WHERE resident_id = ? AND status <> 'cancelled'`,
        [authUser.userId]
      );
      const check = canCustomerClaimCoupon({
        coupon,
        residentId: authUser.userId,
        existingClaims: claims,
        residentPreviousOrdersCount: Number(prevOrdRow?.cnt ?? 0),
      });
      if (!check.ok) {
        return res.status(400).json({ ok: false, error: check.error });
      }
      const nowSql = toMySqlDateTime(new Date());
      await executeSql(
        `INSERT INTO customer_coupons (coupon_id, resident_id, status, claimed_at)
         VALUES (?, ?, 'claimed', ?)
         ON DUPLICATE KEY UPDATE claimed_at = VALUES(claimed_at)`,
        [couponId, authUser.userId, nowSql]
      );
      const saved = await queryOne(
        `SELECT * FROM customer_coupons WHERE coupon_id = ? AND resident_id = ? LIMIT 1`,
        [couponId, authUser.userId]
      );
      emitRealtimeSync('full');
      return res.status(201).json({ ok: true, claim: saved });
    } catch (err) {
      return sendInternalDbError(res, 'coupons.claim', err);
    }
  });

  router.post('/coupons/validate', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const b = (req.body || {}) as {
      code?: string;
      merchant_id?: number;
      items?: Array<{ product_id: number; quantity: number }>;
    };
    const code = normalizeCouponCode(String(b.code || ''));
    const nowSql = toMySqlDateTime(new Date());
    if (!code) {
      return res.status(400).json({ ok: false, error: 'Enter a promo code.' });
    }
    try {
      const couponRow = await queryOne<Record<string, unknown>>(
        `SELECT * FROM coupons WHERE UPPER(code) = ? LIMIT 1`,
        [code]
      );
      if (!couponRow) {
        await executeSql(
          `INSERT INTO coupon_redemptions (coupon_id, coupon_code, resident_id, order_id, discount_amount, status, failure_reason, created_at)
           VALUES (NULL, ?, ?, NULL, 0, 'failed', 'Coupon code not found', ?)`,
          [code, authUser.userId, nowSql]
        );
        emitRealtimeSync('full');
        return res.status(404).json({ ok: false, error: 'Invalid or unknown coupon code.' });
      }
      const coupon = mapRawCouponRow(couponRow);
      const rawItems = Array.isArray(b.items) ? b.items : [];
      const pids = rawItems.map((i) => Number(i.product_id)).filter((n) => Number.isFinite(n));
      const prodRows =
        pids.length > 0
          ? await queryRows<{ product_id: number; regular_price: number }>(
              `SELECT product_id, regular_price FROM products WHERE product_id IN (${pids.map(() => '?').join(',')})`,
              pids
            )
          : [];
      const priceMap = new Map(prodRows.map((p) => [Number(p.product_id), Number(p.regular_price)]));
      const cartItems = rawItems.map((i) => ({
        product_id: Number(i.product_id),
        quantity: Number(i.quantity),
        unit_price: priceMap.get(Number(i.product_id)) ?? 0,
      }));
      const subtotal = Number(
        cartItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0).toFixed(2)
      );

      const [prevOrdRow, usageRow, claimRow] = await Promise.all([
        queryOne<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM orders WHERE resident_id = ? AND status <> 'cancelled'`,
          [authUser.userId]
        ),
        queryOne<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM coupon_redemptions WHERE coupon_id = ? AND resident_id = ? AND status = 'redeemed'`,
          [coupon.coupon_id, authUser.userId]
        ),
        queryOne<CustomerCoupon>(
          `SELECT * FROM customer_coupons WHERE coupon_id = ? AND resident_id = ? LIMIT 1`,
          [coupon.coupon_id, authUser.userId]
        ),
      ]);

      const check = validateAndCalculateCouponDiscount({
        coupon,
        residentId: authUser.userId,
        merchantId: Number(b.merchant_id || 0),
        cartItems,
        subtotal,
        customerClaim: claimRow ?? null,
        residentPreviousOrdersCount: Number(prevOrdRow?.cnt ?? 0),
        residentCouponUsageCount: Number(usageRow?.cnt ?? 0),
      });

      if (!check.valid) {
        await executeSql(
          `INSERT INTO coupon_redemptions (coupon_id, coupon_code, resident_id, order_id, discount_amount, status, failure_reason, created_at)
           VALUES (?, ?, ?, NULL, 0, 'failed', ?, ?)`,
          [coupon.coupon_id, coupon.code, authUser.userId, check.reason || 'Ineligible', nowSql]
        );
        emitRealtimeSync('full');
        return res.status(400).json({ ok: false, error: check.reason });
      }

      return res.json({
        ok: true,
        coupon,
        discountAmount: check.discountAmount,
        finalDiscountedSubtotal: check.finalDiscountedSubtotal,
      });
    } catch (err) {
      return sendInternalDbError(res, 'coupons.validate', err);
    }
  });

  // --------------------------------------------------------------------------
  // 12. RETURN / REFUND REQUESTS & CUSTOMER SERVICE DISPUTE WORKFLOW
  // --------------------------------------------------------------------------
  router.post('/returns', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!userHasPerm(authUser, 'returns:request') && !authUser.isApprovedAdmin) {
      return res.status(403).json({ ok: false, error: 'Only customers can submit return/refund requests.' });
    }
    const b = (req.body || {}) as Record<string, unknown>;
    const orderId = Number(b.order_id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ ok: false, error: 'Valid order ID is required.' });
    }
    const validReasons: ReturnRefundReason[] = [
      'wrong_item',
      'damaged_item',
      'expired_product',
      'missing_item',
      'quality_issue',
      'other',
    ];
    const reasonCode = validReasons.includes(String(b.reason_code) as ReturnRefundReason)
      ? (String(b.reason_code) as ReturnRefundReason)
      : 'other';
    const description = String(b.description || '').trim();
    if (!description) {
      return res.status(400).json({ ok: false, error: 'Please describe the return/refund reason.' });
    }
    const descCheck = validateCommentPrivacy(description, 1000);
    if (!descCheck.valid) {
      return res.status(400).json({ ok: false, error: descCheck.error || 'Invalid return description.' });
    }

    try {
      const ord = await queryOne<{
        order_id: number;
        order_code: string;
        resident_id: number;
        merchant_id: number;
        status: string;
        total_amount: number;
      }>(
        `SELECT order_id, order_code, resident_id, merchant_id, status, total_amount FROM orders WHERE order_id = ? LIMIT 1`,
        [orderId]
      );
      if (!ord) return res.status(404).json({ ok: false, error: 'Order not found.' });

      const existing = await queryRows<{ order_id: number; status: ReturnRefundStatus }>(
        `SELECT order_id, status FROM return_refund_requests WHERE order_id = ?`,
        [orderId]
      );
      const check = canRequestReturnRefund(
        {
          status: ord.status as 'delivered',
          resident_id: Number(ord.resident_id),
          total_amount: Number(ord.total_amount),
          order_id: Number(ord.order_id),
        } as Parameters<typeof canRequestReturnRefund>[0],
        authUser.userId,
        existing
      );
      if (!check.ok) {
        return res.status(400).json({ ok: false, error: check.error });
      }

      const requestedAmount = Math.min(
        Number(ord.total_amount),
        Math.max(1, Number(b.requested_refund_amount || ord.total_amount))
      );
      const refCode = buildUniqueReturnRefCode();
      const nowSql = toMySqlDateTime(new Date());

      const ins = await executeSql(
        `INSERT INTO return_refund_requests (reference_code, order_id, resident_id, merchant_id, reason_code, description, requested_refund_amount, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?)`,
        [
          refCode,
          orderId,
          authUser.userId,
          Number(ord.merchant_id),
          reasonCode,
          description,
          requestedAmount,
          nowSql,
          nowSql,
        ]
      );
      await executeSql(
        `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
         VALUES (?, ?, ?, 'Order', 0, ?)`,
        [
          Number(ord.merchant_id),
          `Return Request ${refCode}`,
          `Customer requested ₱${requestedAmount.toFixed(2)} return/refund for ${ord.order_code}. Please review.`,
          nowSql,
        ]
      );
      const saved = await queryOne(`SELECT * FROM return_refund_requests WHERE return_id = ? LIMIT 1`, [
        ins.insertId,
      ]);
      emitRealtimeSync('full');
      return res.status(201).json({ ok: true, returnRequest: saved });
    } catch (err) {
      return sendInternalDbError(res, 'returns.create', err);
    }
  });

  router.patch('/returns/:id/merchant-respond', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const returnId = Number(req.params.id);
    if (!Number.isInteger(returnId) || returnId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid return ID.' });
    }
    const { status, responseNote, approvedAmount } = (req.body || {}) as {
      status?: ReturnRefundStatus;
      responseNote?: string;
      approvedAmount?: number;
    };
    if (responseNote) {
      const check = validateCommentPrivacy(String(responseNote), 800);
      if (!check.valid) return res.status(400).json({ ok: false, error: check.error || 'Invalid response note.' });
    }
    try {
      const existing = await queryOne<Record<string, unknown>>(
        `SELECT * FROM return_refund_requests WHERE return_id = ? LIMIT 1`,
        [returnId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Return request not found.' });
      const isStoreOwner = Number(existing.merchant_id) === authUser.userId && authUser.status === 'approved';
      if (!authUser.isApprovedAdmin && !isStoreOwner) {
        return res.status(403).json({ ok: false, error: 'Only the assigned Store/Merchant can respond to this return request.' });
      }
      if (!status || !canTransitionReturnRefundStatus(existing.status as ReturnRefundStatus, status, authUser.role)) {
        return res.status(400).json({ ok: false, error: 'Invalid return/refund status transition for store.' });
      }
      const nowSql = toMySqlDateTime(new Date());
      const finalApproved =
        approvedAmount !== undefined && Number.isFinite(Number(approvedAmount))
          ? Math.min(Number(existing.requested_refund_amount), Math.max(0, Number(approvedAmount)))
          : status === 'store_rejected'
            ? 0
            : Number(existing.requested_refund_amount);

      await executeSql(
        `UPDATE return_refund_requests
         SET status = ?, approved_refund_amount = ?, store_response_note = ?, store_responded_by = ?, store_responded_at = ?, updated_at = ?
         WHERE return_id = ?`,
        [status, finalApproved, (responseNote || '').trim().slice(0, 800), authUser.userId, nowSql, nowSql, returnId]
      );
      await executeSql(
        `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
         VALUES (?, ?, ?, 'Order', 0, ?)`,
        [
          Number(existing.resident_id),
          `Return Update: ${String(existing.reference_code)}`,
          `Store marked your return request as ${status.replace('_', ' ')}.`,
          nowSql,
        ]
      );
      const saved = await queryOne(`SELECT * FROM return_refund_requests WHERE return_id = ? LIMIT 1`, [returnId]);
      emitRealtimeSync('full');
      return res.json({ ok: true, returnRequest: saved });
    } catch (err) {
      return sendInternalDbError(res, 'returns.merchant-respond', err);
    }
  });

  router.post('/returns/:id/escalate', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const returnId = Number(req.params.id);
    if (!Number.isInteger(returnId) || returnId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid return ID.' });
    }
    const reason = String((req.body as { reason?: string })?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ ok: false, error: 'Escalation reason is required.' });
    }
    const reasonCheck = validateCommentPrivacy(reason, 600);
    if (!reasonCheck.valid) {
      return res.status(400).json({ ok: false, error: reasonCheck.error || 'Invalid escalation reason.' });
    }
    try {
      const existing = await queryOne<Record<string, unknown>>(
        `SELECT * FROM return_refund_requests WHERE return_id = ? LIMIT 1`,
        [returnId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Return request not found.' });
      if (!authUser.isApprovedAdmin && Number(existing.resident_id) !== authUser.userId) {
        return res.status(403).json({ ok: false, error: 'Not authorized to escalate this return.' });
      }
      if (!canTransitionReturnRefundStatus(existing.status as ReturnRefundStatus, 'escalated', authUser.role)) {
        return res.status(400).json({ ok: false, error: 'This return request cannot be escalated in its current state.' });
      }
      const nowSql = toMySqlDateTime(new Date());
      await executeSql(
        `UPDATE return_refund_requests SET status = 'escalated', escalated_at = ?, escalation_reason = ?, updated_at = ? WHERE return_id = ?`,
        [nowSql, reason, nowSql, returnId]
      );
      await executeSql(
        `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
         SELECT user_id, ?, ?, 'Feedback', 0, ?
         FROM users WHERE role IN ('customer_service', 'admin') AND status = 'approved'`,
        [
          `Escalated Return ${String(existing.reference_code)}`,
          `Customer escalated return/refund dispute ${String(existing.reference_code)}: ${reason}`,
          nowSql,
        ]
      );
      const saved = await queryOne(`SELECT * FROM return_refund_requests WHERE return_id = ? LIMIT 1`, [returnId]);
      emitRealtimeSync('full');
      return res.json({ ok: true, returnRequest: saved });
    } catch (err) {
      return sendInternalDbError(res, 'returns.escalate', err);
    }
  });

  router.patch('/returns/:id/cs-resolve', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!userHasPerm(authUser, 'returns:resolve_dispute')) {
      return res.status(403).json({ ok: false, error: 'Customer Service permission required to resolve disputes.' });
    }
    const returnId = Number(req.params.id);
    if (!Number.isInteger(returnId) || returnId <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid return ID.' });
    }
    const { status, csNotes, resolutionNote, approvedAmount } = (req.body || {}) as {
      status?: ReturnRefundStatus;
      csNotes?: string;
      resolutionNote?: string;
      approvedAmount?: number;
    };
    if (resolutionNote) {
      const check = validateCommentPrivacy(String(resolutionNote), 800);
      if (!check.valid) return res.status(400).json({ ok: false, error: check.error || 'Invalid resolution note.' });
    }
    try {
      const existing = await queryOne<Record<string, unknown>>(
        `SELECT * FROM return_refund_requests WHERE return_id = ? LIMIT 1`,
        [returnId]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'Return request not found.' });
      if (!status || !canTransitionReturnRefundStatus(existing.status as ReturnRefundStatus, status, authUser.role)) {
        return res.status(400).json({ ok: false, error: 'Invalid Customer Service resolution status.' });
      }
      const nowSql = toMySqlDateTime(new Date());
      const finalAmt =
        approvedAmount !== undefined && Number.isFinite(Number(approvedAmount))
          ? Math.min(Number(existing.requested_refund_amount), Math.max(0, Number(approvedAmount)))
          : status === 'cs_dismissed'
            ? 0
            : Number(existing.requested_refund_amount);

      await executeSql(
        `UPDATE return_refund_requests
         SET status = ?, approved_refund_amount = ?, cs_notes = COALESCE(?, cs_notes), cs_resolution_note = ?, cs_resolved_by = ?, cs_resolved_at = ?, updated_at = ?
         WHERE return_id = ?`,
        [
          status,
          finalAmt,
          csNotes ? String(csNotes).slice(0, 1000) : null,
          (resolutionNote || '').trim().slice(0, 800),
          authUser.userId,
          nowSql,
          nowSql,
          returnId,
        ]
      );
      await executeSql(
        `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
         VALUES (?, ?, ?, 'Feedback', 0, ?), (?, ?, ?, 'Feedback', 0, ?)`,
        [
          Number(existing.resident_id),
          `CS Decision on ${String(existing.reference_code)}`,
          `Customer Service updated your dispute to ${status.replace('_', ' ')}. ${resolutionNote || ''}`,
          nowSql,
          Number(existing.merchant_id),
          `CS Decision on ${String(existing.reference_code)}`,
          `Customer Service closed return dispute ${String(existing.reference_code)} as ${status.replace('_', ' ')}.`,
          nowSql,
        ]
      );
      const saved = await queryOne(`SELECT * FROM return_refund_requests WHERE return_id = ? LIMIT 1`, [returnId]);
      emitRealtimeSync('full');
      return res.json({ ok: true, returnRequest: saved });
    } catch (err) {
      return sendInternalDbError(res, 'returns.cs-resolve', err);
    }
  });

  router.post('/admin/barangays', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    if (!authUser.isApprovedAdmin) {
      return res.status(403).json({ ok: false, error: 'Admin access required.' });
    }
    const { name, city, province, region } = (req.body || {}) as Record<string, string>;
    if (!name?.trim()) return res.status(400).json({ ok: false, error: 'Barangay name is required.' });
    try {
      const ins = await executeSql(
        `INSERT INTO barangays (name, city, province, region) VALUES (?, ?, ?, ?)`,
        [
          name.trim().slice(0, 120),
          city?.trim().slice(0, 80) || 'Olongapo City',
          province?.trim().slice(0, 80) || 'Zambales',
          region?.trim().slice(0, 80) || 'Region III',
        ]
      );
      const saved = await queryOne(`SELECT * FROM barangays WHERE barangay_id = ? LIMIT 1`, [
        ins.insertId,
      ]);
      emitRealtimeSync('full');
      return res.status(201).json({ ok: true, barangay: saved });
    } catch (err) {
      return sendInternalDbError(res, 'admin.barangays.create', err);
    }
  });

  router.post('/notifications/read-all', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    try {
      await executeSql(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`, [
        authUser.userId,
      ]);
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'notifications.read-all', err);
    }
  });

  router.post('/notifications/notify-admins', async (req, res) => {
    const authUser = await requireAuthUser(req, res);
    if (!authUser) return;
    const rate = consumeAuthRateLimit(`notify-admins:${authUser.userId}`, 15, 5 * 60 * 1000);
    if (!rate.allowed) {
      return res.status(429).json({
        ok: false,
        error: `Notification limit reached. Try again in ${rate.retryAfterSeconds}s.`,
      });
    }
    const { title, message, notificationType } = (req.body || {}) as Record<string, string>;
    const cleanTitle = String(title || '').trim();
    const cleanMessage = String(message || '').trim();
    if (!cleanTitle || !cleanMessage) {
      return res.status(400).json({ ok: false, error: 'Title and message are required.' });
    }
    const allowedTypes = ['System', 'Delivery', 'Order', 'Alert', 'Feedback', 'Inventory', 'Prescription'];
    const cleanType = allowedTypes.includes(String(notificationType || ''))
      ? String(notificationType)
      : 'System';
    try {
      await notifyApprovedAdmins(cleanTitle.slice(0, 140), cleanMessage.slice(0, 600), cleanType);
      emitRealtimeSync('full');
      return res.json({ ok: true });
    } catch (err) {
      return sendInternalDbError(res, 'notifications.notify-admins', err);
    }
  });

  // Expose effective permissions helper reference to keep unused-import lint clean
  void getEffectivePermissions;

  return router;
}

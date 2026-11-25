import fs from 'node:fs';
import path from 'node:path';
import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { hashPassword, toMySqlDateTime, verifySessionToken } from './authService.ts';
import { emitRealtimeSync } from './realtimeBus.ts';
import type { AccountStatus, UserRole } from '../src/types/medex.ts';

export type MySqlDiagnosticCategory =
  | 'connected'
  | 'not_configured'
  | 'dns_not_found'
  | 'connection_refused'
  | 'timeout'
  | 'auth_failed'
  | 'unknown_database'
  | 'tls_error'
  | 'connection_failed';

let cachedPool: Pool | null = null;
let cachedSignature = '';
let lastPingAt = 0;
let lastPingResult = false;
let lastLoggedErrorAt = 0;
let lastDiagnostic: MySqlDiagnosticCategory = 'not_configured';
let tlsFallbackMode: 'none' | 'strict_ca' | 'encrypted_unverified' = 'none';
let adminBootstrapAttempted = false;
let schemaSyncPromise: Promise<void> | null = null;

export interface MySqlConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
  sslCa?: string;
  sslRejectUnauthorized: boolean;
  sslRejectUnauthorizedExplicit: boolean;
}

function stripSurroundingQuotes(raw: string | undefined): string {
  const trimmed = (raw || '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function discoverCaCertificate(explicitCaPath?: string): string | undefined {
  const inlineCa = process.env.MYSQL_SSL_CA?.trim();
  if (inlineCa && inlineCa.includes('BEGIN CERTIFICATE')) {
    return inlineCa.replace(/\\n/g, '\n');
  }

  const candidatePaths: string[] = [];
  const envCaPath = stripSurroundingQuotes(
    process.env.MYSQL_SSL_CA_PATH || explicitCaPath || process.env.NODE_EXTRA_CA_CERTS
  );
  if (envCaPath) {
    candidatePaths.push(path.isAbsolute(envCaPath) ? envCaPath : path.resolve(process.cwd(), envCaPath));
  }

  // Auto-detect Sevalla/cloud CA certificates placed in the app working directory (e.g. medex-8ej78-ca.crt)
  try {
    const entries = fs.readdirSync(process.cwd());
    for (const entry of entries) {
      if (entry === 'ca.crt' || entry === 'ca.pem' || /-ca\.crt$/i.test(entry) || /-ca\.pem$/i.test(entry)) {
        candidatePaths.push(path.resolve(process.cwd(), entry));
      }
    }
  } catch {
    // ignore filesystem read errors
  }

  for (const filePath of candidatePaths) {
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const content = fs.readFileSync(filePath, 'utf8').trim();
        if (content.includes('BEGIN CERTIFICATE')) {
          return content;
        }
      }
    } catch {
      // ignore unreadable candidate
    }
  }
  return undefined;
}

export function resolveMySqlConfig(): MySqlConnectionConfig | null {
  const rawUrl = stripSurroundingQuotes(process.env.MYSQL_URL || process.env.DATABASE_URL);
  let urlHost = '';
  let urlPort = 3306;
  let urlUser = '';
  let urlPassword = '';
  let urlDatabase = '';
  let urlSsl = false;
  let urlSslCaPath = '';

  if (rawUrl && /^mysql2?:\/\//i.test(rawUrl)) {
    try {
      const parsed = new URL(rawUrl);
      urlHost = parsed.hostname;
      urlPort = Number(parsed.port || 3306) || 3306;
      urlUser = decodeURIComponent(parsed.username || '');
      urlPassword = decodeURIComponent(parsed.password || '');
      urlDatabase = decodeURIComponent((parsed.pathname || '').replace(/^\/+/, ''));
      const sslMode = (
        parsed.searchParams.get('ssl-mode') ||
        parsed.searchParams.get('sslmode') ||
        parsed.searchParams.get('ssl') ||
        ''
      ).toLowerCase();
      urlSslCaPath = parsed.searchParams.get('sslca') || parsed.searchParams.get('sslrootcert') || '';
      urlSsl =
        Boolean(urlSslCaPath) ||
        (sslMode !== '' && sslMode !== 'false' && sslMode !== '0' && sslMode !== 'disabled');
    } catch {
      // fall through to discrete env vars
    }
  }

  const host = stripSurroundingQuotes(process.env.MYSQL_HOST) || urlHost;
  const user = stripSurroundingQuotes(process.env.MYSQL_USER) || urlUser;
  const database = stripSurroundingQuotes(process.env.MYSQL_DATABASE) || urlDatabase;
  const password =
    process.env.MYSQL_PASSWORD !== undefined && process.env.MYSQL_PASSWORD !== ''
      ? process.env.MYSQL_PASSWORD
      : urlPassword;
  const port = Number(stripSurroundingQuotes(process.env.MYSQL_PORT) || urlPort || 3306) || 3306;

  if (!host || !user || !database) return null;
  if (
    host.includes('YOUR_MYSQL') ||
    user.includes('YOUR_MYSQL') ||
    database.includes('YOUR_MYSQL')
  ) {
    return null;
  }

  const sslCa = discoverCaCertificate(urlSslCaPath);
  const rawSsl = stripSurroundingQuotes(process.env.MYSQL_SSL).toLowerCase();
  const sslExplicitlyFalse = rawSsl === 'false' || rawSsl === '0' || rawSsl === 'disabled';
  const sslExplicitlyTrue =
    rawSsl === 'true' || rawSsl === '1' || rawSsl === 'require' || rawSsl === 'required' || rawSsl === 'preferred';
  const ssl = sslExplicitlyTrue || (!sslExplicitlyFalse && (urlSsl || Boolean(sslCa)));

  const rawReject = stripSurroundingQuotes(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED).toLowerCase();
  const sslRejectUnauthorizedExplicit = rawReject === 'true' || rawReject === 'false';
  const sslRejectUnauthorized = rawReject !== 'false';

  return {
    host,
    port,
    user,
    password,
    database,
    ssl,
    sslCa,
    sslRejectUnauthorized,
    sslRejectUnauthorizedExplicit,
  };
}

export function classifyMySqlError(err: unknown): MySqlDiagnosticCategory {
  const rec = (err && typeof err === 'object' ? err : {}) as { code?: string; message?: string };
  const code = String(rec.code || '').toUpperCase();
  const msg = String(rec.message || '').toLowerCase();

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns_not_found';
  if (code === 'ECONNREFUSED') return 'connection_refused';
  if (code === 'ETIMEDOUT' || code === 'PROTOCOL_CONNECTION_LOST' || msg.includes('timed out')) {
    return 'timeout';
  }
  if (code === 'ER_ACCESS_DENIED_ERROR' || code === 'ER_DBACCESS_DENIED_ERROR') return 'auth_failed';
  if (code === 'ER_BAD_DB_ERROR') return 'unknown_database';
  if (
    code === 'ER_SECURE_TRANSPORT_REQUIRED' ||
    code === 'HANDSHAKE_NO_SSL_SUPPORT' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
    code === 'CERT_HAS_EXPIRED' ||
    msg.includes('self-signed') ||
    msg.includes('insecure transport') ||
    msg.includes('ssl') ||
    msg.includes('tls')
  ) {
    return 'tls_error';
  }
  return 'connection_failed';
}

export function getMySqlDiagnosticStatus(): MySqlDiagnosticCategory {
  if (!isMySqlConfigured()) return 'not_configured';
  return lastPingResult ? 'connected' : lastDiagnostic;
}

export function isMySqlConfigured(): boolean {
  return resolveMySqlConfig() !== null;
}

function buildSslOptionForPool(
  cfg: MySqlConnectionConfig,
  overrideMode: 'none' | 'strict_ca' | 'encrypted_unverified'
): Record<string, unknown> | undefined {
  if (overrideMode === 'encrypted_unverified') {
    return cfg.sslCa ? { ca: cfg.sslCa, rejectUnauthorized: false } : { rejectUnauthorized: false };
  }
  if (overrideMode === 'strict_ca') {
    return cfg.sslCa ? { ca: cfg.sslCa, rejectUnauthorized: true } : { rejectUnauthorized: true };
  }
  if (!cfg.ssl) return undefined;
  return cfg.sslCa
    ? { ca: cfg.sslCa, rejectUnauthorized: cfg.sslRejectUnauthorized }
    : { rejectUnauthorized: cfg.sslRejectUnauthorized };
}

export function getMySqlPool(): Pool | null {
  const cfg = resolveMySqlConfig();
  if (!cfg) return null;
  const sig = `${cfg.host}:${cfg.port}/${cfg.database}@${cfg.user}:${cfg.ssl}:${cfg.sslRejectUnauthorized}:${Boolean(cfg.sslCa)}:${tlsFallbackMode}`;
  if (!cachedPool || cachedSignature !== sig) {
    if (cachedPool) {
      void cachedPool.end().catch(() => {});
    }
    cachedPool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 4,
      idleTimeout: 60000,
      queueLimit: 0,
      connectTimeout: 10000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      dateStrings: true,
      decimalNumbers: true,
      ssl: buildSslOptionForPool(cfg, tlsFallbackMode),
    });
    cachedSignature = sig;
    lastPingAt = 0;
    lastPingResult = false;
    adminBootstrapAttempted = false;
    schemaSyncPromise = null;
  }
  return cachedPool;
}

async function ensureMySqlSchemaUpToDate(pool: Pool): Promise<void> {
  const cfg = resolveMySqlConfig();
  if (!cfg) return;
  const requiredColumns: Array<{ table: string; column: string; ddl: string }> = [
    { table: 'users', column: 'policy_accepted_at', ddl: 'ADD COLUMN `policy_accepted_at` DATETIME NULL' },
    { table: 'users', column: 'policy_version', ddl: 'ADD COLUMN `policy_version` VARCHAR(20) NULL' },
    { table: 'users', column: 'created_by_admin_id', ddl: 'ADD COLUMN `created_by_admin_id` INT NULL' },
    { table: 'users', column: 'department_label', ddl: 'ADD COLUMN `department_label` VARCHAR(120) NULL' },
    { table: 'merchant_profiles', column: 'business_permit_name', ddl: 'ADD COLUMN `business_permit_name` VARCHAR(255) NULL' },
    { table: 'merchant_profiles', column: 'business_permit_url', ddl: 'ADD COLUMN `business_permit_url` MEDIUMTEXT NULL' },
    { table: 'merchant_profiles', column: 'government_id_name', ddl: 'ADD COLUMN `government_id_name` VARCHAR(255) NULL' },
    { table: 'merchant_profiles', column: 'government_id_url', ddl: 'ADD COLUMN `government_id_url` MEDIUMTEXT NULL' },
    { table: 'merchant_profiles', column: 'documents_verified_at', ddl: 'ADD COLUMN `documents_verified_at` DATETIME NULL' },
    { table: 'merchant_profiles', column: 'documents_verified_by', ddl: 'ADD COLUMN `documents_verified_by` INT NULL' },
    { table: 'rider_profiles', column: 'operational_status', ddl: "ADD COLUMN `operational_status` ENUM('active', 'available', 'assigned', 'on_delivery', 'suspended', 'inactive') NOT NULL DEFAULT 'available'" },
    { table: 'rider_profiles', column: 'driver_license_name', ddl: 'ADD COLUMN `driver_license_name` VARCHAR(255) NULL' },
    { table: 'rider_profiles', column: 'driver_license_url', ddl: 'ADD COLUMN `driver_license_url` MEDIUMTEXT NULL' },
    { table: 'rider_profiles', column: 'vehicle_registration_name', ddl: 'ADD COLUMN `vehicle_registration_name` VARCHAR(255) NULL' },
    { table: 'rider_profiles', column: 'vehicle_registration_url', ddl: 'ADD COLUMN `vehicle_registration_url` MEDIUMTEXT NULL' },
    { table: 'rider_profiles', column: 'documents_verified_at', ddl: 'ADD COLUMN `documents_verified_at` DATETIME NULL' },
    { table: 'rider_profiles', column: 'documents_verified_by', ddl: 'ADD COLUMN `documents_verified_by` INT NULL' },
    { table: 'products', column: 'is_archived', ddl: 'ADD COLUMN `is_archived` TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'products', column: 'archived_at', ddl: 'ADD COLUMN `archived_at` DATETIME NULL' },
    { table: 'orders', column: 'coupon_id', ddl: 'ADD COLUMN `coupon_id` INT NULL' },
    { table: 'orders', column: 'coupon_code', ddl: 'ADD COLUMN `coupon_code` VARCHAR(64) NULL' },
    { table: 'orders', column: 'discount_amount', ddl: 'ADD COLUMN `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00' },
    { table: 'problem_reports', column: 'category_tag', ddl: 'ADD COLUMN `category_tag` VARCHAR(120) NULL' },
    { table: 'problem_reports', column: 'cs_notes', ddl: 'ADD COLUMN `cs_notes` TEXT NULL' },
    { table: 'problem_reports', column: 'escalated_at', ddl: 'ADD COLUMN `escalated_at` DATETIME NULL' },
    { table: 'problem_reports', column: 'escalated_by_id', ddl: 'ADD COLUMN `escalated_by_id` INT NULL' },
    { table: 'problem_reports', column: 'escalated_reason', ddl: 'ADD COLUMN `escalated_reason` TEXT NULL' },
    { table: 'problem_reports', column: 'store_responded_at', ddl: 'ADD COLUMN `store_responded_at` DATETIME NULL' },
  ];

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('users', 'merchant_profiles', 'rider_profiles', 'products', 'orders', 'problem_reports', 'problem_report_status_history')`,
      [cfg.database]
    );
    const existing = new Set(
      rows.map((r) => `${String(r.table_name).toLowerCase()}.${String(r.column_name).toLowerCase()}`)
    );
    const columnTypes = new Map<string, string>(
      rows.map((r) => [
        `${String(r.table_name).toLowerCase()}.${String(r.column_name).toLowerCase()}`,
        String(r.column_type || '').toLowerCase(),
      ])
    );
    const existingTables = new Set(rows.map((r) => String(r.table_name).toLowerCase()));

    for (const col of requiredColumns) {
      if (!existingTables.has(col.table)) continue;
      if (!existing.has(`${col.table}.${col.column}`)) {
        try {
          await pool.execute(`ALTER TABLE \`${col.table}\` ${col.ddl}`);
        } catch {
          // Ignore if another concurrent worker already added the column
        }
      }
    }

    const enumChecks: Array<{ key: string; requiredToken: string; ddl: string }> = [
      {
        key: 'users.role',
        requiredToken: "'customer_service'",
        ddl: `ALTER TABLE \`users\` MODIFY COLUMN \`role\` ENUM('resident','merchant','rider','admin','delivery_manager','coupon_handler','inventory_manager','customer_service') NOT NULL`,
      },
      {
        key: 'problem_reports.status',
        requiredToken: "'escalated'",
        ddl: `ALTER TABLE \`problem_reports\` MODIFY COLUMN \`status\` ENUM('open','acknowledged','escalated','resolved','dismissed') NOT NULL DEFAULT 'open'`,
      },
      {
        key: 'problem_report_status_history.status',
        requiredToken: "'escalated'",
        ddl: `ALTER TABLE \`problem_report_status_history\` MODIFY COLUMN \`status\` ENUM('open','acknowledged','escalated','resolved','dismissed') NOT NULL`,
      },
      {
        key: 'problem_report_status_history.changed_by_role',
        requiredToken: "'customer_service'",
        ddl: `ALTER TABLE \`problem_report_status_history\` MODIFY COLUMN \`changed_by_role\` ENUM('resident','merchant','rider','admin','delivery_manager','coupon_handler','inventory_manager','customer_service') NOT NULL`,
      },
    ];
    for (const item of enumChecks) {
      const currentType = columnTypes.get(item.key);
      if (!currentType || currentType.includes(item.requiredToken)) continue;
      try {
        await pool.execute(item.ddl);
      } catch {
        // Ignore if table not yet present or already widened
      }
    }

    const [tableRows] = await pool.query<RowDataPacket[]>(
      `SELECT TABLE_NAME AS table_name
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('user_permission_overrides', 'coupons', 'customer_coupons', 'coupon_redemptions', 'inventory_movements', 'return_refund_requests')`,
      [cfg.database]
    );
    const existingNewTables = new Set(tableRows.map((r) => String(r.table_name).toLowerCase()));

    const newTableDdls: Array<{ table: string; ddl: string }> = [
      {
        table: 'user_permission_overrides',
        ddl: `CREATE TABLE IF NOT EXISTS \`user_permission_overrides\` (
        \`override_id\` INT NOT NULL AUTO_INCREMENT,
        \`user_id\` INT NOT NULL,
        \`permission_code\` VARCHAR(96) NOT NULL,
        \`effect\` ENUM('grant', 'revoke') NOT NULL,
        \`granted_by_admin_id\` INT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`override_id\`),
        UNIQUE KEY \`uq_user_perm_override\` (\`user_id\`, \`permission_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      },
      {
        table: 'coupons',
        ddl: `CREATE TABLE IF NOT EXISTS \`coupons\` (
        \`coupon_id\` INT NOT NULL AUTO_INCREMENT,
        \`code\` VARCHAR(64) NOT NULL,
        \`title\` VARCHAR(180) NOT NULL,
        \`description\` TEXT NOT NULL,
        \`discount_type\` ENUM('percentage', 'fixed') NOT NULL DEFAULT 'fixed',
        \`discount_value\` DECIMAL(10, 2) NOT NULL,
        \`max_discount_amount\` DECIMAL(10, 2) NULL,
        \`min_purchase_amount\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        \`usage_limit_total\` INT NULL,
        \`usage_limit_per_user\` INT NOT NULL DEFAULT 1,
        \`times_used\` INT NOT NULL DEFAULT 0,
        \`starts_at\` DATETIME NOT NULL,
        \`expires_at\` DATETIME NOT NULL,
        \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`target_segment\` ENUM('all', 'new_customer', 'repeat_customer', 'selected_customers') NOT NULL DEFAULT 'all',
        \`applicable_merchant_ids\` JSON NULL,
        \`applicable_product_ids\` JSON NULL,
        \`eligible_resident_ids\` JSON NULL,
        \`created_by_id\` INT NOT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`coupon_id\`),
        UNIQUE KEY \`uq_coupons_code\` (\`code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      },
      {
        table: 'customer_coupons',
        ddl: `CREATE TABLE IF NOT EXISTS \`customer_coupons\` (
        \`claim_id\` INT NOT NULL AUTO_INCREMENT,
        \`coupon_id\` INT NOT NULL,
        \`resident_id\` INT NOT NULL,
        \`status\` ENUM('claimed', 'used', 'expired') NOT NULL DEFAULT 'claimed',
        \`claimed_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`used_at\` DATETIME NULL,
        \`order_id\` INT NULL,
        PRIMARY KEY (\`claim_id\`),
        UNIQUE KEY \`uq_customer_coupon_claim\` (\`coupon_id\`, \`resident_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      },
      {
        table: 'coupon_redemptions',
        ddl: `CREATE TABLE IF NOT EXISTS \`coupon_redemptions\` (
        \`redemption_id\` INT NOT NULL AUTO_INCREMENT,
        \`coupon_id\` INT NULL,
        \`coupon_code\` VARCHAR(64) NOT NULL,
        \`resident_id\` INT NOT NULL,
        \`order_id\` INT NULL,
        \`discount_amount\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        \`status\` ENUM('redeemed', 'failed') NOT NULL DEFAULT 'redeemed',
        \`failure_reason\` TEXT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`redemption_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      },
      {
        table: 'inventory_movements',
        ddl: `CREATE TABLE IF NOT EXISTS \`inventory_movements\` (
        \`movement_id\` INT NOT NULL AUTO_INCREMENT,
        \`product_id\` INT NOT NULL,
        \`merchant_id\` INT NOT NULL,
        \`product_name\` VARCHAR(180) NOT NULL,
        \`actor_id\` INT NOT NULL,
        \`actor_name\` VARCHAR(160) NOT NULL,
        \`actor_role\` VARCHAR(48) NOT NULL,
        \`movement_type\` ENUM('restock', 'sale_deduction', 'cancel_restock', 'return_restock', 'manual_adjustment', 'initial_stock') NOT NULL,
        \`quantity_delta\` INT NOT NULL,
        \`stock_before\` INT NOT NULL,
        \`stock_after\` INT NOT NULL,
        \`reference_order_id\` INT NULL,
        \`note\` TEXT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`movement_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      },
      {
        table: 'return_refund_requests',
        ddl: `CREATE TABLE IF NOT EXISTS \`return_refund_requests\` (
        \`return_id\` INT NOT NULL AUTO_INCREMENT,
        \`reference_code\` VARCHAR(64) NOT NULL,
        \`order_id\` INT NOT NULL,
        \`resident_id\` INT NOT NULL,
        \`merchant_id\` INT NOT NULL,
        \`reason_code\` ENUM('wrong_item', 'damaged_item', 'expired_product', 'missing_item', 'quality_issue', 'other') NOT NULL,
        \`description\` TEXT NOT NULL,
        \`requested_refund_amount\` DECIMAL(10, 2) NOT NULL,
        \`approved_refund_amount\` DECIMAL(10, 2) NULL,
        \`status\` ENUM('requested', 'store_approved', 'store_rejected', 'refunded', 'escalated', 'cs_resolved', 'cs_dismissed') NOT NULL DEFAULT 'requested',
        \`store_response_note\` TEXT NULL,
        \`store_responded_by\` INT NULL,
        \`store_responded_at\` DATETIME NULL,
        \`escalated_at\` DATETIME NULL,
        \`escalation_reason\` TEXT NULL,
        \`cs_notes\` TEXT NULL,
        \`cs_resolution_note\` TEXT NULL,
        \`cs_resolved_by\` INT NULL,
        \`cs_resolved_at\` DATETIME NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`return_id\`),
        UNIQUE KEY \`uq_return_refund_ref\` (\`reference_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      },
    ];
    for (const item of newTableDdls) {
      if (existingNewTables.has(item.table)) continue;
      try {
        await pool.execute(item.ddl);
      } catch {
        // Ignore non-fatal concurrent creation
      }
    }
  } catch {
    // Non-fatal: schema may already be up to date or restricted
  }
}

async function pingPoolWithTimeout(pool: Pool, timeoutMs = 6000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      pool.query('SELECT 1 AS ok'),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const timeoutErr = new Error(`MySQL ping timed out after ${timeoutMs}ms`) as Error & { code?: string };
          timeoutErr.code = 'ETIMEDOUT';
          reject(timeoutErr);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkMySqlConnection(force = false): Promise<boolean> {
  const cfg = resolveMySqlConfig();
  let pool = getMySqlPool();
  if (!cfg || !pool) {
    lastDiagnostic = 'not_configured';
    return false;
  }
  const now = Date.now();
  if (!force && lastPingAt > 0 && now - lastPingAt < 5000) {
    return lastPingResult;
  }
  try {
    await pingPoolWithTimeout(pool, 6000);
    lastPingAt = now;
    lastPingResult = true;
    lastDiagnostic = 'connected';
    if (!schemaSyncPromise) {
      schemaSyncPromise = ensureMySqlSchemaUpToDate(pool).catch(() => {});
    }
    if (!adminBootstrapAttempted) {
      adminBootstrapAttempted = true;
      void bootstrapAdminPasswordFromEnv().catch(() => {});
    }
    return true;
  } catch (err) {
    const category = classifyMySqlError(err);
    const errRec = (err && typeof err === 'object' ? err : {}) as { code?: string; message?: string };

    // If a stale socket timed out, recycle the pool cleanly so subsequent requests recover immediately
    if (category === 'timeout' && cachedPool) {
      const stalePool = cachedPool;
      cachedPool = null;
      cachedSignature = '';
      void stalePool.end().catch(() => {});
    }

    // Auto-negotiate TLS on managed cloud databases (e.g. Sevalla MySQL 8.0 with private CA)
    // unless the operator explicitly forced MYSQL_SSL_REJECT_UNAUTHORIZED=true.
    if (category === 'tls_error' && !cfg.sslRejectUnauthorizedExplicit) {
      const nextMode: 'strict_ca' | 'encrypted_unverified' | null =
        tlsFallbackMode === 'none' && !cfg.ssl && cfg.sslCa
          ? 'strict_ca'
          : tlsFallbackMode !== 'encrypted_unverified'
            ? 'encrypted_unverified'
            : null;
      if (nextMode) {
        console.warn(
          `[MedEx MySQL] TLS handshake failed (${errRec.code || 'TLS_ERROR'}); retrying with ${
            nextMode === 'strict_ca' ? 'detected CA certificate' : 'encrypted TLS for managed private CA'
          }.`
        );
        tlsFallbackMode = nextMode;
        pool = getMySqlPool();
        if (pool) {
          try {
            await pingPoolWithTimeout(pool, 6000);
            lastPingAt = Date.now();
            lastPingResult = true;
            lastDiagnostic = 'connected';
            if (!schemaSyncPromise) {
              schemaSyncPromise = ensureMySqlSchemaUpToDate(pool).catch(() => {});
            }
            if (!adminBootstrapAttempted) {
              adminBootstrapAttempted = true;
              void bootstrapAdminPasswordFromEnv().catch(() => {});
            }
            return true;
          } catch (retryErr) {
            const retryRec = (retryErr && typeof retryErr === 'object' ? retryErr : {}) as {
              code?: string;
              message?: string;
            };
            lastDiagnostic = classifyMySqlError(retryErr);
            if (now - lastLoggedErrorAt > 30000) {
              lastLoggedErrorAt = now;
              console.error(
                `[MedEx MySQL] Connection failed after TLS retry (${retryRec.code || lastDiagnostic}): ${retryRec.message || 'Unknown error'}`
              );
            }
            lastPingAt = now;
            lastPingResult = false;
            return false;
          }
        }
      }
    }

    lastDiagnostic = category;
    if (now - lastLoggedErrorAt > 30000) {
      lastLoggedErrorAt = now;
      console.error(
        `[MedEx MySQL] Connection failed (${errRec.code || category}) to ${cfg.host}:${cfg.port}/${cfg.database}: ${errRec.message || 'Unknown error'}`
      );
    }
    lastPingAt = now;
    lastPingResult = false;
    return false;
  }
}

export async function queryRows<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = getMySqlPool();
  if (!pool) {
    throw new Error('MySQL database is not configured.');
  }
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows as unknown as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await queryRows<T>(sql, params);
  return rows[0] ?? null;
}

export async function executeSql(
  sql: string,
  params: unknown[] = []
): Promise<ResultSetHeader> {
  const pool = getMySqlPool();
  if (!pool) {
    throw new Error('MySQL database is not configured.');
  }
  const [result] = await pool.execute<ResultSetHeader>({ sql, values: params });
  return result;
}

export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const pool = getMySqlPool();
  if (!pool) {
    throw new Error('MySQL database is not configured.');
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function bootstrapAdminPasswordFromEnv(): Promise<void> {
  const initialAdminPw = (process.env.ADMIN_INITIAL_PASSWORD || '').trim();
  if (
    !initialAdminPw ||
    initialAdminPw.length < 8 ||
    initialAdminPw.includes('YOUR_ADMIN_PASSWORD')
  ) {
    return;
  }
  const adminRow = await queryOne<{ user_id: number; password_hash: string | null }>(
    `SELECT user_id, password_hash FROM users WHERE email = ? AND role = 'admin' LIMIT 1`,
    ['admin@medex.ph']
  );
  if (adminRow && !adminRow.password_hash) {
    const hashed = hashPassword(initialAdminPw);
    await executeSql(
      `UPDATE users SET password_hash = ? WHERE user_id = ? AND password_hash IS NULL`,
      [hashed, adminRow.user_id]
    );
  }
}

export interface AuthenticatedMedExUser {
  userId: number;
  role: UserRole;
  status: AccountStatus;
  email: string;
  firstName: string;
  lastName: string;
  isApprovedAdmin: boolean;
  permissionOverrides: { grant: string[]; revoke: string[] };
}

export async function resolveAuthenticatedMedExUser(
  bearerToken: string | null
): Promise<AuthenticatedMedExUser | null> {
  if (!bearerToken) return null;
  if (!(await checkMySqlConnection())) return null;

  const payload = verifySessionToken(bearerToken);
  if (!payload) return null;

  try {
    const row = await queryOne<{
      user_id: number;
      role: UserRole;
      status: AccountStatus;
      email: string;
      first_name: string;
      last_name: string;
    }>(
      `SELECT user_id, role, status, email, first_name, last_name
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [payload.userId]
    );

    if (!row) return null;
    if (row.status === 'suspended' || row.status === 'rejected') return null;

    let overrideRows: Array<{ permission_code: string; effect: 'grant' | 'revoke' }> = [];
    try {
      overrideRows = await queryRows<{ permission_code: string; effect: 'grant' | 'revoke' }>(
        `SELECT permission_code, effect FROM user_permission_overrides WHERE user_id = ?`,
        [row.user_id]
      );
    } catch {
      overrideRows = [];
    }
    const grant = overrideRows.filter((o) => o.effect === 'grant').map((o) => o.permission_code);
    const revoke = overrideRows.filter((o) => o.effect === 'revoke').map((o) => o.permission_code);

    return {
      userId: Number(row.user_id),
      role: row.role,
      status: row.status,
      email: String(row.email || '').toLowerCase(),
      firstName: String(row.first_name || ''),
      lastName: String(row.last_name || ''),
      isApprovedAdmin: row.role === 'admin' && row.status === 'approved',
      permissionOverrides: { grant, revoke },
    };
  } catch {
    return null;
  }
}

export interface AuthoritativeOrderCheckoutInfo {
  orderId: number;
  orderCode: string;
  residentId: number;
  merchantId: number;
  merchantName: string;
  deliveryFee: number;
  totalAmount: number;
  status: string;
  hasPrescription: boolean;
  prescriptionStatus?: string;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
}

export async function getAuthoritativeOrderForCheckoutFromDb(orderId: number): Promise<{
  found: boolean;
  order?: AuthoritativeOrderCheckoutInfo;
  valid: boolean;
  statusCode: number;
  error?: string;
} | null> {
  if (!(await checkMySqlConnection())) return null;

  try {
    const orderRow = await queryOne<{
      order_id: number;
      order_code: string;
      resident_id: number;
      merchant_id: number;
      delivery_fee: number;
      total_amount: number;
      status: string;
    }>(
      `SELECT order_id, order_code, resident_id, merchant_id, delivery_fee, total_amount, status
       FROM orders
       WHERE order_id = ?
       LIMIT 1`,
      [orderId]
    );

    if (!orderRow) {
      return {
        found: false,
        valid: false,
        statusCode: 404,
        error: 'Order not found.',
      };
    }

    if (orderRow.status === 'cancelled') {
      return {
        found: true,
        valid: false,
        statusCode: 400,
        error: 'Cancelled orders cannot be paid.',
      };
    }

    const [rxRow, itemRows, merchantRow] = await Promise.all([
      queryOne<{ status: string }>(
        `SELECT status FROM prescriptions WHERE order_id = ? LIMIT 1`,
        [orderId]
      ),
      queryRows<{ product_name: string; quantity: number; unit_price: number }>(
        `SELECT product_name, quantity, unit_price FROM order_items WHERE order_id = ?`,
        [orderId]
      ),
      queryOne<{ shop_name: string }>(
        `SELECT shop_name FROM merchant_profiles WHERE merchant_id = ? LIMIT 1`,
        [orderRow.merchant_id]
      ),
    ]);

    if (rxRow && rxRow.status !== 'approved') {
      return {
        found: true,
        valid: false,
        statusCode: 403,
        error: 'GCash payment is locked until a licensed pharmacist approves the prescription.',
      };
    }

    return {
      found: true,
      valid: true,
      statusCode: 200,
      order: {
        orderId: Number(orderRow.order_id),
        orderCode: String(orderRow.order_code),
        residentId: Number(orderRow.resident_id),
        merchantId: Number(orderRow.merchant_id),
        merchantName: String(merchantRow?.shop_name || 'MedEx Partner Pharmacy'),
        deliveryFee: Number(orderRow.delivery_fee) || 0,
        totalAmount: Number(orderRow.total_amount) || 0,
        status: String(orderRow.status),
        hasPrescription: Boolean(rxRow),
        prescriptionStatus: rxRow?.status ? String(rxRow.status) : undefined,
        items: itemRows.map((it) => ({
          name: String(it.product_name || 'Medicine Item'),
          quantity: Math.max(1, Number(it.quantity) || 1),
          unitPrice: Number(it.unit_price) || 0,
        })),
      },
    };
  } catch {
    return null;
  }
}

export async function getOrderParticipantsFromDb(
  orderId: number
): Promise<{ residentId: number; merchantId: number } | null> {
  if (!(await checkMySqlConnection())) return null;
  try {
    const row = await queryOne<{ resident_id: number; merchant_id: number }>(
      `SELECT resident_id, merchant_id FROM orders WHERE order_id = ? LIMIT 1`,
      [orderId]
    );
    if (!row) return null;
    return {
      residentId: Number(row.resident_id),
      merchantId: Number(row.merchant_id),
    };
  } catch {
    return null;
  }
}

export async function recordCheckoutSessionOnPaymentDb(
  orderId: number,
  sessionId: string
): Promise<boolean> {
  if (!(await checkMySqlConnection())) return false;
  try {
    await executeSql(
      `UPDATE payments SET checkout_session_id = ? WHERE order_id = ?`,
      [sessionId, orderId]
    );
    return true;
  } catch {
    return false;
  }
}

export async function syncPaymentOutcomeToDb(input: {
  orderId?: number;
  sessionId?: string;
  status: 'pending' | 'paid' | 'failed';
  gatewayReference?: string;
  failureReason?: string;
  paidAt?: string;
}): Promise<boolean> {
  if (!(await checkMySqlConnection())) return false;

  try {
    let targetOrderId = input.orderId;
    if (!targetOrderId && input.sessionId) {
      const payRow = await queryOne<{ order_id: number }>(
        `SELECT order_id FROM payments WHERE checkout_session_id = ? LIMIT 1`,
        [input.sessionId]
      );
      if (payRow?.order_id) {
        targetOrderId = Number(payRow.order_id);
      }
    }
    if (!targetOrderId) return false;

    const nowSql = toMySqlDateTime(input.paidAt || new Date());

    await executeSql(
      `UPDATE payments
       SET status = ?,
           gateway_reference = ?,
           failure_reason = ?,
           checkout_session_id = COALESCE(?, checkout_session_id),
           paid_at = ?
       WHERE order_id = ?`,
      [
        input.status,
        input.gatewayReference ?? null,
        input.status === 'paid' ? null : input.failureReason ?? null,
        input.sessionId ?? null,
        input.status === 'paid' ? nowSql : null,
        targetOrderId,
      ]
    );

    const orderRow = await queryOne<{
      order_id: number;
      order_code: string;
      status: string;
      merchant_id: number;
      total_amount: number;
    }>(
      `SELECT order_id, order_code, status, merchant_id, total_amount
       FROM orders
       WHERE order_id = ?
       LIMIT 1`,
      [targetOrderId]
    );

    if (!orderRow) return true;

    if (input.status === 'paid' && orderRow.status === 'pending') {
      await executeSql(`UPDATE orders SET status = 'placed' WHERE order_id = ?`, [targetOrderId]);
      await executeSql(
        `INSERT INTO order_status_history (order_id, status, note, created_at)
         VALUES (?, 'placed', ?, ?)`,
        [
          targetOrderId,
          input.gatewayReference
            ? `GCash payment verified via PayMongo (${input.gatewayReference})`
            : 'GCash payment verified via PayMongo',
          nowSql,
        ]
      );

      const merchantRow = await queryOne<{ user_id: number }>(
        `SELECT user_id FROM merchant_profiles WHERE merchant_id = ? LIMIT 1`,
        [orderRow.merchant_id]
      );
      if (merchantRow?.user_id) {
        await executeSql(
          `INSERT INTO notifications (user_id, title, message, notification_type, is_read, created_at)
           VALUES (?, ?, ?, 'Order', 0, ?)`,
          [
            merchantRow.user_id,
            `GCash paid for ${orderRow.order_code}`,
            `Customer authorized ₱${Number(orderRow.total_amount).toFixed(2)} via GCash. Ready for pharmacy preparation.`,
            nowSql,
          ]
        );
      }
    } else if (input.status === 'failed') {
      await executeSql(
        `INSERT INTO order_status_history (order_id, status, note, created_at)
         VALUES (?, ?, ?, ?)`,
        [
          targetOrderId,
          orderRow.status,
          input.failureReason || 'GCash payment authorization failed',
          nowSql,
        ]
      );
    }

    emitRealtimeSync('full');
    return true;
  } catch {
    return false;
  }
}

export async function findPaymentSessionFromDb(sessionId: string): Promise<{
  sessionId: string;
  orderId: number;
  orderCode: string;
  idempotencyKey: string;
  amount: number;
  mode: 'paymongo_live' | 'sandbox';
  status: 'pending' | 'paid' | 'failed';
  checkoutUrl: null;
  gatewayReference?: string;
  failureReason?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
} | null> {
  if (!sessionId || !(await checkMySqlConnection())) return null;

  try {
    const payRow = await queryOne<{
      order_id: number;
      idempotency_key: string;
      amount: number;
      status: string;
      gateway_reference: string | null;
      failure_reason: string | null;
      is_simulated_sandbox: number;
      paid_at: string | null;
      created_at: string;
    }>(
      `SELECT order_id, idempotency_key, amount, status, gateway_reference, failure_reason,
              is_simulated_sandbox, paid_at, created_at
       FROM payments
       WHERE checkout_session_id = ?
       LIMIT 1`,
      [sessionId]
    );
    if (!payRow) return null;

    const orderRow = await queryOne<{ order_code: string }>(
      `SELECT order_code FROM orders WHERE order_id = ? LIMIT 1`,
      [payRow.order_id]
    );

    const mappedStatus: 'pending' | 'paid' | 'failed' =
      payRow.status === 'paid' || payRow.status === 'collected'
        ? 'paid'
        : payRow.status === 'failed'
          ? 'failed'
          : 'pending';

    return {
      sessionId,
      orderId: Number(payRow.order_id),
      orderCode: orderRow?.order_code || `MDX-ORD-${payRow.order_id}`,
      idempotencyKey: payRow.idempotency_key || `pay-${payRow.order_id}`,
      amount: Number(payRow.amount) || 0,
      mode: payRow.is_simulated_sandbox ? 'sandbox' : 'paymongo_live',
      status: mappedStatus,
      checkoutUrl: null,
      gatewayReference: payRow.gateway_reference || undefined,
      failureReason: payRow.failure_reason || undefined,
      paidAt: payRow.paid_at || undefined,
      createdAt: payRow.created_at || new Date().toISOString(),
      updatedAt: payRow.paid_at || payRow.created_at || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function syncEmergencyDispatchLogToDb(record: {
  idempotencyKey: string;
  handoffMode: 'mobile_dialer' | 'desktop_qr';
}): Promise<boolean> {
  if (!(await checkMySqlConnection())) return false;
  try {
    const existing = await queryOne<{ alert_id: number; status: string }>(
      `SELECT alert_id, status FROM emergency_alerts WHERE idempotency_key = ? LIMIT 1`,
      [record.idempotencyKey]
    );
    if (!existing) return false;
    const nextStatus = existing.status === 'queued_offline' ? 'submitted' : existing.status;
    await executeSql(
      `UPDATE emergency_alerts SET handoff_mode = ?, status = ? WHERE alert_id = ?`,
      [record.handoffMode, nextStatus, existing.alert_id]
    );
    emitRealtimeSync('full');
    return true;
  } catch {
    return false;
  }
}

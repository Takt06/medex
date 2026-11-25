# Security Summary

This walkthrough documents the security, business-logic, database-integrity, and UI hardening applied across the MedEx Olongapo PWA and Express/MySQL backend (`server.ts`, `server/authService.ts`, `server/medexRoutes.ts`, `database/medex_mysql_schema.sql`, `src/utils/medexRules.ts`, `src/utils/imageUpload.ts`, `src/utils/apiSync.ts`, `src/context/MedExContext.tsx`, and portal UI components).

## Hardened Areas
1. **Authentication, Session Revocation & Rate Limiting (`server/authService.ts`, `server/medexRoutes.ts`)**
   - Added unique `jti` token identifiers, explicit `POST /api/auth/logout` token revocation (`revokeSessionToken`), and `invalidateUserTokens(userId, atMs)` triggered when an admin suspends/rejects an account, changes a user's role, or overrides RBAC permissions.
   - Added sliding-window rate limiting (`consumeAuthRateLimit`) across `/api/auth/login` and `/api/auth/claim-admin` plus `/api/notifications/notify-admins`, returning HTTP `429` with `Retry-After` headers.
   - Added a startup warning in production when `SESSION_SECRET` is unset or weak.

2. **Public PII & Document Exposure (`server/medexRoutes.ts`)**
   - Redacted sensitive fields (`business_permit_url`, `government_id_url`, `business_permit_name`, `government_id_name`) from unauthenticated and public `GET /api/state` merchant payloads via `redactPublicMerchantFields`.
   - Stripped secret delivery confirmation PINs from public order state snapshots unless the viewer is an authorized order owner, approved merchant, assigned rider, or approved admin.

3. **Authoritative Order, Pricing, Inventory & Delivery PIN Enforcement (`server/medexRoutes.ts`, `src/utils/medexRules.ts`, `src/utils/apiSync.ts`, `src/context/MedExContext.tsx`)**
   - `POST /api/orders` locks target product rows in deterministic `product_id` order (`FOR UPDATE`), aggregates duplicate line items per SKU before deducting stock, enforces `purchase_limit`, enforces server-authoritative `AUTHORITATIVE_DELIVERY_FEE = 45`, checks `requires_prescription` gating, and forces valid initial order status (`placed`, `pending`, or `awaiting_prescription_review`).
   - `PATCH /api/orders/:id/status` enforces role-aware and prescription-aware state transitions via `canTransitionOrderStatus`, blocks arbitrary client-submitted `'delivered'` skips without dispatch/admin authority or PIN verification, and executes inside `withTransaction` with row locking.
   - Added server-authoritative `POST /api/orders/:id/delivery/verify-code` with randomized 4-digit PIN generation, constant-time `crypto.timingSafeEqual` comparison (`isSafePinMatch`), attempt counter enforcement (`max 3` attempts before admin escalation flag), COD collection prerequisite verification, and atomic delivery completion + single `rider_earnings` record creation.
   - Locked `POST /api/riders/earnings` exclusively to approved Admin staff, derived `delivery_id` and `rider_id` server-side in `POST /api/ratings/delivery`, and enforced owner/staff field allowlists on `PUT /api/reviews/pharmacy/:id`, `PATCH /api/reports/:id/status`, `POST /api/coupons`, and `PUT /api/coupons/:id`.

4. **XSS, Upload, URL & Redirect Safety (`src/utils/imageUpload.ts`, `src/utils/medexRules.ts`, `server.ts`, frontend modals)**
   - Removed SVG upload acceptance (`svg`, `image/svg+xml`) from medicine image validation to eliminate stored SVG script execution risks.
   - Enforced `isSafeImageOrDocUrl` allowlists (relative app/upload paths, `https://`, and raster/PDF `data:` payloads only — rejecting `javascript:`, `vbscript:`, `data:text/html`, `data:image/svg+xml`, path traversal `..`, and insecure `http://` URLs) across product saves, Rx reuploads, admin document preview links/images, and server write endpoints.
   - Enforced `isSafeHttpsUrl` on PayMongo checkout URL redirects both server-side (`server.ts`) and in `GCashCheckoutSheet.tsx`.
   - Hardened `getAppBaseUrl(req)` against untrusted `Host` headers, disabled `X-Powered-By`, and added `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=()` headers while keeping iframe compatibility intact.

5. **Database Schema Constraints & UI Double-Submit Prevention (`database/medex_mysql_schema.sql`, frontend forms)**
   - Added `idx_orders_coupon` index and `CHECK` constraints on `delivery_ratings.stars` (`1..5`), `pharmacy_reviews.rating` (`1..5`), and `coupons.discount_value` (`> 0`).
   - Added in-flight submission locks (`submitting`, `verifyingDeliveryId`, `cancelSubmitting`, `reuploadSubmitting`) to rating/report modals, rider PIN verification, and resident order cancel/Rx-reupload forms.
   - Converted server catch blocks to sanitized `sendInternalDbError(...)` responses so raw database messages and stack details are logged server-side and never returned in JSON API error payloads.

---

## PoC Verification

### 1. Security Headers & `X-Powered-By` Removal (Live HTTP Verification)
Verified via `curl -s -D - -o /dev/null http://localhost:3000/api/auth/bootstrap-status`:
- Observed HTTP `200 OK` with headers:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=()`
- Confirmed `X-Powered-By` header is absent from server responses.

### 2. Token Revocation on `POST /api/auth/logout` & Fail-Closed `503` Verification
Verified via automated HTTP integration test (`server/auditSecurity.test.ts`):
- Signed a bearer token via `signSessionToken(...)` and verified `verifySessionToken(token)` returned active claims.
- Sent `POST /api/auth/logout` with `Authorization: Bearer <token>` against the live test Express app (`createMedExRouter()`); received HTTP `200 { ok: true }` and confirmed `verifySessionToken(token)` subsequently returned `null` (immediate `jti` revocation).
- Sent requests to `POST /api/orders`, `POST /api/orders/501/delivery/verify-code`, `POST /api/riders/earnings`, `POST /api/notifications/notify-admins`, and `GET /api/state` without a configured MySQL instance; confirmed every route fails closed with HTTP `503`, `ok: false`, and sanitized error messages free of raw SQL statements or stack traces.

### 3. URL Scheme, SVG Upload & State-Machine Guard Verification
Verified via automated unit tests (`src/utils/medexRules.test.ts` & `server/authService.test.ts`):
- `isSafeImageOrDocUrl` rejects `javascript:alert(1)`, `vbscript:msgbox(1)`, `data:text/html;base64,...`, `data:image/svg+xml;base64,...`, `/uploads/../etc/passwd`, and `http://` links while allowing `/uploads/...`, `https://`, and raster/PDF base64 URLs.
- `isSafeHttpsUrl` rejects `http://` and `javascript:` redirect URLs while permitting `https://checkout.paymongo.com/...`.
- `validateMedicineImageFile` rejects `.svg` / `image/svg+xml` uploads.
- `canTransitionOrderStatus` and `validateReportStatusTransition` block unauthorized role jumps, unapproved Rx fulfillment skips, unassigned rider pickups, terminal state rewrites, and store-owner edits on escalated reports.
- `consumeAuthRateLimit` enforces sliding-window thresholds and resets cleanly.

### 4. Automated Test Suite, Build & TypeScript Verification
Executed after final edits:
- `npx --yes tsx --test src/utils/*.test.ts`: **69 passed, 0 failed**
- `npx --yes tsx --test server/*.test.ts`: **17 passed, 0 failed**
- **Combined test total**: **86 passed, 0 failed**
- `npm run build` (`compile_applet`): **Succeeded**
- `tsc --noEmit` (`lint_applet`): **Succeeded (0 errors)**

### 5. Headless Chromium Verification (`playwright-cli`)
Verified against running `http://localhost:3000?autostart=1` after restarting the dev server:
- **Desktop (`1440x900`)**: Storefront shell, search bar, category filters, promotional banner carousel, empty-state messaging, and sign-in modal rendered cleanly with **0 console errors and 0 warnings**.
- **Mobile (`390x844`)**: Responsive navigation, stacked service cards, search input, and category strip stayed cleanly within the viewport bounds with **0 console errors and 0 warnings**.
- *Scope limitation*: Because MySQL is not provisioned in this container (`mysqlConfigured: false`), authenticated multi-role persistence paths against live MySQL (`POST /api/orders`, `POST /api/orders/:id/delivery/verify-code`, live SSE DB deltas) were verified by code inspection, TypeScript checking, and router/unit test suites rather than against a live MySQL daemon.

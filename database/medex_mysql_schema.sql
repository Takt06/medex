-- ============================================================================
-- MedEx Olongapo City — Complete MySQL 8.0 / MariaDB Schema & Seed Script
-- Compatible with Navicat for MySQL, MySQL 8.0+, and MariaDB 10.4+ (XAMPP)
--
-- HOW TO RUN IN NAVICAT FOR MYSQL:
--   1. Connect to your local MySQL server in Navicat.
--   2. Right-click your connection -> New Query (or Execute SQL File...).
--   3. Open and run this entire file. It creates `medex_olongapo`, all 26
--      normalized InnoDB tables, 3 privacy-safe views, indexes, and initial
--      Olongapo City seed records safely.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `medex_olongapo`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `medex_olongapo`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- 1. CORE IDENTITY, BARANGAYS & HOUSEHOLD SAFETY TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS `barangays` (
  `barangay_id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `city` VARCHAR(100) NOT NULL DEFAULT 'Olongapo City',
  `province` VARCHAR(100) NOT NULL DEFAULT 'Zambales',
  `region` VARCHAR(80) NOT NULL DEFAULT 'Region III',
  PRIMARY KEY (`barangay_id`),
  UNIQUE KEY `uq_barangays_name_city` (`name`, `city`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `user_id` INT NOT NULL AUTO_INCREMENT,
  `role` ENUM(
    'resident',
    'merchant',
    'rider',
    'admin',
    'delivery_manager',
    'coupon_handler',
    'inventory_manager',
    'customer_service'
  ) NOT NULL,
  `phone_number` VARCHAR(32) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(255) NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `date_of_birth` DATE NOT NULL,
  `status` ENUM('pending', 'approved', 'rejected', 'suspended') NOT NULL DEFAULT 'pending',
  `status_reason` TEXT NULL,
  `policy_accepted_at` DATETIME NULL,
  `policy_version` VARCHAR(32) NULL,
  `created_by_admin_id` INT NULL,
  `department_label` VARCHAR(120) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_users_phone` (`phone_number`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_role_status` (`role`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `addresses` (
  `address_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `barangay_id` INT NOT NULL,
  `recipient_name` VARCHAR(160) NOT NULL,
  `recipient_phone` VARCHAR(32) NOT NULL,
  `street` VARCHAR(255) NOT NULL,
  `landmark` VARCHAR(255) NULL,
  `delivery_instructions` TEXT NULL,
  `latitude` DOUBLE NOT NULL,
  `longitude` DOUBLE NOT NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`address_id`),
  KEY `idx_addresses_user_id` (`user_id`),
  KEY `idx_addresses_barangay_id` (`barangay_id`),
  CONSTRAINT `fk_addresses_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_addresses_barangay` FOREIGN KEY (`barangay_id`) REFERENCES `barangays` (`barangay_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `household_flags` (
  `user_id` INT NOT NULL,
  `has_senior` TINYINT(1) NOT NULL DEFAULT 0,
  `has_pwd` TINYINT(1) NOT NULL DEFAULT 0,
  `has_young_child` TINYINT(1) NOT NULL DEFAULT 0,
  `has_pregnant_member` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_household_flags_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `emergency_contacts` (
  `contact_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `contact_name` VARCHAR(150) NOT NULL,
  `relationship` VARCHAR(100) NOT NULL,
  `phone_number` VARCHAR(32) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`contact_id`),
  KEY `idx_emergency_contacts_user` (`user_id`),
  CONSTRAINT `fk_emergency_contacts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `emergency_alerts` (
  `alert_id` INT NOT NULL AUTO_INCREMENT,
  `reference_code` VARCHAR(64) NOT NULL,
  `idempotency_key` VARCHAR(120) NOT NULL,
  `user_id` INT NOT NULL,
  `category` ENUM('911_general') NOT NULL DEFAULT '911_general',
  `handoff_mode` ENUM('mobile_dialer', 'desktop_qr') NULL,
  `address_id` INT NOT NULL,
  `address_snapshot` TEXT NOT NULL,
  `barangay_name` VARCHAR(120) NOT NULL,
  `latitude` DOUBLE NOT NULL,
  `longitude` DOUBLE NOT NULL,
  `status` ENUM('queued_offline', 'submitted', 'received', 'verified', 'resolved', 'cancelled', 'escalated') NOT NULL DEFAULT 'submitted',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelled_at` DATETIME NULL,
  PRIMARY KEY (`alert_id`),
  UNIQUE KEY `uq_emergency_alerts_ref` (`reference_code`),
  UNIQUE KEY `uq_emergency_alerts_idem` (`idempotency_key`),
  KEY `idx_emergency_alerts_user` (`user_id`, `created_at`),
  CONSTRAINT `fk_emergency_alerts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_emergency_alerts_address` FOREIGN KEY (`address_id`) REFERENCES `addresses` (`address_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `alert_verifications` (
  `verification_id` INT NOT NULL AUTO_INCREMENT,
  `alert_id` INT NOT NULL,
  `decision` ENUM('genuine', 'false_alarm', 'accidental_press') NOT NULL,
  `verified_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `verified_by_id` INT NOT NULL,
  `verified_by_name` VARCHAR(150) NOT NULL,
  `notes` TEXT NOT NULL,
  PRIMARY KEY (`verification_id`),
  UNIQUE KEY `uq_alert_verifications_alert` (`alert_id`),
  CONSTRAINT `fk_alert_verifications_alert` FOREIGN KEY (`alert_id`) REFERENCES `emergency_alerts` (`alert_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_alert_verifications_user` FOREIGN KEY (`verified_by_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 2. PHARMACY STOREFRONT, OPERATING HOURS & INVENTORY TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS `product_categories` (
  `category_id` INT NOT NULL AUTO_INCREMENT,
  `name` ENUM('Medicines', 'First Aid', 'Hygiene', 'Baby Care', 'Masks & PPE', 'Equipment') NOT NULL,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `uq_product_categories_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `merchant_profiles` (
  `merchant_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `shop_name` VARCHAR(180) NOT NULL,
  `shop_address_id` INT NOT NULL,
  `is_pharmacist` TINYINT(1) NOT NULL DEFAULT 1,
  `pharmacist_name` VARCHAR(150) NOT NULL,
  `pharmacist_license_no` VARCHAR(32) NOT NULL,
  `is_24_hours` TINYINT(1) NOT NULL DEFAULT 0,
  `is_temporarily_closed` TINYINT(1) NOT NULL DEFAULT 0,
  `contact_no` VARCHAR(32) NOT NULL,
  `business_permit_name` VARCHAR(255) NULL,
  `business_permit_url` MEDIUMTEXT NULL,
  `government_id_name` VARCHAR(255) NULL,
  `government_id_url` MEDIUMTEXT NULL,
  `documents_verified_at` DATETIME NULL,
  `documents_verified_by` INT NULL,
  PRIMARY KEY (`merchant_id`),
  UNIQUE KEY `uq_merchant_profiles_user` (`user_id`),
  UNIQUE KEY `uq_merchant_prc` (`pharmacist_license_no`),
  KEY `idx_merchant_profiles_address` (`shop_address_id`),
  CONSTRAINT `fk_merchant_profiles_merchant_user` FOREIGN KEY (`merchant_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_merchant_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_merchant_profiles_address` FOREIGN KEY (`shop_address_id`) REFERENCES `addresses` (`address_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `merchant_hours` (
  `hours_id` INT NOT NULL AUTO_INCREMENT,
  `merchant_id` INT NOT NULL,
  `day_of_week` TINYINT NOT NULL,
  `opens_at` VARCHAR(10) NOT NULL DEFAULT '08:00',
  `closes_at` VARCHAR(10) NOT NULL DEFAULT '20:00',
  `is_closed` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`hours_id`),
  UNIQUE KEY `uq_merchant_hours_day` (`merchant_id`, `day_of_week`),
  CONSTRAINT `fk_merchant_hours_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchant_profiles` (`merchant_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `products` (
  `product_id` INT NOT NULL AUTO_INCREMENT,
  `merchant_id` INT NOT NULL,
  `category_id` INT NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `dosage_strength` VARCHAR(100) NULL,
  `description` TEXT NOT NULL,
  `image_path` MEDIUMTEXT NOT NULL,
  `unit` VARCHAR(80) NOT NULL,
  `purchase_limit` INT NOT NULL DEFAULT 5,
  `is_listed` TINYINT(1) NOT NULL DEFAULT 1,
  `is_archived` TINYINT(1) NOT NULL DEFAULT 0,
  `archived_at` DATETIME NULL,
  `requires_prescription` TINYINT(1) NOT NULL DEFAULT 0,
  `regular_price` DECIMAL(10, 2) NOT NULL,
  `stock_quantity` INT NOT NULL DEFAULT 0,
  `low_stock_threshold` INT NOT NULL DEFAULT 10,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`product_id`),
  KEY `idx_products_merchant_listed` (`merchant_id`, `is_listed`),
  KEY `idx_products_archived` (`is_archived`),
  KEY `idx_products_category` (`category_id`),
  CONSTRAINT `fk_products_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchant_profiles` (`merchant_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `product_categories` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. ORDERS, PRESCRIPTIONS, PAYMENTS & RIDER DELIVERY TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS `orders` (
  `order_id` INT NOT NULL AUTO_INCREMENT,
  `order_code` VARCHAR(64) NOT NULL,
  `idempotency_key` VARCHAR(120) NOT NULL,
  `resident_id` INT NOT NULL,
  `merchant_id` INT NOT NULL,
  `alert_id` INT NULL,
  `address_id` INT NOT NULL,
  `delivery_address_snapshot` TEXT NOT NULL,
  `recipient_name` VARCHAR(160) NOT NULL,
  `recipient_phone` VARCHAR(32) NOT NULL,
  `rider_note` TEXT NULL,
  `subtotal` DECIMAL(10, 2) NOT NULL,
  `delivery_fee` DECIMAL(10, 2) NOT NULL,
  `coupon_id` INT NULL,
  `coupon_code` VARCHAR(64) NULL,
  `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(10, 2) NOT NULL,
  `status` ENUM(
    'awaiting_prescription_review',
    'pending',
    'placed',
    'preparing',
    'ready_for_pickup',
    'out_for_delivery',
    'delivered',
    'cancelled'
  ) NOT NULL DEFAULT 'placed',
  `cancel_reason` TEXT NULL,
  `placed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_id`),
  UNIQUE KEY `uq_orders_code` (`order_code`),
  UNIQUE KEY `uq_orders_idem` (`idempotency_key`),
  KEY `idx_orders_resident` (`resident_id`, `placed_at`),
  KEY `idx_orders_merchant` (`merchant_id`, `placed_at`),
  KEY `idx_orders_coupon` (`coupon_id`),
  CONSTRAINT `fk_orders_resident` FOREIGN KEY (`resident_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_orders_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchant_profiles` (`merchant_id`),
  CONSTRAINT `fk_orders_alert` FOREIGN KEY (`alert_id`) REFERENCES `emergency_alerts` (`alert_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_orders_address` FOREIGN KEY (`address_id`) REFERENCES `addresses` (`address_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_items` (
  `order_item_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `merchant_id` INT NOT NULL,
  `product_name` VARCHAR(180) NOT NULL,
  `unit` VARCHAR(80) NOT NULL,
  `requires_prescription` TINYINT(1) NOT NULL DEFAULT 0,
  `unit_price` DECIMAL(10, 2) NOT NULL,
  `quantity` INT NOT NULL,
  PRIMARY KEY (`order_item_id`),
  KEY `idx_order_items_order` (`order_id`),
  KEY `idx_order_items_product` (`product_id`),
  CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_order_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`),
  CONSTRAINT `fk_order_items_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchant_profiles` (`merchant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_status_history` (
  `history_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `status` VARCHAR(48) NOT NULL,
  `note` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  KEY `idx_order_history_order` (`order_id`, `created_at`),
  CONSTRAINT `fk_order_history_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `prescriptions` (
  `prescription_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `resident_id` INT NOT NULL,
  `merchant_id` INT NOT NULL,
  `patient_name` VARCHAR(160) NOT NULL,
  `doctor_name` VARCHAR(160) NOT NULL,
  `license_no` VARCHAR(64) NOT NULL,
  `date_issued` DATE NOT NULL,
  `valid_until` DATE NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_type` ENUM('jpg', 'png', 'pdf') NOT NULL,
  `file_preview_url` MEDIUMTEXT NOT NULL,
  `storage_path` VARCHAR(512) NULL,
  `status` ENUM('pending_review', 'approved', 'rejected') NOT NULL DEFAULT 'pending_review',
  `reject_reason` TEXT NULL,
  `remarks` TEXT NULL,
  `reviewed_by` VARCHAR(160) NULL,
  `reviewed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`prescription_id`),
  UNIQUE KEY `uq_prescriptions_order` (`order_id`),
  KEY `idx_prescriptions_merchant` (`merchant_id`, `status`),
  CONSTRAINT `fk_prescriptions_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_prescriptions_resident` FOREIGN KEY (`resident_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_prescriptions_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchant_profiles` (`merchant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payments` (
  `payment_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `method` ENUM('GCash', 'COD') NOT NULL,
  `idempotency_key` VARCHAR(120) NOT NULL,
  `receipt_number` VARCHAR(80) NOT NULL,
  `amount` DECIMAL(10, 2) NOT NULL,
  `amount_collected` DECIMAL(10, 2) NULL,
  `is_flagged` TINYINT(1) NOT NULL DEFAULT 0,
  `failure_reason` TEXT NULL,
  `status` ENUM('pending', 'paid', 'collected', 'failed') NOT NULL DEFAULT 'pending',
  `gateway_reference` VARCHAR(120) NULL,
  `checkout_session_id` VARCHAR(120) NULL,
  `is_simulated_sandbox` TINYINT(1) NOT NULL DEFAULT 0,
  `paid_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `uq_payments_order` (`order_id`),
  UNIQUE KEY `uq_payments_idem` (`idempotency_key`),
  UNIQUE KEY `uq_payments_receipt` (`receipt_number`),
  KEY `idx_payments_checkout_session` (`checkout_session_id`),
  CONSTRAINT `fk_payments_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rider_profiles` (
  `rider_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `vehicle_type` VARCHAR(120) NOT NULL,
  `plate_number` VARCHAR(32) NOT NULL,
  `is_online` TINYINT(1) NOT NULL DEFAULT 0,
  `operational_status` ENUM('active', 'available', 'assigned', 'on_delivery', 'suspended', 'inactive') NOT NULL DEFAULT 'available',
  `rating` DECIMAL(3, 2) NOT NULL DEFAULT 5.00,
  `total_deliveries` INT NOT NULL DEFAULT 0,
  `driver_license_name` VARCHAR(255) NULL,
  `driver_license_url` MEDIUMTEXT NULL,
  `vehicle_registration_name` VARCHAR(255) NULL,
  `vehicle_registration_url` MEDIUMTEXT NULL,
  `documents_verified_at` DATETIME NULL,
  `documents_verified_by` INT NULL,
  PRIMARY KEY (`rider_id`),
  UNIQUE KEY `uq_rider_profiles_user` (`user_id`),
  UNIQUE KEY `uq_rider_plate` (`plate_number`),
  CONSTRAINT `fk_rider_profiles_rider_user` FOREIGN KEY (`rider_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rider_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `deliveries` (
  `delivery_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `rider_id` INT NULL,
  `pickup_merchant_id` INT NOT NULL,
  `status` ENUM('requested', 'assigned', 'picked_up', 'delivered', 'not_home', 'failed') NOT NULL DEFAULT 'requested',
  `failure_reason` TEXT NULL,
  `assigned_at` DATETIME NULL,
  `picked_up_at` DATETIME NULL,
  `delivered_at` DATETIME NULL,
  `requested_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmation_code` VARCHAR(16) NOT NULL,
  `code_attempts` INT NOT NULL DEFAULT 0,
  `is_flagged_for_admin` TINYINT(1) NOT NULL DEFAULT 0,
  `rider_lat` DOUBLE NULL,
  `rider_lng` DOUBLE NULL,
  `declined_by_rider_ids` JSON NULL,
  PRIMARY KEY (`delivery_id`),
  UNIQUE KEY `uq_deliveries_order` (`order_id`),
  KEY `idx_deliveries_status_rider` (`status`, `rider_id`),
  CONSTRAINT `fk_deliveries_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_deliveries_rider` FOREIGN KEY (`rider_id`) REFERENCES `rider_profiles` (`rider_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_deliveries_merchant` FOREIGN KEY (`pickup_merchant_id`) REFERENCES `merchant_profiles` (`merchant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rider_earnings` (
  `earning_id` INT NOT NULL AUTO_INCREMENT,
  `rider_id` INT NOT NULL,
  `delivery_id` INT NOT NULL,
  `order_code` VARCHAR(64) NOT NULL,
  `amount` DECIMAL(10, 2) NOT NULL,
  `payout_status` ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`earning_id`),
  UNIQUE KEY `uq_rider_earnings_delivery` (`delivery_id`),
  KEY `idx_rider_earnings_rider` (`rider_id`, `created_at`),
  CONSTRAINT `fk_rider_earnings_rider` FOREIGN KEY (`rider_id`) REFERENCES `rider_profiles` (`rider_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rider_earnings_delivery` FOREIGN KEY (`delivery_id`) REFERENCES `deliveries` (`delivery_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. RATINGS, REVIEWS, REPORTS, NOTIFICATIONS & AUDIT LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS `delivery_ratings` (
  `rating_id` INT NOT NULL AUTO_INCREMENT,
  `delivery_id` INT NOT NULL,
  `order_id` INT NOT NULL,
  `resident_id` INT NOT NULL,
  `rider_id` INT NOT NULL,
  `stars` TINYINT NOT NULL,
  `tags` JSON NULL,
  `comment` TEXT NOT NULL,
  `is_anonymous` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`rating_id`),
  UNIQUE KEY `uq_delivery_ratings_delivery` (`delivery_id`),
  UNIQUE KEY `uq_delivery_ratings_order` (`order_id`),
  KEY `idx_delivery_ratings_rider` (`rider_id`),
  CONSTRAINT `chk_delivery_ratings_stars` CHECK (`stars` BETWEEN 1 AND 5),
  CONSTRAINT `fk_delivery_ratings_delivery` FOREIGN KEY (`delivery_id`) REFERENCES `deliveries` (`delivery_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_delivery_ratings_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_delivery_ratings_resident` FOREIGN KEY (`resident_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_delivery_ratings_rider` FOREIGN KEY (`rider_id`) REFERENCES `rider_profiles` (`rider_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `feedback_categories` (
  `category_id` INT NOT NULL AUTO_INCREMENT,
  `applies_to` ENUM('order', 'locator', 'app') NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `label` VARCHAR(160) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `uq_feedback_categories_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pharmacy_reviews` (
  `review_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `resident_id` INT NOT NULL,
  `merchant_id` INT NOT NULL,
  `rating` TINYINT NOT NULL,
  `tags` JSON NULL,
  `comment` TEXT NOT NULL,
  `is_anonymous` TINYINT(1) NOT NULL DEFAULT 1,
  `status` ENUM('visible', 'hidden') NOT NULL DEFAULT 'visible',
  `moderation_reason` TEXT NULL,
  `moderated_by` INT NULL,
  `moderated_at` DATETIME NULL,
  `merchant_reply` TEXT NULL,
  `replied_at` DATETIME NULL,
  `idempotency_key` VARCHAR(120) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`review_id`),
  UNIQUE KEY `uq_pharmacy_reviews_order` (`order_id`),
  UNIQUE KEY `uq_pharmacy_reviews_idem` (`idempotency_key`),
  KEY `idx_pharmacy_reviews_merchant` (`merchant_id`, `status`),
  CONSTRAINT `chk_pharmacy_reviews_rating` CHECK (`rating` BETWEEN 1 AND 5),
  CONSTRAINT `fk_pharmacy_reviews_resident` FOREIGN KEY (`resident_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_pharmacy_reviews_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchant_profiles` (`merchant_id`),
  CONSTRAINT `fk_pharmacy_reviews_moderator` FOREIGN KEY (`moderated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `problem_reports` (
  `report_id` INT NOT NULL AUTO_INCREMENT,
  `reference_code` VARCHAR(64) NOT NULL,
  `idempotency_key` VARCHAR(120) NOT NULL,
  `user_id` INT NOT NULL,
  `source` ENUM('order', 'locator', 'app') NOT NULL,
  `order_id` INT NULL,
  `merchant_id` INT NULL,
  `product_id` INT NULL,
  `search_id` VARCHAR(120) NULL,
  `category_code` VARCHAR(64) NOT NULL,
  `category_label` VARCHAR(160) NOT NULL,
  `category_tag` VARCHAR(120) NULL,
  `description` TEXT NOT NULL,
  `is_anonymous` TINYINT(1) NOT NULL DEFAULT 1,
  `status` ENUM('open', 'acknowledged', 'escalated', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  `admin_notes` TEXT NULL,
  `cs_notes` TEXT NULL,
  `resolution_note` TEXT NULL,
  `escalated_at` DATETIME NULL,
  `escalated_by_id` INT NULL,
  `escalated_reason` TEXT NULL,
  `store_responded_at` DATETIME NULL,
  `resolved_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`report_id`),
  UNIQUE KEY `uq_problem_reports_ref` (`reference_code`),
  UNIQUE KEY `uq_problem_reports_idem` (`idempotency_key`),
  KEY `idx_problem_reports_user` (`user_id`, `created_at`),
  CONSTRAINT `fk_problem_reports_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_problem_reports_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_problem_reports_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchant_profiles` (`merchant_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_problem_reports_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `problem_report_status_history` (
  `history_id` INT NOT NULL AUTO_INCREMENT,
  `report_id` INT NOT NULL,
  `status` ENUM('open', 'acknowledged', 'escalated', 'resolved', 'dismissed') NOT NULL,
  `changed_by_id` INT NOT NULL,
  `changed_by_name` VARCHAR(160) NOT NULL,
  `changed_by_role` ENUM(
    'resident',
    'merchant',
    'rider',
    'admin',
    'delivery_manager',
    'coupon_handler',
    'inventory_manager',
    'customer_service'
  ) NOT NULL,
  `note` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  KEY `idx_report_history_report` (`report_id`, `created_at`),
  CONSTRAINT `fk_report_history_report` FOREIGN KEY (`report_id`) REFERENCES `problem_reports` (`report_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_report_history_user` FOREIGN KEY (`changed_by_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `notification_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `message` TEXT NOT NULL,
  `notification_type` ENUM('Order', 'Payment', 'Delivery', 'Verification', 'Prescription', 'Feedback', 'System', 'Alert') NOT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `idx_notifications_user_read` (`user_id`, `is_read`, `created_at`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `log_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `actor_name` VARCHAR(160) NOT NULL,
  `action` VARCHAR(120) NOT NULL,
  `entity` VARCHAR(80) NOT NULL,
  `entity_id` VARCHAR(64) NOT NULL,
  `before_after` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_audit_logs_created` (`created_at`),
  CONSTRAINT `fk_audit_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 5. PRIVACY-SAFE VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW `public_pharmacy_reviews` AS
SELECT
  `review_id`,
  `order_id`,
  CASE WHEN `is_anonymous` = 1 THEN NULL ELSE `resident_id` END AS `resident_id`,
  `merchant_id`,
  `rating`,
  `tags`,
  `comment`,
  `is_anonymous`,
  `status`,
  `merchant_reply`,
  `replied_at`,
  `created_at`,
  `updated_at`
FROM `pharmacy_reviews`
WHERE `status` = 'visible';

CREATE OR REPLACE VIEW `public_delivery_ratings` AS
SELECT
  `rating_id`,
  `delivery_id`,
  `order_id`,
  CASE WHEN `is_anonymous` = 1 THEN NULL ELSE `resident_id` END AS `resident_id`,
  `rider_id`,
  `stars`,
  `tags`,
  `comment`,
  `is_anonymous`,
  `created_at`
FROM `delivery_ratings`;

CREATE OR REPLACE VIEW `rider_deliveries_view` AS
SELECT
  `delivery_id`,
  `order_id`,
  `rider_id`,
  `pickup_merchant_id`,
  `status`,
  `failure_reason`,
  `assigned_at`,
  `picked_up_at`,
  `delivered_at`,
  `requested_at`,
  `code_attempts`,
  `is_flagged_for_admin`,
  `rider_lat`,
  `rider_lng`,
  `declined_by_rider_ids`
FROM `deliveries`;

-- ============================================================================
-- 6. INITIAL OLONGAPO CITY REFERENCE DATA & ADMIN ACCOUNT (IDEMPOTENT)
-- Note: No unreachable demo customers, merchants, or riders are pre-seeded.
-- Register all Customers, Pharmacy Stores, and Delivery Riders directly via Sign Up.
-- The sole built-in Admin account (admin@medex.ph) starts with password_hash = NULL:
-- set ADMIN_INITIAL_PASSWORD in .env OR use First-time MySQL Setup in Sign In.
-- ============================================================================

INSERT IGNORE INTO `barangays` (`barangay_id`, `name`, `city`, `province`, `region`) VALUES
  (1, 'East Bajac-Bajac', 'Olongapo City', 'Zambales', 'Region III'),
  (2, 'West Bajac-Bajac', 'Olongapo City', 'Zambales', 'Region III'),
  (3, 'Pag-asa', 'Olongapo City', 'Zambales', 'Region III'),
  (4, 'East Tapinac', 'Olongapo City', 'Zambales', 'Region III'),
  (5, 'Barretto', 'Olongapo City', 'Zambales', 'Region III'),
  (6, 'Kalaklan', 'Olongapo City', 'Zambales', 'Region III');

INSERT IGNORE INTO `product_categories` (`category_id`, `name`) VALUES
  (1, 'Medicines'),
  (2, 'First Aid'),
  (3, 'Hygiene'),
  (4, 'Baby Care'),
  (5, 'Masks & PPE'),
  (6, 'Equipment');

INSERT IGNORE INTO `feedback_categories` (`category_id`, `applies_to`, `code`, `label`, `is_active`) VALUES
  (1, 'order', 'wrong_item', 'Wrong item received', 1),
  (2, 'order', 'missing_item', 'Missing item in package', 1),
  (3, 'order', 'damaged_item', 'Damaged or tampered item', 1),
  (4, 'order', 'late_order', 'Significant order delay', 1),
  (5, 'locator', 'wrong_stock', 'Out of stock / wrong stock', 1),
  (6, 'locator', 'wrong_price', 'Displayed price was inaccurate', 1),
  (7, 'locator', 'wrong_open_status', 'Pharmacy was actually closed', 1),
  (8, 'locator', 'wrong_location', 'Map pin or address mismatch', 1),
  (9, 'app', 'app_issue', 'App bug or display issue', 1),
  (10, 'app', 'suggestion', 'Feature suggestion', 1),
  (11, 'app', 'other', 'Other general concern', 1);

-- ============================================================================
-- 4B. RBAC, COUPONS, INVENTORY MOVEMENTS & RETURN/REFUND TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS `rbac_roles` (
  `role_code` VARCHAR(48) NOT NULL,
  `display_name` VARCHAR(120) NOT NULL,
  `is_public_registerable` TINYINT(1) NOT NULL DEFAULT 0,
  `is_internal_admin` TINYINT(1) NOT NULL DEFAULT 0,
  `description` TEXT NULL,
  PRIMARY KEY (`role_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rbac_permissions` (
  `permission_code` VARCHAR(96) NOT NULL,
  `module_name` VARCHAR(80) NOT NULL,
  `label` VARCHAR(160) NOT NULL,
  `description` TEXT NULL,
  PRIMARY KEY (`permission_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rbac_role_permissions` (
  `role_code` VARCHAR(48) NOT NULL,
  `permission_code` VARCHAR(96) NOT NULL,
  PRIMARY KEY (`role_code`, `permission_code`),
  CONSTRAINT `fk_rrp_role` FOREIGN KEY (`role_code`) REFERENCES `rbac_roles` (`role_code`) ON DELETE CASCADE,
  CONSTRAINT `fk_rrp_perm` FOREIGN KEY (`permission_code`) REFERENCES `rbac_permissions` (`permission_code`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_permission_overrides` (
  `override_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `permission_code` VARCHAR(96) NOT NULL,
  `effect` ENUM('grant', 'revoke') NOT NULL,
  `granted_by_admin_id` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`override_id`),
  UNIQUE KEY `uq_user_perm_override` (`user_id`, `permission_code`),
  CONSTRAINT `fk_upo_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `coupons` (
  `coupon_id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `description` TEXT NOT NULL,
  `discount_type` ENUM('percentage', 'fixed') NOT NULL DEFAULT 'fixed',
  `discount_value` DECIMAL(10, 2) NOT NULL,
  `max_discount_amount` DECIMAL(10, 2) NULL,
  `min_purchase_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `usage_limit_total` INT NULL,
  `usage_limit_per_user` INT NOT NULL DEFAULT 1,
  `times_used` INT NOT NULL DEFAULT 0,
  `starts_at` DATETIME NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `target_segment` ENUM('all', 'new_customer', 'repeat_customer', 'selected_customers') NOT NULL DEFAULT 'all',
  `applicable_merchant_ids` JSON NULL,
  `applicable_product_ids` JSON NULL,
  `eligible_resident_ids` JSON NULL,
  `created_by_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`coupon_id`),
  UNIQUE KEY `uq_coupons_code` (`code`),
  KEY `idx_coupons_active_dates` (`is_active`, `starts_at`, `expires_at`),
  CONSTRAINT `chk_coupons_discount_value` CHECK (`discount_value` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_coupons` (
  `claim_id` INT NOT NULL AUTO_INCREMENT,
  `coupon_id` INT NOT NULL,
  `resident_id` INT NOT NULL,
  `status` ENUM('claimed', 'used', 'expired') NOT NULL DEFAULT 'claimed',
  `claimed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `used_at` DATETIME NULL,
  `order_id` INT NULL,
  PRIMARY KEY (`claim_id`),
  UNIQUE KEY `uq_customer_coupon_claim` (`coupon_id`, `resident_id`),
  KEY `idx_customer_coupons_resident` (`resident_id`, `status`),
  CONSTRAINT `fk_cc_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`coupon_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cc_resident` FOREIGN KEY (`resident_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `coupon_redemptions` (
  `redemption_id` INT NOT NULL AUTO_INCREMENT,
  `coupon_id` INT NULL,
  `coupon_code` VARCHAR(64) NOT NULL,
  `resident_id` INT NOT NULL,
  `order_id` INT NULL,
  `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `status` ENUM('redeemed', 'failed') NOT NULL DEFAULT 'redeemed',
  `failure_reason` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`redemption_id`),
  KEY `idx_coupon_redemptions_coupon` (`coupon_id`, `status`, `created_at`),
  KEY `idx_coupon_redemptions_resident` (`resident_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_movements` (
  `movement_id` INT NOT NULL AUTO_INCREMENT,
  `product_id` INT NOT NULL,
  `merchant_id` INT NOT NULL,
  `product_name` VARCHAR(180) NOT NULL,
  `actor_id` INT NOT NULL,
  `actor_name` VARCHAR(160) NOT NULL,
  `actor_role` VARCHAR(48) NOT NULL,
  `movement_type` ENUM('restock', 'sale_deduction', 'cancel_restock', 'return_restock', 'manual_adjustment', 'initial_stock') NOT NULL,
  `quantity_delta` INT NOT NULL,
  `stock_before` INT NOT NULL,
  `stock_after` INT NOT NULL,
  `reference_order_id` INT NULL,
  `note` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`movement_id`),
  KEY `idx_inv_movements_merchant` (`merchant_id`, `created_at`),
  KEY `idx_inv_movements_product` (`product_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `return_refund_requests` (
  `return_id` INT NOT NULL AUTO_INCREMENT,
  `reference_code` VARCHAR(64) NOT NULL,
  `order_id` INT NOT NULL,
  `resident_id` INT NOT NULL,
  `merchant_id` INT NOT NULL,
  `reason_code` ENUM('wrong_item', 'damaged_item', 'expired_product', 'missing_item', 'quality_issue', 'other') NOT NULL,
  `description` TEXT NOT NULL,
  `requested_refund_amount` DECIMAL(10, 2) NOT NULL,
  `approved_refund_amount` DECIMAL(10, 2) NULL,
  `status` ENUM('requested', 'store_approved', 'store_rejected', 'refunded', 'escalated', 'cs_resolved', 'cs_dismissed') NOT NULL DEFAULT 'requested',
  `store_response_note` TEXT NULL,
  `store_responded_by` INT NULL,
  `store_responded_at` DATETIME NULL,
  `escalated_at` DATETIME NULL,
  `escalation_reason` TEXT NULL,
  `cs_notes` TEXT NULL,
  `cs_resolution_note` TEXT NULL,
  `cs_resolved_by` INT NULL,
  `cs_resolved_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`return_id`),
  UNIQUE KEY `uq_return_refund_ref` (`reference_code`),
  KEY `idx_return_refund_merchant` (`merchant_id`, `status`),
  KEY `idx_return_refund_resident` (`resident_id`, `created_at`),
  CONSTRAINT `fk_rrr_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rrr_resident` FOREIGN KEY (`resident_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_rrr_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchant_profiles` (`merchant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Built-in Admin account only (set password via ADMIN_INITIAL_PASSWORD in .env or Sign In modal)
INSERT IGNORE INTO `users` (`user_id`, `role`, `phone_number`, `email`, `password_hash`, `first_name`, `last_name`, `date_of_birth`, `status`, `created_at`) VALUES
  (1, 'admin', '+639175550401', 'admin@medex.ph', NULL, 'Nadia', 'Villanueva', '1984-01-25', 'approved', '2026-09-01 00:00:00');

INSERT IGNORE INTO `rbac_roles` (`role_code`, `display_name`, `is_public_registerable`, `is_internal_admin`, `description`) VALUES
  ('resident', 'Customer', 1, 0, 'Publicly registered resident ordering pharmacy products and managing personal profile, addresses, coupons, complaints, returns, and 911 alerts.'),
  ('merchant', 'Store / Merchant', 1, 0, 'Publicly registered partner pharmacy managing own store inventory, orders, prescriptions, operating hours, returns, and store feedback.'),
  ('rider', 'Delivery Rider', 1, 0, 'Publicly registered courier rider operating under Delivery Management dispatch.'),
  ('admin', 'Global Admin', 0, 1, 'Full platform administrator managing internal staff accounts, RBAC, partner verifications, emergency alerts, zones, and oversight.'),
  ('delivery_manager', 'Delivery Management', 0, 1, 'Internal department role overseeing active/pending/failed deliveries, shipped items, rider assignment, and rider operational status.'),
  ('coupon_handler', 'Coupon Handler', 0, 1, 'Internal department role managing promo codes, promotional campaigns, eligibility limits, redemptions, and coupon analytics.'),
  ('inventory_manager', 'Inventory Management', 0, 1, 'Internal department role monitoring cross-store inventory levels, stock movement history, restocking risks, and analytics.'),
  ('customer_service', 'Customer Service', 0, 1, 'Internal department role handling customer feedback, complaints, escalations, return/refund disputes, and support analytics.');

-- Align AUTO_INCREMENT values cleanly
ALTER TABLE `barangays` AUTO_INCREMENT = 7;
ALTER TABLE `product_categories` AUTO_INCREMENT = 7;
ALTER TABLE `feedback_categories` AUTO_INCREMENT = 12;
ALTER TABLE `users` AUTO_INCREMENT = 2;

SET FOREIGN_KEY_CHECKS = 1;

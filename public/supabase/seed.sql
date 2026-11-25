-- ============================================================================
-- MedEx Olongapo City — Phase 3 Initial Seed Data
-- Run this THIRD in Supabase Dashboard -> SQL Editor (after storage.sql)
-- Safe to run once (uses ON CONFLICT DO NOTHING and resets sequences).
-- ============================================================================

INSERT INTO public.barangays (barangay_id, name, city, province, region) VALUES
  (1, 'East Bajac-Bajac', 'Olongapo City', 'Zambales', 'Region III'),
  (2, 'West Bajac-Bajac', 'Olongapo City', 'Zambales', 'Region III'),
  (3, 'Pag-asa', 'Olongapo City', 'Zambales', 'Region III'),
  (4, 'East Tapinac', 'Olongapo City', 'Zambales', 'Region III'),
  (5, 'Barretto', 'Olongapo City', 'Zambales', 'Region III'),
  (6, 'Kalaklan', 'Olongapo City', 'Zambales', 'Region III')
ON CONFLICT (barangay_id) DO NOTHING;

INSERT INTO public.product_categories (category_id, name) VALUES
  (1, 'Medicines'),
  (2, 'First Aid'),
  (3, 'Hygiene'),
  (4, 'Baby Care'),
  (5, 'Masks & PPE'),
  (6, 'Equipment')
ON CONFLICT (category_id) DO NOTHING;

INSERT INTO public.feedback_categories (category_id, applies_to, code, label, is_active) VALUES
  (1, 'order', 'wrong_item', 'Wrong item received', TRUE),
  (2, 'order', 'missing_item', 'Missing item in package', TRUE),
  (3, 'order', 'damaged_item', 'Damaged or tampered item', TRUE),
  (4, 'order', 'late_order', 'Significant order delay', TRUE),
  (5, 'locator', 'wrong_stock', 'Out of stock / wrong stock', TRUE),
  (6, 'locator', 'wrong_price', 'Displayed price was inaccurate', TRUE),
  (7, 'locator', 'wrong_open_status', 'Pharmacy was actually closed', TRUE),
  (8, 'locator', 'wrong_location', 'Map pin or address mismatch', TRUE),
  (9, 'app', 'app_issue', 'App bug or display issue', TRUE),
  (10, 'app', 'suggestion', 'Feature suggestion', TRUE),
  (11, 'app', 'other', 'Other general concern', TRUE)
ON CONFLICT (category_id) DO NOTHING;

INSERT INTO public.users (user_id, role, phone_number, email, first_name, last_name, date_of_birth, status, created_at) VALUES
  (101, 'resident', '+639175550101', 'claire.santos@medex.ph', 'Claire', 'Santos', '1994-06-18', 'approved', '2026-10-12T08:00:00Z'),
  (102, 'resident', '+639175550102', 'marco.reyes@medex.ph', 'Marco', 'Reyes', '1988-02-09', 'approved', '2026-10-15T09:30:00Z'),
  (201, 'merchant', '+639185550201', 'rizal.pharmacy@medex.ph', 'Elena', 'Mendoza', '1982-04-11', 'approved', '2026-09-20T07:00:00Z'),
  (202, 'merchant', '+639185550202', 'magsaysay.care@medex.ph', 'Rafael', 'Lim', '1979-11-22', 'approved', '2026-09-24T07:00:00Z'),
  (203, 'merchant', '+639185550203', 'tapinac.meds@medex.ph', 'Bianca', 'Cruz', '1985-08-30', 'approved', '2026-10-01T07:00:00Z'),
  (204, 'merchant', '+639185550204', 'barretto.wellness@medex.ph', 'David', 'Tan', '1987-03-14', 'pending', '2026-11-12T14:00:00Z'),
  (301, 'rider', '+639195550301', 'paolo.garcia@medex.ph', 'Paolo', 'Garcia', '1996-09-05', 'approved', '2026-10-02T08:00:00Z'),
  (302, 'rider', '+639195550302', 'jericho.diaz@medex.ph', 'Jericho', 'Diaz', '1993-12-19', 'pending', '2026-11-12T16:20:00Z'),
  (401, 'admin', '+639175550401', 'admin@medex.ph', 'Nadia', 'Villanueva', '1984-01-25', 'approved', '2026-09-01T00:00:00Z')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.addresses (address_id, user_id, barangay_id, recipient_name, recipient_phone, street, landmark, delivery_instructions, latitude, longitude, is_primary, created_at) VALUES
  (1, 101, 1, 'Claire Santos', '+639175550101', '18 18th Street, East Bajac-Bajac', 'Beside East Bajac-Bajac Barangay Hall', 'Call on arrival at green gate', 14.8364, 120.2846, TRUE, '2026-10-12T08:05:00Z'),
  (2, 101, 2, 'Lola Teresita Santos', '+639175550199', '42 Arthur Street, West Bajac-Bajac', 'Near West Bajac-Bajac Elementary School', 'Ring doorbell twice', 14.8331, 120.2791, FALSE, '2026-10-18T10:00:00Z'),
  (3, 102, 4, 'Marco Reyes', '+639175550102', '74 Fontaine Street, East Tapinac', 'Near East Tapinac Covered Court', NULL, 14.8295, 120.2874, TRUE, '2026-10-15T09:35:00Z'),
  (4, 201, 1, 'Rizal Ave. 24/7 Care Pharmacy', '+639185550201', '214 Rizal Avenue, East Bajac-Bajac', 'Near James L. Gordon Memorial Hospital', NULL, 14.8342, 120.2834, TRUE, '2026-09-20T07:05:00Z'),
  (5, 202, 3, 'Magsaysay Healthpoint Pharmacy', '+639185550202', '88 Magsaysay Drive, Pag-asa', 'Across Harbor Point / SBMA Main Gate Approach', NULL, 14.8266, 120.2815, TRUE, '2026-09-24T07:05:00Z'),
  (6, 203, 4, 'Tapinac Meds & Wellness', '+639185550203', '45 Gordon Avenue, East Tapinac', 'Near Olongapo City Convention Center', NULL, 14.8318, 120.2869, TRUE, '2026-10-01T07:05:00Z'),
  (7, 204, 5, 'Barretto Coastal Apothecary', '+639185550204', '102 National Highway, Barretto', 'Near Barretto Barangay Hall & Public Market', NULL, 14.8492, 120.2647, TRUE, '2026-11-12T14:05:00Z')
ON CONFLICT (address_id) DO NOTHING;

INSERT INTO public.household_flags (user_id, has_senior, has_pwd, has_young_child, has_pregnant_member) VALUES
  (101, TRUE, FALSE, FALSE, FALSE),
  (102, FALSE, FALSE, TRUE, FALSE)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.emergency_contacts (contact_id, user_id, contact_name, relationship, phone_number) VALUES
  (1, 101, 'Miguel Santos', 'Brother', '+639175550188'),
  (2, 101, 'Dr. Nina Villanueva', 'Family Physician (JLGMMH)', '+639175550177')
ON CONFLICT (contact_id) DO NOTHING;

INSERT INTO public.merchant_profiles (merchant_id, user_id, shop_name, shop_address_id, is_pharmacist, pharmacist_name, pharmacist_license_no, is_24_hours, is_temporarily_closed, contact_no) VALUES
  (201, 201, 'Rizal Ave. 24/7 Care Pharmacy', 4, TRUE, 'RPh. Elena Mendoza', 'PRC-0094821', TRUE, FALSE, '+639185550201'),
  (202, 202, 'Magsaysay Healthpoint Pharmacy', 5, TRUE, 'RPh. Rafael Lim', 'PRC-0083104', FALSE, FALSE, '+639185550202'),
  (203, 203, 'Tapinac Meds & Wellness', 6, TRUE, 'RPh. Bianca Cruz', 'PRC-0102944', FALSE, TRUE, '+639185550203'),
  (204, 204, 'Barretto Coastal Apothecary', 7, TRUE, 'RPh. David Tan', 'PRC-0114002', FALSE, FALSE, '+639185550204')
ON CONFLICT (merchant_id) DO NOTHING;

INSERT INTO public.merchant_hours (merchant_id, day_of_week, opens_at, closes_at, is_closed) VALUES
  (202, 0, '08:00', '18:00', FALSE),
  (202, 1, '07:00', '21:00', FALSE),
  (202, 2, '07:00', '21:00', FALSE),
  (202, 3, '07:00', '21:00', FALSE),
  (202, 4, '07:00', '21:00', FALSE),
  (202, 5, '07:00', '21:00', FALSE),
  (202, 6, '07:00', '21:00', FALSE),
  (203, 0, '08:00', '20:00', FALSE),
  (203, 1, '08:00', '20:00', FALSE),
  (203, 2, '08:00', '20:00', FALSE),
  (203, 3, '08:00', '20:00', FALSE),
  (203, 4, '08:00', '20:00', FALSE),
  (203, 5, '08:00', '20:00', FALSE),
  (203, 6, '08:00', '20:00', FALSE),
  (204, 0, '08:00', '21:00', FALSE),
  (204, 1, '08:00', '21:00', FALSE),
  (204, 2, '08:00', '21:00', FALSE),
  (204, 3, '08:00', '21:00', FALSE),
  (204, 4, '08:00', '21:00', FALSE),
  (204, 5, '08:00', '21:00', FALSE),
  (204, 6, '08:00', '21:00', FALSE)
ON CONFLICT (merchant_id, day_of_week) DO NOTHING;

INSERT INTO public.products (product_id, merchant_id, category_id, name, dosage_strength, description, unit, purchase_limit, is_listed, requires_prescription, regular_price, stock_quantity, low_stock_threshold) VALUES
  (1, 201, 1, 'Paracetamol 500mg', '500mg Tablet', 'Fast-acting analgesic and antipyretic for fever, headache, and mild-to-moderate pain.', 'Box of 10 tablets', 5, TRUE, FALSE, 68.00, 84, 15),
  (2, 202, 1, 'Paracetamol 500mg', '500mg Tablet', 'Standard antipyretic tablet strip for fever and body pain.', 'Box of 10 tablets', 4, TRUE, FALSE, 72.00, 8, 10),
  (3, 203, 1, 'Paracetamol 500mg', '500mg Tablet', 'Fever and pain tablet strip, currently awaiting restock.', 'Box of 10 tablets', 4, TRUE, FALSE, 65.00, 0, 10),
  (4, 201, 1, 'Amoxicillin 500mg', '500mg Capsule', 'Broad-spectrum penicillin antibiotic. Valid physician prescription required.', 'Strip of 10 capsules', 3, TRUE, TRUE, 185.00, 42, 10),
  (5, 201, 1, 'Losartan 50mg', '50mg Tablet', 'Maintenance antihypertensive medication. Valid physician prescription required.', 'Box of 10 tablets', 3, TRUE, TRUE, 210.00, 28, 10),
  (6, 201, 2, 'Emergency Trauma First Aid Kit', '18-Piece Pack', 'Sterile gauze pads, elastic bandages, povidone-iodine antiseptic, and medical tape.', '1 Complete Kit', 2, TRUE, FALSE, 340.00, 19, 5),
  (7, 202, 2, 'Povidone-Iodine Antiseptic 120ml', '10% Solution', 'Topical wound disinfectant solution for minor cuts, scrapes, and burns.', '120ml Bottle', 3, TRUE, FALSE, 165.00, 34, 8),
  (8, 201, 4, 'Oral Rehydration Salts (ORS) Sachets', '10 Sachets', 'WHO-formula electrolyte hydration powder for pediatric and adult dehydration.', 'Box of 10 sachets', 4, TRUE, FALSE, 175.00, 50, 10),
  (9, 202, 3, '70% Isopropyl Medical Alcohol', '500ml Pump', 'Hospital-grade disinfecting alcohol with skin moisturizer.', '500ml Bottle', 4, TRUE, FALSE, 135.00, 60, 12),
  (10, 201, 5, 'KN95 Particulate Respirator Masks', '10 Masks', '4-layer protective filtration masks individually sealed for family safety kits.', 'Pack of 10 masks', 5, TRUE, FALSE, 140.00, 92, 15),
  (11, 202, 6, 'Digital Clinical Thermometer', 'Flexible Tip', '10-second fast fever reading with memory recall and fever alarm.', '1 Unit', 2, TRUE, FALSE, 295.00, 7, 10)
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO public.rider_profiles (rider_id, user_id, vehicle_type, plate_number, is_online, rating, total_deliveries) VALUES
  (301, 301, 'Motorcycle (Honda Click 125)', 'ZMB-4821', TRUE, 4.50, 38),
  (302, 302, 'E-Scooter', 'PENDING-09', FALSE, 5.00, 0)
ON CONFLICT (rider_id) DO NOTHING;

-- Synchronize Identity Sequences so new registrations/orders never collide
SELECT setval(pg_get_serial_sequence('public.barangays', 'barangay_id'), GREATEST((SELECT COALESCE(MAX(barangay_id), 1) FROM public.barangays), 1));
SELECT setval(pg_get_serial_sequence('public.users', 'user_id'), GREATEST((SELECT COALESCE(MAX(user_id), 401) FROM public.users), 401));
SELECT setval(pg_get_serial_sequence('public.addresses', 'address_id'), GREATEST((SELECT COALESCE(MAX(address_id), 7) FROM public.addresses), 7));
SELECT setval(pg_get_serial_sequence('public.emergency_contacts', 'contact_id'), GREATEST((SELECT COALESCE(MAX(contact_id), 2) FROM public.emergency_contacts), 2));
SELECT setval(pg_get_serial_sequence('public.product_categories', 'category_id'), GREATEST((SELECT COALESCE(MAX(category_id), 6) FROM public.product_categories), 6));
SELECT setval(pg_get_serial_sequence('public.products', 'product_id'), GREATEST((SELECT COALESCE(MAX(product_id), 11) FROM public.products), 11));
SELECT setval(pg_get_serial_sequence('public.feedback_categories', 'category_id'), GREATEST((SELECT COALESCE(MAX(category_id), 11) FROM public.feedback_categories), 11));
SELECT setval(pg_get_serial_sequence('public.orders', 'order_id'), GREATEST((SELECT COALESCE(MAX(order_id), 5002) FROM public.orders), 5002));
SELECT setval(pg_get_serial_sequence('public.payments', 'payment_id'), GREATEST((SELECT COALESCE(MAX(payment_id), 7002) FROM public.payments), 7002));
SELECT setval(pg_get_serial_sequence('public.deliveries', 'delivery_id'), GREATEST((SELECT COALESCE(MAX(delivery_id), 8002) FROM public.deliveries), 8002));

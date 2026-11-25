export const POLICY_VERSION = '1.0';
export const POLICY_LAST_UPDATED = '2026';
export const POLICY_SUPPORT_EMAIL = 'medex@gmail.com';
export const POLICY_PDF_URL = '/assets/aistudio/Policies_fdedaf0c.pdf';

export interface PolicyRuleItem {
  heading: string;
  body: string;
}

export interface PolicySection {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  items: PolicyRuleItem[];
}

export const MEDEX_POLICY_SECTIONS: PolicySection[] = [
  {
    id: 'shipping-delivery',
    number: 1,
    title: 'Shipping & Delivery',
    subtitle: 'Olongapo City coverage, delivery fees, confirmation codes & failed delivery handling',
    items: [
      {
        heading: 'Service Area',
        body: 'MedEx currently delivers within Olongapo City only. Orders are fulfilled per pharmacy, and each order contains items from one pharmacy at a time.',
      },
      {
        heading: 'Delivery Fees & Transparency',
        body: 'Standard delivery fees are shown clearly before checkout so you always see the full total before confirming.',
      },
      {
        heading: 'Delivery Tracking & 4-Digit Confirmation Code',
        body: 'Once a rider picks up your order, you can track delivery status in real time. At drop-off, provide the 4-digit confirmation code from your Orders tab to complete delivery safely.',
      },
      {
        heading: 'Order Cancellations & Automatic Restocking',
        body: 'Orders may be cancelled before preparation/dispatch where applicable. When an eligible order is cancelled, reserved product stock is automatically restored to the pharmacy inventory.',
      },
      {
        heading: 'Failed Deliveries & Customer Not Home',
        body: 'If a rider cannot reach the recipient or three invalid confirmation code attempts occur, the delivery is flagged for Admin and pharmacy follow-up.',
      },
    ],
  },
  {
    id: 'payment-methods',
    number: 2,
    title: 'Payment Methods',
    subtitle: 'GCash digital checkout, Cash on Delivery (COD), receipts & mismatch safeguards',
    items: [
      {
        heading: 'Accepted Payment Options',
        body: 'Customers can pay via GCash or Cash on Delivery (COD). Both methods issue an official MedEx receipt with a unique receipt number.',
      },
      {
        heading: 'GCash for Prescription (Rx) Orders',
        body: 'For orders containing prescription medicines, GCash payment unlocks only after a licensed pharmacist approves the uploaded prescription.',
      },
      {
        heading: 'Cash on Delivery (COD) Verification',
        body: 'Riders record the exact cash amount collected upon handoff. Any discrepancy between the order total and collected cash is automatically flagged for Admin audit.',
      },
      {
        heading: 'Failed Payment Recovery',
        body: 'If a GCash payment fails or times out, you can retry GCash authorization or switch the order to Cash on Delivery directly from your Orders screen.',
      },
    ],
  },
  {
    id: 'prescription-medicines',
    number: 3,
    title: 'Prescription Medicines (Rx)',
    subtitle: 'Upload format & 10 MB limit, pharmacist review SLA, 7 rejection reasons & private storage',
    items: [
      {
        heading: 'Required Upload & Supported Formats',
        body: 'Controlled or Rx-tagged medicines require a valid doctor’s prescription uploaded as JPG, PNG, or PDF (maximum file size: 10 MB) along with patient name, prescribing physician, PRC license number, and date issued.',
      },
      {
        heading: 'Pharmacist Verification & Review Timeline',
        body: 'Only the fulfilling pharmacy’s licensed pharmacist (or backup MedEx Admin) reviews your prescription. Unreviewed Rx orders trigger a 4-hour reminder, a 12-hour Admin escalation alert, and automatic cancellation after 24 hours if still unreviewed.',
      },
      {
        heading: 'Standard Prescription Rejection Reasons',
        body: 'A prescription may be rejected if: (1) Image is unclear or unreadable, (2) Required details are missing or incomplete, (3) Prescription has expired, (4) Patient name does not match the order, (5) Doctor or license number cannot be verified, (6) Prescription does not cover the medicine ordered, or (7) Other specified pharmacist remarks. Customers may re-upload a corrected prescription.',
      },
      {
        heading: 'Private Document Storage',
        body: 'Prescription files and merchant verification documents are stored privately on the server and accessible strictly to the account owner, fulfilling pharmacy (for Rx), and authorized MedEx Admins.',
      },
    ],
  },
  {
    id: 'item-problems-feedback',
    number: 4,
    title: 'Item Problems, Reviews & Feedback',
    subtitle: '7-day issue window, 1,000-character problem reports, 1–5 star ratings & privacy rules',
    items: [
      {
        heading: '7-Day Order Problem Reporting Window',
        body: 'Customers can report wrong, missing, damaged, or significantly delayed items within 7 days of delivery using descriptions up to 1,000 characters. Each report receives a trackable reference code.',
      },
      {
        heading: 'Pharmacy & Rider Ratings',
        body: 'Delivered orders can be rated from 1 to 5 stars with structured tags and comments. Pharmacy reviews may be edited within 24 hours of submission, and pharmacies may post one public reply per review.',
      },
      {
        heading: 'Locator & App Feedback',
        body: 'Residents can report inaccurate pharmacy stock, prices, hours, or map pins from the Pharmacy Locator so merchants can update their listings immediately.',
      },
      {
        heading: 'Reviewer Privacy & Personal Data Protection',
        body: 'Reviews and reports default to anonymous display to protect customer phone numbers, emails, and street addresses. Never post sensitive personal health or financial data in public comments.',
      },
    ],
  },
  {
    id: 'pharmacy-locator',
    number: 5,
    title: 'Pharmacy Locator & Live Inventory',
    subtitle: 'Verified partner branches, real-time stock, operating hours & nearest pharmacy distance',
    items: [
      {
        heading: 'Verified Pharmacies Only',
        body: 'Only Admin-verified partner pharmacies with valid business permits, government-issued IDs, and PRC pharmacist credentials appear on the public storefront and locator.',
      },
      {
        heading: 'Real-Time Stock & Operating Status',
        body: 'Store open/closed status follows Asia/Manila (UTC+8) operating hours and temporary closure overrides. Stock counts update automatically when orders are placed, cancelled, or restocked.',
      },
      {
        heading: 'Nearest Pharmacy Sorting',
        body: 'Distance calculations use Haversine coordinates between your primary Olongapo delivery address (or Olongapo City center when browsing as a guest) and each pharmacy’s verified map pin.',
      },
    ],
  },
  {
    id: 'emergency-button',
    number: 6,
    title: 'Emergency 911 Button',
    subtitle: '2-second press-and-hold safeguard, mobile dialer / desktop QR handoff & 60-second dedup',
    items: [
      {
        heading: 'Immediate 911 Call Handoff',
        body: 'The Emergency button requires a deliberate 2-second press-and-hold to prevent accidental taps. On mobile devices it launches the 911 phone dialer; on desktop it displays an instant scannable 911 QR code.',
      },
      {
        heading: '60-Second Deduplication & Dispatch Log',
        body: 'Repeated taps within 60 seconds are deduplicated to avoid duplicate alert records. Logged alerts capture your primary Olongapo address and barangay snapshot for Admin verification.',
      },
      {
        heading: 'Emergency Disclaimer',
        body: 'MedEx assists with rapid 911 dialing and logging but does not replace direct emergency dispatch. Always call 911 immediately in life-threatening situations.',
      },
    ],
  },
  {
    id: 'account-address',
    number: 7,
    title: 'Account Security, Verification & Addresses',
    subtitle: '18+ age rule, unique credentials, merchant document review, statuses & support',
    items: [
      {
        heading: 'Eligibility & Unique Credentials',
        body: 'Users must be at least 18 years old and register with a unique @gmail.com email address and Philippine mobile number (+639XXXXXXXXX). Duplicate accounts sharing an email, phone number, PRC license, or LTO plate number are blocked.',
      },
      {
        heading: 'Password Protection',
        body: 'Account passwords are securely hashed with salted scrypt encryption on the server and protected against copying or drag-export in authentication forms.',
      },
      {
        heading: 'Merchant & Partner Verification Statuses',
        body: 'Partner pharmacies must submit a valid Business Permit and Government-Issued ID for Admin review prior to approval. Partner statuses include Pending, Verified, Rejected, and Suspended.',
      },
      {
        heading: 'Historical Record Archiving',
        body: 'Discontinued or removed catalog items are archived rather than permanently deleted so all historical orders, receipts, and audit trails remain intact.',
      },
      {
        heading: 'Support & Policy Inquiries',
        body: `For account verification, order disputes, or privacy requests, contact MedEx Support at ${POLICY_SUPPORT_EMAIL}.`,
      },
    ],
  },
];

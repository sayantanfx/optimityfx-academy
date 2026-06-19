/* ============================================================
   OptimityFX — App Configuration
   Replace ALL placeholder values before going live.
   ============================================================ */

window.OFX = Object.freeze({
  // Supabase — get from: supabase.com > Project Settings > API
  supabaseUrl: 'https://odcqkutaindtzbjrncdl.supabase.co',    // https://xxxx.supabase.co
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kY3FrdXRhaW5kdHpianJuY2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDUyMDAsImV4cCI6MjA5NjQyMTIwMH0.92AAPjpZVReQTpU4y9eX88IB0U-8Vu6CR9ufOkUGBzE',        // eyJhbGc... (safe to expose)

  // Razorpay — get from: dashboard.razorpay.com > Settings > API Keys
  razorpayKey: 'rzp_test_RIyiX1gYWReMxp',        // TEST key — swap for rzp_live_XXXX after Razorpay approves the site

  // Business info
  currency:    'INR',
  companyName: 'OptimityFX NextGen Academy',
  supportEmail:'optimityfx@gmail.com',
  siteUrl:     'https://academy.optimityfx.com',

  // Daily login rewards
  rewards: {
    daily:       5,   // base credits per login
    // Bonus credits by streak day (index 0 = day 1, index 6 = day 7)
    streakBonus: [0, 0, 5, 5, 10, 10, 20],
  },

  // Roles
  roles: { CUSTOMER: 'customer', TEAM: 'team', ADMIN: 'admin', SUPER: 'super_admin' },
});

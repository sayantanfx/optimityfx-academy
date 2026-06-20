/* ============================================================
   POST /api/create-order
   Computes the order amount SERVER-SIDE from authoritative product
   prices (prevents client price tampering), creates a Cashfree
   Payment Gateway order, and persists a pending order + items in
   Supabase. Returns { paymentSessionId, cfOrderId, total, mode }.

   Required Vercel env vars:
     SUPABASE_URL                e.g. https://odcqkutaindtzbjrncdl.supabase.co
     SUPABASE_SERVICE_ROLE_KEY   Supabase service_role key (server-only secret)
     CASHFREE_APP_ID             Cashfree App ID / client id (server-only)
     CASHFREE_SECRET_KEY         Cashfree Secret Key (server-only)
     CASHFREE_ENV                'sandbox' (default) or 'production'
   ============================================================ */

const CF_API_VERSION = '2023-08-01';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENV } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const cfBase = (CASHFREE_ENV === 'production')
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

  const sb = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });

  try {
    // 1. Authenticate the caller via their Supabase access token
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!ures.ok) return res.status(401).json({ error: 'Invalid session' });
    const user = await ures.json();
    const uid = user.id;
    if (!uid) return res.status(401).json({ error: 'Invalid session' });

    const { items = [], couponCode = null, useCredits = 0 } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

    // 2. Resolve cart slugs -> authoritative product prices (never trust client prices)
    const slugs = [...new Set(items.map(i => i.id))];
    const inList = slugs.map(s => `"${String(s).replace(/"/g, '')}"`).join(',');
    const pres = await sb(`products?select=id,slug,price,sale_price&slug=in.(${encodeURIComponent(inList)})`);
    const products = await pres.json();
    if (!Array.isArray(products)) return res.status(500).json({ error: 'Product lookup failed' });
    const bySlug = Object.fromEntries(products.map(p => [p.slug, p]));
    const missing = slugs.filter(s => !bySlug[s]);
    if (missing.length) return res.status(400).json({ error: 'Unknown product: ' + missing.join(', ') });

    const lineItems = items.map(i => {
      const p = bySlug[i.id];
      const price = Number(p.sale_price ?? p.price ?? 0);
      return { product_id: p.id, price };
    });
    let subtotal = lineItems.reduce((s, li) => s + li.price, 0);

    // 3. Validate coupon server-side (mirrors client logic)
    let discount = 0, couponId = null;
    if (couponCode) {
      const cres = await sb(`coupons?select=*&code=eq.${encodeURIComponent(String(couponCode).toUpperCase().trim())}&is_active=eq.true`);
      const [c] = await cres.json();
      const okExpiry = c && (!c.expires_at || new Date(c.expires_at) >= new Date());
      const okUses   = c && (!c.max_uses || c.used_count < c.max_uses);
      const okMin    = c && subtotal >= (c.min_order || 0);
      if (c && okExpiry && okUses && okMin) {
        discount = c.discount_type === 'percent' ? subtotal * c.discount_value / 100 : c.discount_value;
        discount = Math.min(discount, subtotal);
        couponId = c.id;
      }
    }

    // 4. Apply wallet credits, clamped to the user's real balance.
    //    Also fetch profile contact details Cashfree needs for the order.
    let creditsApplied = 0;
    const prres = await sb(`profiles?select=wallet_credits,full_name&id=eq.${uid}`);
    const profJson = await prres.json();
    const prof = Array.isArray(profJson) ? profJson[0] : null;
    if (Number(useCredits) > 0) {
      const bal = Number(prof?.wallet_credits || 0);
      creditsApplied = Math.max(0, Math.min(Number(useCredits), bal, subtotal - discount));
    }

    const total = Math.max(1, Math.round(subtotal - discount - creditsApplied));

    // 5. Create the Cashfree order. We supply our own order_id so the
    //    pending Supabase row and the Cashfree order share one key.
    const cfOrderId = `ofx_${uid.slice(0, 8)}_${Date.now()}`;
    // Cashfree requires a customer phone; fall back to a valid placeholder.
    const phone = String(prof?.phone || '').replace(/\D/g, '').slice(-10) || '9999999999';

    const cfres = await fetch(`${cfBase}/orders`, {
      method: 'POST',
      headers: {
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET_KEY,
        'x-api-version': CF_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order_id: cfOrderId,
        order_amount: total,
        order_currency: 'INR',
        customer_details: {
          customer_id: uid,
          customer_email: user.email || 'noreply@optimityfx.com',
          customer_phone: phone,
          customer_name: prof?.full_name || 'OptimityFX Student',
        },
        order_note: `${lineItems.length} item(s) — OptimityFX Academy`,
      }),
    });
    if (!cfres.ok) {
      const detail = await cfres.text();
      return res.status(502).json({ error: 'Cashfree order creation failed', detail });
    }
    const cfOrder = await cfres.json();
    if (!cfOrder.payment_session_id) {
      return res.status(502).json({ error: 'Cashfree returned no payment session', detail: cfOrder });
    }

    // 6. Persist a pending order + items (finalized in verify-payment)
    const ores = await sb('orders', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: uid, total, discount, credits_used: creditsApplied,
        coupon_id: couponId, status: 'created', cashfree_order_id: cfOrderId,
      }),
    });
    const [order] = await ores.json();
    if (!order || !order.id) return res.status(500).json({ error: 'Could not persist order' });

    await sb('order_items', {
      method: 'POST',
      body: JSON.stringify(lineItems.map(li => ({ order_id: order.id, product_id: li.product_id, price: li.price }))),
    });

    return res.status(200).json({
      paymentSessionId: cfOrder.payment_session_id,
      cfOrderId,
      total,
      mode: (CASHFREE_ENV === 'production') ? 'production' : 'sandbox',
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: String(e) });
  }
}

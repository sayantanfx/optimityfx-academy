/* ============================================================
   POST /api/verify-payment
   Verifies the Razorpay payment signature SERVER-SIDE. Only on a
   valid signature does it mark the pending order 'paid' and grant
   purchases / deduct credits / bump coupon usage (all with the
   service role). This is what makes a forged "paid" order impossible.

   Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }

   Required Vercel env vars:
     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RAZORPAY_KEY_SECRET
   ============================================================ */
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RAZORPAY_KEY_SECRET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ valid: false, error: 'Server not configured' });
  }

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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ valid: false, error: 'Missing payment fields' });
    }

    // 1. Verify HMAC signature: HMAC_SHA256(order_id|payment_id, key_secret)
    const expected = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(razorpay_signature));
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) return res.status(400).json({ valid: false, error: 'Signature verification failed' });

    // 2. Look up the pending order we created server-side
    const ores = await sb(`orders?select=*&razorpay_order_id=eq.${encodeURIComponent(razorpay_order_id)}`);
    const [order] = await ores.json();
    if (!order) return res.status(404).json({ valid: false, error: 'Order not found' });
    if (order.status === 'paid') return res.status(200).json({ valid: true, orderId: order.id, already: true });

    // 3. Mark paid
    await sb(`orders?id=eq.${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paid', razorpay_payment_id }),
    });

    // 4. Grant purchases from the persisted line items
    const ires = await sb(`order_items?select=product_id&order_id=eq.${order.id}`);
    const lineItems = await ires.json();
    if (Array.isArray(lineItems) && lineItems.length) {
      await sb('purchases', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(lineItems.map(li => ({ user_id: order.user_id, product_id: li.product_id, order_id: order.id }))),
      });
    }

    // 5. Deduct wallet credits
    if (order.credits_used > 0) {
      const prres = await sb(`profiles?select=wallet_credits&id=eq.${order.user_id}`);
      const [prof] = await prres.json();
      const bal = Number(prof?.wallet_credits || 0);
      await sb(`profiles?id=eq.${order.user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ wallet_credits: Math.max(0, bal - order.credits_used) }),
      });
      await sb('wallet_transactions', {
        method: 'POST',
        body: JSON.stringify({
          user_id: order.user_id, type: 'spent', amount: order.credits_used,
          description: `Credits applied to order #${String(order.id).slice(0, 8)}`, ref_id: order.id,
        }),
      });
    }

    // 6. Bump coupon usage
    if (order.coupon_id) {
      const cres = await sb(`coupons?select=used_count&id=eq.${order.coupon_id}`);
      const [c] = await cres.json();
      await sb(`coupons?id=eq.${order.coupon_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ used_count: (c?.used_count || 0) + 1 }),
      });
      await sb('coupon_usage', {
        method: 'POST',
        body: JSON.stringify({ coupon_id: order.coupon_id, user_id: order.user_id, order_id: order.id }),
      });
    }

    return res.status(200).json({ valid: true, orderId: order.id });
  } catch (e) {
    return res.status(500).json({ valid: false, error: String(e) });
  }
}

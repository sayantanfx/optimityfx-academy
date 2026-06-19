/* ============================================================
   OptimityFX — Auth & Session Utilities
   Depends on: Supabase CDN (global: window.supabase), config.js
   Include on every page before main.js
   ============================================================ */
(function () {
  'use strict';

  if (!window.supabase) { console.warn('OFXAuth: Supabase CDN not loaded'); return; }
  if (!window.OFX)     { console.warn('OFXAuth: config.js not loaded'); return; }

  const isConfigured = !OFX.supabaseUrl.startsWith('YOUR_');

  const { createClient } = window.supabase;
  let sb = null;
  if (isConfigured) {
    try { sb = createClient(OFX.supabaseUrl, OFX.supabaseKey); }
    catch (e) { console.error('OFXAuth: createClient failed —', e.message); }
  } else {
    console.warn('OFXAuth: Supabase not configured yet — fill in js/config.js. URL starts with YOUR_');
  }

  /* ================================================================
     CART (localStorage)
  ================================================================ */
  const Cart = {
    get()         { try { return JSON.parse(localStorage.getItem('ofx_cart') || '[]'); } catch { return []; } },
    save(c)       { localStorage.setItem('ofx_cart', JSON.stringify(c)); Cart.updateBadge(); },
    add(product)  { const c = Cart.get(); if (!c.find(p => p.id === product.id)) c.push(product); Cart.save(c); Cart.flashBadge(); },
    remove(id)    { Cart.save(Cart.get().filter(p => p.id !== id)); },
    clear()       { localStorage.removeItem('ofx_cart'); Cart.updateBadge(); },
    count()       { return Cart.get().length; },
    total()       { return Cart.get().reduce((s, p) => s + (p.sale_price || p.price || 0), 0); },
    updateBadge() {
      document.querySelectorAll('.cart-badge').forEach(el => {
        const n = Cart.count();
        el.textContent = n;
        el.style.display = n > 0 ? '' : 'none';
      });
    },
    flashBadge() {
      Cart.updateBadge();
      document.querySelectorAll('.cart-badge').forEach(el => {
        el.classList.add('pop');
        setTimeout(() => el.classList.remove('pop'), 500);
      });
    },
  };

  /* ================================================================
     TOAST notifications
  ================================================================ */
  function toast(msg, type = 'info', dur = 3500) {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    const t = document.createElement('div');
    t.className = `toast toast--${type}`;
    const icons = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>',
      error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
      info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
      reward:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    };
    t.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
    wrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    if (dur > 0) setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, dur);
  }

  /* ================================================================
     DAILY REWARDS
  ================================================================ */
  async function grantDailyReward(userId) {
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await sb.from('login_rewards').select('id').eq('user_id', userId).eq('date', today).maybeSingle();
    if (existing) return;

    const { data: profile } = await sb.from('profiles').select('login_streak, last_login_date, wallet_credits, total_logins').eq('id', userId).maybeSingle();
    if (!profile) return;

    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];
    let newStreak = (profile.last_login_date === yStr) ? (profile.login_streak || 0) + 1 : 1;
    if (newStreak > 7) newStreak = 1;

    const bonus = OFX.rewards.streakBonus[Math.min(newStreak - 1, 6)] || 0;
    const totalCredits = OFX.rewards.daily + bonus;

    await sb.from('login_rewards').insert({ user_id: userId, date: today, credits_earned: totalCredits, streak_day: newStreak });
    await sb.from('profiles').update({
      login_streak: newStreak, last_login_date: today,
      wallet_credits: (profile.wallet_credits || 0) + totalCredits,
      total_logins:   (profile.total_logins   || 0) + 1,
    }).eq('id', userId);
    await sb.from('wallet_transactions').insert({
      user_id: userId, type: 'earned', amount: totalCredits,
      description: `Daily login reward — Day ${newStreak} streak${bonus ? ` (+${bonus} streak bonus)` : ''}`,
    });

    setTimeout(() => {
      toast(`🎯 +${totalCredits} Credits! Day ${newStreak} streak${bonus ? ` (+${bonus} bonus)` : ''}`, 'reward', 5000);
    }, 1200);
  }

  /* ================================================================
     NAV UPDATE
  ================================================================ */
  /* Helper to inject or update the nav auth button */
  function setNavBtn(session) {
    const isLogin = window.location.pathname.includes('login.html') ||
                    window.location.pathname.includes('register.html');
    const base = document.querySelector('base')?.href || window.location.origin + '/';

    // Resolve correct paths (works from any subdirectory like /admin/ or /team/)
    const depth = (window.location.pathname.match(/\//g)||[]).length - 1;
    const prefix = depth > 0 ? '../'.repeat(depth) : '';

    const navCta  = document.querySelector('.nav-cta');
    const mDrawer = document.querySelector('.m-drawer');

    // Remove old
    document.querySelectorAll('.nav-auth-btn, .mobile-auth-link').forEach(el => el.remove());

    if (navCta) {
      const btn = document.createElement('a');
      btn.className = 'btn btn-ghost btn-sm nav-auth-btn';
      if (session) {
        btn.href = prefix + 'dashboard.html';
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg> My Account`;
      } else {
        btn.href = isLogin ? '#' : prefix + 'login.html';
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg> Sign In`;
        if (isLogin) btn.style.display = 'none';
      }
      navCta.insertBefore(btn, navCta.firstChild);
    }

    if (mDrawer) {
      const mLink = document.createElement('a');
      mLink.className = 'mobile-auth-link';
      if (session) { mLink.href = prefix + 'dashboard.html'; mLink.textContent = 'My Dashboard'; }
      else          { mLink.href = prefix + 'login.html';    mLink.textContent = 'Sign In'; }
      mDrawer.insertBefore(mLink, mDrawer.firstChild);
    }
  }

  async function updateNav() {
    // 1. Show Sign In button IMMEDIATELY (no waiting)
    setNavBtn(null);

    // 2. Check session with 4s timeout — update to Dashboard if logged in
    if (!sb) return;
    try {
      const race = await Promise.race([
        sb.auth.getSession(),
        new Promise(r => setTimeout(() => r({ data: { session: null } }), 4000)),
      ]);
      const session = race?.data?.session;
      if (session) setNavBtn(session);
    } catch { /* keep Sign In */ }
  }

  /* ================================================================
     AUTH STATE LISTENER
  ================================================================ */
  if (sb) {
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // CRITICAL: Supabase JS v2 serializes ALL gotrue operations on a
        // single exclusive navigator.locks lock keyed to the storage key
        // (e.g. "lock:sb-<ref>-auth-token"). This callback runs WHILE that
        // lock is held. Awaiting further async work here — especially
        // queries through the same client — can deadlock the lock forever
        // (confirmed live: navigator.locks.query() showed the lock stuck
        // "held" with pending requests queued behind it, causing every
        // later getSession()/signIn() call to hang indefinitely — exactly
        // the "logged in but logged out in 2 seconds" symptom). Defer to
        // a macrotask via setTimeout so the lock is released first, per
        // Supabase's documented guidance for onAuthStateChange callbacks.
        setTimeout(() => { grantDailyReward(session.user.id); }, 0);
      }
    });
  }

  /* ================================================================
     INIT
  ================================================================ */
  /* Inject a cart icon + badge into the nav (works from any directory depth) */
  function ensureCartBtn() {
    const depth = (window.location.pathname.match(/\//g) || []).length - 1;
    const prefix = depth > 0 ? '../'.repeat(depth) : '';
    document.querySelectorAll('.nav-cta').forEach(navCta => {
      if (navCta.querySelector('.nav-cart-btn')) return;
      const a = document.createElement('a');
      a.className = 'nav-cart-btn';
      a.href = prefix + 'checkout.html';
      a.setAttribute('aria-label', 'View cart');
      a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg><span class="cart-badge" style="display:none">0</span>';
      navCta.insertBefore(a, navCta.firstChild);
    });
  }

  /* Delegated "Add to cart" handler — any element with class .add-to-cart and
     data-id/data-name/data-price (optional data-sale, data-cat, data-img, data-type) */
  async function onAddToCart(e) {
    const btn = e.target.closest('.add-to-cart');
    if (!btn) return;
    e.preventDefault();
    const d = btn.dataset;
    if (!d.id) return;
    // Require sign-in before anything can be added to the cart
    const { data: { session } } = sb ? await sb.auth.getSession() : { data: { session: null } };
    if (!session) {
      toast('Please sign in to add items to your cart', 'info');
      const next = encodeURIComponent(location.pathname.replace(/^\//, '') + location.search);
      setTimeout(() => { window.location.href = 'login.html?next=' + next; }, 900);
      return;
    }
    const already = Cart.get().some(p => p.id === d.id);
    if (already) { toast('Already in your cart', 'info'); return; }
    Cart.add({
      id:            d.id,
      name:          d.name || 'Item',
      price:         parseFloat(d.price) || 0,
      sale_price:    d.sale ? parseFloat(d.sale) : null,
      category:      d.cat || d.type || '',
      thumbnail_url: d.img || '',
      type:          d.type || 'product',
    });
    toast(`Added “${d.name}” to cart`, 'success');
    const label = btn.querySelector('.atc-label') || btn;
    const orig = label.textContent;
    label.textContent = 'Added ✓';
    btn.classList.add('in-cart');
    setTimeout(() => { label.textContent = orig; btn.classList.remove('in-cart'); }, 1600);
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateNav();
    ensureCartBtn();
    Cart.updateBadge();
  });
  document.addEventListener('click', onAddToCart);

  /* ================================================================
     PUBLIC API  —  window.OFXAuth
  ================================================================ */
  window.OFXAuth = {
    sb, Cart, toast,

    async getSession() {
      if (!sb) return null;
      const { data: { session } } = await sb.auth.getSession();
      return session;
    },

    async getProfile(userId) {
      if (!sb) return null;
      try {
        const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
        return data;
      } catch { return null; }
    },

    async requireAuth(redirectTo) {
      if (!sb) return null;
      try {
        // 6-second timeout guards against extensions blocking the fetch
        const race = await Promise.race([
          sb.auth.getSession(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
        ]);
        const session = race?.data?.session;
        if (!session) {
          // redirectTo is already a full destination URL relative to the
          // CALLING page (e.g. 'login.html?next=admin.html' from admin.html,
          // or '../login.html?next=team/index.html' from team/index.html).
          // The absolute-path fallback works correctly from any directory depth.
          window.location.href = redirectTo || `/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          return null;
        }
        return session;
      } catch (e) {
        console.warn('requireAuth:', e.message, '— redirecting to login');
        // BUG FIX: this used to hardcode the relative path 'login.html', which
        // resolves to e.g. '/team/login.html' (404) when called from a page
        // inside a subdirectory like /team/. Reuse the same redirectTo the
        // caller already computed (it accounts for its own directory depth),
        // and fall back to an absolute path that works from anywhere.
        window.location.href = redirectTo || `/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return null;
      }
    },

    async signIn(identifier, password) {
      if (!sb) return { error: { message: 'Supabase not configured. Fill in js/config.js.' } };
      // Internal team/admin accounts log in with a username (no @) — map it to
      // a synthetic, never-emailed address so Supabase Auth can authenticate it.
      const email = identifier.includes('@')
        ? identifier
        : `${identifier.trim().toLowerCase()}@team.optimityfx.local`;
      return sb.auth.signInWithPassword({ email, password });
    },

    async signUp(email, password, fullName) {
      if (!sb) return { data: null, error: { message: 'Supabase not configured. Fill in js/config.js.' } };
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } },
      });
      if (!error && data.user) {
        await sb.from('profiles').upsert({
          id: data.user.id, email, full_name: fullName,
          role: 'customer', wallet_credits: 0, login_streak: 0,
        });
      }
      return { data, error };
    },

    async signInWithGoogle(next) {
      if (!sb) return;
      // Return the user where they started (e.g. checkout.html) if a safe
      // same-site `next` is provided; otherwise land on the dashboard.
      let dest = OFX.siteUrl + '/dashboard.html';
      if (next && !/^https?:/i.test(next) && !next.startsWith('//')) {
        dest = OFX.siteUrl + '/' + next.replace(/^\/+/, '');
      }
      return sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: dest },
      });
    },

    async signOut() {
      if (sb) await sb.auth.signOut();
      Cart.clear();
      window.location.href = 'index.html';
    },

    async resetPassword(email) {
      if (!sb) return { error: { message: 'Supabase not configured.' } };
      return sb.auth.resetPasswordForEmail(email, {
        redirectTo: OFX.siteUrl + '/forgot-password.html',
      });
    },

    async updatePassword(newPassword) {
      if (!sb) return { error: { message: 'Supabase not configured.' } };
      return sb.auth.updateUser({ password: newPassword });
    },

    async validateCoupon(code, orderTotal) {
      if (!sb) return { valid: false, message: 'Coupons unavailable — Supabase not configured.' };
      const { data, error } = await sb
        .from('coupons')
        .select('*')
        .eq('code', code.toUpperCase().trim())
        .eq('is_active', true)
        .maybeSingle();
      if (error || !data) return { valid: false, message: 'Invalid coupon code.' };
      if (data.expires_at && new Date(data.expires_at) < new Date()) return { valid: false, message: 'Coupon has expired.' };
      if (data.max_uses && data.used_count >= data.max_uses) return { valid: false, message: 'Coupon usage limit reached.' };
      if (orderTotal < (data.min_order || 0)) return { valid: false, message: `Minimum order ₹${data.min_order} required.` };
      const discount = data.discount_type === 'percent'
        ? (orderTotal * data.discount_value / 100)
        : data.discount_value;
      return { valid: true, coupon: data, discount: Math.min(discount, orderTotal), message: `Coupon applied! You save ₹${Math.floor(discount)}.` };
    },

    updateNav,
  };
})();

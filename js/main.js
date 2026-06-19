/* ============================================================
   OptimityFX — Interactions
   ============================================================ */
(function () {
  'use strict';

  /* ---- Navbar scroll state + progress bar + depth parallax ---- */
  const nav = document.querySelector('.nav');
  const progress = document.querySelector('.progress');
  const root = document.documentElement;
  const onScroll = () => {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 20);
    if (progress) {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      progress.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
    }
    // Exposes scroll position as a CSS var so hero layers can drift at a
    // different rate than the page — a sense of depth, no tilt/rotation.
    root.style.setProperty('--scroll-y', window.scrollY);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- Mobile menu ---- */
  const burger = document.querySelector('.burger');
  if (burger) {
    burger.addEventListener('click', () => document.body.classList.toggle('menu-open'));
    document.querySelectorAll('.m-drawer a').forEach(a =>
      a.addEventListener('click', () => document.body.classList.remove('menu-open')));
  }

  /* ---- Scroll reveal ---- */
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(el => io.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('in'));
  }

  /* ---- Animated counters ---- */
  const counters = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window && counters.length) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const target = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const dur = 1500; const start = performance.now();
        const dec = (target % 1 !== 0) ? 1 : 0;
        const tick = (now) => {
          const p = Math.min((now - start) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = (target * eased).toFixed(dec) + suffix;
          if (p < 1) requestAnimationFrame(tick); else el.textContent = target.toFixed(dec) + suffix;
        };
        requestAnimationFrame(tick);
        cio.unobserve(el);
      });
    }, { threshold: 0.5 });
    counters.forEach(c => cio.observe(c));
  }

  /* ---- Portfolio filters ---- */
  const filterBtns = document.querySelectorAll('.filter-btn');
  if (filterBtns.length) {
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.filter;
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('[data-cat]').forEach(item => {
          const show = f === 'all' || item.dataset.cat.includes(f);
          item.style.display = show ? '' : 'none';
        });
      });
    });
  }

  /* ---- Before / After sliders ---- */
  document.querySelectorAll('.ba').forEach(ba => {
    const after = ba.querySelector('.after');
    const handle = ba.querySelector('.handle');
    const range = ba.querySelector('input[type=range]');
    const set = (v) => {
      after.style.clipPath = `inset(0 0 0 ${v}%)`;
      handle.style.left = v + '%';
    };
    if (range) { range.addEventListener('input', () => set(range.value)); set(range.value || 50); }
  });

  /* ---- Video poster -> iframe ---- */
  document.querySelectorAll('.video-poster').forEach(poster => {
    poster.addEventListener('click', () => {
      const src = poster.dataset.src;
      if (!src) return;
      const frame = poster.closest('.video-frame');
      const ratio = frame.querySelector('.ratio');
      const iframe = document.createElement('iframe');
      iframe.src = src + (src.includes('?') ? '&' : '?') + 'autoplay=1';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.loading = 'lazy';
      ratio.appendChild(iframe);
      poster.remove();
    });
  });

  /* ---- Accordion (FAQ) ---- */
  document.querySelectorAll('.acc-q').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.closest('.acc-item');
      const ans = item.querySelector('.acc-a');
      const isOpen = item.classList.contains('open');
      item.classList.toggle('open');
      ans.style.maxHeight = isOpen ? null : ans.scrollHeight + 'px';
    });
  });

  /* ---- Lightbox gallery (images + video) ---- */
  const lb = document.querySelector('.lightbox');
  if (lb) {
    const stage = lb.querySelector('.lb-stage') || lb.querySelector('img');
    // Build an ordered list of clickable gallery items.
    // An item can be: a .tile carrying data-full (image) or data-video (embed),
    // or any standalone element with [data-lightbox]/[data-full]/[data-video].
    const nodes = Array.from(document.querySelectorAll(
      '.tile[data-full], .tile[data-video], [data-lightbox], [data-full]:not(.tile), [data-video]:not(.tile)'
    ));
    const items = nodes.map(n => ({
      video: n.dataset.video || null,
      src: n.dataset.full || n.dataset.lightbox || (n.tagName === 'IMG' ? n.src : (n.querySelector('img') ? n.querySelector('img').src : '')),
      node: n
    })).filter(it => it.video || it.src);

    let idx = 0;
    const render = () => {
      const it = items[idx];
      if (it.video) {
        const sep = it.video.includes('?') ? '&' : '?';
        lb.querySelector('.lb-frame').innerHTML =
          '<iframe src="' + it.video + sep + 'autoplay=1" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>';
        lb.classList.add('is-video');
      } else {
        lb.querySelector('.lb-frame').innerHTML = '<img src="' + it.src + '" alt="Gallery image">';
        lb.classList.remove('is-video');
      }
    };
    const open = (i) => { idx = (i + items.length) % items.length; lb.classList.add('open'); document.body.style.overflow = 'hidden'; render(); };
    const close = () => { lb.classList.remove('open'); lb.querySelector('.lb-frame').innerHTML = ''; document.body.style.overflow = ''; };
    const go = (d) => { idx = (idx + d + items.length) % items.length; render(); };

    items.forEach((it, i) => {
      it.node.style.cursor = 'pointer';
      it.node.addEventListener('click', (e) => { e.preventDefault(); open(i); });
    });
    lb.querySelector('.lb-close').addEventListener('click', close);
    lb.querySelector('.lb-next').addEventListener('click', () => go(1));
    lb.querySelector('.lb-prev').addEventListener('click', () => go(-1));
    lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('lb-frame')) close(); });
    document.addEventListener('keydown', (e) => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    });
  }

  /* ---- Contact / form fake submit ---- */
  document.querySelectorAll('form[data-fake]').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      const orig = btn.textContent;
      btn.textContent = 'Sending…'; btn.disabled = true;
      setTimeout(() => {
        btn.textContent = '✓ Message Sent';
        form.reset();
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2600);
      }, 1000);
    });
  });

  /* ---- Contact form: real submission via Web3Forms ---- */
  document.querySelectorAll('form[data-web3forms]').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      const status = form.querySelector('.form-status');
      const orig = btn.textContent;
      btn.textContent = 'Sending…'; btn.disabled = true;
      if (status) { status.textContent = ''; status.style.color = ''; }
      try {
        const res = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(Object.fromEntries(new FormData(form)))
        });
        const data = await res.json();
        if (data.success) {
          btn.textContent = '✓ Message Sent';
          if (status) { status.textContent = "Thanks — we'll be in touch within 24 hours."; status.style.color = 'var(--accent)'; }
          form.reset();
        } else {
          throw new Error(data.message || 'Submission failed');
        }
      } catch (err) {
        btn.textContent = orig;
        if (status) { status.textContent = 'Something went wrong — please email us directly at hello@optimityfx.com.'; status.style.color = 'var(--red)'; }
      } finally {
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2600);
      }
    });
  });

  /* ---- Magnetic buttons — primary CTAs drift gently toward the cursor ---- */
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !window.matchMedia('(hover: none)').matches) {
    const PULL = 0.28;     // how much of the offset to follow (0–1)
    const MAX  = 14;       // px cap so the pull stays subtle
    document.querySelectorAll('.btn-accent, .btn-primary').forEach((el) => {
      el.classList.add('btn-magnetic');
      let raf;
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const x = Math.max(-MAX, Math.min(MAX, (e.clientX - r.left - r.width / 2) * PULL));
        const y = Math.max(-MAX, Math.min(MAX, (e.clientY - r.top - r.height / 2) * PULL));
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => { el.style.transform = `translate(${x}px, ${y}px)`; });
      }, { passive: true });
      el.addEventListener('mouseleave', () => {
        if (raf) cancelAnimationFrame(raf);
        el.style.transform = '';
      });
    });
  }

  /* ---- Year ---- */
  document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());

  /* ---- Cinematic hero background video ----
     Faint looping clip behind the hero copy on every page, played as a
     muted Vimeo "background" embed (auto-loops, hides UI, no controls).
     Swap HERO_VIDEO_ID for a brand clip whenever ready. */
  const HERO_VIDEO_ID = '1036232141';
  const HERO_VIDEO_SRC = `https://player.vimeo.com/video/${HERO_VIDEO_ID}?badge=0&autopause=0&player_id=0&app_id=58479&background=1&autoplay=1&loop=1&muted=1`;
  const heroSections = document.querySelectorAll('.hero, .page-hero, .dash-hero');
  if (heroSections.length && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    heroSections.forEach((section) => {
      const wrap = document.createElement('div');
      wrap.className = 'hero-cine-video is-loading';
      wrap.setAttribute('aria-hidden', 'true');

      const iframe = document.createElement('iframe');
      iframe.src = HERO_VIDEO_SRC;
      iframe.setAttribute('tabindex', '-1');
      iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      iframe.title = 'Background ambience';
      iframe.addEventListener('load', () => wrap.classList.remove('is-loading'), { once: true });

      wrap.appendChild(iframe);
      section.insertBefore(wrap, section.firstChild);
    });

    if (!document.querySelector('script[src*="player.vimeo.com/api/player.js"]')) {
      const api = document.createElement('script');
      api.src = 'https://player.vimeo.com/api/player.js';
      document.body.appendChild(api);
    }
  }
})();

/* ---- Mouse-tracking glow ---- */
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = window.matchMedia('(hover: none)').matches;

  const glow = document.createElement('div');
  glow.id = 'mouse-glow';
  glow.setAttribute('aria-hidden', 'true');
  document.body.appendChild(glow);

  let raf, mx = 50, my = 50;
  const render = () => {
    glow.style.background =
      `radial-gradient(820px circle at ${mx}% ${my}%, rgba(0,212,255,0.075), rgba(0,212,255,0.02) 35%, transparent 60%)`;
  };

  document.addEventListener('mousemove', (e) => {
    mx = (e.clientX / window.innerWidth)  * 100;
    my = (e.clientY / window.innerHeight) * 100;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  }, { passive: true });

  // Initial soft glow at center-top
  render();

  /* ---- Trailing glow dot — a single focused light that eases toward the cursor ---- */
  if (!reduced && !touch) {
    const dot = document.createElement('div');
    dot.id = 'mouse-glow-dot';
    dot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dot);

    let tx = window.innerWidth / 2, ty = window.innerHeight / 2; // target (cursor)
    let dx = tx, dy = ty;                                         // displayed (eased)
    let active = false, dotRaf = null;

    const tick = () => {
      dx += (tx - dx) * 0.16;
      dy += (ty - dy) * 0.16;
      dot.style.transform = `translate(${dx}px, ${dy}px)`;
      if (Math.abs(tx - dx) > 0.4 || Math.abs(ty - dy) > 0.4) {
        dotRaf = requestAnimationFrame(tick);
      } else {
        dotRaf = null;
      }
    };
    const startTick = () => { if (!dotRaf) dotRaf = requestAnimationFrame(tick); };

    document.addEventListener('mousemove', (e) => {
      tx = e.clientX; ty = e.clientY;
      if (!active) { active = true; dot.classList.add('show'); dx = tx; dy = ty; }
      startTick();
    }, { passive: true });

    document.addEventListener('mouseleave', () => { dot.classList.remove('show'); active = false; });
  }
})();

/* ============================================================
   OptimityFX — Panel dashboard widgets
   Renders into any element with id="panel-widgets".
   Layout (top to bottom):
     1. Hero Live Timer  (Team Portal only — moved here from the
        dedicated Time Tracker section, with a glowing left-to-right
        loop animation while tracking)
     2. Overview row: Local Time / Weather / Focus Mode
     3. "Your Day"        — Quick Actions, Today's Tasks, Deadlines, Daily Tip
     4. "Team & Projects" — My Week, Project Health, Recent Activity, Team Pulse
   Weather: Open-Meteo (free, no API key) — falls back to Kolkata
   if geolocation is denied or unavailable.
   Reads via OFXAuth.sb (already-authenticated client + RLS).
   ============================================================ */
(function () {
  'use strict';

  const FALLBACK = { name: 'Kolkata', lat: 22.5726, lon: 88.3639 };
  const onTeamPortal = location.pathname.includes('/team/');

  // WMO weather codes -> { label, icon, bad }
  const WCODES = {
    0:['Clear sky','☀️',false], 1:['Mainly clear','🌤️',false], 2:['Partly cloudy','⛅',false], 3:['Overcast','☁️',false],
    45:['Fog','🌫️',true], 48:['Fog','🌫️',true],
    51:['Light drizzle','🌦️',true], 53:['Drizzle','🌦️',true], 55:['Heavy drizzle','🌧️',true],
    61:['Light rain','🌧️',true], 63:['Rain','🌧️',true], 65:['Heavy rain','🌧️',true],
    66:['Freezing rain','🌧️',true], 67:['Freezing rain','🌧️',true],
    71:['Light snow','🌨️',true], 73:['Snow','🌨️',true], 75:['Heavy snow','🌨️',true],
    80:['Rain showers','🌦️',true], 81:['Rain showers','🌧️',true], 82:['Violent showers','⛈️',true],
    95:['Thunderstorm','⛈️',true], 96:['Thunderstorm w/ hail','⛈️',true], 99:['Severe thunderstorm','⛈️',true],
  };

  function fmtDur(mins) { if (!mins) return '0m'; const h=Math.floor(mins/60), m=mins%60; return h ? `${h}h ${m}m` : `${m}m`; }
  function relativeTime(iso) {
    if (!iso) return '—';
    const diffSec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (diffSec < 60)    return 'Just now';
    if (diffSec < 3600)  return `${Math.floor(diffSec/60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec/3600)}h ago`;
    return `${Math.floor(diffSec/86400)}d ago`;
  }
  const rowStyle = 'display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line-soft)';

  /* ================================================================
     1. HERO LIVE TIMER  (Team Portal only)
     Moved here from the dedicated Time Tracker section so members can
     start/stop tracking without leaving the dashboard. Self-contained:
     loads its own project list (ALL projects — the old widget only
     listed "active" ones, which silently left the dropdown empty for
     teams without an active project, the "select project not working"
     bug) and writes straight to time_logs.
  ================================================================ */
  function heroTimerHTML() {
    return `<div class="pw-hero-timer" id="pw-timer">
      <div class="pw-hero-grid">
        <div>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="pw-timer-dot idle" id="pwt-dot"></span>
            <span style="font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px">Live Time Tracker</span>
          </div>
          <div class="pw-hero-clock" id="pwt-clock">00:00:00</div>
          <div class="pw-hero-label" id="pwt-label">Pick a project and hit Start to begin tracking</div>
        </div>
        <div class="pw-hero-controls">
          <select class="filter-select" id="pwt-project"><option value="">Select project…</option></select>
          <button class="btn-timer start" id="pwt-start">▶ Start</button>
          <button class="btn-timer stop" id="pwt-stop" style="display:none">⏹ Stop</button>
        </div>
      </div>
      <div class="pw-glow-track idle" id="pwt-track"><div class="pw-glow-fill"></div></div>
    </div>`;
  }

  let pwtInterval = null, pwtStart = null, pwtSeconds = 0, pwtProjectId = null, pwtProjects = [];
  function pwtTick() {
    const h = Math.floor(pwtSeconds/3600), m = Math.floor((pwtSeconds%3600)/60), s = pwtSeconds%60;
    const el = document.getElementById('pwt-clock');
    if (el) el.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  async function startHeroTimer() {
    const root = document.getElementById('pw-timer');
    if (!root) return;
    const sb = window.OFXAuth?.sb;
    const session = await OFXAuth.getSession();
    if (!sb || !session) return;
    const myId = session.user.id;

    // Load ALL projects (not just "active") so the dropdown is never empty.
    const { data: projects } = await sb.from('projects').select('id,title,status').order('title', { ascending: true });
    pwtProjects = projects || [];
    const sel = document.getElementById('pwt-project');
    if (sel) {
      sel.innerHTML = '<option value="">Select project…</option>' +
        pwtProjects.map(p => `<option value="${p.id}">${p.title}${p.status === 'completed' ? ' (completed)' : ''}</option>`).join('');
    }

    const dot      = document.getElementById('pwt-dot');
    const labelEl  = document.getElementById('pwt-label');
    const track    = document.getElementById('pwt-track');
    const startBtn = document.getElementById('pwt-start');
    const stopBtn  = document.getElementById('pwt-stop');
    if (!sel || !startBtn || !stopBtn) return;

    startBtn.addEventListener('click', () => {
      pwtProjectId = sel.value;
      if (!pwtProjectId) { OFXAuth.toast('Select a project first.', 'error'); return; }
      const proj = pwtProjects.find(p => p.id === pwtProjectId);
      labelEl.textContent = `Tracking “${proj?.title || 'project'}” — keep this tab open while you work`;
      pwtStart = new Date();
      pwtSeconds = 0; pwtTick();
      startBtn.style.display = 'none';
      stopBtn.style.display  = '';
      sel.disabled = true;
      dot.classList.remove('idle');
      track.classList.remove('idle');
      pwtInterval = setInterval(() => { pwtSeconds++; pwtTick(); }, 1000);
    });

    stopBtn.addEventListener('click', async () => {
      clearInterval(pwtInterval);
      const end = new Date();
      const mins = Math.round((end - pwtStart) / 60000);
      startBtn.style.display = '';
      stopBtn.style.display  = 'none';
      sel.disabled = false;
      dot.classList.add('idle');
      track.classList.add('idle');
      labelEl.textContent = 'Pick a project and hit Start to begin tracking';
      pwtSeconds = 0; pwtTick();
      if (mins < 1) { OFXAuth.toast('Session too short to log.', 'info'); return; }
      const { error } = await sb.from('time_logs').insert({
        user_id: myId, project_id: pwtProjectId,
        start_time: pwtStart.toISOString(), end_time: end.toISOString(), duration_mins: mins,
      });
      if (error) { OFXAuth.toast('Could not save time log: ' + error.message, 'error'); return; }
      OFXAuth.toast(`Logged ${fmtDur(mins)} ✓`, 'success');
      loadMyWeek();
      loadRecentActivity();
      // Refresh the Time Tracker page's own log list, if it's mounted.
      if (typeof window.loadTimeLogs === 'function') window.loadTimeLogs();
    });
  }

  /* ================================================================
     2. OVERVIEW ROW — Local Time / Weather / Focus Mode
  ================================================================ */
  function overviewHTML() {
    return `
    <div class="pw-bar" style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:8px">
      <div class="pw-card" id="pw-clock" style="flex:1;min-width:180px;background:var(--panel-2);border:1px solid var(--line);border-radius:14px;padding:16px 20px">
        <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px">Local Time</div>
        <div id="pw-clock-time" style="font-size:1.5rem;font-weight:700;color:var(--white);font-family:monospace">--:--:--</div>
        <div id="pw-clock-date" style="font-size:.78rem;color:var(--muted);margin-top:2px">—</div>
      </div>
      <div class="pw-card" id="pw-weather" style="flex:1;min-width:220px;background:var(--panel-2);border:1px solid var(--line);border-radius:14px;padding:16px 20px">
        <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px">Weather — <span id="pw-weather-loc">…</span></div>
        <div id="pw-weather-body" style="font-size:.92rem;color:var(--text)">Loading weather…</div>
      </div>
      <div class="pw-card" id="pw-focus" style="flex:1;min-width:180px;background:var(--panel-2);border:1px solid var(--line);border-radius:14px;padding:16px 20px;display:flex;flex-direction:column;justify-content:space-between">
        <div>
          <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px">Focus Mode</div>
          <div id="pw-focus-status" style="font-size:.92rem;color:var(--text)">Off — distractions visible</div>
        </div>
        <button class="btn btn-ghost btn-sm" id="pw-focus-btn" style="margin-top:10px;align-self:flex-start">Turn on Focus Mode</button>
      </div>
    </div>`;
  }

  function startClock() {
    const timeEl = document.getElementById('pw-clock-time');
    const dateEl = document.getElementById('pw-clock-date');
    if (!timeEl) return;
    const tick = () => {
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      dateEl.textContent = now.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' });
    };
    tick();
    setInterval(tick, 1000);
  }

  async function loadWeather(lat, lon, locName) {
    const locEl  = document.getElementById('pw-weather-loc');
    const bodyEl = document.getElementById('pw-weather-body');
    if (locEl) locEl.textContent = locName;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,precipitation_probability_max&timezone=auto&forecast_days=1`;
      const res = await fetch(url);
      const data = await res.json();
      const code = data?.current?.weather_code;
      const temp = Math.round(data?.current?.temperature_2m);
      const [label, icon, bad] = WCODES[code] || ['—','🌡️',false];
      const rainChance = data?.daily?.precipitation_probability_max?.[0];
      let html = `<div style="font-size:1.3rem;font-weight:700;color:var(--white)">${icon} ${isNaN(temp)?'—':temp+'°C'}</div>
                  <div style="margin-top:2px">${label}${rainChance!=null?` · ${rainChance}% rain chance today`:''}</div>`;
      if (bad || (rainChance != null && rainChance >= 60)) {
        html += `<div style="margin-top:10px;padding:8px 12px;background:rgba(255,194,61,.1);border:1px solid rgba(255,194,61,.3);border-radius:8px;font-size:.8rem;color:#FFC23D">⚠ Bad weather ahead — plan around possible delays today.</div>`;
      } else {
        html += `<div style="margin-top:10px;padding:8px 12px;background:rgba(34,224,122,.1);border:1px solid rgba(34,224,122,.3);border-radius:8px;font-size:.8rem;color:#22e07a">✓ Good conditions — clear skies for focused work.</div>`;
      }
      if (bodyEl) bodyEl.innerHTML = html;
    } catch (e) {
      if (bodyEl) bodyEl.textContent = 'Weather unavailable right now.';
    }
  }

  function startWeather() {
    if (!document.getElementById('pw-weather')) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => loadWeather(pos.coords.latitude, pos.coords.longitude, 'Your location'),
        () => loadWeather(FALLBACK.lat, FALLBACK.lon, FALLBACK.name),
        { timeout: 5000 }
      );
    } else {
      loadWeather(FALLBACK.lat, FALLBACK.lon, FALLBACK.name);
    }
  }

  function startFocusMode() {
    const btn = document.getElementById('pw-focus-btn');
    const status = document.getElementById('pw-focus-status');
    if (!btn) return;
    const KEY = 'ofx_focus_mode';
    const apply = (on) => {
      document.body.classList.toggle('focus-mode', on);
      btn.textContent = on ? 'Turn off Focus Mode' : 'Turn on Focus Mode';
      status.textContent = on ? 'On — sidebar dimmed, stay in flow' : 'Off — distractions visible';
      localStorage.setItem(KEY, on ? '1' : '0');
    };
    btn.addEventListener('click', () => apply(!document.body.classList.contains('focus-mode')));
    apply(localStorage.getItem(KEY) === '1');
  }

  /* ================================================================
     3 & 4. PRODUCTIVITY GRIDS
  ================================================================ */
  function pCardHTML(id, title, badgeId) {
    return `<div class="pw-card" id="${id}" style="background:var(--panel-2);border:1px solid var(--line);border-radius:14px;padding:16px 20px;display:flex;flex-direction:column">
      <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;display:flex;align-items:center;gap:8px">
        <span>${title}</span>
        ${badgeId ? `<span id="${badgeId}" style="display:none;background:var(--accent);color:#0B0E14;border-radius:20px;padding:1px 8px;font-size:.68rem;font-weight:700"></span>` : ''}
      </div>
      <div id="${id}-body" style="font-size:.86rem;color:var(--text);flex:1">Loading…</div>
    </div>`;
  }

  function gridHTML(label, cards) {
    return `<div class="pw-section-label">${label}</div>
    <div class="pw-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-bottom:8px">
      ${cards.join('')}
    </div>`;
  }

  /* ---------- Quick Actions ---------- */
  // Each entry maps to a button that already exists somewhere on THIS page
  // (Team Portal or Admin Panel) — we just surface the most useful ones in
  // one place and "click" the real button so all existing logic still runs.
  const QUICK_ACTIONS = [
    { id: 'add-task-btn',        label: 'New Task',        icon: '✅' },
    { id: 'add-project-btn',     label: 'New Project',     icon: '📁' },
    { id: 'admin-add-proj-btn',  label: 'New Project',     icon: '📁' },
    { id: 'manual-log-btn',      label: 'Log Time',        icon: '⏱️', section: 'timetracker' },
    { id: 'add-client-btn',      label: 'Add Client',      icon: '🧑‍💼' },
    { id: 'add-product-btn',     label: 'New Product',     icon: '🛍️' },
    { id: 'add-course-btn',      label: 'New Course',      icon: '🎓' },
    { id: 'add-coupon-btn',      label: 'New Coupon',      icon: '🏷️' },
  ];
  function loadQuickActions() {
    const body = document.getElementById('pw-quick-body');
    if (!body) return;
    const found = QUICK_ACTIONS.filter(a => document.getElementById(a.id));
    if (!found.length) { body.innerHTML = '<div style="color:var(--muted)">No quick actions available here.</div>'; return; }
    body.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px">${found.map(a =>
      `<button type="button" class="btn btn-ghost btn-sm pw-qa-btn" data-target="${a.id}" data-section="${a.section||''}">${a.icon} ${a.label}</button>`
    ).join('')}</div>`;
    body.querySelectorAll('.pw-qa-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sectionName = btn.dataset.section;
        if (sectionName) {
          const navBtn = document.querySelector(`.sidebar-link[data-section="${sectionName}"]`);
          if (navBtn) navBtn.click();
        }
        const target = document.getElementById(btn.dataset.target);
        if (target) setTimeout(() => target.click(), sectionName ? 80 : 0);
      });
    });
  }

  /* ---------- Today's Tasks ---------- */
  async function loadTodayTasks() {
    const body  = document.getElementById('pw-today-body');
    const badge = document.getElementById('pw-today-badge');
    if (!body) return;
    const sb = window.OFXAuth?.sb;
    if (!sb) { body.textContent = 'Unavailable.'; return; }
    try {
      const session = await OFXAuth.getSession();
      if (!session) { body.innerHTML = '<div style="color:var(--muted)">Sign in to see your tasks.</div>'; return; }
      const today = new Date().toISOString().split('T')[0];
      const { data } = await sb.from('tasks')
        .select('id,title,priority,status,due_date,project:projects(title)')
        .eq('assigned_to', session.user.id)
        .eq('due_date', today)
        .neq('status', 'done')
        .order('priority', { ascending: false });
      const tasks = data || [];
      if (badge) { badge.textContent = tasks.length; badge.style.display = tasks.length ? '' : 'none'; }
      if (!tasks.length) { body.innerHTML = '<div style="color:var(--muted)">🎉 Nothing due today — you\'re all caught up!</div>'; return; }
      const pColor = { low:'#5E6776', medium:'#FFC23D', high:'#FF8A3D', urgent:'#FF3B57' };
      body.innerHTML = tasks.map(t => `
        <div style="${rowStyle}">
          <span style="width:7px;height:7px;border-radius:50%;background:${pColor[t.priority]||pColor.medium};flex:none"></span>
          <div style="min-width:0;flex:1">
            <div style="color:var(--white);font-size:.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.title}</div>
            ${t.project?.title ? `<div style="font-size:.72rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.project.title}</div>` : ''}
          </div>
        </div>`).join('');
    } catch (e) { body.innerHTML = '<div style="color:var(--muted)">Could not load today\'s tasks.</div>'; }
  }

  /* ---------- Upcoming Deadlines ---------- */
  async function loadDeadlines() {
    const body = document.getElementById('pw-deadlines-body');
    if (!body) return;
    const sb = window.OFXAuth?.sb;
    if (!sb) { body.textContent = 'Unavailable.'; return; }
    try {
      const today = new Date(); today.setHours(0,0,0,0);
      const horizon = new Date(today); horizon.setDate(horizon.getDate() + 7);
      const todayStr   = today.toISOString().split('T')[0];
      const horizonStr = horizon.toISOString().split('T')[0];
      const [{ data: tasks }, { data: projects }] = await Promise.all([
        sb.from('tasks').select('id,title,due_date').neq('status','done').gte('due_date', todayStr).lte('due_date', horizonStr),
        sb.from('projects').select('id,title,deadline').neq('status','completed').gte('deadline', todayStr).lte('deadline', horizonStr),
      ]);
      const items = [
        ...(tasks||[]).map(t => ({ type: 'Task',    title: t.title, date: t.due_date })),
        ...(projects||[]).map(p => ({ type: 'Project', title: p.title, date: p.deadline })),
      ].filter(it => it.date).sort((a,b) => new Date(a.date) - new Date(b.date)).slice(0, 6);
      if (!items.length) { body.innerHTML = '<div style="color:var(--muted)">No deadlines in the next 7 days. 🎈</div>'; return; }
      body.innerHTML = items.map(it => {
        const days = Math.round((new Date(it.date) - today) / 86400000);
        const dueLabel = days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
        const urgent = days <= 1;
        return `<div style="${rowStyle};justify-content:space-between">
          <div style="min-width:0">
            <div style="color:var(--white);font-size:.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.title}</div>
            <div style="font-size:.72rem;color:var(--muted)">${it.type}</div>
          </div>
          <span style="font-size:.74rem;font-weight:700;color:${urgent?'#FF3B57':'var(--accent)'};white-space:nowrap;margin-left:10px">${dueLabel}</span>
        </div>`;
      }).join('');
    } catch (e) { body.innerHTML = '<div style="color:var(--muted)">Could not load deadlines.</div>'; }
  }

  /* ---------- Daily Tip ---------- */
  const PRODUCTIVITY_TIPS = [
    'Batch similar tasks together — every context switch has a hidden cost.',
    'Block your first 90 minutes for deep work, before inboxes take over.',
    'Write tomorrow’s top 3 priorities before you log off today.',
    'A 5-minute break every 50 minutes keeps focus sharp for longer.',
    'One finished small task beats three half-finished big ones.',
    'Say the outcome out loud before you start — clarity beats motivation.',
    'Close the tabs you’re not using right now; clutter taxes attention.',
    'Batch replies instead of answering messages the instant they land.',
    'Review what you just finished before jumping to the next thing.',
    'Protect your sharpest hours for your hardest task, not your easiest.',
    'Progress beats perfection — ship the version that’s good enough today.',
    'A cluttered project board hides risk. Groom it before it grows.',
  ];
  function loadDailyTip() {
    const body = document.getElementById('pw-tip-body');
    if (!body) return;
    const dayIndex = Math.floor(Date.now() / 86400000);
    const tip = PRODUCTIVITY_TIPS[dayIndex % PRODUCTIVITY_TIPS.length];
    body.innerHTML = `<div style="display:flex;gap:12px;align-items:flex-start;height:100%">
      <span class="pw-tip-icon">💡</span>
      <span style="font-size:.86rem;color:var(--text);line-height:1.6;align-self:center">${tip}</span>
    </div>`;
  }

  /* ---------- My Week at a Glance ---------- */
  async function loadMyWeek() {
    const body = document.getElementById('pw-myweek-body');
    if (!body) return;
    const sb = window.OFXAuth?.sb;
    if (!sb) { body.textContent = 'Unavailable.'; return; }
    try {
      const session = await OFXAuth.getSession();
      if (!session) { body.innerHTML = '<div style="color:var(--muted)">Sign in to see your week.</div>'; return; }
      const start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate() - 6);
      const { data } = await sb.from('time_logs').select('duration_mins,created_at').eq('user_id', session.user.id).gte('created_at', start.toISOString());
      const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
      const totals = days.map(d => {
        const key = d.toISOString().split('T')[0];
        return (data||[]).filter(l => (l.created_at||'').startsWith(key)).reduce((s,l)=>s+(l.duration_mins||0), 0);
      });
      const max = Math.max(1, ...totals);
      const totalMins = totals.reduce((a,b)=>a+b, 0);
      const totalH = Math.round(totalMins/60 * 10) / 10;
      const dayLabels = days.map(d => d.toLocaleDateString('en-IN', { weekday: 'narrow' }));
      body.innerHTML = `
        <div style="display:flex;align-items:flex-end;gap:6px;height:72px;margin-bottom:10px">
          ${totals.map((mins,i) => {
            const h = mins ? Math.max(6, Math.round(mins/max*64)) : 3;
            const isToday = i === 6;
            const hrs = Math.round(mins/60*10)/10;
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px" title="${hrs}h">
              <div style="width:100%;height:${h}px;border-radius:5px 5px 2px 2px;background:${isToday ? 'linear-gradient(180deg,var(--accent),rgba(0,212,255,.2))' : 'rgba(154,163,178,.28)'}"></div>
              <span style="font-size:.66rem;color:${isToday ? 'var(--accent)' : 'var(--muted)'}">${dayLabels[i]}</span>
            </div>`;
          }).join('')}
        </div>
        <div style="font-size:.78rem;color:var(--muted)">⏱ <strong style="color:var(--white)">${totalH}h</strong> logged in the last 7 days</div>`;
    } catch (e) { body.innerHTML = '<div style="color:var(--muted)">Could not load your week.</div>'; }
  }

  /* ---------- Project Health ---------- */
  async function loadProjectHealth() {
    const body = document.getElementById('pw-health-body');
    if (!body) return;
    const sb = window.OFXAuth?.sb;
    if (!sb) { body.textContent = 'Unavailable.'; return; }
    try {
      const { data: projects } = await sb.from('projects').select('id,title,status,deadline').eq('status','active').order('deadline', { ascending: true, nullsFirst: false }).limit(5);
      if (!projects?.length) { body.innerHTML = '<div style="color:var(--muted)">No active projects right now. 🎈</div>'; return; }
      const ids = projects.map(p=>p.id);
      const { data: tasks } = await sb.from('tasks').select('project_id,status').in('project_id', ids);
      const today = new Date(); today.setHours(0,0,0,0);
      body.innerHTML = projects.map(p => {
        const pTasks = (tasks||[]).filter(t => t.project_id === p.id);
        const done = pTasks.filter(t => t.status === 'done').length;
        const pct = pTasks.length ? Math.round(done/pTasks.length*100) : 0;
        let dueLabel = 'No deadline', atRisk = false;
        if (p.deadline) {
          const days = Math.round((new Date(p.deadline) - today) / 86400000);
          atRisk = days <= 3 && pct < 80;
          dueLabel = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`;
        }
        const color = pct === 100 ? '#22e07a' : pct >= 50 ? 'var(--accent)' : '#FFC23D';
        return `<div class="pw-health-row">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <span style="color:var(--white);font-size:.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.title}</span>
            <span style="font-size:.72rem;font-weight:600;color:${atRisk ? '#FF3B57' : 'var(--muted)'};white-space:nowrap">${atRisk ? '⚠ ' : ''}${dueLabel}</span>
          </div>
          <div class="pw-health-bar"><div class="pw-health-fill" style="width:${pct}%;background:${color}"></div></div>
          <div style="font-size:.7rem;color:var(--muted);margin-top:3px">${pct}% complete · ${done}/${pTasks.length} tasks done</div>
        </div>`;
      }).join('');
    } catch (e) { body.innerHTML = '<div style="color:var(--muted)">Could not load project health.</div>'; }
  }

  /* ---------- Recent Activity ---------- */
  async function loadRecentActivity() {
    const body = document.getElementById('pw-activity-body');
    if (!body) return;
    const sb = window.OFXAuth?.sb;
    if (!sb) { body.textContent = 'Unavailable.'; return; }
    try {
      const [{ data: tasks }, { data: projects }] = await Promise.all([
        sb.from('tasks').select('id,title,status,updated_at').order('updated_at',{ascending:false}).limit(5),
        sb.from('projects').select('id,title,status,updated_at').order('updated_at',{ascending:false}).limit(5),
      ]);
      const items = [
        ...(tasks||[]).map(t => ({ icon: t.status==='done' ? '✅' : '📝', text: `Task “${t.title}” — ${String(t.status||'').replace('_',' ')}`, at: t.updated_at })),
        ...(projects||[]).map(p => ({ icon: '📁', text: `Project “${p.title}” — ${String(p.status||'').replace('_',' ')}`, at: p.updated_at })),
      ].filter(it => it.at).sort((a,b) => new Date(b.at) - new Date(a.at)).slice(0, 6);
      if (!items.length) { body.innerHTML = '<div style="color:var(--muted)">No recent activity yet.</div>'; return; }
      body.innerHTML = items.map(it => `
        <div style="${rowStyle};align-items:flex-start">
          <span style="flex:none">${it.icon}</span>
          <div style="min-width:0">
            <div style="color:var(--text);font-size:.8rem;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${it.text}</div>
            <div style="font-size:.7rem;color:var(--muted);margin-top:1px">${relativeTime(it.at)}</div>
          </div>
        </div>`).join('');
    } catch (e) { body.innerHTML = '<div style="color:var(--muted)">Could not load activity.</div>'; }
  }

  /* ---------- Team Pulse ---------- */
  // Light social-presence widget: surfaces who has touched a task or
  // logged time in the last 24h, with a "live" indicator if it was within
  // the last 30 minutes. Built from tasks/time_logs (not a real presence
  // system), so it degrades gracefully even before the team-profile
  // visibility RLS fix lands — falls back to "Teammate" if a name can't
  // be resolved for another member.
  async function loadTeamPulse() {
    const body = document.getElementById('pw-pulse-body');
    if (!body) return;
    const sb = window.OFXAuth?.sb;
    if (!sb) { body.textContent = 'Unavailable.'; return; }
    try {
      const since = new Date(Date.now() - 24*3600*1000).toISOString();
      const [{ data: tasks }, { data: logs }] = await Promise.all([
        sb.from('tasks').select('assigned_to,title,updated_at,member:profiles(full_name,email)').not('assigned_to','is',null).gte('updated_at', since).order('updated_at',{ascending:false}).limit(20),
        sb.from('time_logs').select('user_id,created_at,member:profiles(full_name,email)').gte('created_at', since).order('created_at',{ascending:false}).limit(20),
      ]);
      const seen = new Map();
      const consider = (id, name, at, what) => {
        if (!id || seen.has(id)) return;
        seen.set(id, { name: name || 'Teammate', at, what });
      };
      (logs||[]).forEach(l => consider(l.user_id, l.member?.full_name || l.member?.email, l.created_at, 'logging time'));
      (tasks||[]).forEach(t => consider(t.assigned_to, t.member?.full_name || t.member?.email, t.updated_at, `working on “${t.title}”`));
      const rows = [...seen.values()].sort((a,b) => new Date(b.at) - new Date(a.at)).slice(0, 5);
      if (!rows.length) { body.innerHTML = '<div style="color:var(--muted)">No team activity in the last 24 hours yet.</div>'; return; }
      body.innerHTML = rows.map(r => {
        const live = (Date.now() - new Date(r.at).getTime()) < 30*60*1000;
        return `<div style="${rowStyle}">
          <span class="pw-pulse-dot ${live?'live':'idle'}" title="${live?'Active recently':'Idle'}"></span>
          <div style="min-width:0;flex:1;overflow:hidden">
            <span style="color:var(--white);font-size:.84rem">${r.name}</span>
            <span style="color:var(--muted);font-size:.78rem"> — ${r.what}</span>
          </div>
          <span style="font-size:.7rem;color:var(--muted);white-space:nowrap;margin-left:6px">${relativeTime(r.at)}</span>
        </div>`;
      }).join('');
    } catch (e) { body.innerHTML = '<div style="color:var(--muted)">Could not load team activity.</div>'; }
  }

  /* ================================================================
     INIT
  ================================================================ */
  function init() {
    const mount = document.getElementById('panel-widgets');
    if (!mount) return;

    mount.innerHTML =
      (onTeamPortal ? heroTimerHTML() : '') +
      overviewHTML() +
      gridHTML('Your Day', [
        pCardHTML('pw-quick', '⚡ Quick Actions'),
        pCardHTML('pw-today', "📋 Today's Tasks", 'pw-today-badge'),
        pCardHTML('pw-deadlines', '⏰ Upcoming Deadlines'),
        pCardHTML('pw-tip', '💡 Daily Tip'),
      ]) +
      gridHTML('Team &amp; Projects', [
        pCardHTML('pw-myweek', '📊 My Week at a Glance'),
        pCardHTML('pw-health', '📁 Project Health'),
        pCardHTML('pw-activity', '🕒 Recent Activity'),
        pCardHTML('pw-pulse', '👥 Team Pulse'),
      ]);

    startClock();
    startWeather();
    startFocusMode();
    if (onTeamPortal) startHeroTimer();

    loadQuickActions();
    loadTodayTasks();
    loadDeadlines();
    loadDailyTip();
    loadMyWeek();
    loadProjectHealth();
    loadRecentActivity();
    loadTeamPulse();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

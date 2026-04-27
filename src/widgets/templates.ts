// HTML widgets rendered alongside ChatGPT replies via the Apps SDK.
//
// Each widget is plain HTML+CSS+JS, served as an MCP "resource" with
// MIME type `text/html;profile=mcp-app`. ChatGPT renders the resource
// inside a sandboxed iframe and pushes the corresponding tool's
// `structuredContent` to it via a `ui/notifications/tool-result`
// postMessage.
//
// Each widget file below:
//   - exports a URI constant (`ui://widget/<name>.html`)
//   - exports the HTML string
//   - is referenced from the matching tool's `_meta.openai/outputTemplate`
//
// Style conventions (kept consistent across widgets):
//   - Light green accent (#A7F0BA) matching the connector icon.
//   - Dark/light mode aware via CSS prefers-color-scheme.
//   - System fonts only (no external CSS or web fonts to avoid CSP).
//   - Inline SVG / unicode for icons; no external images.

export const URI_GET_CONTEXT = 'ui://widget/get-context.html';
export const URI_LOG_MEAL = 'ui://widget/log-meal.html';
export const URI_LOG_WORKOUT = 'ui://widget/log-workout.html';
export const URI_SET_TARGET = 'ui://widget/set-target.html';

const SHARED_HEAD = `
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    color-scheme: light dark;
    --fg: #1c1c1c;
    --fg-muted: #6e6e6e;
    --bg: #ffffff;
    --card: #fafafa;
    --border: #e8e8e8;
    --accent: #086f3a;
    --accent-bg: #d6f4dc;
    --good: #086f3a;
    --warn: #b46e00;
    --bad: #b22a2a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --fg: #f3f3f3;
      --fg-muted: #a0a0a0;
      --bg: #18181a;
      --card: #232326;
      --border: #34343a;
      --accent: #4ade80;
      --accent-bg: rgba(74, 222, 128, 0.12);
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI",
      Roboto, system-ui, sans-serif;
    font-size: 14px; line-height: 1.4; }
  body { padding: 12px; }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 12px;
    padding: 14px 16px; margin-bottom: 8px;
  }
  h2 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
  h3 { margin: 14px 0 6px; font-size: 12px; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--fg-muted); font-weight: 600; }
  .muted { color: var(--fg-muted); }
  .row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .stat { display: flex; align-items: baseline; gap: 4px; font-variant-numeric: tabular-nums; }
  .stat .num { font-size: 22px; font-weight: 600; }
  .stat .unit { font-size: 12px; color: var(--fg-muted); }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 999px;
    font-size: 11px; background: var(--accent-bg); color: var(--accent);
    font-weight: 500; text-transform: capitalize; }
  .pill.warn { background: rgba(180,110,0,0.12); color: var(--warn); }
  .pill.bad { background: rgba(178,42,42,0.12); color: var(--bad); }
  .pill.muted { background: rgba(0,0,0,0.06); color: var(--fg-muted); }
  @media (prefers-color-scheme: dark) {
    .pill.muted { background: rgba(255,255,255,0.08); }
  }
  .progress {
    height: 6px; background: rgba(0,0,0,0.06); border-radius: 999px;
    overflow: hidden; margin-top: 4px;
  }
  @media (prefers-color-scheme: dark) {
    .progress { background: rgba(255,255,255,0.08); }
  }
  .progress > .bar { height: 100%; background: var(--accent);
    border-radius: 999px; transition: width 250ms ease-out; }
  .progress > .bar.warn { background: var(--warn); }
  .progress > .bar.bad { background: var(--bad); }
  .meal-row, .workout-row {
    padding: 6px 0; border-bottom: 1px dashed var(--border);
    display: flex; align-items: baseline; gap: 8px;
  }
  .meal-row:last-child, .workout-row:last-child { border-bottom: none; }
  .meal-row .time, .workout-row .time { font-size: 11px; color: var(--fg-muted);
    min-width: 38px; font-variant-numeric: tabular-nums; }
  .meal-row .desc, .workout-row .desc { flex: 1; }
  .meal-row .desc .small, .workout-row .desc .small {
    color: var(--fg-muted); font-size: 12px; margin-top: 1px;
  }
  .meal-row .kcal { font-variant-numeric: tabular-nums; font-weight: 500; }
  .empty { padding: 18px 0; text-align: center; color: var(--fg-muted);
    font-size: 13px; }
  .badge {
    display: inline-block; padding: 4px 10px; border-radius: 999px;
    background: var(--accent-bg); color: var(--accent);
    font-weight: 600; font-size: 13px;
  }
  .corrective {
    margin-top: 10px; padding: 8px 10px; border-radius: 8px;
    background: rgba(180,110,0,0.10); color: var(--warn); font-size: 12px;
    border-left: 3px solid var(--warn);
  }
</style>
`;

const SHARED_BRIDGE = `
<script>
  // Read structuredContent from the Apps SDK iframe bridge.
  // ChatGPT pushes tool results via window.postMessage and also pre-seeds
  // window.openai.toolOutput, depending on runtime. We support both.
  function getInitialData() {
    try {
      if (window.openai && typeof window.openai === 'object') {
        if (window.openai.toolOutput && window.openai.toolOutput.structuredContent) {
          return window.openai.toolOutput.structuredContent;
        }
        if (window.openai.toolOutput) {
          return window.openai.toolOutput;
        }
      }
    } catch (e) {}
    return null;
  }

  function subscribeToUpdates(onData) {
    window.addEventListener('message', function (e) {
      var msg = e && e.data;
      if (!msg) return;
      if (msg.method === 'ui/notifications/tool-result' && msg.params) {
        onData(msg.params.structuredContent || null);
      }
      if (msg.method === 'ui/notifications/tool-input' && msg.params) {
        // tool inputs are pushed too; we don't need them for read-only
        // dashboards. Hook left for future use.
      }
    }, { passive: true });
    var initial = getInitialData();
    if (initial) onData(initial);
  }
</script>
`;

// ---------- get_context (daily dashboard) -----------------------------------

const GET_CONTEXT_HTML = `<!doctype html>
<html><head>${SHARED_HEAD}</head><body>
<div class="card" id="root">
  <div id="empty" class="empty">Loading today's snapshot…</div>
  <div id="content" hidden>
    <h2 id="title"></h2>
    <div class="muted" id="subtitle" style="font-size:12px; margin-bottom:10px;"></div>

    <div id="targets-section" hidden>
      <h3>Today &amp; this week</h3>
      <div id="targets"></div>
    </div>

    <div id="meals-section" hidden>
      <h3>Today's meals</h3>
      <div id="meals"></div>
    </div>

    <div id="workouts-section" hidden>
      <h3>Last 7 days</h3>
      <div id="workouts"></div>
    </div>
  </div>
</div>
${SHARED_BRIDGE}
<script>
  function pct(value, target) {
    if (target == null || target === 0 || value == null) return 0;
    return Math.max(0, Math.min(100, (value / target) * 100));
  }
  function progressClass(t) {
    if (t.current_value == null) return 'muted';
    if (t.comparison === 'lte') {
      // headroom: positive remaining = under cap (good); negative = over (bad)
      if (t.remaining < 0) return 'bad';
      if (t.remaining < t.target * 0.1) return 'warn';
      return '';
    }
    // gte: progress toward goal
    var ratio = t.current_value / t.target;
    if (ratio >= 1) return '';
    if (ratio >= 0.6) return 'warn';
    return 'bad';
  }
  function targetLabel(kind) {
    return ({
      protein_g: 'Protein',
      calories_kcal: 'Calories',
      workouts_per_week: 'Workouts / week',
      sleep_hours: 'Sleep',
    })[kind] || kind;
  }
  function fmtNum(n) {
    if (n == null) return '—';
    return Math.round(n).toLocaleString();
  }

  function renderTargets(targets) {
    if (!targets || targets.length === 0) return '';
    return targets.map(function(t) {
      var width = t.comparison === 'lte'
        ? Math.min(100, ((t.current_value || 0) / t.target) * 100)
        : Math.min(100, ((t.current_value || 0) / t.target) * 100);
      var barCls = progressClass(t);
      var op = t.comparison === 'gte' ? '≥' : t.comparison === 'lte' ? '≤' : '=';
      var statusText;
      if (t.current_value == null) {
        statusText = '<span class="muted">no data yet</span>';
      } else if (t.comparison === 'lte') {
        statusText = fmtNum(t.current_value) + ' / ' + fmtNum(t.target) + ' ' + t.unit
          + (t.remaining < 0 ? ' · <span class="muted" style="color:var(--bad);">' + fmtNum(-t.remaining) + ' over</span>' : '');
      } else {
        statusText = fmtNum(t.current_value) + ' / ' + fmtNum(t.target) + ' ' + t.unit
          + ' · <span class="muted">' + fmtNum(t.remaining) + ' to go</span>';
      }
      return '' +
        '<div style="margin-bottom:10px;">' +
          '<div class="row">' +
            '<div><strong>' + targetLabel(t.kind) + '</strong> <span class="muted" style="font-size:11px;">' + op + ' ' + fmtNum(t.target) + ' ' + t.unit + '</span></div>' +
            '<div style="font-size:12px;">' + statusText + '</div>' +
          '</div>' +
          '<div class="progress"><div class="bar ' + barCls + '" style="width:' + width.toFixed(1) + '%;"></div></div>' +
        '</div>';
    }).join('');
  }

  function renderMeals(meals) {
    if (!meals || meals.length === 0) {
      return '<div class="empty">Nothing logged yet today.</div>';
    }
    return meals.map(function(m) {
      var portion = m.portion_assumed
        ? '<div class="small">' + escapeHtml(m.portion_assumed) + '</div>'
        : '';
      var kcal = m.calories_kcal != null
        ? '<span class="kcal">' + fmtNum(m.calories_kcal) + ' kcal</span>'
        : '<span class="muted">— kcal</span>';
      return '' +
        '<div class="meal-row">' +
          '<div class="time">' + escapeHtml(m.time || '') + '</div>' +
          '<div class="desc">' + escapeHtml(m.description) + portion + '</div>' +
          '<div>' + kcal + '</div>' +
        '</div>';
    }).join('');
  }

  function renderWorkouts(workouts) {
    if (!workouts || workouts.length === 0) {
      return '<div class="empty">No workouts in the last 7 days.</div>';
    }
    return workouts.map(function(w) {
      var meta = [w.intensity, w.duration_min ? w.duration_min + ' min' : null]
        .filter(function(x) { return x; }).join(' · ');
      return '' +
        '<div class="workout-row">' +
          '<div class="time">' + escapeHtml(w.day || '').slice(0,3) + '</div>' +
          '<div class="desc">' +
            '<span class="pill">' + escapeHtml(w.type) + '</span>' +
            (meta ? ' <span class="muted" style="font-size:12px;">' + escapeHtml(meta) + '</span>' : '') +
          '</div>' +
        '</div>';
    }).join('');
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function render(data) {
    if (!data) return;
    document.getElementById('empty').hidden = true;
    document.getElementById('content').hidden = false;
    document.getElementById('title').textContent =
      (data.user || 'You') + ' · ' + (data.today_day_of_week || '') +
      (data.today ? ' ' + data.today.slice(5).replace('-','/') : '');
    document.getElementById('subtitle').textContent =
      (data.current_time_local ? data.current_time_local + ' · ' : '') +
      (data.timezone || '');

    var targets = data.active_targets || [];
    var targetsHtml = renderTargets(targets);
    if (targetsHtml) {
      document.getElementById('targets-section').hidden = false;
      document.getElementById('targets').innerHTML = targetsHtml;
    }

    var meals = data.today_meals || [];
    if (meals.length > 0) {
      document.getElementById('meals-section').hidden = false;
      document.getElementById('meals').innerHTML = renderMeals(meals);
    }

    var workouts = data.last_7_days_workouts || [];
    if (workouts.length > 0) {
      document.getElementById('workouts-section').hidden = false;
      document.getElementById('workouts').innerHTML = renderWorkouts(workouts);
    }
  }

  subscribeToUpdates(render);
</script>
</body></html>`;

// ---------- log_meal -------------------------------------------------------

const LOG_MEAL_HTML = `<!doctype html>
<html><head>${SHARED_HEAD}</head><body>
<div class="card" id="root">
  <div id="empty" class="empty">Logged…</div>
  <div id="content" hidden>
    <div class="row" style="margin-bottom: 6px;">
      <h2 id="desc"></h2>
      <span class="badge" id="kcal"></span>
    </div>
    <div class="muted" id="portion" style="font-size:12px; margin-bottom:8px;"></div>

    <div class="row" style="border-top: 1px solid var(--border); padding-top: 10px;">
      <div class="stat"><span class="num" id="protein">—</span><span class="unit">g protein</span></div>
      <div class="stat"><span class="num" id="time">—</span><span class="unit"></span></div>
    </div>

    <div id="daily-progress" hidden style="margin-top: 14px;">
      <h3 style="margin-top:0;">Today's calories</h3>
      <div class="row">
        <div class="stat">
          <span class="num" id="day-kcal">—</span>
          <span class="unit" id="day-target"></span>
        </div>
        <div id="day-status" style="font-size:12px;"></div>
      </div>
      <div class="progress" style="margin-top:6px;"><div class="bar" id="day-bar" style="width:0;"></div></div>
    </div>

    <div class="corrective" id="hint">
      Tell me if the assumed portion is wrong and I'll adjust.
    </div>
  </div>
</div>
${SHARED_BRIDGE}
<script>
  function fmtNum(n) {
    if (n == null) return '—';
    return Math.round(n).toLocaleString();
  }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function render(data) {
    if (!data) return;
    document.getElementById('empty').hidden = true;
    document.getElementById('content').hidden = false;
    document.getElementById('desc').textContent = data.description || '';
    document.getElementById('kcal').textContent =
      (data.calories_kcal != null ? fmtNum(data.calories_kcal) : '—') + ' kcal';
    document.getElementById('portion').textContent =
      'Assumed: ' + (data.portion_assumed || '—');
    document.getElementById('protein').textContent = fmtNum(data.protein_g);
    document.getElementById('time').textContent = data.time || '—';

    if (data.daily_total_calories != null) {
      document.getElementById('daily-progress').hidden = false;
      var total = data.daily_total_calories;
      var target = data.daily_target_calories;
      var dayKcal = document.getElementById('day-kcal');
      var dayTarget = document.getElementById('day-target');
      var dayStatus = document.getElementById('day-status');
      var dayBar = document.getElementById('day-bar');
      dayKcal.textContent = fmtNum(total);
      if (target != null) {
        dayTarget.textContent = '/ ' + fmtNum(target) + ' kcal';
        var ratio = total / target;
        dayBar.style.width = Math.min(100, ratio * 100).toFixed(1) + '%';
        if (ratio > 1) {
          dayBar.classList.add('bad');
          dayStatus.innerHTML = '<span style="color:var(--bad);">' + fmtNum(total - target) + ' over</span>';
        } else if (ratio > 0.9) {
          dayBar.classList.add('warn');
          dayStatus.textContent = fmtNum(target - total) + ' kcal headroom';
        } else {
          dayStatus.textContent = fmtNum(target - total) + ' kcal headroom';
        }
      } else {
        dayTarget.textContent = 'kcal';
      }
    }
  }

  subscribeToUpdates(render);
</script>
</body></html>`;

// ---------- log_workout -----------------------------------------------------

const LOG_WORKOUT_HTML = `<!doctype html>
<html><head>${SHARED_HEAD}</head><body>
<div class="card" id="root">
  <div id="empty" class="empty">Logged…</div>
  <div id="content" hidden>
    <div class="row" style="margin-bottom: 6px;">
      <h2 id="title"></h2>
      <span class="pill" id="type"></span>
    </div>
    <div class="muted" id="subtitle" style="font-size:12px; margin-bottom:10px;"></div>

    <div class="row" style="border-top: 1px solid var(--border); padding-top: 10px;">
      <div class="stat"><span class="num" id="duration">—</span><span class="unit" id="duration-unit"></span></div>
      <div class="stat"><span class="num" id="intensity-num">—</span><span class="unit"></span></div>
    </div>

    <div id="weekly-progress" hidden style="margin-top: 14px;">
      <h3 style="margin-top:0;">This week</h3>
      <div class="row">
        <div class="stat">
          <span class="num" id="week-count">—</span>
          <span class="unit" id="week-target"></span>
        </div>
        <div id="week-status" style="font-size:12px;"></div>
      </div>
      <div class="progress" style="margin-top:6px;"><div class="bar" id="week-bar" style="width:0;"></div></div>
    </div>

    <div id="notes-block" hidden class="muted" style="margin-top: 10px; font-size:12px;"></div>
  </div>
</div>
${SHARED_BRIDGE}
<script>
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function render(data) {
    if (!data) return;
    document.getElementById('empty').hidden = true;
    document.getElementById('content').hidden = false;
    document.getElementById('title').textContent =
      (data.day_of_week || '') + ' workout';
    document.getElementById('type').textContent = data.type || '—';
    document.getElementById('subtitle').textContent =
      'logged at ' + (data.time || '');

    if (data.duration_min != null) {
      document.getElementById('duration').textContent = data.duration_min;
      document.getElementById('duration-unit').textContent = 'min';
    } else {
      document.getElementById('duration').textContent = '—';
    }

    document.getElementById('intensity-num').textContent =
      data.intensity || '—';

    if (data.weekly_count != null) {
      document.getElementById('weekly-progress').hidden = false;
      var weekCount = document.getElementById('week-count');
      var weekTarget = document.getElementById('week-target');
      var weekStatus = document.getElementById('week-status');
      var weekBar = document.getElementById('week-bar');
      weekCount.textContent = data.weekly_count;
      if (data.weekly_target != null) {
        weekTarget.textContent = '/ ' + data.weekly_target;
        var ratio = data.weekly_count / data.weekly_target;
        weekBar.style.width = Math.min(100, ratio * 100).toFixed(1) + '%';
        weekStatus.textContent = ratio >= 1
          ? 'goal hit 💪'
          : (data.weekly_target - data.weekly_count) + ' to go';
      } else {
        weekTarget.textContent = 'this week';
      }
    }

    if (data.notes) {
      var nb = document.getElementById('notes-block');
      nb.hidden = false;
      nb.textContent = data.notes;
    }
  }

  subscribeToUpdates(render);
</script>
</body></html>`;

// ---------- set_target ------------------------------------------------------

const SET_TARGET_HTML = `<!doctype html>
<html><head>${SHARED_HEAD}</head><body>
<div class="card" id="root">
  <div id="empty" class="empty">Setting target…</div>
  <div id="content" hidden>
    <div class="row" style="margin-bottom: 4px;">
      <h2 id="kind">Target</h2>
      <span class="pill" id="period"></span>
    </div>
    <div class="muted" id="set-on" style="font-size:12px; margin-bottom:14px;"></div>

    <div style="text-align:center; padding: 16px 0;">
      <div class="stat" style="justify-content:center;">
        <span class="num" id="target-value" style="font-size:36px;">—</span>
        <span class="unit" id="target-unit" style="font-size:14px; margin-left:6px;"></span>
      </div>
      <div class="muted" id="op-line" style="margin-top: 4px; font-size: 12px;"></div>
    </div>

    <div class="muted" style="font-size:12px; text-align:center; padding-top: 6px; border-top: 1px solid var(--border);">
      Progress against this target will show in your daily snapshot.
    </div>
  </div>
</div>
${SHARED_BRIDGE}
<script>
  function targetLabel(kind) {
    return ({
      protein_g: 'Daily protein',
      calories_kcal: 'Daily calories',
      workouts_per_week: 'Workouts per week',
      sleep_hours: 'Sleep per night',
    })[kind] || kind;
  }
  function opText(comparison) {
    return ({
      gte: 'at least',
      lte: 'at most',
      eq: 'exactly',
    })[comparison] || comparison;
  }

  function render(data) {
    if (!data) return;
    document.getElementById('empty').hidden = true;
    document.getElementById('content').hidden = false;
    document.getElementById('kind').textContent = targetLabel(data.kind);
    document.getElementById('period').textContent = data.period || '';
    document.getElementById('set-on').textContent =
      'Set ' + (data.set_on || '');
    document.getElementById('target-value').textContent =
      data.target_value == null ? '—' : data.target_value.toLocaleString();
    document.getElementById('target-unit').textContent = data.unit || '';
    document.getElementById('op-line').textContent =
      opText(data.comparison) + ' ' + (data.target_value || '') + ' ' + (data.unit || '') +
      (data.period === 'daily' ? ' / day' : data.period === 'weekly' ? ' / week' : '');
  }

  subscribeToUpdates(render);
</script>
</body></html>`;

export const WIDGETS: Array<{
  uri: string;
  html: string;
}> = [
  { uri: URI_GET_CONTEXT, html: GET_CONTEXT_HTML },
  { uri: URI_LOG_MEAL, html: LOG_MEAL_HTML },
  { uri: URI_LOG_WORKOUT, html: LOG_WORKOUT_HTML },
  { uri: URI_SET_TARGET, html: SET_TARGET_HTML },
];

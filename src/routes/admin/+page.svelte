<script lang="ts">
  let { data } = $props();
  const o = data.overview;
  const t = o.totals;
</script>

<header class="admin-head">
  <div class="head-title">Admin</div>
  <form method="POST" action="/logout">
    <button type="submit" class="signout">Sign Out</button>
  </form>
</header>

<div class="admin-links">
  <a class="admin-link" href="/admin/users">
    <span class="link-label">Users</span>
    <span class="link-count">{t.users}</span>
    <span class="link-arrow">›</span>
  </a>
  <a class="admin-link" href="/admin/feedback">
    <span class="link-label">Feedback/Support</span>
    {#if t.feedbackUnread}<span class="unread-pill">{t.feedbackUnread} unread</span>{/if}
    <span class="link-count">{t.feedback}</span>
    <span class="link-arrow">›</span>
  </a>
</div>

<div class="form-section">Service Health</div>
<div class="stat-list">
  <div class="stat-row"><span>Database</span><b class={o.db.healthy ? 'ok' : 'bad'}>{o.db.healthy ? 'Healthy' : 'PROBLEM'}</b></div>
  <div class="stat-row"><span>Integrity Check</span><b>{o.db.integrity}</b></div>
  <div class="stat-row"><span>Journal Mode</span><b>{o.db.journalMode}</b></div>
  <div class="stat-row"><span>Database Size</span><b>{o.db.size}</b></div>
  <div class="stat-row"><span>App Uptime</span><b>{o.app.uptime}</b></div>
  <div class="stat-row"><span>Memory (RSS)</span><b>{o.app.memoryRss}</b></div>
  <div class="stat-row"><span>Node</span><b>{o.app.node}</b></div>
</div>

<div class="form-section">Totals</div>
<div class="stat-list">
  <div class="stat-row"><span>Users</span><b>{t.users}</b></div>
  <div class="stat-row"><span>Vehicles</span><b>{t.vehicles}</b></div>
  <div class="stat-row"><span>Records</span><b>{t.records}</b></div>
  <div class="stat-row indent"><span>Fuel-Ups</span><b>{t.recordsByType.fuel}</b></div>
  <div class="stat-row indent"><span>Services</span><b>{t.recordsByType.service}</b></div>
  <div class="stat-row indent"><span>Expenses</span><b>{t.recordsByType.expense}</b></div>
  <div class="stat-row indent"><span>Notes</span><b>{t.recordsByType.note}</b></div>
  <div class="stat-row"><span>Vehicle Parts</span><b>{t.parts}</b></div>
  <div class="stat-row"><span>Locations</span><b>{t.locations}</b></div>
  <div class="stat-row"><span>Vehicle Shares</span><b>{t.shares}</b></div>
  <div class="stat-row"><span>Active Sessions</span><b>{t.activeSessions}</b></div>
  <div class="stat-row"><span>Sessions (all)</span><b>{t.sessions}</b></div>
</div>

<style>
  .admin-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 6px;
  }
  .head-title { font-size: 22px; font-weight: 700; color: #222; }
  .signout {
    background: none;
    border: 1px solid #c62828;
    color: #c62828;
    border-radius: 4px;
    padding: 7px 14px;
    font-size: 15px;
    cursor: pointer;
    font-family: inherit;
  }
  .admin-links { padding: 10px 16px 0; display: flex; flex-direction: column; gap: 10px; }
  .unread-pill {
    background: #c62828;
    color: #fff;
    border-radius: 10px;
    padding: 1px 9px;
    font-size: 13px;
    font-weight: 700;
  }
  .admin-link {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 16px;
    text-decoration: none;
    color: #222;
  }
  .link-label { font-size: 18px; font-weight: 600; flex: 1; }
  .link-count { font-size: 17px; color: var(--teal-dark); font-weight: 700; }
  .link-arrow { font-size: 22px; color: #999; }
  .stat-list { background: #fff; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 11px 16px;
    border-bottom: 1px solid #eee;
    font-size: 16px;
  }
  .stat-row:last-child { border-bottom: 0; }
  .stat-row span { color: #555; }
  .stat-row b { color: #222; font-weight: 600; }
  .stat-row.indent span { padding-left: 18px; color: #777; }
  .ok { color: #2e7d32 !important; }
  .bad { color: #c62828 !important; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .head-title { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .admin-link, :global(.phone[data-theme="dark"]) .stat-list { background: #1d2025; }
  :global(.phone[data-theme="dark"]) .stat-row b { color: var(--ink); }
</style>

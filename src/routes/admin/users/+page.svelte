<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';
  let { data } = $props();
</script>

<SubHeader title="Users" backHref="/admin" />

{#if data.users.length === 0}
  <p class="empty">No users yet.</p>
{:else}
  <div class="user-list">
    {#each data.users as u}
      <a class="user-row" href="/admin/users/{u.id}">
        <span class="user-main">
          <span class="user-name">{u.displayName}{#if u.isAdmin} <span class="admin-badge">ADMIN</span>{/if}{#if data.plansEnabled} <span class="plan-badge">{u.plan === 'paid' ? 'PAID' : 'FREE'}</span>{/if}</span>
          <span class="user-email">{u.email}</span>
        </span>
        <span class="user-stats">
          {u.vehicles} vehicles · {u.records} records<br />
          Last login: {u.lastLogin}
        </span>
        <span class="user-arrow">›</span>
      </a>
    {/each}
  </div>
{/if}

<style>
  .empty { text-align: center; color: #777; padding: 34px 20px; font-size: 16px; }
  .user-list { background: #fff; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .user-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 13px 16px;
    border-bottom: 1px solid #eee;
    text-decoration: none;
    color: #222;
  }
  .user-row:last-child { border-bottom: 0; }
  .user-main { display: flex; flex-direction: column; min-width: 0; }
  .user-name { font-size: 17px; font-weight: 600; }
  .admin-badge {
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: var(--teal-dark);
    border-radius: 3px;
    padding: 1px 5px;
    vertical-align: 2px;
  }
  .plan-badge {
    font-size: 11px;
    font-weight: 700;
    color: var(--teal-dark);
    background: #e3f0fb;
    border-radius: 3px;
    padding: 1px 5px;
    vertical-align: 2px;
  }
  .user-email { font-size: 14px; color: #888; overflow: hidden; text-overflow: ellipsis; }
  .user-stats { margin-left: auto; text-align: right; font-size: 13.5px; color: #666; line-height: 1.4; flex-shrink: 0; }
  .user-arrow { font-size: 22px; color: #999; flex-shrink: 0; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .user-list { background: #1d2025; }
  :global(.phone[data-theme="dark"]) .user-row { color: var(--ink); border-bottom-color: #2c3036; }
</style>

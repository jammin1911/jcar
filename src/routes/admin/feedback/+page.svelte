<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';
  let { data } = $props();
</script>

<SubHeader title="Feedback/Support" backHref="/admin" />

<div class="head">
  <span>{data.messages.length} message{data.messages.length === 1 ? '' : 's'}</span>
  {#if data.unread}<span class="unread-pill">{data.unread} unread</span>{/if}
</div>

{#if data.messages.length === 0}
  <p class="empty">No feedback messages yet.</p>
{:else}
  <div class="list">
    {#each data.messages as m}
      <div class="msg" class:unread={!m.isRead}>
        <div class="msg-top">
          <span class="msg-email">{m.email}</span>
          <span class="msg-when">{m.when}</span>
        </div>
        <p class="msg-body">{m.message}</p>
        {#if m.hasPhoto}
          <a href="/admin/feedback/photo/{m.id}" target="_blank" rel="noreferrer">
            <img class="msg-photo" src="/admin/feedback/photo/{m.id}" alt="Photo attached to this message" loading="lazy" />
          </a>
        {/if}
        <div class="msg-actions">
          {#if m.isRead}
            <form method="POST" action="?/markUnread">
              <input type="hidden" name="id" value={m.id} />
              <button type="submit" class="mini">Mark Unread</button>
            </form>
          {:else}
            <form method="POST" action="?/markRead">
              <input type="hidden" name="id" value={m.id} />
              <button type="submit" class="mini">Mark Read</button>
            </form>
          {/if}
          <form
            method="POST"
            action="?/deleteMessage"
            onsubmit={(e) => {
              if (!confirm('Delete this feedback message?')) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={m.id} />
            <button type="submit" class="mini danger">Delete</button>
          </form>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 16px 10px;
    font-size: 16px;
    font-weight: 600;
    color: #333;
  }
  .unread-pill {
    background: #c62828;
    color: #fff;
    border-radius: 10px;
    padding: 1px 9px;
    font-size: 13px;
    font-weight: 700;
  }
  .empty { padding: 10px 16px; color: #777; font-size: 15.5px; }
  .list { border-top: 1px solid var(--line); }
  .msg { background: #fff; border-bottom: 1px solid #eee; padding: 13px 16px; }
  .msg.unread { background: #eef5fd; }
  .msg-top { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
  .msg-email { font-weight: 700; color: #222; font-size: 15.5px; word-break: break-all; }
  .msg-when { color: #888; font-size: 13.5px; white-space: nowrap; }
  .msg-photo { display: block; max-width: 100%; max-height: 240px; border-radius: 8px; margin: 4px 0 10px; }
  .msg-email { min-width: 0; overflow-wrap: anywhere; }
  .msg-body { overflow-wrap: anywhere;
 margin: 8px 0 10px; font-size: 15.5px; color: #333; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
  .msg-actions { display: flex; gap: 8px; }
  .mini {
    padding: 7px 12px;
    background: #fff;
    color: var(--teal-dark);
    border: 1px solid var(--teal-dark);
    border-radius: 4px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .mini.danger { color: #c62828; border-color: #c62828; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .msg { background: #1d2025; border-bottom-color: #2c3036; }
  :global(.phone[data-theme="dark"]) .msg.unread { background: #22314a; }
  :global(.phone[data-theme="dark"]) .msg-body { color: #d7dade; }
  :global(.phone[data-theme="dark"]) .msg-email { color: var(--ink); }
</style>

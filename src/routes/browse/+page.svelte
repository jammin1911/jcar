<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';
  import { icons, iconsDark, pumpIcon, filterIcon, backfillIcon } from '$lib/icons';

  // All four entry types (fuel-up, service, expense, note) live in the
  // one records list, and each renders its own icon here.
  let { data } = $props();

  type RecType = 'fuel' | 'service' | 'expense' | 'note';
  const ic = data.theme === 'dark' ? { ...icons, ...iconsDark } : icons;
  const typeIcons: Record<RecType, string> = {
    fuel: ic.fuel ?? pumpIcon,
    service: ic.service,
    expense: ic.expense,
    note: ic.note
  };
</script>

<SubHeader title="Browse Records" actionHref={data.filterHref} actionIcon={filterIcon} actionLabel="Filter records" action2Href={data.backfillHref} action2Icon={backfillIcon} action2Label="Backfill records" />

<div class="summary-bar">
  <span>{data.summary.total}</span>
  <span>{data.summary.avgEff}</span>
  <span>{data.summary.count} Recs</span>
</div>

{#if data.filtered}
  <div class="filter-bar">
    <span>Filters active</span>
    <a href="/browse">Clear</a>
  </div>
{/if}

{#if data.rows.length === 0}
  {#if data.filtered}
    <p class="browse-empty">No records match the current filters.</p>
  {:else}
    <p class="browse-empty">No records yet for {data.vehicleName}. Add one from the Dashboard.</p>
  {/if}
{/if}

{#each data.rows as r, i}
  <a class="rec-row" class:alt={i % 2 === 1} href={r.href} aria-label="Edit record">
    <div class="rec-icon">{@html typeIcons[r.type as RecType] ?? pumpIcon}</div>
    <div class="rec-main">
      <div class="rec-line1">
        {#each r.line1 as part}
          <span>{part}</span>
        {/each}
      </div>
      <div class="rec-line2">
        <span class="cost">{r.cost}{#if r.odometer}<span class="at">@</span>{r.odometer.slice(1)}{/if}</span>
        <span class="meta">
          {#if r.photoCount}<span class="photo-ind">📷{r.photoCount > 1 ? ` ${r.photoCount}` : ''}</span>{/if}
          <span class="date">{r.date}</span>
        </span>
      </div>
      {#if data.multi || r.recordedBy}
        <div class="rec-line3">{#if data.multi}{r.vehicleName}{/if}{#if r.recordedBy}{#if data.multi} · {/if}Recorded by: {r.recordedBy}{/if}</div>
      {/if}
    </div>
  </a>
{/each}

<style>
  .browse-empty { text-align: center; color: #999; font-size: 16px; margin: 30px 34px 0; line-height: 1.5; }
  .filter-bar {
    display: flex; justify-content: space-between; align-items: center;
    background: #e3f0fb; color: var(--teal-dark);
    padding: 8px 14px; font-size: 15px; font-weight: 700;
  }
  .filter-bar a { color: var(--teal-dark); text-decoration: underline; }
  .rec-line2 .meta { display: inline-flex; align-items: baseline; gap: 8px; }
  .rec-line2 .photo-ind { font-size: 13.5px; }
  /* Multi-vehicle browse: the vehicle name gets its own row, line 2
     has no room for it. */
  .rec-line3 { color: #888; font-size: 13.5px; font-weight: 700; margin-top: 1px; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .filter-bar { background: #1d2f47; color: #a9c8f2; }
</style>

<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  let { data } = $props();
</script>

<SubHeader title="Filter Records" backHref={data.backHref} />

<p class="filter-intro">Choose what Browse Records shows, then tap Show Records.</p>

<form method="GET" action="/browse" class="filter-form">
  <div class="form-section">Vehicle</div>
  {#each data.vehicles as v}
    <label class="check-line">
      <input type="checkbox" name="vehicles" value={v.id} checked={v.checked} />
      <span>{v.label}</span>
    </label>
  {/each}

  <div class="form-section">Record Type</div>
  {#each data.types as t}
    <label class="check-line">
      <input type="checkbox" name="types" value={t.key} checked={t.checked} />
      <span>{t.label}</span>
    </label>
  {/each}

  <div class="form-section">Date Range</div>
  {#each data.ranges as r}
    <label class="check-line">
      <input type="radio" name="range" value={r.key} checked={r.checked} />
      <span>{r.label}</span>
    </label>
    {#if r.key === 'custom'}
      <div class="custom-dates">
        <label>From <input type="date" name="from" value={data.from} /></label>
        <label>To <input type="date" name="to" value={data.to} /></label>
      </div>
    {/if}
  {/each}

  <button type="submit" class="apply-btn">Show Records</button>
  <a class="clear-link" href="/browse">Clear all filters</a>
</form>

<style>
  .filter-intro { color: #999; text-align: center; font-size: 15px; padding: 12px 22px 2px; line-height: 1.45; }
  .filter-form { padding-bottom: 30px; }
  .check-line {
    display: flex; align-items: center; gap: 12px;
    padding: 11px 18px; font-size: 17px; color: #333; cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
  }
  .check-line input { width: 21px; height: 21px; accent-color: var(--teal); flex: 0 0 auto; cursor: pointer; }
  .custom-dates { display: flex; gap: 14px; padding: 4px 18px 12px 51px; }
  .custom-dates label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: #777; font-weight: 700; }
  .custom-dates input { font-size: 16px; padding: 7px 8px; border: 1px solid #ccc; border-radius: 4px; font-family: inherit; }
  .apply-btn {
    display: block; width: calc(100% - 32px); margin: 22px 16px 0;
    padding: 13px; background: var(--teal); color: #fff; border: none; border-radius: 4px;
    font-size: 17px; font-weight: 700; cursor: pointer; font-family: inherit;
  }
  .clear-link { display: block; text-align: center; margin-top: 16px; color: var(--teal-dark); font-size: 15.5px; font-weight: 600; }

  /* Dark theme */
    :global(.phone[data-theme="dark"]) .custom-dates input { border-color: #4a4f57; }
  :global(.phone[data-theme="dark"]) .check-line { border-bottom-color: #26292f; color: var(--ink); }
</style>

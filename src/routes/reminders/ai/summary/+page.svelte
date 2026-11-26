<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  let { data, form } = $props();

  const dispKm = (km: number | null) =>
    km == null ? '' : String(Math.round(data.distanceUnit === 'mi' ? km / 1.60934 : km));
</script>

<SubHeader title="Review Suggestions" backHref="/reminders/ai" />

<div class="sum-body">
  <p class="intro">Suggested service schedule for <b>{data.vehicle.name}</b>. Check the numbers, untick anything you do not want, then confirm.</p>
  <p class="disclaimer">
    Suggestions come from the public internet and AI. They are not guaranteed accurate, double
    check them against your owner's manual. Your vehicle may not be available.
  </p>

  <form method="POST">
    {#each data.suggestions as s}
      {#if s.suggested && !s.special}
        <div class="sugg-row">
          <label class="sugg-check">
            <input type="checkbox" name="use_{s.key}" value="1" checked />
            <span class="sugg-name">{s.name}</span>
          </label>
          <div class="sugg-inputs">
            {#if !data.vehicle.costTracking}
              <label class="mini">
                <input type="text" inputmode="decimal" name="km_{s.key}" value={dispKm(s.km)} aria-label="Distance interval for {s.name}" />
                <span>{data.distanceUnit}</span>
              </label>
            {/if}
            <label class="mini">
              <input type="text" inputmode="numeric" name="mo_{s.key}" value={s.months ?? ''} aria-label="Time interval in months for {s.name}" />
              <span>months</span>
            </label>
          </div>
        </div>
      {:else if s.suggested && s.special === 'lifetime'}
        <div class="sugg-row info">
          <span class="sugg-name">{s.name}</span>
          <span class="sugg-note">The maker calls this lifetime, no reminder needed.</span>
        </div>
      {:else if s.suggested && s.special === 'monitor'}
        <div class="sugg-row info">
          <span class="sugg-name">{s.name}</span>
          <span class="sugg-note">The vehicle itself decides this one, no reminder needed.</span>
        </div>
      {:else}
        <div class="sugg-row info">
          <span class="sugg-name">{s.name}</span>
          <span class="sugg-note">No suggestion.</span>
        </div>
      {/if}
    {/each}

    {#if form?.error}<p class="error">{form.error}</p>{/if}
    <button type="submit" class="confirm-btn">Add These Reminders</button>
    <a class="cancel-link" href="/reminders">Cancel, add nothing</a>
    <p class="hint">Due dates count from today and due odometers from the vehicle's latest reading. You can adjust any reminder afterwards.</p>
  </form>
</div>

<style>
  .sum-body { padding: 18px 16px 30px; }
  .intro { font-size: 16px; line-height: 1.55; color: #333; margin: 0 0 10px; }
  .disclaimer { font-size: 14px; line-height: 1.5; color: #777; margin: 0 0 18px; }
  .sugg-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 11px 2px; border-top: 1px solid #eee;
  }
  .sugg-row.info { color: #888; }
  .sugg-check { display: flex; align-items: center; gap: 10px; cursor: pointer; min-width: 0; }
  .sugg-check input { width: 21px; height: 21px; accent-color: var(--teal); flex: 0 0 auto; }
  .sugg-name { font-size: 16px; font-weight: 700; color: #333; overflow-wrap: anywhere; }
  .sugg-row.info .sugg-name { color: #666; }
  .sugg-note { font-size: 14px; color: #999; text-align: right; }
  .sugg-inputs { display: flex; gap: 10px; flex: 0 0 auto; }
  .mini { display: inline-flex; align-items: baseline; gap: 4px; font-size: 13.5px; color: #888; }
  .mini input {
    width: 74px; border: 0; border-bottom: 1px solid #bbb; background: transparent;
    font-size: 16px; padding: 4px 2px; color: var(--ink); font-family: inherit; text-align: right;
  }
  .mini input:focus { outline: none; border-bottom: 2px solid var(--teal); }
  .error { color: #c62828; font-size: 15px; font-weight: 600; margin: 16px 0 0; }
  .confirm-btn {
    display: block; width: 100%; margin-top: 20px; padding: 13px 16px; border: 0; border-radius: 6px;
    background: var(--teal); color: #fff; font-size: 16.5px; font-weight: 700; font-family: inherit; cursor: pointer;
  }
  .cancel-link { display: block; text-align: center; margin-top: 14px; color: var(--teal-dark); font-size: 15.5px; }
  .hint { font-size: 13.5px; color: #999; line-height: 1.5; margin: 14px 0 0; text-align: center; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .intro { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .sugg-row { border-top-color: #26292f; }
  :global(.phone[data-theme="dark"]) .sugg-name { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .sugg-row.info .sugg-name { color: #a6abb3; }
  :global(.phone[data-theme="dark"]) .mini input { border-bottom-color: #4a4f57; }
</style>

<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';
  import SaveToast from '$lib/components/SaveToast.svelte';
  import { fmtDate, fmtNum, distValue, distLabel } from '$lib/format';

  let { data } = $props();

  const plusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;

  const idx = data.vehicles.findIndex((v) => v.id === data.vehicle.id);
  const prevVehicle = data.vehicles.length > 1 ? data.vehicles[(idx - 1 + data.vehicles.length) % data.vehicles.length] : null;
  const nextVehicle = data.vehicles.length > 1 ? data.vehicles[(idx + 1) % data.vehicles.length] : null;

  /** an ISO date plus whole months, the day clamps to the months length */
  function addMonthsIso(iso: string, months: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    const total = y * 12 + (m - 1) + months;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${ny}-${p(nm)}-${p(Math.min(d, lastDay))}`;
  }

  function dayDiff(fromIso: string, toIso: string): number {
    const a = fromIso.split('-').map(Number);
    const b = toIso.split('-').map(Number);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  }

  /** "3 months, 5 days" style span between two dates, calendar
   * months first so a yearly reminder reads 12 months, not
   * 11 months and change */
  function spanText(fromIso: string, toIso: string): string {
    const [y1, m1] = fromIso.split('-').map(Number);
    const [y2, m2] = toIso.split('-').map(Number);
    let months = (y2 - y1) * 12 + (m2 - m1);
    if (months > 0 && addMonthsIso(fromIso, months) > toIso) months--;
    const rem = dayDiff(addMonthsIso(fromIso, months), toIso);
    if (months === 0) return rem === 1 ? '1 day' : `${rem} days`;
    const m = months === 1 ? '1 month' : `${months} months`;
    if (rem === 0) return m;
    return `${m}, ${rem === 1 ? '1 day' : `${rem} days`}`;
  }

  function dateLine(r: (typeof data.reminders)[number]): string | null {
    if (!r.nextDueDate || r.daysLeft == null) return null;
    const when = fmtDate(`${r.nextDueDate}T12:00:00`, data.settings);
    if (r.daysLeft === 0) return `Due today (${when})`;
    if (r.daysLeft > 0) return `Due in ${spanText(data.today, r.nextDueDate)} (${when})`;
    return `Overdue by ${spanText(r.nextDueDate, data.today)} (${when})`;
  }

  function distLine(r: (typeof data.reminders)[number]): string | null {
    if (r.nextDueOdometer == null || data.vehicle.costTracking) return null;
    const at = `${fmtNum(Math.round(distValue(r.nextDueOdometer, data.settings)))} ${distLabel(data.settings)}`;
    if (r.kmLeft == null) return `Due at ${at}`;
    const left = `${fmtNum(Math.round(distValue(Math.abs(r.kmLeft), data.settings)))} ${distLabel(data.settings)}`;
    if (r.kmLeft === 0) return `Due now (@ ${at})`;
    if (r.kmLeft > 0) return `Due in ${left} (@ ${at})`;
    return `Overdue by ${left} (@ ${at})`;
  }

  function repeatLine(r: (typeof data.reminders)[number]): string | null {
    const parts: string[] = [];
    if (r.distanceIntervalKm != null && !data.vehicle.costTracking) {
      parts.push(`${fmtNum(Math.round(distValue(r.distanceIntervalKm, data.settings)))} ${distLabel(data.settings)}`);
    }
    if (r.timeIntervalMonths != null) {
      parts.push(r.timeIntervalMonths === 1 ? '1 month' : `${r.timeIntervalMonths} months`);
    }
    return parts.length ? `Repeating every: ${parts.join(' / ')}` : null;
  }
</script>

{#if data.flash}
  <SaveToast message={data.flash.message} detail={data.flash.detail} />
{/if}

<SubHeader title="Reminders" actionHref="/reminders/edit" actionIcon={plusIcon} actionLabel="Add a reminder" />

<div class="veh-strip">
  {#if prevVehicle}
    <form method="POST" action="?/select" class="veh-arrow-form">
      <input type="hidden" name="vehicleId" value={prevVehicle.id} />
      <button type="submit" class="veh-arrow" aria-label="Previous vehicle: {prevVehicle.name}">&#8249;</button>
    </form>
  {:else}
    <span class="veh-arrow-spacer"></span>
  {/if}
  <span class="veh-name">{data.vehicle.name}</span>
  {#if nextVehicle}
    <form method="POST" action="?/select" class="veh-arrow-form">
      <input type="hidden" name="vehicleId" value={nextVehicle.id} />
      <button type="submit" class="veh-arrow" aria-label="Next vehicle: {nextVehicle.name}">&#8250;</button>
    </form>
  {:else}
    <span class="veh-arrow-spacer"></span>
  {/if}
</div>

{#if data.aiAvailable}
  <a class="ai-btn" href="/reminders/ai">Auto Fill with AI</a>
{/if}

{#if data.reminders.length === 0}
  <div class="empty">
    <p class="empty-title">No reminders for this vehicle yet.</p>
    <p class="empty-text">Add one with the + button, or let AI Auto Fill suggest the factory service schedule for this vehicle.</p>
  </div>
{:else}
  <div class="rem-list">
    {#each data.reminders as r}
      {@const dl = distLine(r)}
      {@const tl = dateLine(r)}
      {@const rl = repeatLine(r)}
      <a class="rem-row {r.state}" href="/reminders/edit?edit={r.id}">
        <span class="rem-title">{r.title}</span>
        {#if dl}<span class="rem-line due">{dl}</span>{/if}
        {#if tl}<span class="rem-line due">{tl}</span>{/if}
        {#if rl}<span class="rem-line repeat">{rl}</span>{/if}
        {#if r.notes}<span class="rem-line notes">{r.notes}</span>{/if}
      </a>
    {/each}
  </div>
{/if}

<style>
  .veh-strip {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 8px 2px;
  }
  .veh-name { font-size: 17px; font-weight: 700; color: #333; text-align: center; flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .veh-arrow-form { margin: 0; }
  .veh-arrow {
    background: none; border: 0; font-size: 30px; line-height: 1; color: var(--teal-dark);
    cursor: pointer; padding: 2px 12px; font-family: inherit;
  }
  .veh-arrow-spacer { width: 44px; }
  .ai-btn {
    display: block; margin: 12px 16px 0; padding: 12px 16px; text-align: center;
    border: 1.5px solid var(--teal); border-radius: 6px; color: var(--teal-dark);
    font-size: 16px; font-weight: 700; text-decoration: none; background: #fff;
  }
  .empty { text-align: center; margin: 44px 30px 0; }
  .empty-title { font-size: 17px; font-weight: 700; color: #333; margin: 0 0 10px; }
  .empty-text { color: #666; font-size: 15px; line-height: 1.5; margin: 0; }
  .rem-list { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px 20px; }
  .rem-row {
    display: block; text-decoration: none; color: #333;
    background: #fff; border: 1px solid var(--line); border-left: 5px solid #cfd8dc;
    border-radius: 8px; padding: 12px 14px;
  }
  .rem-row.overdue { background: #fdecec; border-left-color: #d32f2f; }
  .rem-row.soon { background: #fff6e0; border-left-color: #ef9a1a; }
  .rem-title { display: block; font-size: 17px; font-weight: 700; margin-bottom: 2px; overflow-wrap: anywhere; }
  .rem-line { display: block; font-size: 14.5px; line-height: 1.45; color: #555; }
  .rem-row.overdue .rem-line.due { color: #c62828; font-weight: 600; }
  .rem-row.soon .rem-line.due { color: #9a6a00; font-weight: 600; }
  .rem-line.repeat { color: #777; }
  .rem-line.notes { color: #777; overflow-wrap: anywhere; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .veh-name { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .ai-btn { background: #1d2025; }
  :global(.phone[data-theme="dark"]) .empty-title { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .empty-text { color: #a6abb3; }
  :global(.phone[data-theme="dark"]) .rem-row { background: #1d2025; color: var(--ink); border-color: #26292f; border-left-color: #455a64; }
  :global(.phone[data-theme="dark"]) .rem-row.overdue { background: #3a2326; border-left-color: #ef5350; }
  :global(.phone[data-theme="dark"]) .rem-row.soon { background: #38331d; border-left-color: #f0a51e; }
  :global(.phone[data-theme="dark"]) .rem-line { color: #a6abb3; }
  :global(.phone[data-theme="dark"]) .rem-row.overdue .rem-line.due { color: #f2a0a0; }
  :global(.phone[data-theme="dark"]) .rem-row.soon .rem-line.due { color: #ecc26a; }
</style>

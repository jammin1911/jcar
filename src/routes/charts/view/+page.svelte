<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  let { data } = $props();

  // Spending toggles: ticking a box submits the GET form, so the new
  // scope arrives as URL parameters and everything stays server-rendered.
  function autoSubmit(e: Event) {
    (e.currentTarget as HTMLInputElement).form?.submit();
  }
</script>

<SubHeader title={data.title} backHref="/charts" />

<div class="range-row">
  {#each data.ranges as r}
    <a class="range-chip" class:active={r.active} href={r.href}>{#if r.stack}<span class="stack">{r.stack[0]}<br />{r.stack[1]}</span>{:else}{r.label}{/if}</a>
  {/each}
</div>

{#if data.kind === 'compare'}
  <div class="big-box">
    {#if data.cmp}
      <svg viewBox="0 0 400 250" class="big-chart">
        <rect x="90" y={230 - (data.cmp.first / data.cmp.max) * 190} width="70" height={(data.cmp.first / data.cmp.max) * 190} fill="#7e57c2" />
        <rect x="240" y={230 - (data.cmp.second / data.cmp.max) * 190} width="70" height={(data.cmp.second / data.cmp.max) * 190} fill="#42a5f5" />
        <text x="125" y={222 - (data.cmp.first / data.cmp.max) * 190} text-anchor="middle" class="bar-val">{data.cmp.first.toFixed(2)}</text>
        <text x="275" y={222 - (data.cmp.second / data.cmp.max) * 190} text-anchor="middle" class="bar-val">{data.cmp.second.toFixed(2)}</text>
        <text x="125" y="248" text-anchor="middle" class="axis-label">First half</text>
        <text x="275" y="248" text-anchor="middle" class="axis-label">Second half</text>
      </svg>
    {:else}
      <span class="nodata">Not enough data in this period!</span>
    {/if}
  </div>
  <p class="chart-note">{data.count} fuel-ups in this period. Each bar is the average fuel efficiency of one half of them.</p>
{:else if data.kind === 'bars'}
  <form class="spend-controls" method="get" action="/charts/view">
    <input type="hidden" name="chart" value="spending" />
    <input type="hidden" name="range" value={data.range} />
    <input type="hidden" name="tf" value="1" />
    <label class="smooth-toggle">
      <input type="checkbox" name="veh" value="all" checked={data.spend.all} onchange={autoSubmit} />
      <span>All Vehicles</span>
    </label>
    <div class="spend-types">
      {#each data.spend.typeOptions as t}
        <label class="type-toggle">
          <input type="checkbox" name="types" value={t.key} checked={t.on} onchange={autoSubmit} />
          <span>{t.label}</span>
        </label>
      {/each}
    </div>
    <noscript><button type="submit" class="spend-apply">Apply</button></noscript>
  </form>
  <div class="big-box">
    {#if data.bars}
      <svg viewBox="0 0 400 250" class="big-chart">
        <line x1="46" y1="12" x2="392" y2="12" class="grid" />
        <line x1="46" y1={data.bars.midY} x2="392" y2={data.bars.midY} class="grid" />
        <line x1="46" y1="222" x2="392" y2="222" class="grid" />
        <text x="42" y="16" text-anchor="end" class="axis-label">{data.bars.yMax}</text>
        <text x="42" y={data.bars.midY + 4} text-anchor="end" class="axis-label">{data.bars.yMid}</text>
        <text x="42" y="226" text-anchor="end" class="axis-label">0</text>
        {#each data.bars.rects as b}
          <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#42a5f5" />
          {#if b.val}<text x={b.tx} y={b.y - 4} text-anchor="middle" class="bar-val-sm">{b.val}</text>{/if}
        {/each}
        <text x="46" y="240" class="axis-label">{data.bars.startLabel}</text>
        <text x="392" y="240" text-anchor="end" class="axis-label">{data.bars.endLabel}</text>
      </svg>
    {:else}
      <span class="nodata">Not enough data in this period!</span>
    {/if}
  </div>
  {#if data.stats}
    <div class="chart-stats">
      <div><span class="k">Months</span><span class="v">{data.count}</span></div>
      <div><span class="k">Min</span><span class="v">{data.stats.min}</span></div>
      <div><span class="k">Avg</span><span class="v">{data.stats.avg}</span></div>
      <div><span class="k">Max</span><span class="v">{data.stats.max}</span></div>
    </div>
  {/if}
  {#if data.bars}
    <p class="chart-note">Total ${data.bars.total} across {data.count} {data.count === 1 ? 'month' : 'months'} in this period.{#if data.spend.all} All vehicles combined.{/if} {#if data.spend.typeOptions.every((t) => t.on)}Fuel, service and expense records combined.{:else}Counting only: {data.spend.typeOptions.filter((t) => t.on).map((t) => t.label).join(', ')}.{/if}</p>
  {/if}
{:else}
  <div class="chart-wrap">
    <label class="smooth-toggle">
      <input type="checkbox" id="smooth-toggle" />
      <span>Smoothing</span>
    </label>
    <div class="big-box">
      {#if data.chart}
        <svg viewBox="0 0 400 250" class="big-chart raw-svg">
          <line x1="46" y1="12" x2="392" y2="12" class="grid" />
          <line x1="46" y1={data.chart.midY} x2="392" y2={data.chart.midY} class="grid" />
          <line x1="46" y1="222" x2="392" y2="222" class="grid" />
          <text x="42" y="16" text-anchor="end" class="axis-label">{data.chart.raw.yMax}</text>
          <text x="42" y={data.chart.midY + 4} text-anchor="end" class="axis-label">{data.chart.raw.yMid}</text>
          <text x="42" y="226" text-anchor="end" class="axis-label">{data.chart.raw.yMin}</text>
          <polyline points={data.chart.raw.line} fill="none" stroke="#33691e" stroke-width="1.6" />
          {#each data.chart.raw.dots as d}
            <circle cx={d.x} cy={d.y} r="2.4" fill="#33691e" />
          {/each}
          <text x="46" y="240" class="axis-label">{data.chart.startLabel}</text>
          <text x="392" y="240" text-anchor="end" class="axis-label">{data.chart.endLabel}</text>
        </svg>
        <svg viewBox="0 0 400 250" class="big-chart smooth-svg">
          <line x1="46" y1="12" x2="392" y2="12" class="grid" />
          <line x1="46" y1={data.chart.midY} x2="392" y2={data.chart.midY} class="grid" />
          <line x1="46" y1="222" x2="392" y2="222" class="grid" />
          <text x="42" y="16" text-anchor="end" class="axis-label">{data.chart.smooth.yMax}</text>
          <text x="42" y={data.chart.midY + 4} text-anchor="end" class="axis-label">{data.chart.smooth.yMid}</text>
          <text x="42" y="226" text-anchor="end" class="axis-label">{data.chart.smooth.yMin}</text>
          <path d={data.chart.smooth.path} fill="none" stroke="#33691e" stroke-width="1.6" />
          <text x="46" y="240" class="axis-label">{data.chart.startLabel}</text>
          <text x="392" y="240" text-anchor="end" class="axis-label">{data.chart.endLabel}</text>
        </svg>
      {:else}
        <span class="nodata">Not enough data in this period!</span>
      {/if}
    </div>
    {#if data.stats}
      <div class="chart-stats stats-raw">
        <div><span class="k">Points</span><span class="v">{data.count}</span></div>
        <div><span class="k">Min</span><span class="v">{data.stats.raw.min}</span></div>
        <div><span class="k">Avg</span><span class="v">{data.stats.raw.avg}</span></div>
        <div><span class="k">Max</span><span class="v">{data.stats.raw.max}</span></div>
      </div>
      <div class="chart-stats stats-smooth">
        <div><span class="k">Points</span><span class="v">{data.count}</span></div>
        <div><span class="k">Min</span><span class="v">{data.stats.smooth.min}</span></div>
        <div><span class="k">Avg</span><span class="v">{data.stats.smooth.avg}</span></div>
        <div><span class="k">Max</span><span class="v">{data.stats.smooth.max}</span></div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .range-row { display: flex; gap: 6px; justify-content: center; padding: 14px 8px 4px; }
  .smooth-toggle {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 10px 0 0; font-size: 15.5px; font-weight: 600; color: #444; cursor: pointer;
  }
  .smooth-toggle input { width: 19px; height: 19px; accent-color: var(--teal); cursor: pointer; }
  .spend-controls .smooth-toggle { padding-top: 14px; }
  .spend-types { display: flex; justify-content: center; gap: 20px; padding-top: 9px; }
  .type-toggle {
    display: flex; align-items: center; gap: 6px;
    font-size: 15px; font-weight: 600; color: #444; cursor: pointer;
  }
  .type-toggle input { width: 18px; height: 18px; accent-color: var(--teal); cursor: pointer; }
  .spend-apply {
    display: block; margin: 10px auto 0; padding: 6px 18px;
    border: 1.5px solid var(--teal); border-radius: 999px; background: #fff;
    color: var(--teal-dark); font-weight: 700; font-size: 14px; cursor: pointer;
  }
  /* Pure CSS toggle: both charts render server-side, each with its
     own y scale, and the checkbox picks which one shows, no
     JavaScript. The stats follow the chart on screen. The compound
     selectors matter, .big-chart sets display block and .chart-stats
     sets display flex at the same base specificity, so a bare
     .smooth-svg display none loses on source order and both show. */
  .big-chart.smooth-svg, .chart-stats.stats-smooth { display: none; }
  .chart-wrap:has(#smooth-toggle:checked) .big-chart.smooth-svg { display: block; }
  .chart-wrap:has(#smooth-toggle:checked) .chart-stats.stats-smooth { display: flex; }
  .chart-wrap:has(#smooth-toggle:checked) .big-chart.raw-svg,
  .chart-wrap:has(#smooth-toggle:checked) .chart-stats.stats-raw { display: none; }
  .range-chip {
    padding: 7px 13px;
    border: 1.5px solid var(--teal);
    border-radius: 999px;
    color: var(--teal-dark);
    font-weight: 700;
    font-size: 15px;
    text-decoration: none;
    background: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    min-height: 37px;
    box-sizing: border-box;
  }
  .range-chip.active { background: var(--teal); color: #fff; }
  /* "THIS MONTH" is squished onto its pill as two small centred lines. */
  .range-chip .stack { font-size: 10.5px; line-height: 1.1; letter-spacing: 0.4px; }
  .big-box {
    margin: 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: #fff;
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .big-chart { width: 100%; height: auto; display: block; }
  .big-chart .grid { stroke: #e3e3e3; stroke-width: 1; }
  .big-chart .axis-label { font-size: 11px; fill: #777; }
  .big-chart .bar-val { font-size: 15px; font-weight: 700; fill: #333; }
  .big-chart .bar-val-sm { font-size: 11px; font-weight: 700; fill: #333; }
  .nodata { color: #aaa; font-size: 15px; padding: 30px 0; }
  .chart-note { text-align: center; color: #888; font-size: 14.5px; margin: 4px 22px; line-height: 1.45; }
  .chart-stats { display: flex; justify-content: space-around; padding: 6px 12px 20px; }
  .chart-stats > div { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .chart-stats .k { color: #999; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
  .chart-stats .v { font-size: 18px; font-weight: 700; color: #222; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .big-box { background: #1d2025; border-color: #33373d; }
  :global(.phone[data-theme="dark"]) .big-chart .grid { stroke: #33373d; }
  :global(.phone[data-theme="dark"]) .big-chart .axis-label { fill: #9aa0a8; }
  :global(.phone[data-theme="dark"]) .big-chart .bar-val { fill: var(--ink); }
  :global(.phone[data-theme="dark"]) .big-chart .bar-val-sm { fill: var(--ink); }
  :global(.phone[data-theme="dark"]) .chart-stats .v { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .range-chip { background: #1d2025; }
  :global(.phone[data-theme="dark"]) .smooth-toggle { color: #c9ccd1; }
  :global(.phone[data-theme="dark"]) .type-toggle { color: #c9ccd1; }
  :global(.phone[data-theme="dark"]) .spend-apply { background: #1d2025; }
</style>

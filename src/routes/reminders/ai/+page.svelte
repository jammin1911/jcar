<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  let { data, form } = $props();

  // With JS the run goes through the run endpoint so the page can
  // show what is happening while the model thinks. Without JS the
  // form action runs the same call server side.
  let running = $state(false);
  let stage = $state(0); // 1 sending, 2 waiting, 3 preparing
  let jsError = $state('');

  const steps = ['Sending the vehicle details', 'Waiting for the AI answer', 'Preparing your summary'];

  async function start(e: SubmitEvent) {
    e.preventDefault();
    if (running) return;
    running = true;
    jsError = '';
    // the send is instant, the wait is the step the user sits on
    stage = 2;
    try {
      const res = await fetch('/reminders/ai/run', { method: 'POST', body: new FormData() });
      const out = (await res.json().catch(() => null)) as { jobId?: string; error?: string } | null;
      if (!res.ok || !out?.jobId) {
        jsError = out?.error ?? 'Something went wrong while talking to the AI service. Try again.';
        running = false;
        stage = 0;
        return;
      }
      stage = 3;
      window.location.href = `/reminders/ai/summary?job=${out.jobId}`;
    } catch {
      jsError = 'The AI service did not respond. Try again.';
      running = false;
      stage = 0;
    }
  }
</script>

<SubHeader title="AI Auto Fill" backHref="/reminders" />

<div class="ai-body">
  {#if data.demo}
    <p class="notice">AI services are disabled on the demo account. On a real install this asks the AI for the factory service schedule for the selected vehicle, and you review the suggestions before anything is saved.</p>
  {:else if !data.configured}
    <p class="notice">AI Auto Fill is not set up yet - the AI endpoint is not configured on this server. Reminders still work fine by hand with the + button on the Reminders page.</p>
  {:else if data.planBlocked}
    <p class="notice">AI Auto Fill is a Paid plan feature.</p>
  {:else if data.missing.length > 0}
    <p class="notice">
      The AI needs the full specs for <b>{data.vehicle.name}</b> before it can look up the right schedule.
      Still missing: {data.missing.join(', ')}.
    </p>
    <a class="big-btn" href={data.editHref}>Fill in the vehicle specs</a>
    <p class="hint">Once the specs are in, come back here and run it again. No AI call has been made.</p>
  {:else}
    <p class="intro">
      Ask the AI for the factory service schedule for <b>{data.vehicle.name}</b>. You get a summary
      to review and edit first, nothing is added until you confirm it.
    </p>
    <p class="disclaimer">
      Suggestions come from the public internet and AI. They are not guaranteed accurate, double
      check them against your owner's manual. Your vehicle may not be available.
    </p>
    {#if running}
      <div class="steps" aria-live="polite">
        {#each steps as label, i}
          <div class="step" class:done={stage > i + 1} class:active={stage === i + 1}>
            <span class="step-dot">{stage > i + 1 ? '✓' : i + 1}</span>
            <span>{label}</span>
          </div>
        {/each}
        <p class="hint">This usually takes about 20 to 30 seconds.</p>
      </div>
    {:else}
      <form method="POST" onsubmit={start}>
        <button type="submit" class="big-btn as-button">Get Suggestions</button>
      </form>
    {/if}
    {#if form?.error}<p class="error">{form.error}</p>{/if}
    {#if jsError}<p class="error">{jsError}</p>{/if}
  {/if}
</div>

<style>
  .ai-body { padding: 18px 16px 30px; }
  .intro { font-size: 16px; line-height: 1.55; color: #333; margin: 0 0 12px; }
  .disclaimer { font-size: 14px; line-height: 1.5; color: #777; margin: 0 0 20px; }
  .notice { font-size: 16px; line-height: 1.55; color: #333; margin: 0 0 16px; }
  .hint { font-size: 14px; color: #888; line-height: 1.5; margin: 12px 0 0; }
  .error { color: #c62828; font-size: 15px; font-weight: 600; margin: 16px 0 0; }
  .big-btn {
    display: block; width: 100%; box-sizing: border-box; padding: 13px 16px; text-align: center;
    background: var(--teal); color: #fff; border: 0; border-radius: 6px;
    font-size: 16.5px; font-weight: 700; font-family: inherit; text-decoration: none; cursor: pointer;
  }
  .steps { margin-top: 6px; }
  .step { display: flex; align-items: center; gap: 12px; padding: 9px 0; font-size: 16px; color: #999; }
  .step.active { color: #333; font-weight: 700; }
  .step.done { color: #2e7d32; }
  .step-dot {
    width: 26px; height: 26px; border-radius: 50%; border: 2px solid #bbb; flex: 0 0 auto;
    display: inline-flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700;
  }
  .step.active .step-dot { border-color: var(--teal); color: var(--teal-dark); }
  .step.done .step-dot { border-color: #2e7d32; background: #2e7d32; color: #fff; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .intro, :global(.phone[data-theme="dark"]) .notice { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .step.active { color: var(--ink); }
</style>

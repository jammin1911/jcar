<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';
  import { plusCircleIcon } from '$lib/icons';

  let { data, form } = $props();

  let receipt = $state<{ url: string; name: string } | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let submitting = $state(false);
  function onPick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    if (receipt) URL.revokeObjectURL(receipt.url);
    receipt = f ? { url: URL.createObjectURL(f), name: f.name } : null;
  }
  function clearReceipt() {
    if (receipt) URL.revokeObjectURL(receipt.url);
    receipt = null;
    if (fileInput) fileInput.value = '';
  }

  // Staged flow with a real progress bar. With JS on, the submit is
  // driven step by step against the staged endpoints so the bar
  // reflects actual work (OCR, extraction, each AI attempt incl.
  // retries). Without JS the form posts to the one-shot action.
  type StepKey = 'upload' | 'ocr' | 'extract' | 'aiText' | 'aiVision' | 'verify' | 'done';
  type StepState = 'pending' | 'active' | 'done' | 'failed';
  const STEP_DEFS: { key: StepKey; label: string }[] = [
    { key: 'upload', label: 'Uploading your photo' },
    { key: 'ocr', label: 'Reading the photo text (OCR)' },
    { key: 'extract', label: 'Finding the fuel numbers' },
    { key: 'aiText', label: 'Asking AI to read the text' },
    { key: 'aiVision', label: 'Asking AI to look at the photo' },
    { key: 'verify', label: 'Verifying the numbers' },
    { key: 'done', label: 'Filling in the Fuel-Up form' }
  ];
  const blankSteps = (): Record<StepKey, StepState> => ({
    upload: 'pending', ocr: 'pending', extract: 'pending', aiText: 'pending',
    aiVision: 'pending', verify: 'pending', done: 'pending'
  });
  let running = $state(false);
  let stepState = $state<Record<StepKey, StepState>>(blankSteps());
  let stepNote = $state<Partial<Record<StepKey, string>>>({});
  let stageError = $state('');
  let stageOcrText = $state('');

  const progressPct = $derived(
    Math.round(
      (STEP_DEFS.filter((s) => stepState[s.key] === 'done').length /
        STEP_DEFS.length) *
        100
    )
  );

  function setStep(key: StepKey, state: StepState, note?: string) {
    stepState = { ...stepState, [key]: state };
    if (note !== undefined) stepNote = { ...stepNote, [key]: note };
  }

  async function postJson(url: string, payload: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  function failStage(step: StepKey, message: string) {
    setStep(step, 'failed');
    stageError = message;
    running = false;
    submitting = false;
  }

  /** The numbers passed the server-side multiply-out check already;
   *  show the last two steps completing and go to the form. */
  function finishWith(location: string) {
    setStep('verify', 'active');
    setStep('verify', 'done');
    setStep('done', 'active');
    setStep('done', 'done');
    window.location.href = location;
  }

  async function runStaged(e: SubmitEvent) {
    e.preventDefault();
    if (!receipt || submitting) return;
    submitting = true;
    running = true;
    stageError = '';
    stageOcrText = '';
    stepState = blankSteps();
    stepNote = {};
    const formEl = e.currentTarget as HTMLFormElement;
    const maxAttempts = 2;

    // Steps 1-2: upload + OCR (one request; the response carries the
    // text the server read).
    setStep('upload', 'active');
    let jobId = '';
    try {
      const res = await fetch('/fuel-up/ai/ocr', { method: 'POST', body: new FormData(formEl) });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setStep('upload', 'done');
        stageOcrText = String(body.ocrText ?? '');
        failStage('ocr', String(body.error ?? 'The photo could not be read.'));
        return;
      }
      jobId = String(body.jobId);
      stageOcrText = String(body.ocrText ?? '');
    } catch {
      failStage('upload', 'The photo could not be uploaded - the request failed.');
      return;
    }
    setStep('upload', 'done');
    setStep('ocr', 'done');

    // Step 3: deterministic extraction from the OCR text.
    setStep('extract', 'active');
    let parsed: Record<string, unknown>;
    try {
      parsed = (await postJson('/fuel-up/ai/parse', { jobId, phase: 'regex' })).body;
    } catch {
      failStage('extract', 'Extraction failed - the request did not go through.');
      return;
    }
    if (typeof parsed.location === 'string') {
      setStep('extract', 'done');
      setStep('aiText', 'done', 'Not needed');
      setStep('aiVision', 'done', 'Not needed');
      finishWith(parsed.location);
      return;
    }
    if (!parsed.aiNeeded) {
      failStage('extract', String(parsed.error ?? 'Extraction failed.'));
      return;
    }
    setStep('extract', 'done', 'Not enough - asking AI');

    // Step 4: AI reads the OCR text.
    setStep('aiText', 'active');
    let toVision = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        setStep('aiText', 'active', `The AI did not respond - retrying (attempt ${attempt} of ${maxAttempts})...`);
        await new Promise((r) => setTimeout(r, 2500));
      }
      let out: { status: number; body: Record<string, unknown> };
      try {
        out = await postJson('/fuel-up/ai/parse', { jobId, phase: 'ai' });
      } catch {
        out = { status: 0, body: { retryable: true } };
      }
      if (typeof out.body.location === 'string') {
        setStep('aiText', 'done');
        setStep('aiVision', 'done', 'Not needed');
        finishWith(out.body.location);
        return;
      }
      if (out.body.fatal) {
        failStage('aiText', String(out.body.error ?? 'The AI service could not be reached.'));
        return;
      }
      if (out.body.retryable && attempt < maxAttempts) continue;
      setStep('aiText', 'done', 'No luck - trying the photo itself');
      toVision = true;
      break;
    }

    // Step 5: AI looks at the photo itself (vision) - the step that
    // reads fuel pump photos. Detection is automatic: the text steps
    // simply find nothing usable in a pump photo.
    if (toVision) {
      setStep('aiVision', 'active');
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (attempt > 1) {
          setStep('aiVision', 'active', `The AI did not respond - retrying (attempt ${attempt} of ${maxAttempts})...`);
          await new Promise((r) => setTimeout(r, 2500));
        }
        let vout: { status: number; body: Record<string, unknown> };
        try {
          const res = await fetch('/fuel-up/ai/vision', { method: 'POST', body: new FormData(formEl) });
          vout = { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
        } catch {
          vout = { status: 0, body: { retryable: true } };
        }
        if (typeof vout.body.location === 'string') {
          setStep('aiVision', 'done');
          finishWith(vout.body.location);
          return;
        }
        if (vout.body.retryable && attempt < maxAttempts) continue;
        if (vout.body.retryable || vout.body.fatal) {
          failStage('aiVision', String(vout.body.error ?? 'The AI service did not respond. Please try again in a moment.'));
          return;
        }
        failStage('aiVision', String(vout.body.error ?? 'The fuel details could not be found in that photo.'));
        return;
      }
    }
  }
</script>

<SubHeader title="AI Auto Fill" backHref="/fuel-up" />

<div class="ai-wrap">
  <p class="ai-intro">
    Attach a photo of your fuel <b>receipt</b> or the <b>pump</b> display and AI Auto
    Fill will attempt read it and fill in the Fuel-Up form for <b>{data.vehicleName}</b>.
    You review and save the record yourself - nothing is saved automatically. This
    feature <b>may</b> or <b>may not</b> stay free forever.
  </p>
  <p class="ai-tips">
    For the best results: take a clear, close-up photo, straight-on in good light
    with no glare. The <b>Volume</b> and <b>Total Cost</b> matter most - make sure
    both are fully visible.
  </p>

  {#if form?.error}
    <p class="form-banner-error">{form.error}</p>
  {/if}
  {#if stageError}
    <p class="form-banner-error">{stageError}</p>
  {/if}

  {#if data.planBlocked}
    <div class="plan-note">
      <p><b>AI Auto Fill is a Paid plan feature.</b></p>
      <p>
        Your account is on the Free plan, so AI reading is turned off. Every
        fuel-up can still be added by hand: the Fuel-Up form works exactly
        the same. <a href="/beta#pricing">See what the plans include</a>
      </p>
    </div>
  {:else if !data.configured}
    <p class="form-banner-error">
      AI Auto Fill isn't set up yet - the AI endpoint is not configured on this server.
    </p>
  {:else}
    <form method="POST" enctype="multipart/form-data" class="ai-form" onsubmit={runStaged}>
      <div class="form-section">Photo</div>
      <div class="attach-row">
        {#if receipt}
          <div class="photo-thumb">
            <img src={receipt.url} alt="Your photo" />
            <button type="button" class="thumb-del" onclick={clearReceipt} aria-label="Remove receipt photo">&#10005;</button>
          </div>
        {/if}
        <!-- One receipt only: once a photo is picked the add square is
             hidden (the input stays mounted so the form still posts the
             file); the x on the thumbnail clears it to pick another. -->
        <label class="attach-square" class:sq-hidden={receipt !== null} aria-label="Attach receipt photo">
          {@html plusCircleIcon}
          <input bind:this={fileInput} type="file" name="receipt" accept="image/*" hidden onchange={onPick} />
        </label>
      </div>
      <button type="submit" class="ai-btn" disabled={submitting || !receipt}>
        {submitting ? 'Reading photo...' : 'Auto Fill from Photo'}
      </button>

      {#if running || stageError}
        <div class="progress-box">
          <div class="progress-track"><div class="progress-fill" style="width: {progressPct}%"></div></div>
          <ul class="steps">
            {#each STEP_DEFS as s}
              <li class="step-{stepState[s.key]}">
                <span class="step-mark">
                  {#if stepState[s.key] === 'done'}&#10003;{:else if stepState[s.key] === 'failed'}&#10007;{:else if stepState[s.key] === 'active'}<span class="pulse"></span>{:else}&middot;{/if}
                </span>
                <span class="step-label">{s.label}</span>
                {#if stepNote[s.key]}<span class="step-note">{stepNote[s.key]}</span>{/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </form>
  {/if}

  {#if form?.ocrText}
    <details class="ocr-details">
      <summary>Text read from your photo</summary>
      <pre>{form.ocrText}</pre>
    </details>
  {:else if stageOcrText && stageError}
    <details class="ocr-details">
      <summary>Text read from your photo</summary>
      <pre>{stageOcrText}</pre>
    </details>
  {/if}
</div>

<style>
  .ai-wrap { padding-bottom: 34px; }
  .plan-note {
    border: 1.5px solid var(--teal); border-radius: 10px;
    padding: 14px 16px; margin-top: 14px; line-height: 1.5; font-size: 15.5px;
  }
  .plan-note p { margin: 0; }
  .plan-note p + p { margin-top: 6px; }
  .plan-note a { color: var(--teal-dark); font-weight: 700; }
  :global(.phone[data-theme="dark"]) .plan-note a { color: var(--teal); }
  .ai-intro { font-size: 16.5px; line-height: 1.55; color: #333; padding: 16px 18px 0; }
  .ai-tips { font-size: 14.5px; line-height: 1.5; color: #666; padding: 10px 18px 0; margin: 0; }
  .ai-form { padding: 0 16px; }
  /* The thumbnail's x hangs 8px below the image; keep it off the button. */
  .ai-form .attach-row { margin-bottom: 18px; }
  .sq-hidden { display: none; }
  .ai-btn {
    display: block; width: 100%; margin-top: 20px; padding: 13px;
    background: var(--teal); color: #fff; border: none; border-radius: 4px;
    font-size: 17px; font-weight: 700; cursor: pointer; font-family: inherit;
  }
  .ai-btn:disabled { background: #b0bec5; cursor: default; }
  .progress-box { margin-top: 20px; }
  .progress-track {
    height: 10px;
    background: #e3e8ee;
    border-radius: 5px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--teal);
    border-radius: 5px;
    transition: width 0.45s ease;
  }
  .steps { list-style: none; margin: 14px 0 0; padding: 0; }
  .steps li {
    display: flex;
    align-items: baseline;
    gap: 9px;
    padding: 5px 0;
    font-size: 15.5px;
    color: #999;
  }
  .steps li.step-active { color: #222; font-weight: 600; }
  .steps li.step-done { color: #333; }
  .steps li.step-failed { color: #c62828; font-weight: 600; }
  .step-mark { width: 16px; text-align: center; font-weight: 700; flex: 0 0 auto; }
  .step-done .step-mark { color: #2e7d32; }
  .step-failed .step-mark { color: #c62828; }
  .step-note { color: #888; font-size: 13.5px; font-weight: 400; }
  .pulse {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--teal);
    animation: pulse 0.9s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    from { opacity: 0.25; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1.15); }
  }
  .ocr-details { margin: 18px 16px 0; }
  .ocr-details summary { color: var(--teal-dark); font-weight: 700; cursor: pointer; font-size: 15px; }
  .ocr-details pre {
    white-space: pre-wrap; word-break: break-word; background: #f5f5f5; border: 1px solid #e0e0e0;
    border-radius: 6px; padding: 10px 12px; font-size: 13px; color: #444; max-height: 300px; overflow: auto;
  }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .ai-intro { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .ai-tips { color: #a6abb3; }
  :global(.phone[data-theme="dark"]) .steps li.step-active { color: #fff; }
  :global(.phone[data-theme="dark"]) .steps li.step-done { color: #c9ccd1; }
  :global(.phone[data-theme="dark"]) .progress-track { background: #2a2e34; }
</style>

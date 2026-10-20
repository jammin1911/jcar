<script lang="ts">
  let { data } = $props();
</script>

<div class="auth">
  <img src="/logo-sm.png" alt="jCar" class="auth-logo" />
  <h1 class="auth-title">Choose Your Plan</h1>

  <div class="plans">
    {#each data.plans as p}
      <div class="plan-card">
        <div class="plan-name">
          {#if p.key === 'paid'}<s>Paid</s> Free Plan <span class="plan-left">({data.paidRemaining} Free Forever Paid Plans Left)</span>{:else}{p.name}{/if}
        </div>
        <div class="plan-row"><span>Vehicles:</span><strong>{p.vehicleLimit}</strong></div>
        <div class="plan-row"><span>Record Retention:</span><strong>{p.retentionLabel}</strong></div>
        <div class="plan-row"><span>Cost:</span><strong>{#if p.key === 'paid'}<s>$5</s> $0 per year{:else}{p.cost}{/if}</strong></div>
        <div class="plan-note">{p.note}</div>
        {#if p.key === 'free'}
          <span class="auth-btn plan-disabled" aria-disabled="true">Disabled</span>
        {:else}
          <a class="auth-btn plan-select" href="/register/form?plan={p.key}">Select</a>
        {/if}
      </div>
    {/each}
  </div>

  <p class="auth-alt">Already registered? <a href="/login">Sign In</a></p>
</div>

<style>
  .auth { padding: 22px 28px 20px; text-align: center; }
  .auth-logo { width: 62px; height: 62px; border-radius: 13px; }
  .auth-title { font-size: 22px; margin: 8px 0 12px; color: #333; }
  .plans { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; text-align: left; }
  .plan-card {
    border: 1px solid #ddd;
    border-radius: 10px;
    padding: 12px 14px;
    background: #fff;
  }
  .plan-name { font-size: 16px; font-weight: 700; color: #222; margin-bottom: 5px; }
  .plan-row {
    display: flex;
    justify-content: space-between;
    font-size: 15px;
    color: #555;
    padding: 2px 0;
  }
  .plan-row strong { color: #222; }
  .plan-note { margin-top: 6px; font-size: 14px; color: var(--teal-dark); font-weight: 600; }
  .auth-btn {
    display: block;
    margin-top: 9px;
    padding: 10px;
    background: var(--teal);
    color: #fff;
    border: 0;
    border-radius: 4px;
    font-size: 17px;
    font-weight: 600;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    font-family: inherit;
  }
  .plan-disabled { background: #b0bec5; cursor: not-allowed; }
  .plan-name s { color: #999; }
  .plan-row strong s { color: #999; }
  .plan-left { font-size: 12px; font-weight: 600; color: var(--teal-dark); letter-spacing: -0.3px; white-space: nowrap; }
  .auth-alt { margin-top: 13px; color: #666; font-size: 15px; }
  .auth-alt a { color: var(--teal-dark); }
</style>

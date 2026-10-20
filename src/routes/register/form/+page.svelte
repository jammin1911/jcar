<script lang="ts">
  let { data, form } = $props();
</script>

<div class="auth">
  <img src="/logo-sm.png" alt="jCar" class="auth-logo" />
  <h1 class="auth-title">Register</h1>

  {#if data.plan}
    <p class="plan-line">
      Plan: <strong>{data.plan.name}</strong> - <a href="/register">Change</a><br />
      <span class="plan-sub">{data.plan.vehicleLimit} vehicles - retention {data.plan.retentionLabel} - {data.plan.cost}</span>
    </p>
  {/if}

  {#if form?.error}
    <p class="auth-error">{form.error}</p>
  {/if}

  <form method="POST" class="auth-form">
    {#if data.plan}<input type="hidden" name="plan" value={data.plan.key} />{/if}
    <label for="email">Email Address</label>
    <input id="email" name="email" type="email" autocomplete="email" required value={form?.values?.email ?? ''} />
    <label for="displayName">Display Name</label>
    <input id="displayName" name="displayName" type="text" autocomplete="name" required value={form?.values?.displayName ?? ''} />
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="new-password" required />
    <label for="confirm">Confirm Password</label>
    <input id="confirm" name="confirm" type="password" autocomplete="new-password" required />
    <button type="submit" class="auth-btn">Create Account</button>
  </form>

  <p class="auth-alt">Already registered? <a href="/login">Sign In</a></p>
</div>

<style>
  .auth { padding: 22px 28px 20px; text-align: center; }
  .auth-logo { width: 62px; height: 62px; border-radius: 13px; }
  .auth-title { font-size: 22px; margin: 8px 0 8px; color: #333; }
  .plan-line { font-size: 14.5px; color: #555; margin: 0 0 4px; line-height: 1.45; }
  .plan-line a { color: var(--teal-dark); }
  .plan-sub { font-size: 13px; color: #888; }
  .auth-error { color: #c62828; font-size: 15px; margin: 0 0 12px; }
  .auth-form { text-align: left; display: flex; flex-direction: column; gap: 4px; }
  .auth-form label { font-size: 14.5px; color: #555; margin-top: 6px; }
  .auth-form input {
    font-size: 16.5px;
    padding: 7px 8px;
    border: 0;
    border-bottom: 1px solid #bbb;
    background: transparent;
    font-family: inherit;
  }
  .auth-form input:focus { outline: none; border-bottom: 2px solid var(--teal); }
  .auth-btn {
    margin-top: 14px;
    padding: 11px;
    background: var(--teal);
    color: #fff;
    border: 0;
    border-radius: 4px;
    font-size: 17px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .auth-alt { margin-top: 13px; color: #666; font-size: 15px; }
  .auth-alt a { color: var(--teal-dark); }
</style>

<script lang="ts">
  let { data, form } = $props();
</script>

<div class="auth">
  <img src="/logo-sm.png" alt="jCar" class="auth-logo" />

  {#if form?.setupAdmin}
    <h1 class="auth-title">Create Admin Account</h1>
    <p class="auth-note">
      No admin account exists yet. Pick a username and password for it -
      you'll sign in with them from this same screen afterwards.
    </p>
    {#if form?.error}
      <p class="auth-error">{form.error}</p>
    {/if}
    <form method="POST" action="?/setupAdmin" class="auth-form">
      <label for="username">Admin Username</label>
      <input id="username" name="username" type="text" autocomplete="username" value={form?.username ?? 'admin'} required />
      <label for="new-password">Admin Password</label>
      <input id="new-password" name="password" type="password" autocomplete="new-password" required />
      <label for="confirm">Confirm Password</label>
      <input id="confirm" name="confirm" type="password" autocomplete="new-password" required />
      <div class="remember-row">
        <input id="remember2" name="remember" type="checkbox" checked />
        <label for="remember2">Remember Me</label>
      </div>
      <button type="submit" class="auth-btn">Create Admin Account</button>
    </form>
    <p class="auth-alt"><a href="/login">Back to Sign In</a></p>
  {:else}
    <h1 class="auth-title">Sign In</h1>

    {#if form?.error}
      <p class="auth-error">{form.error}</p>
    {/if}

    <form method="POST" action="?/signin" class="auth-form">
      <label for="email">Email Address</label>
      <input id="email" name="email" type="text" autocomplete="username" required />
      <label for="password">Password</label>
      <!-- Not `required`: signing in as "admin" before the admin account
           exists must accept a blank password and go to admin setup. -->
      <input id="password" name="password" type="password" autocomplete="current-password" />
      <div class="remember-row">
        <input id="remember" name="remember" type="checkbox" checked />
        <label for="remember">Remember Me</label>
      </div>
      <button type="submit" class="auth-btn">Sign In</button>
    </form>

    {#if data.adminSetupPending}
      <p class="auth-note">Admin not set up yet - sign in as <b>admin</b> to create the admin account.</p>
    {/if}
    <p class="auth-alt">No account yet? <a href="/register">Register</a></p>
    {#if data.demoUrl}
      <p class="auth-alt demo-alt">or try the <a href={data.demoUrl}>live demo</a></p>
    {/if}
  {/if}
</div>

<style>
  .auth { padding: 48px 28px 30px; text-align: center; }
  .auth-logo { width: 92px; height: 92px; border-radius: 18px; }
  .auth-title { font-size: 24px; margin: 14px 0 20px; color: #333; }
  .auth-error { color: #c62828; font-size: 15px; margin: 0 0 12px; }
  .auth-form { text-align: left; display: flex; flex-direction: column; gap: 6px; }
  .auth-form label { font-size: 15px; color: #555; margin-top: 10px; }
  .auth-form input {
    font-size: 17px;
    padding: 10px 8px;
    border: 0;
    border-bottom: 1px solid #bbb;
    background: transparent;
    font-family: inherit;
  }
  .auth-form input:focus { outline: none; border-bottom: 2px solid var(--teal); }
  .auth-btn {
    margin-top: 22px;
    padding: 12px;
    background: var(--teal);
    color: #fff;
    border: 0;
    border-radius: 4px;
    font-size: 17px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .remember-row { display: flex; align-items: center; gap: 9px; margin-top: 16px; }
  .remember-row input { width: 19px; height: 19px; accent-color: var(--teal); margin: 0; }
  .remember-row label { margin: 0; font-size: 16px; color: #444; }
  .auth-note { color: #666; font-size: 15px; line-height: 1.45; margin: 14px 0 4px; }
  .auth-alt { margin-top: 20px; color: #666; font-size: 15.5px; }
  .demo-alt { margin-top: 6px; }
  .auth-alt a { color: var(--teal-dark); }
</style>

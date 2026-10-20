<script lang="ts">
  import { onMount } from 'svelte';
  import { icons, iconsDark, dotsIcon } from '$lib/icons';

  let { data } = $props();

  // Add Icon to Homescreen. Only shows where it applies: Android
  // Chromium fires beforeinstallprompt, iOS and Android Firefox
  // can't prompt so they get step-by-step instructions instead.
  // Desktop and already installed apps never see it.
  type InstallKind = 'prompt' | 'ios' | 'firefox';
  interface DeferredPrompt {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  }
  let installKind = $state<InstallKind | null>(null);
  let installHelp = $state(false);
  let dotsMenuEl: HTMLDetailsElement | undefined = $state();
  let vehMenuEl: HTMLDetailsElement | undefined = $state();

  // The header dropdowns are <details> elements, so they only toggle
  // from their own button. Close them on any outside click or Escape.
  onMount(() => {
    const closeMenus = () => {
      if (dotsMenuEl) dotsMenuEl.open = false;
      if (vehMenuEl) vehMenuEl.open = false;
    };
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (dotsMenuEl?.open && !dotsMenuEl.contains(t)) dotsMenuEl.open = false;
      if (vehMenuEl?.open && !vehMenuEl.contains(t)) vehMenuEl.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenus();
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  });
  let deferredPrompt: DeferredPrompt | null = null;

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      if (!/android/i.test(navigator.userAgent)) return; // no desktop
      deferredPrompt = e as unknown as DeferredPrompt;
      installKind = 'prompt';
    });
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      installKind = null;
    });
  }

  onMount(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) {
      installKind = null;
      return;
    }
    if (installKind) return; // beforeinstallprompt already offered it
    const ua = navigator.userAgent;
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      installKind = 'ios';
    } else if (/android/i.test(ua) && /firefox/i.test(ua)) {
      installKind = 'firefox';
    }
  });

  async function onInstallClick() {
    if (dotsMenuEl) dotsMenuEl.open = false;
    if (installKind === 'prompt' && deferredPrompt) {
      const ev = deferredPrompt;
      deferredPrompt = null;
      await ev.prompt();
      const choice = await ev.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') installKind = null;
    } else {
      installHelp = true;
    }
  }

  const current = data.vehicles.find((v) => v.id === data.selectedId) ?? null;
  const currentIdx = data.vehicles.findIndex((v) => v.id === data.selectedId);
  const prevVehicle =
    data.vehicles.length > 1 ? data.vehicles[(currentIdx - 1 + data.vehicles.length) % data.vehicles.length] : null;
  const nextVehicle = data.vehicles.length > 1 ? data.vehicles[(currentIdx + 1) % data.vehicles.length] : null;

  const ic = data.theme === 'dark' ? { ...icons, ...iconsDark } : icons;

  const tiles: { label: string; href: string; icon: string; plus: boolean; dot?: boolean }[] = [
    { label: 'Fuel-Up', href: '/fuel-up', icon: ic.fuel, plus: true },
    { label: 'Service', href: '/service', icon: ic.service, plus: true },
    { label: 'Expense', href: '/expense', icon: ic.expense, plus: true },
    { label: 'Note', href: '/notes/new', icon: ic.note, plus: true },
    { label: 'Browse Recs', href: '/browse', icon: ic.browse, plus: false },
    { label: 'Statistics', href: '/statistics', icon: ic.statistics, plus: false },
    { label: 'Charts', href: '/charts', icon: ic.charts, plus: false },
    { label: 'Vehicle Details', href: '/vehicle', icon: ic.vehicleDetails, plus: false },
    { label: 'Predictions', href: '/predictions', icon: ic.predictions, plus: false },
    { label: 'Settings', href: '/settings', icon: ic.settings, plus: false },
    { label: 'Import/Export', href: '/import-export', icon: ic.importExport, plus: false },
    { label: 'Sharing', href: '/sharing', icon: ic.sharing, plus: false, dot: data.pendingInvites > 0 }
  ];
</script>

<header class="app-header">
  <div class="logo-slot"><img src="/logo-sm.png" alt="jCar" class="logo-img" /></div>
  <div class="vehicle-select-wrap">
    {#if current}
      {#if prevVehicle}
        <form method="POST" action="?/select" class="veh-arrow-form">
          <input type="hidden" name="vehicleId" value={prevVehicle.id} />
          <button type="submit" class="veh-arrow" aria-label="Previous vehicle: {prevVehicle.name}">&#8249;</button>
        </form>
      {/if}
      <details class="veh-menu" bind:this={vehMenuEl}>
        <summary class="veh-current" aria-label="Select vehicle">
          {current.name}
        </summary>
        <div class="veh-dropdown">
          {#each data.vehicles as v}
            <form method="POST" action="?/select">
              <input type="hidden" name="vehicleId" value={v.id} />
              <button type="submit" class="veh-item" class:selected={v.id === data.selectedId}>
                <span class="veh-item-main">
                  <span class="veh-item-name">{#if !v.isOwner}<span class="veh-share-ico">{@html ic.sharing}</span>{/if}{v.name}</span>
                  {#if !v.isOwner}<span class="veh-item-shared">shared by {v.ownerName}</span>{/if}
                  {#if v.costTracking}<span class="veh-item-shared">cost tracking only</span>{/if}
                </span>
                {#if v.id === data.selectedId}<span class="veh-check">&#10003;</span>{/if}
              </button>
            </form>
          {/each}
          <a class="veh-item veh-add" href="/vehicle/new">+ Add Vehicle</a>
        </div>
      </details>
      {#if nextVehicle}
        <form method="POST" action="?/select" class="veh-arrow-form">
          <input type="hidden" name="vehicleId" value={nextVehicle.id} />
          <button type="submit" class="veh-arrow" aria-label="Next vehicle: {nextVehicle.name}">&#8250;</button>
        </form>
      {/if}
    {/if}
  </div>
  <details class="dots-menu" bind:this={dotsMenuEl}>
    <summary class="icon-btn" aria-label="More options">{@html dotsIcon}</summary>
    <div class="dots-dropdown">
      <a class="dots-item" href="/feedback">Feedback/Support</a>
      {#if installKind}
        <button type="button" class="dots-item" onclick={onInstallClick}>Add Icon to Homescreen</button>
      {/if}
      <form method="POST" action="/logout">
        <button type="submit" class="dots-item">Sign Out</button>
      </form>
    </div>
  </details>
</header>

{#if installHelp}
  <div class="install-overlay" role="dialog" aria-label="Add Icon to Homescreen">
    <div class="install-card">
      <h2>Add Icon to Homescreen</h2>
      {#if installKind === 'ios'}
        <p>Tap the <b>Share</b> button (the square with an arrow pointing up), scroll down, and tap <b>Add to Home Screen</b>. Then tap <b>Add</b>.</p>
      {:else}
        <p>Tap the <b>&#8942; menu</b> in Firefox, tap <b>More</b>, then tap <b>Add app to Home screen</b>.</p>
      {/if}
      <button type="button" class="install-close" onclick={() => (installHelp = false)}>Close</button>
    </div>
  </div>
{/if}

<h1 class="page-title">Dashboard</h1>

{#if data.vehicles.length === 0}
  {#if data.pendingInviteList.length > 0}
    <div class="invite-card">
      <p class="invite-title">Shared with you</p>
      {#each data.pendingInviteList as inv}
        <div class="invite-row">
          <div class="invite-info">
            <span class="invite-veh">{inv.vehicleName}</span>
            <span class="invite-by">shared by {inv.ownerName}</span>
          </div>
          <div class="invite-actions">
            <form method="POST" action="?/acceptInvite">
              <input type="hidden" name="shareId" value={inv.shareId} />
              <button type="submit" class="invite-btn solid">Accept</button>
            </form>
            <form method="POST" action="?/denyInvite">
              <input type="hidden" name="shareId" value={inv.shareId} />
              <button type="submit" class="invite-btn">Deny</button>
            </form>
          </div>
        </div>
      {/each}
      <p class="invite-note">Accepting adds the vehicle to your account.</p>
    </div>
  {/if}
  <div class="no-vehicle">
    <p class="no-vehicle-text">You have no vehicles yet.</p>
    <a class="empty-btn" href="/vehicle/new">+ Add your first vehicle</a>
    <a class="empty-btn outline" href="/import-export">Import Records</a>
  </div>
{:else}
  <nav class="console-grid">
    {#each tiles as t}
      <a class="tile" href={t.href}>
        <span class="tile-icon">{@html t.icon}{#if t.plus}<span class="plus"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15"/></svg></span>{/if}{#if t.dot}<span class="dot" aria-label="You have a sharing invite waiting"></span>{/if}</span>
        <span>{t.label}</span>
      </a>
    {/each}
  </nav>
  {#if data.demoMode}
    <p class="demo-note">
      This is a live demo with seeded sample data. Feel free to add, edit or delete
      anything while you test - it resets itself automatically every 24 hours.
    </p>
  {/if}
{/if}

<style>
  .demo-note { color: #999; font-size: 14.5px; line-height: 1.5; text-align: center; margin: 26px 30px 0; }
  .no-vehicle { text-align: center; margin: 40px 30px 0; }
  .no-vehicle-text { color: #666; font-size: 17px; margin: 0 0 20px; }
  /* Invite card for users with no vehicles and pending shares. */
  .invite-card {
    margin: 26px 16px 0; padding: 14px 16px 10px;
    border: 1.5px solid var(--teal); border-radius: 10px; background: #fff;
  }
  .invite-title { font-size: 16px; font-weight: 700; color: #333; margin: 0 0 6px; }
  .invite-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 0; border-top: 1px solid #eee;
  }
  .invite-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .invite-veh { font-size: 16.5px; font-weight: 700; color: #333; overflow-wrap: anywhere; }
  .invite-by { font-size: 13.5px; color: #999; }
  .invite-actions { display: flex; gap: 8px; flex: 0 0 auto; }
  .invite-btn {
    padding: 8px 12px; font-size: 14.5px; font-weight: 700; border-radius: 4px; cursor: pointer;
    border: 1.5px solid var(--teal); background: #fff; color: var(--teal-dark); font-family: inherit;
    white-space: nowrap;
  }
  .invite-btn.solid { background: var(--teal); color: #fff; }
  .invite-note { font-size: 13.5px; color: #999; margin: 8px 0 2px; line-height: 1.4; }
  .empty-btn {
    display: block;
    max-width: 300px;
    margin: 0 auto 12px;
    padding: 13px 16px;
    background: var(--teal);
    color: #fff;
    border-radius: 6px;
    font-size: 17px;
    font-weight: 600;
    text-decoration: none;
  }
  .empty-btn.outline {
    background: #fff;
    color: var(--teal-dark);
    border: 1.5px solid var(--teal-dark);
  }
  .dots-menu { position: relative; flex: 0 0 auto; }
  .dots-menu summary { list-style: none; }
  .dots-menu summary::-webkit-details-marker { display: none; }
  .dots-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
    min-width: 160px;
    z-index: 60;
    overflow: hidden;
  }
  .dots-item {
    display: block;
    width: 100%;
    box-sizing: border-box;
    text-decoration: none;
    text-align: left;
    padding: 13px 16px;
    background: none;
    border: 0;
    font-size: 16.5px;
    font-family: inherit;
    color: #222;
    cursor: pointer;
  }
  .dots-item:active { background: #f0f0f0; }
  .install-overlay {
    position: fixed; inset: 0; z-index: 60;
    background: rgba(0, 0, 0, 0.55);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .install-card {
    background: #fff; color: #222; border-radius: 12px;
    padding: 20px; max-width: 340px; width: 100%;
  }
  .install-card h2 { font-size: 19px; margin: 0 0 10px; }
  .install-card p { font-size: 16px; line-height: 1.5; margin: 0 0 16px; }
  .install-close {
    display: block; width: 100%; padding: 11px;
    background: var(--teal); color: #fff; border: 0; border-radius: 4px;
    font-size: 16px; font-weight: 600; cursor: pointer; font-family: inherit;
  }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .no-vehicle-text { color: #a6abb3; }
  :global(.phone[data-theme="dark"]) .invite-card { background: #1d2025; }
  :global(.phone[data-theme="dark"]) .invite-title, :global(.phone[data-theme="dark"]) .invite-veh { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .invite-row { border-top-color: #26292f; }
  :global(.phone[data-theme="dark"]) .invite-btn { background: #1d2025; }
  :global(.phone[data-theme="dark"]) .invite-btn.solid { background: var(--teal); color: #fff; }
  :global(.phone[data-theme="dark"]) .empty-btn.outline { background: #1d2025; }
  :global(.phone[data-theme="dark"]) .dots-dropdown { background: #1d2025; }
  :global(.phone[data-theme="dark"]) .dots-item { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .dots-item:active { background: #26292f; }
  :global(.phone[data-theme="dark"]) .install-card { background: #1d2025; color: var(--ink); }
</style>

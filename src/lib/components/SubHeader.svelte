<script lang="ts">
  import { floppyIcon } from '$lib/icons';

  interface Props {
    title: string;
    save?: boolean;
    onsave?: () => void;
    backHref?: string;
    formId?: string;
    /** optional right-side link button (e.g. the Browse filter funnel) */
    actionHref?: string;
    actionIcon?: string;
    actionLabel?: string;
    /** optional secondary link shown beside the save button (e.g. "AI") */
    secondaryHref?: string;
    secondaryLabel?: string;
  }
  let { title, save = false, onsave, backHref = '/', formId, actionHref, actionIcon, actionLabel, secondaryHref, secondaryLabel }: Props = $props();
</script>

<style>
  .header-actions { display: inline-flex; align-items: center; gap: 4px; }
  .ai-chip {
    color: #fff; text-decoration: none; font-weight: 800; font-size: 15px;
    letter-spacing: 0.06em; border: 2px solid rgba(255, 255, 255, 0.85);
    border-radius: 999px; padding: 3px 11px; line-height: 1.25;
  }
</style>

<header class="app-header">
  <a class="icon-btn back-btn" href={backHref} aria-label="Back">&#8249;</a>
  <div class="title">{title}</div>
  {#if save && formId}
    <span class="header-actions">
      {#if secondaryHref}
        <a class="ai-chip" href={secondaryHref}>{secondaryLabel ?? 'AI'}</a>
      {/if}
      <button class="icon-btn" type="submit" form={formId} aria-label="Save">{@html floppyIcon}</button>
    </span>
  {:else if save}
    <button class="icon-btn" onclick={onsave} aria-label="Save">{@html floppyIcon}</button>
  {:else if actionHref}
    <a class="icon-btn" href={actionHref} aria-label={actionLabel ?? 'Action'}>{@html actionIcon ?? ''}</a>
  {:else}
    <div class="header-spacer"></div>
  {/if}
</header>

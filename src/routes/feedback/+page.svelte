<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';
  import { plusCircleIcon } from '$lib/icons';
  let { data, form } = $props();

  // Optional single photo, same attach pattern as AI Auto Fill.
  // Picking shows a thumbnail and the x clears it, and the input
  // stays mounted so the form posts the file with or without JS.
  let photo = $state<{ url: string } | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();

  function onPick() {
    const f = fileInput?.files?.[0];
    if (photo) URL.revokeObjectURL(photo.url);
    photo = f ? { url: URL.createObjectURL(f) } : null;
  }
  function clearPhoto() {
    if (photo) URL.revokeObjectURL(photo.url);
    photo = null;
    if (fileInput) fileInput.value = '';
  }
</script>

<SubHeader title="Feedback/Support" backHref="/" />

<div class="wrap">
  {#if form?.sent}
    <div class="sent-box">
      <p class="sent-title">Thank you - your message was sent.</p>
      <p class="sent-sub">We read every message. If a reply is needed we'll use your account email ({data.email}).</p>
      <a class="btn" href="/">Back to Dashboard</a>
    </div>
  {:else}
    <p class="intro">
      Send feedback, report a problem, or ask for help. Your message is stored with your
      email address ({data.email}) and the date so we can follow up.
    </p>
    {#if form?.error}<p class="err">{form.error}</p>{/if}
    <form method="POST" enctype="multipart/form-data">
      <label for="message">Your Message</label>
      <textarea id="message" name="message" rows="8" maxlength="5000" required placeholder="Type your feedback or support question..."></textarea>
      <div class="form-section-fb">Photo (optional)</div>
      <div class="attach-row">
        {#if photo}
          <div class="photo-thumb">
            <img src={photo.url} alt="Attached photo" />
            <button type="button" class="thumb-del" onclick={clearPhoto} aria-label="Remove photo">&#10005;</button>
          </div>
        {/if}
        <label class="attach-square" class:sq-hidden={photo !== null} aria-label="Attach a photo">
          {@html plusCircleIcon}
          <input bind:this={fileInput} type="file" name="photo" accept="image/*" hidden onchange={onPick} />
        </label>
      </div>
      <button type="submit" class="btn">Send Feedback</button>
    </form>
  {/if}
</div>

<style>
  .wrap { padding: 20px 16px 30px; }
  .intro { font-size: 15.5px; color: #555; line-height: 1.45; margin: 0 0 16px; }
  .err { color: #c62828; font-size: 15px; margin: 0 0 12px; }
  label { display: block; font-size: 15px; color: #555; margin-bottom: 6px; }
  textarea {
    width: 100%;
    box-sizing: border-box;
    font-size: 16.5px;
    padding: 12px 10px;
    border: 1px solid #bbb;
    border-radius: 6px;
    background: #fff;
    font-family: inherit;
    resize: vertical;
  }
  textarea:focus { outline: none; border-color: var(--teal); }
  .btn {
    display: block;
    width: 100%;
    box-sizing: border-box;
    margin-top: 16px;
    padding: 13px;
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
  .form-section-fb { font-size: 15px; color: #555; margin-top: 16px; }
  .attach-row { margin-bottom: 18px; }
  .sq-hidden { display: none; }
  .photo-thumb img { border-radius: 6px; }
  .sent-box { text-align: center; padding-top: 30px; }
  .sent-title { font-size: 19px; font-weight: 700; color: #222; margin: 0 0 10px; }
  .sent-sub { font-size: 15.5px; color: #555; line-height: 1.45; margin: 0 0 8px; }

  /* Dark theme */
  :global(.phone[data-theme="dark"]) .intro, :global(.phone[data-theme="dark"]) label, :global(.phone[data-theme="dark"]) .form-section-fb { color: #b8bcc2; }
  :global(.phone[data-theme="dark"]) textarea { background: #1d2025; border-color: #4a4f57; color: var(--ink); }
  :global(.phone[data-theme="dark"]) .sent-title { color: var(--ink); }
  :global(.phone[data-theme="dark"]) .err { color: #ef5350; }
</style>

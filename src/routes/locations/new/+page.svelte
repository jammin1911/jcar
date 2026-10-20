<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  // Address fields plus a Notes field, nothing else.
  let { data } = $props();

  const rows: { label: string; id: string }[] = [
    { label: 'Street Address', id: 'street' },
    { label: 'City', id: 'city' },
    { label: 'Province', id: 'province' },
    { label: 'Postal Code', id: 'postal' },
    { label: 'Country', id: 'country' }
  ];
</script>

<SubHeader title="New Location" save formId="location-form" backHref={data.backHref} />

<form id="location-form" class="record-form" method="POST">
  {#each rows as r}
    <div class="form-row">
      <label for={r.id}>{r.label}</label>
      <div class="field"><input id={r.id} name={r.id} type="text" /></div>
    </div>
  {/each}

  <div class="form-row notes-row">
    <label for="notes">Notes</label>
    <div class="field"><textarea id="notes" name="notes" rows="3" placeholder="----------"></textarea></div>
  </div>
</form>

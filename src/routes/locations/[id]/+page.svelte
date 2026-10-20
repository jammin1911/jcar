<script lang="ts">
  import SubHeader from '$lib/components/SubHeader.svelte';

  let { data } = $props();
  const l = data.location;

  const rows: { label: string; id: string; value: string }[] = [
    { label: 'Street Address', id: 'street', value: l.street ?? '' },
    { label: 'City', id: 'city', value: l.city ?? '' },
    { label: 'Province', id: 'province', value: l.province ?? '' },
    { label: 'Postal Code', id: 'postal', value: l.postalCode ?? '' },
    { label: 'Country', id: 'country', value: l.country ?? '' }
  ];
</script>

<SubHeader title="Edit Location" save formId="location-form" backHref="/locations" />

<form id="location-form" class="record-form" method="POST" action="?/save">
  {#each rows as r}
    <div class="form-row">
      <label for={r.id}>{r.label}</label>
      <div class="field"><input id={r.id} name={r.id} type="text" value={r.value} /></div>
    </div>
  {/each}

  <div class="form-row notes-row">
    <label for="notes">Notes</label>
    <div class="field"><textarea id="notes" name="notes" rows="3">{l.notes ?? ''}</textarea></div>
  </div>
</form>

<form method="POST" action="?/delete" class="delete-form" onsubmit={(e) => { if (!confirm('Delete this location? Records keep their data but lose the link.')) e.preventDefault(); }}>
  <button type="submit" class="delete-btn">Delete Location</button>
</form>

<style>
  .delete-form { padding: 10px 16px 30px; text-align: center; }
  .delete-btn { background: none; border: 0; color: #c62828; font-size: 15.5px; cursor: pointer; font-family: inherit; }
</style>

<script lang="ts">
  import RecordForm from '$lib/components/RecordForm.svelte';
  let { data, form } = $props();
</script>

<RecordForm
  title={data.editing ? "Edit Expense Record" : "New Expense Record"}
  kind="expense"
  vehicleName={data.vehicleName}
  costTracking={data.costTracking}
  prevOdometer={data.prevOdometer}
  defaultDateTime={data.defaultDateTime}
  locationId={form?.locationId ?? data.locationId}
  locationLabel={form?.locationLabel ?? data.locationLabel}
  error={form?.error}
  values={form?.values ?? data.editing?.values ?? null}
  recordId={data.editing?.id ?? null}
  photos={data.editing?.photos ?? []}
/>

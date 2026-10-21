<script lang="ts">
  import RecordForm from '$lib/components/RecordForm.svelte';
  let { data, form } = $props();
</script>

<RecordForm
  title={data.editing ? "Edit Fuel-Up Record" : "New Fuel-Up Record"}
  kind="fuel"
  vehicleName={data.vehicleName}
  costTracking={data.costTracking}
  prevOdometer={data.prevOdometer}
  defaultDateTime={data.defaultDateTime}
  locationId={form?.locationId ?? data.locationId}
  locationLabel={form?.locationLabel ?? data.locationLabel}
  error={form?.error}
  values={form?.values ?? data.editing?.values ?? data.aiValues ?? null}
  info={data.aiNote}
  aiHref={data.editing ? undefined : '/fuel-up/ai'}
  recordId={data.editing?.id ?? null}
  recordedBy={data.editing?.recordedBy ?? ''}
  photos={data.editing?.photos ?? []}
/>

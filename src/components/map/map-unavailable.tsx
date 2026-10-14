import { Alert } from "@/components/ui";

export function MapUnavailable({ compact = false }: { compact?: boolean }) {
  return (
    <Alert tone="info" title="Map unavailable">
      {compact
        ? "No map key is configured."
        : "No Mapbox token is configured (NEXT_PUBLIC_MAPBOX_TOKEN), so the interactive map is switched off. Everything else — search, filters and the list view — still works."}
    </Alert>
  );
}

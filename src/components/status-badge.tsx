import { Badge } from "@/components/ui";

const LISTING: Record<string, { label: string; tone: "neutral" | "green" | "amber" | "red" | "blue" | "teal" }> = {
  draft: { label: "Draft", tone: "neutral" },
  published: { label: "Published", tone: "green" },
  paused: { label: "Paused", tone: "amber" },
  removed: { label: "Removed", tone: "red" },
};
const REQUEST: Record<string, { label: string; tone: "neutral" | "green" | "amber" | "red" | "blue" | "teal" }> = {
  pending: { label: "Pending", tone: "amber" },
  accepted: { label: "Accepted", tone: "green" },
  declined: { label: "Declined", tone: "red" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  completed: { label: "Completed", tone: "blue" },
};

export function ListingStatusBadge({ status, moderation }: { status: string; moderation?: string }) {
  const s = LISTING[status] ?? { label: status, tone: "neutral" as const };
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={s.tone}>{s.label}</Badge>
      {moderation === "suspended" && <Badge tone="red">Suspended by moderator</Badge>}
    </span>
  );
}

export function RequestStatusBadge({ status }: { status: string }) {
  const s = REQUEST[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

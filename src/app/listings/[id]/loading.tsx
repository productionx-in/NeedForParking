import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]" aria-busy="true" aria-label="Loading listing">
      <div className="space-y-4">
        <Skeleton className="aspect-[16/10] w-full" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

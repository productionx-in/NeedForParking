import Link from "next/link";
import { buttonClass, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState title="We couldn't find that page" action={<Link href="/search" className={buttonClass("primary")}>Browse listings</Link>}>
      The listing may have been paused or removed, or the link may be wrong.
    </EmptyState>
  );
}

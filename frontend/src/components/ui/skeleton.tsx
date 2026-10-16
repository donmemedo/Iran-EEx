import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-sm", className)} aria-hidden />;
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border border-line bg-surface p-5", className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-36" />
      <Skeleton className="mt-3 h-3 w-full" />
    </div>
  );
}

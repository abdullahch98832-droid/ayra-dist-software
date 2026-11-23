import { LoadingRegion } from "@/components/shared/loading-region";
import { CardsSkeleton, PageHeaderSkeleton } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton />
      <CardsSkeleton />
      <div className="mt-6 grid gap-6 lg:grid-cols-2"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
    </LoadingRegion>
  );
}

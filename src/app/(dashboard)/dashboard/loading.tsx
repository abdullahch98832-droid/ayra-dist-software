import { LoadingRegion } from "@/components/shared/loading-region";
import { CardsSkeleton, ChartsSkeleton, PageHeaderSkeleton } from "@/components/shared/states";

export default function Loading() {
  return (
    <LoadingRegion>
      <PageHeaderSkeleton />
      <CardsSkeleton count={8} />
      <div className="mt-8"><ChartsSkeleton /></div>
    </LoadingRegion>
  );
}

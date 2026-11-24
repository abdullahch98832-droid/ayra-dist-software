import { LoadingRegion } from "@/components/shared/loading-region";
import { PageHeaderSkeleton, TableSkeleton } from "@/components/shared/states";

export default function Loading() {
  return <LoadingRegion><PageHeaderSkeleton /><TableSkeleton /></LoadingRegion>;
}

import { LoadingRegion } from "@/components/shared/loading-region";
import { FormSkeleton, PageHeaderSkeleton } from "@/components/shared/states";

export default function Loading() {
  return <LoadingRegion><PageHeaderSkeleton /><FormSkeleton /></LoadingRegion>;
}

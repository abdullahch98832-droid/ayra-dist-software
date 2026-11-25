import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-shimmer rounded-md bg-[linear-gradient(100deg,var(--muted-strong)_35%,var(--muted)_50%,var(--muted-strong)_65%)] bg-[length:200%_100%]", className)}
      {...props}
    />
  )
}

export { Skeleton }

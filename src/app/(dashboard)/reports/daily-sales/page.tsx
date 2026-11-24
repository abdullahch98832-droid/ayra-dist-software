import { SalesReport, salesReportMetadata } from "@/components/reports/sales-report";

export const generateMetadata = () => salesReportMetadata("day");

export default function DailySalesPage({ searchParams }: PageProps<"/reports/daily-sales">) {
  return <SalesReport bucket="day" searchParams={searchParams} />;
}

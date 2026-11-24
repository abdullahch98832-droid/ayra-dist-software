import { SalesReport, salesReportMetadata } from "@/components/reports/sales-report";

export const generateMetadata = () => salesReportMetadata("month");

export default function MonthlySalesPage({ searchParams }: PageProps<"/reports/monthly-sales">) {
  return <SalesReport bucket="month" searchParams={searchParams} />;
}

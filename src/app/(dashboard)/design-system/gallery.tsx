"use client";

import { useState } from "react";
import { Boxes, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { BarListCard } from "@/components/charts/bar-list";
import { ColumnChartCard } from "@/components/charts/column-chart";
import { LineChartCard } from "@/components/charts/line-chart";
import { Field, FormAlert, NativeSelect } from "@/components/forms/field";
import { FormActions, FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState, TableSkeleton } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";

// Placeholder magnitudes for layout only; never import these outside this page.
const SHAPE = [12, 30, 18, 44, 26, 38, 52, 41];

export function Gallery() {
  const { t } = useI18n();
  const [confirm, setConfirm] = useState(false);
  const labels = [t.modules.sales, t.modules.inventory, t.modules.purchasing, t.modules.expenses, t.modules.sol, t.modules.vehicles, t.modules.reports, t.modules.company];
  const points = SHAPE.map((v, i) => ({ label: labels[i] ?? "", values: [{ value: v, display: String(v) }, { value: 60 - v, display: String(60 - v) }] }));
  const series = [{ key: "a", label: t.modules.sales }, { key: "b", label: t.modules.purchasing }];
  const rows = Array.from({ length: 60 }, (_, i) => ({ id: String(i + 1), name: `${labels[i % labels.length]} ${i + 1}`, qty: (i * 37) % 101 }));

  return (
    <div className="grid gap-6">
      <h1 className="font-heading text-3xl text-navy">Design system</h1>
      <SectionCard title="Button / Badge">
        <div className="flex flex-wrap items-center gap-3">
          <Button>{t.common.save}</Button>
          <Button variant="outline">{t.common.cancel}</Button>
          <Button variant="secondary">{t.common.edit}</Button>
          <Button variant="ghost">{t.common.view}</Button>
          <Button variant="destructive" onClick={() => setConfirm(true)}><Trash2 aria-hidden />{t.common.delete}</Button>
          <Button variant="outline" onClick={() => toast.add({ title: t.common.saved, description: t.employees.updated, type: "success" })}>{t.notifications.title}</Button>
          {(["green", "blue", "amber", "red", "gray"] as const).map((tone) => <StatusBadge key={tone} tone={tone}>{t.common.status}</StatusBadge>)}
        </div>
      </SectionCard>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={t.roles.deleteRole} subject={t.modules.sales} description={t.roles.confirmDelete} confirmLabel={t.common.delete} onConfirm={() => setConfirm(false)} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t.modules.inventory} value="—" icon={Boxes} />
        <StatCard label={t.modules.sales} value="—" icon={Boxes} tone="attention" hint={t.common.status} />
        <StatCard label={t.modules.reports} value="—" icon={Boxes} href="/dashboard" />
      </div>
      <FormSection title="Form">
        <Field id="g-name" label={t.common.name} required error="required"><Input id="g-name" /></Field>
        <Field id="g-phone" label={t.common.phone} optional hint={t.employees.codeAuto}><Input id="g-phone" dir="ltr" defaultValue="+92 300 0000000" /></Field>
        <Field id="g-money" label={t.employees.salary}><MoneyInput id="g-money" defaultValue="0.00" /></Field>
        <Field id="g-select" label={t.common.status}><NativeSelect id="g-select">{labels.map((l) => <option key={l}>{l}</option>)}</NativeSelect></Field>
        <Field id="g-menu" label="Select">
          <Select items={labels.map((l) => ({ value: l, label: l }))} defaultValue={labels[0]}>
            <SelectTrigger id="g-menu" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{labels.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <label className="flex items-center gap-2"><Checkbox defaultChecked />{t.common.confirm}</label>
          <label className="flex items-center gap-2"><Switch defaultChecked />{t.common.confirm}</label>
        </div>
      </FormSection>
      <FormActions><Button size="lg">{t.common.save}</Button><Button size="lg" variant="outline">{t.common.cancel}</Button></FormActions>
      <Tabs defaultValue="a"><TabsList><TabsTrigger value="a">{t.modules.sales}</TabsTrigger><TabsTrigger value="b">{t.modules.purchasing}</TabsTrigger></TabsList><TabsContent value="a"><FormAlert tone="info">{t.auth.sessionExpired}</FormAlert></TabsContent><TabsContent value="b"><FormAlert tone="success">{t.common.saved}</FormAlert></TabsContent></Tabs>
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <BarListCard title="BarList" series={series[0]!} points={points.slice(0, 5)} />
        <ColumnChartCard title="ColumnChart" series={series} points={points} />
        <LineChartCard title="LineChart" series={series} points={points} />
      </div>
      <DataTable
        rows={rows} rowKey={(r) => r.id} caption="DataTable" searchText={(r) => r.name}
        columns={[
          { id: "name", header: t.common.name, primary: true, sortValue: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
          { id: "qty", header: t.charts.value, align: "end", sortValue: (r) => r.qty, cell: (r) => r.qty },
        ]}
        empty={{ title: t.states.emptyTitle }}
      />
      <EmptyState title={t.states.emptyTitle} description={t.employees.emptyHint} actions={<Button>{t.common.add}</Button>} />
      <TableSkeleton rows={3} />
    </div>
  );
}

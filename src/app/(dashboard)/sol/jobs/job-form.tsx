"use client";

import Link from "next/link";
import { useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ProductOption } from "@/features/catalog/types";
import type { CustomerOption } from "@/features/customers/schema";
import { saveJobAction } from "@/features/sol/actions";
import type { JobType, Service, Staff } from "@/features/sol/queries";
import { jobSchema, type JobValues } from "@/features/sol/schema";
import { useI18n } from "@/i18n/context";
import { parseRupees, toDbAmount, type Paisa } from "@/lib/utils/money";
import { CustomerPicker } from "@/components/documents/customer-picker";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { itemsTotal, JobItems } from "./job-items";

export function JobForm({ jobId, defaults, customer, lockClient, types, staff, services, products, seesCosts, canAddClient, delivered }: {
  jobId: string | null;
  defaults: JobValues;
  customer: CustomerOption | null;
  /** The client of a confirmed job is fixed. */
  lockClient: boolean;
  types: JobType[];
  staff: Staff[];
  services: Service[];
  products: ProductOption[];
  seesCosts: boolean;
  canAddClient: boolean;
  /** Lines that are on a delivery: their kind, product and unit are fixed. */
  delivered: string[];
}) {
  const { t, locale } = useI18n();
  const s = t.sol;
  const [chosen, setChosen] = useState<CustomerOption | null>(customer);
  const name = (x: { nameEn: string; nameUr: string | null }) => (locale === "ur" && x.nameUr ? x.nameUr : x.nameEn);
  return (
    <DocumentForm<JobValues>
      defaults={defaults}
      resolver={zodResolver(jobSchema)}
      save={saveJobAction.bind(null, jobId)}
      openPath={(id) => `/sol/jobs/${id}`}
      cancelPath={jobId ? `/sol/jobs/${jobId}` : "/sol/jobs"}
      submitLabel={t.common.save}
      savedMessage={s.jobSaved}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={s.job} className="lg:grid-cols-3">
              <div className="grid content-start gap-2">
              <Field id="customerId" label={s.client} required error={errors.customerId?.message}>
                <CustomerPicker id="customerId" value={chosen} disabled={lockClient} onChange={(c) => { setChosen(c); form.setValue("customerId", c.id, { shouldDirty: true, shouldValidate: form.formState.isSubmitted }); }} />
              </Field>
              {canAddClient && !lockClient && <p className="text-xs text-muted-foreground">{s.newClient} <Link href="/customers/new" className="text-primary hover:underline">{t.customers.add}</Link></p>}
              </div>
              <Field id="typeId" label={s.type} required error={errors.typeId?.message}>
                <NativeSelect id="typeId" {...form.register("typeId")}>
                  <option value="">{t.documents.choose}</option>
                  {types.map((x) => <option key={x.id} value={x.id}>{name(x)}</option>)}
                </NativeSelect>
              </Field>
              <Field id="responsibleId" label={s.responsible} optional error={errors.responsibleId?.message}>
                <NativeSelect id="responsibleId" {...form.register("responsibleId")}>
                  <option value="">{s.nobody}</option>
                  {staff.map((x) => <option key={x.id} value={x.id}>{name(x)} ({x.code})</option>)}
                </NativeSelect>
              </Field>
              <Field id="contactName" label={s.contact} optional error={errors.contactName?.message}><Input id="contactName" {...form.register("contactName")} /></Field>
              <Field id="contactPhone" label={s.contactPhone} optional error={errors.contactPhone?.message}><Input id="contactPhone" dir="ltr" type="tel" {...form.register("contactPhone")} /></Field>
              <Field id="address" label={s.address} optional error={errors.address?.message}><Input id="address" {...form.register("address")} /></Field>
              <Field id="date" label={s.jobDate} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
              <Field id="startDate" label={s.startDate} optional error={errors.startDate?.message}><Input id="startDate" type="date" dir="ltr" {...form.register("startDate")} /></Field>
              <Field id="dueDate" label={s.dueDate} optional error={errors.dueDate?.message}><Input id="dueDate" type="date" dir="ltr" {...form.register("dueDate")} /></Field>
              <Field id="description" label={s.description} optional className="sm:col-span-2 lg:col-span-3" error={errors.description?.message}><Textarea id="description" rows={3} {...form.register("description")} /></Field>
            </FormSection>
            <Items types={types} services={services} products={products} seesCosts={seesCosts} delivered={delivered} />
            <FormSection title={s.contract} description={s.contractHint}>
              <Contract />
              <Field id="notes" label={t.documents.notes} optional error={errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
            </FormSection>
          </>
        );
      }}
    </DocumentForm>
  );
}

function Items(props: { types: JobType[]; services: Service[]; products: ProductOption[]; seesCosts: boolean; delivered: string[] }) {
  const typeId = useWatch<JobValues, "typeId">({ name: "typeId" });
  const type = props.types.find((x) => x.id === typeId);
  return <JobItems services={props.services} products={props.products} seesCosts={props.seesCosts} delivered={props.delivered} usesServices={type?.usesServices ?? true} usesProducts={type?.usesProducts ?? true} />;
}

/** The agreed amount, next to what the items add up to. */
function Contract() {
  const { t } = useI18n();
  const s = t.sol;
  const { register, setValue, formState: { errors }, control } = useFormContext<JobValues>();
  const [lines, contract] = useWatch({ control, name: ["lines", "contract"] });
  const total = itemsTotal(lines ?? []);
  let agreed: Paisa | null = null;
  try { agreed = parseRupees(contract ?? ""); } catch { /* still typing */ }
  const differs = total > BigInt(0) && agreed !== null && agreed !== total;
  return (
    <div className="grid content-start gap-2">
      <Field id="contract" label={s.contract} required error={errors.contract?.message}><MoneyInput id="contract" {...register("contract")} /></Field>
      {differs && <p className="text-xs text-warning">{s.itemsDiffer}</p>}
      {total > BigInt(0) && (agreed === null || differs) && (
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setValue("contract", toDbAmount(total), { shouldDirty: true, shouldValidate: true })}>{s.useItemsTotal}</Button>
      )}
    </div>
  );
}

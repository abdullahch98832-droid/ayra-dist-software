-- Reports name each person who paid or received with their share, where more than one did:
-- "Aftab Chattha (1,000,000.00), Mudassar Rao (1,000,000.00)" in place of the one account.
insert into public.app_settings (key, value, description) values
  ('schema_version', '"20261208100000"', 'Newest database migration applied')
on conflict (key) do update set value = excluded.value;

create or replace function private.people_names(p_people jsonb) returns text
language sql immutable set search_path = '' as $$
  select nullif(string_agg((c ->> 'name') || ' (' || to_char((c ->> 'amount')::numeric, 'FM999,999,999,999,990.00') || ')', ', ' order by o), '')
    from jsonb_array_elements(coalesce(p_people, '[]'::jsonb)) with ordinality as x(c, o);
$$;

create or replace function public.report_collections(p_from date, p_to date, p_collector_id uuid default null, p_method text default null)
returns table (entry_id uuid, payment_id uuid, doc_no text, payment_date date, customer_id uuid, customer text, customer_ur text, method public.payment_method, reference text,
               collector_en text, collector_ur text, destination text, held boolean, is_reversal boolean, amount numeric, settled numeric, on_account numeric, invoices text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_own uuid;
begin
  if not (private.has_permission('receivables.post') or (private.has_permission('receivables.view') and private.has_permission('sales.view_all'))) then
    perform private.require_permission('receivables.collect');
    v_own := coalesce(private.current_employee_id(), '00000000-0000-0000-0000-000000000000');
  end if;
  return query
  select je.id, p.id, p.doc_no, je.entry_date, c.id, c.name, c.name_ur, p.method, p.reference, e.full_name, e.full_name_ur, coalesce(private.people_names(p.contributors), fa.name),
         p.financial_account_id is null, je.reversal_of is not null, l.amount, case when p.status = 'posted' then coalesce(a.settled, 0) else 0 end,
         l.amount - case when p.status = 'posted' then coalesce(a.settled, 0) else 0 end, case when p.status = 'posted' then a.invoices end
    from public.journal_entries je
    join public.customer_payments p on p.id = je.source_id
    join public.customers c on c.id = p.customer_id
    join lateral (select sum(x.credit - x.debit) as amount from public.journal_entry_lines x where x.journal_entry_id = je.id and x.account_id = private.account_id('AR')) l on l.amount is not null
    left join public.employees e on e.id = p.collected_by
    left join public.financial_accounts fa on fa.id = p.financial_account_id
    left join (select pa.customer_payment_id, sum(pa.amount) as settled, string_agg(coalesce(i.doc_no, j.doc_no), ', ' order by coalesce(i.doc_no, j.doc_no)) as invoices
                 from public.customer_payment_allocations pa
                 left join public.sales_invoices i on i.id = pa.sales_invoice_id
                 left join public.sol_jobs j on j.id = pa.sol_job_id
                group by pa.customer_payment_id) a on a.customer_payment_id = p.id
   where je.status = 'posted' and je.source_type = 'customer_payment' and je.entry_date between p_from and p_to
     and (v_own is null or p.collected_by = v_own)
     and (p_collector_id is null or p.collected_by = p_collector_id)
     and (p_method is null or p.method::text = p_method)
   order by je.entry_date desc, p.doc_no desc, je.doc_no desc;
end;
$$;

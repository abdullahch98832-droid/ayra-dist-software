-- An approved expense voucher can be corrected by whoever may approve vouchers.
-- The posted entry is never edited: when the money changes it is reversed and a corrected one is posted.
-- Drafts keep working as before, and the people who paid are saved on both.
insert into public.app_settings (key, value, description) values
  ('schema_version', '"20261205100000"', 'Newest database migration applied')
on conflict (key) do update set value = excluded.value;

create or replace function public.update_expense(p_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.expenses%rowtype;
  v_new public.expenses%rowtype;
  v_problem text;
  v_gl uuid;
  v_je uuid;
begin
  if not private.has_permission('expenses.post') then
    perform private.require_permission('expenses.create');
  end if;
  select * into v_old from public.expenses where id = p_id for update;
  if v_old.id is null or not (private.has_permission('expenses.post') or coalesce(v_old.created_by = auth.uid(), false)) then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if v_old.status <> 'draft' and not (v_old.status = 'posted' and private.has_permission('expenses.post')) then
    raise exception 'Expense % is already %', v_old.doc_no, v_old.status using errcode = '23514';
  end if;
  perform private.check_expense_input(p_doc);
  if (p_doc ->> 'date')::date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;

  update public.expenses
     set expense_date = coalesce((p_doc ->> 'date')::date, expense_date), category_id = (p_doc ->> 'category_id')::uuid, amount = (p_doc ->> 'amount')::numeric,
         financial_account_id = (p_doc ->> 'financial_account_id')::uuid, method = (p_doc ->> 'method')::public.payment_method, reference = nullif(trim(p_doc ->> 'reference'), ''),
         payee = nullif(trim(p_doc ->> 'payee'), ''), description = nullif(trim(p_doc ->> 'description'), ''), vehicle_id = (p_doc ->> 'vehicle_id')::uuid,
         sol_job_id = (p_doc ->> 'sol_job_id')::uuid, litres = (p_doc ->> 'litres')::numeric, odometer = (p_doc ->> 'odometer')::bigint,
         receipt_path = coalesce(nullif(p_doc ->> 'receipt_path', ''), receipt_path), no_receipt_reason = nullif(trim(p_doc ->> 'no_receipt_reason'), ''),
         contributors = private.clean_contributors(p_doc -> 'contributors', (p_doc ->> 'amount')::numeric)
   where id = p_id
  returning * into v_new;

  if v_old.status = 'posted' then
    v_problem := private.expense_problem(v_new);
    if v_problem is not null then raise exception '%', v_problem using errcode = '23514'; end if;
    -- Payee, people, notes or a receipt do not touch the accounts; the money side does.
    if (v_new.amount, v_new.category_id, v_new.financial_account_id, v_new.expense_date, v_new.description)
       is distinct from (v_old.amount, v_old.category_id, v_old.financial_account_id, v_old.expense_date, v_old.description) then
      perform private.reverse_journal(v_old.journal_entry_id, v_old.expense_date, 'Corrected');
      select gl_account_id into v_gl from public.expense_categories where id = v_new.category_id;
      v_je := private.post_journal(v_new.expense_date,
        'Expense ' || v_new.doc_no || ': ' || v_new.description, 'expense', v_new.id,
        jsonb_build_array(
          jsonb_build_object('account_id', v_gl, 'debit', v_new.amount, 'employee_id', v_new.employee_id),
          jsonb_build_object('account_id', private.financial_gl(v_new.financial_account_id), 'credit', v_new.amount)));
      update public.expenses set journal_entry_id = v_je where id = p_id;
    end if;
  end if;
  return p_id;
end;
$$;

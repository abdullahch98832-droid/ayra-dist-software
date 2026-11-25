-- PREVIEW ONLY: this file changes nothing.
-- Run it in the Supabase SQL Editor before clear-all-data.sql to see which logins stay and how many rows are cleared.
select 'Login' as what, coalesce(u.email, u.id::text) as name,
       case when r.code = 'super_admin' and p.is_active then 'KEEP' else 'DELETE' end as result
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.roles r on r.id = p.role_id
union all
select 'Rows now', t.tablename,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.tablename), false, true, '')))[1]::text
  from pg_tables t where t.schemaname = 'public'
   and t.tablename not in ('app_settings', 'chart_of_accounts', 'document_sequences', 'expense_categories', 'permissions',
                           'roles', 'role_permissions', 'sol_job_types', 'units')
 order by 1, 3 desc, 2;

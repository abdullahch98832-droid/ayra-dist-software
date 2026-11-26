-- The distributor's own name on its papers: AM Traders, a distributor of Ayra Happiness products.
-- Only the old default is replaced; a name an administrator typed in stays.
insert into public.app_settings (key, value, description) values
  ('schema_version', '"20261209100000"', 'Newest database migration applied')
on conflict (key) do update set value = excluded.value;

update public.app_settings set value = '"AM TRADERS"' where key = 'company_name' and value = '"AYRA HAPPINESS"'::jsonb;
update public.app_settings set value = '"اے ایم ٹریڈرز"' where key = 'company_name_ur' and value = '"آئرا ہیپینیس"'::jsonb;

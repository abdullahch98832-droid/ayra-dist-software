-- Reference data required in every environment (including production).
-- Contains configuration only: no transactions, balances or stock.

insert into public.permissions (code, module, description_en, description_ur) values
  ('dashboard.view', 'dashboard', 'View dashboard', 'ڈیش بورڈ دیکھیں'),
  ('users.view', 'users', 'View users and roles', 'صارفین اور کردار دیکھیں'),
  ('users.manage', 'users', 'Manage users, roles and permissions', 'صارفین، کردار اور اجازتوں کا انتظام'),
  ('employees.view', 'employees', 'View employees', 'ملازمین دیکھیں'),
  ('employees.manage', 'employees', 'Manage employees', 'ملازمین کا انتظام'),
  ('products.view', 'products', 'View products and units', 'مصنوعات اور اکائیاں دیکھیں'),
  ('products.manage', 'products', 'Manage products, categories and units', 'مصنوعات، زمرے اور اکائیوں کا انتظام'),
  ('warehouses.view', 'warehouses', 'View warehouses', 'گودام دیکھیں'),
  ('warehouses.manage', 'warehouses', 'Manage warehouses', 'گوداموں کا انتظام'),
  ('inventory.view', 'inventory', 'View stock, movements and valuation', 'اسٹاک، نقل و حرکت اور مالیت دیکھیں'),
  ('inventory.adjust', 'inventory', 'Post stock adjustments, opening stock, write-offs and counts', 'اسٹاک ایڈجسٹمنٹ، ابتدائی اسٹاک، رائٹ آف اور گنتی پوسٹ کریں'),
  ('inventory.transfer', 'inventory', 'Create and post stock transfers', 'اسٹاک منتقلی بنائیں اور پوسٹ کریں'),
  ('inventory.count', 'inventory', 'Record physical stock counts', 'اسٹاک کی گنتی درج کریں'),
  ('purchasing.view', 'purchasing', 'View purchase orders, receipts and supplier invoices', 'خریداری آرڈر، وصولیاں اور سپلائر انوائس دیکھیں'),
  ('purchasing.create', 'purchasing', 'Create purchasing documents', 'خریداری دستاویزات بنائیں'),
  ('purchasing.approve', 'purchasing', 'Approve or cancel purchase orders', 'خریداری آرڈر منظور یا منسوخ کریں'),
  ('purchasing.post', 'purchasing', 'Post goods receipts, supplier invoices and returns', 'مال کی وصولی، سپلائر انوائس اور واپسی پوسٹ کریں'),
  ('suppliers.view', 'suppliers', 'View suppliers', 'سپلائرز دیکھیں'),
  ('suppliers.manage', 'suppliers', 'Manage suppliers', 'سپلائرز کا انتظام'),
  ('payables.view', 'payables', 'View supplier and company ledgers', 'سپلائر اور کمپنی لیجر دیکھیں'),
  ('payables.pay', 'payables', 'Record and post supplier payments', 'سپلائر ادائیگیاں درج اور پوسٹ کریں'),
  ('customers.view', 'customers', 'View customers', 'گاہک دیکھیں'),
  ('customers.manage', 'customers', 'Manage customers and credit limits', 'گاہکوں اور کریڈٹ حد کا انتظام'),
  ('sales.view', 'sales', 'View own sales orders and invoices', 'اپنے سیلز آرڈر اور انوائس دیکھیں'),
  ('sales.view_all', 'sales', 'View all sales orders, invoices and deliveries', 'تمام سیلز آرڈر، انوائس اور ڈلیوریاں دیکھیں'),
  ('sales.create', 'sales', 'Create sales orders', 'سیلز آرڈر بنائیں'),
  ('sales.approve', 'sales', 'Approve or cancel sales orders', 'سیلز آرڈر منظور یا منسوخ کریں'),
  ('sales.credit_override', 'sales', 'Override customer credit limits', 'گاہک کی کریڈٹ حد سے تجاوز کی اجازت'),
  ('sales.dispatch', 'sales', 'Create and dispatch deliveries', 'ڈلیوری بنائیں اور روانہ کریں'),
  ('sales.invoice', 'sales', 'Create and post direct sales invoices', 'براہ راست سیلز انوائس بنائیں اور پوسٹ کریں'),
  ('sales.return', 'sales', 'Record and post customer returns', 'گاہک کی واپسی درج اور پوسٹ کریں'),
  ('receivables.view', 'receivables', 'View customer ledgers and balances', 'گاہک لیجر اور بیلنس دیکھیں'),
  ('receivables.collect', 'receivables', 'Record customer collections', 'گاہک سے وصولی درج کریں'),
  ('receivables.post', 'receivables', 'Post and allocate customer payments', 'گاہک کی ادائیگی پوسٹ اور مختص کریں'),
  ('sol.view', 'sol', 'View SOL jobs and trips', 'ایس او ایل کام اور دورے دیکھیں'),
  ('sol.manage', 'sol', 'Manage SOL jobs and trips', 'ایس او ایل کام اور دوروں کا انتظام'),
  ('sol.post', 'sol', 'Complete SOL jobs (books revenue)', 'ایس او ایل کام مکمل کریں (آمدنی درج)'),
  ('vehicles.view', 'vehicles', 'View vehicles and drivers', 'گاڑیاں اور ڈرائیور دیکھیں'),
  ('vehicles.manage', 'vehicles', 'Manage vehicles and drivers', 'گاڑیوں اور ڈرائیوروں کا انتظام'),
  ('expenses.view', 'expenses', 'View expenses', 'اخراجات دیکھیں'),
  ('expenses.create', 'expenses', 'Record expenses', 'اخراجات درج کریں'),
  ('expenses.post', 'expenses', 'Post and void expenses; manage categories', 'اخراجات پوسٹ اور منسوخ کریں؛ زمروں کا انتظام'),
  ('payroll.view', 'payroll', 'View payroll, advances and salary balances', 'تنخواہیں، ایڈوانس اور بیلنس دیکھیں'),
  ('payroll.manage', 'payroll', 'Prepare payroll and advances', 'تنخواہ اور ایڈوانس تیار کریں'),
  ('payroll.post', 'payroll', 'Post payroll runs', 'تنخواہ پوسٹ کریں'),
  ('payroll.pay', 'payroll', 'Pay salaries and advances', 'تنخواہ اور ایڈوانس ادا کریں'),
  ('cash_bank.view', 'cash_bank', 'View cash and bank accounts', 'نقد اور بینک اکاؤنٹس دیکھیں'),
  ('cash_bank.manage', 'cash_bank', 'Manage cash and bank accounts', 'نقد اور بینک اکاؤنٹس کا انتظام'),
  ('cash_bank.transfer', 'cash_bank', 'Transfer funds between accounts', 'اکاؤنٹس کے درمیان رقم منتقل کریں'),
  ('accounting.view', 'accounting', 'View journals and the general ledger', 'جرنل اور جنرل لیجر دیکھیں'),
  ('accounting.journal', 'accounting', 'Post and reverse manual journal entries', 'دستی جرنل اندراجات پوسٹ اور واپس کریں'),
  ('accounting.manage', 'accounting', 'Manage chart of accounts and accounting periods', 'اکاؤنٹس کی فہرست اور مالی ادوار کا انتظام'),
  ('reports.view', 'reports', 'View operational reports', 'آپریشنل رپورٹس دیکھیں'),
  ('reports.financial', 'reports', 'View financial reports (P&L, trial balance)', 'مالیاتی رپورٹس دیکھیں (نفع و نقصان، ٹرائل بیلنس)'),
  ('audit.view', 'audit', 'View audit log', 'آڈٹ لاگ دیکھیں'),
  ('settings.manage', 'settings', 'Manage application settings and document numbering', 'ترتیبات اور دستاویز نمبرنگ کا انتظام');

insert into public.roles (code, name_en, name_ur, description, is_system) values
  ('admin', 'Administrator', 'منتظم', 'Full access', true),
  ('manager', 'Manager', 'مینیجر', 'All operations; cannot manage users or settings', true),
  ('accountant', 'Accountant', 'اکاؤنٹنٹ', 'Finance, payables, receivables, payroll, expenses', true),
  ('warehouse', 'Warehouse Staff', 'گودام عملہ', 'Receiving, transfers, counts, dispatch, returns', true),
  ('order_taker', 'Order Taker', 'آرڈر ٹیکر', 'Own customers'' orders and collections', true),
  ('driver', 'Driver', 'ڈرائیور', 'Assigned deliveries and SOL', true),
  ('viewer', 'Viewer', 'ناظر', 'Read-only operational access', true);

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
  from public.roles r
  join public.permissions p on
       r.code = 'admin'
    or (r.code = 'manager' and p.code not in ('users.manage', 'settings.manage'))
    or (r.code = 'accountant' and p.code in (
          'dashboard.view', 'reports.view', 'reports.financial', 'audit.view',
          'accounting.view', 'accounting.journal', 'accounting.manage',
          'cash_bank.view', 'cash_bank.manage', 'cash_bank.transfer',
          'payables.view', 'payables.pay', 'receivables.view', 'receivables.collect', 'receivables.post',
          'expenses.view', 'expenses.create', 'expenses.post',
          'payroll.view', 'payroll.manage', 'payroll.post', 'payroll.pay',
          'suppliers.view', 'customers.view', 'purchasing.view', 'purchasing.create', 'purchasing.post',
          'sales.view', 'sales.view_all', 'inventory.view', 'products.view', 'warehouses.view',
          'sol.view', 'employees.view', 'vehicles.view'))
    or (r.code = 'warehouse' and p.code in (
          'dashboard.view', 'products.view', 'warehouses.view',
          'inventory.view', 'inventory.transfer', 'inventory.count',
          'purchasing.view', 'purchasing.create', 'purchasing.post', 'suppliers.view',
          'sales.view', 'sales.view_all', 'sales.dispatch', 'sales.return', 'customers.view',
          'vehicles.view', 'sol.view'))
    or (r.code = 'order_taker' and p.code in (
          'dashboard.view', 'products.view', 'customers.view', 'sales.view', 'sales.create',
          'receivables.view', 'receivables.collect'))
    or (r.code = 'driver' and p.code in ('dashboard.view', 'sales.view', 'sol.view', 'vehicles.view'))
    or (r.code = 'viewer' and p.code in (
          'dashboard.view', 'products.view', 'warehouses.view', 'inventory.view', 'purchasing.view',
          'suppliers.view', 'customers.view', 'sales.view', 'sales.view_all', 'sol.view', 'vehicles.view',
          'reports.view'));

insert into public.units (code, name_en, name_ur) values
  ('PCS', 'Piece', 'عدد'),
  ('PKT', 'Packet', 'پیکٹ'),
  ('BOX', 'Box', 'ڈبہ'),
  ('CTN', 'Carton', 'کارٹن');

-- Chart of accounts (starting structure; extend as needed).
insert into public.chart_of_accounts (code, name_en, name_ur, account_type, is_postable, system_key) values
  ('1000', 'Assets', 'اثاثے', 'asset', false, null),
  ('2000', 'Liabilities', 'واجبات', 'liability', false, null),
  ('3000', 'Equity', 'سرمایہ', 'equity', false, null),
  ('4000', 'Income', 'آمدنی', 'income', false, null),
  ('5000', 'Cost of Sales', 'فروخت کی لاگت', 'expense', false, null),
  ('6000', 'Operating Expenses', 'آپریٹنگ اخراجات', 'expense', false, null);

insert into public.chart_of_accounts (code, name_en, name_ur, account_type, is_postable, system_key, parent_id)
select v.code, v.name_en, v.name_ur, v.account_type::public.account_type, v.is_postable, v.system_key,
       (select id from public.chart_of_accounts where code = v.parent)
  from (values
    ('1100', 'Cash Accounts', 'نقد اکاؤنٹس', 'asset', false, 'CASH_PARENT', '1000'),
    ('1150', 'Bank Accounts', 'بینک اکاؤنٹس', 'asset', false, 'BANK_PARENT', '1000'),
    ('1200', 'Accounts Receivable — Customers', 'وصول طلب — گاہک', 'asset', true, 'AR', '1000'),
    ('1300', 'Inventory', 'انوینٹری', 'asset', true, 'INVENTORY', '1000'),
    ('1400', 'Employee Advances', 'ملازمین کو ایڈوانس', 'asset', true, 'EMPLOYEE_ADVANCES', '1000'),
    ('1600', 'Fixed Assets', 'مستقل اثاثے', 'asset', true, null, '1000'),
    ('2100', 'Payable — Ayra Happiness (Main Company)', 'واجب الادا — آئرا ہیپینیس (مرکزی کمپنی)', 'liability', true, 'AP_PRINCIPAL', '2000'),
    ('2200', 'Payable — Suppliers', 'واجب الادا — سپلائرز', 'liability', true, 'AP_SUPPLIERS', '2000'),
    ('2300', 'Sales Tax Payable', 'سیلز ٹیکس واجب الادا', 'liability', true, 'TAX_OUTPUT', '2000'),
    ('2400', 'Salaries Payable', 'تنخواہیں واجب الادا', 'liability', true, 'SALARIES_PAYABLE', '2000'),
    ('3100', 'Owner''s Capital', 'مالک کا سرمایہ', 'equity', true, 'CAPITAL', '3000'),
    ('3200', 'Owner''s Drawings', 'مالک کی وصولیاں', 'equity', true, 'DRAWINGS', '3000'),
    ('3300', 'Opening Balance Equity', 'ابتدائی بیلنس سرمایہ', 'equity', true, 'OPENING_EQUITY', '3000'),
    ('3900', 'Retained Earnings', 'برقرار منافع', 'equity', true, 'RETAINED_EARNINGS', '3000'),
    ('4100', 'Sales Revenue', 'فروخت کی آمدنی', 'income', true, 'SALES', '4000'),
    ('4150', 'Sales Returns', 'فروخت کی واپسی', 'income', true, 'SALES_RETURNS', '4000'),
    ('4200', 'SOL Transport Revenue', 'ایس او ایل ٹرانسپورٹ آمدنی', 'income', true, 'SOL_REVENUE', '4000'),
    ('4900', 'Other Income', 'دیگر آمدنی', 'income', true, 'OTHER_INCOME', '4000'),
    ('5100', 'Cost of Goods Sold', 'فروخت شدہ مال کی لاگت', 'expense', true, 'COGS', '5000'),
    ('5200', 'Inventory Adjustments & Variances', 'انوینٹری ایڈجسٹمنٹ اور فرق', 'expense', true, 'INVENTORY_VARIANCE', '5000'),
    ('5300', 'Damaged Stock Written Off', 'خراب مال کا نقصان', 'expense', true, 'STOCK_WRITE_OFF', '5000'),
    ('6100', 'Salaries and Wages', 'تنخواہیں اور اجرت', 'expense', true, 'SALARIES_EXPENSE', '6000'),
    ('6200', 'Fuel / Petrol', 'پیٹرول', 'expense', true, null, '6000'),
    ('6300', 'Rent', 'کرایہ', 'expense', true, null, '6000'),
    ('6400', 'Utilities', 'یوٹیلیٹیز', 'expense', true, null, '6000'),
    ('6500', 'Staff Refreshments', 'عملے کے لیے چائے پانی', 'expense', true, null, '6000'),
    ('6600', 'Vehicle Maintenance', 'گاڑیوں کی مرمت', 'expense', true, null, '6000'),
    ('6700', 'Office and General', 'دفتری و عمومی', 'expense', true, null, '6000'),
    ('6800', 'Bank Charges', 'بینک چارجز', 'expense', true, null, '6000'),
    ('6900', 'Miscellaneous Expenses', 'متفرق اخراجات', 'expense', true, null, '6000')
  ) as v(code, name_en, name_ur, account_type, is_postable, system_key, parent);

insert into public.expense_categories (code, name_en, name_ur, gl_account_id)
select v.code, v.name_en, v.name_ur, (select id from public.chart_of_accounts where code = v.account)
  from (values
    ('FUEL', 'Petrol / Fuel', 'پیٹرول', '6200'),
    ('RENT', 'Rent', 'کرایہ', '6300'),
    ('UTILITIES', 'Utilities', 'یوٹیلیٹیز', '6400'),
    ('REFRESHMENTS', 'Snacks / Refreshments', 'چائے پانی', '6500'),
    ('VEHICLE_MAINTENANCE', 'Vehicle Maintenance', 'گاڑی کی مرمت', '6600'),
    ('OFFICE', 'Office and General', 'دفتری و عمومی', '6700'),
    ('BANK_CHARGES', 'Bank Charges', 'بینک چارجز', '6800'),
    ('MISC', 'Miscellaneous', 'متفرق', '6900')
  ) as v(code, name_en, name_ur, account);

insert into public.document_sequences (doc_type, prefix, description) values
  ('JV', 'JV-', 'Journal voucher'),
  ('FTR', 'FTR-', 'Fund transfer'),
  ('ADJ', 'ADJ-', 'Stock adjustment'),
  ('CNT', 'CNT-', 'Stock count'),
  ('TRF', 'TRF-', 'Stock transfer'),
  ('PO', 'PO-', 'Purchase order'),
  ('GRN', 'GRN-', 'Goods receipt'),
  ('SBL', 'SBL-', 'Supplier invoice'),
  ('SPAY', 'SPAY-', 'Supplier payment'),
  ('SRET', 'SRET-', 'Supplier return'),
  ('SO', 'SO-', 'Sales order'),
  ('INV', 'INV-', 'Sales invoice'),
  ('DLV', 'DLV-', 'Delivery'),
  ('CRET', 'CRET-', 'Customer return'),
  ('RCPT', 'RCPT-', 'Customer payment receipt'),
  ('SOLJ', 'SOLJ-', 'SOL transport job'),
  ('SOLT', 'SOLT-', 'SOL vehicle trip'),
  ('EXP', 'EXP-', 'Expense'),
  ('ADV', 'ADV-', 'Employee advance'),
  ('PAY', 'PAY-', 'Payroll run'),
  ('SAL', 'SAL-', 'Salary payment');

insert into public.app_settings (key, value, description) values
  ('company_name', '"AYRA HAPPINESS"', 'Business name on documents'),
  ('company_name_ur', '"آئرا ہیپینیس"', 'Business name in Urdu'),
  ('currency', '"PKR"', 'Currency code'),
  ('inventory_costing_method', '"weighted_average"', 'Informational. Costing is implemented as company-wide weighted average.'),
  ('reserve_stock_on_approval', 'true', 'Approved sales orders reserve stock until dispatch');

insert into public.warehouses (code, name_en, name_ur, warehouse_type) values
  ('MAIN', 'Main Warehouse', 'مرکزی گودام', 'main'),
  ('DAMAGED', 'Damaged Goods', 'خراب مال', 'damaged');

insert into public.suppliers (code, name, name_ur, is_principal) values
  ('AYRA', 'Ayra Happiness', 'آئرا ہیپینیس', true);

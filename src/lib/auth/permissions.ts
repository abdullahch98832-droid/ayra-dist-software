// Mirrors public.permissions (a database test keeps the two in sync).
export const PERMISSIONS = [
  "dashboard.view",
  "users.view", "users.manage",
  "employees.view", "employees.manage",
  "products.view", "products.manage",
  "warehouses.view", "warehouses.manage",
  "inventory.view", "inventory.adjust", "inventory.transfer", "inventory.count", "inventory.negative_override",
  "purchasing.view", "purchasing.create", "purchasing.approve", "purchasing.post",
  "suppliers.view", "suppliers.manage",
  "payables.view", "payables.pay",
  "company.view", "company.pay",
  "customers.view", "customers.manage",
  "sales.view", "sales.view_all", "sales.create", "sales.approve", "sales.credit_override",
  "sales.dispatch", "sales.invoice", "sales.return", "sales.team",
  "receivables.view", "receivables.collect", "receivables.post", "receivables.adjust",
  "sol.view", "sol.view_all", "sol.manage", "sol.dispatch", "sol.post",
  "vehicles.view", "vehicles.manage",
  "expenses.view", "expenses.create", "expenses.post",
  "payroll.view", "payroll.manage", "payroll.post", "payroll.pay",
  "cash_bank.view", "cash_bank.manage", "cash_bank.transfer",
  "accounting.view", "accounting.journal", "accounting.manage",
  "costs.view",
  "reports.view", "reports.financial",
  "audit.view",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/** Display order of permission modules in the role editor. */
export const PERMISSION_MODULES = [
  "dashboard", "inventory", "products", "warehouses", "purchasing", "sales", "customers", "receivables",
  "suppliers", "payables", "company", "sol", "vehicles", "expenses", "salaries", "cash_bank",
  "accounting", "costs", "reports", "employees", "users", "audit", "settings",
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

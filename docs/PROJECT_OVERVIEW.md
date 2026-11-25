# AYRA HAPPINESS — Project Overview

## About

AYRA HAPPINESS Distribution Management System (DMS) is a production-grade enterprise application built for a **distributor** of Ayra Happiness products. The owner of the software is not the Ayra company. The distributor:

- Takes goods from the Ayra company, at its prices, and from external suppliers
- Stores products in a warehouse with full inventory tracking
- Supplies shops with what its order takers bring as orders, and collects the payments
- In SOL, supplies distributors of other cities: a call brings the order, the goods are ordered from Ayra for it, received, supplied and paid. Other SOL jobs stay beside these orders
- Tracks all financial transactions, expenses, and profitability

## Business Entity

- **Shown name:** AYRA HAPPINESS, with "Distributor" under it
- **Type:** Distributor of Ayra Happiness products
- **Operations:** Purchase → Warehouse → Sales → Delivery → Collection
- **Software Developer:** Webcore Solutions

## Key Stakeholders

- Business owner / management
- Warehouse staff
- Order takers (field sales)
- Delivery drivers
- Accounts / finance team
- System administrators

## Application Modules

| # | Module | Description |
|---|--------|-------------|
| 1 | Dashboard | Real-time business overview |
| 2 | Products | Product catalog with unit management |
| 3 | Warehouse | Stock in/out, damaged goods, reconciliation |
| 4 | Inventory | Real-time stock levels and valuation |
| 5 | Purchases | Purchases from the Ayra company and suppliers |
| 6 | Ayra account | What is owed to the Ayra company |
| 7 | Suppliers | Supplier profiles, invoices, payments |
| 8 | Customers | Shop profiles, credit limits, areas |
| 9 | Sales & Orders | Order creation, approval, invoicing |
| 10 | Order Takers | Field sales staff management |
| 11 | Deliveries | Dispatch, delivery confirmation, returns |
| 12 | SOL | Orders of distributors of other cities; jobs with contract, payments and costs |
| 13 | Vehicles | Fleet management |
| 14 | Expenses | Business expense tracking |
| 15 | Employees | HR profiles and status |
| 16 | Payroll | Salary, advances, deductions |
| 17 | Cash & Bank | Cash and bank account management |
| 18 | Accounting | Double-entry bookkeeping |
| 19 | Profit & Loss | Financial reporting |
| 20 | Invoices | Sales and purchase invoice generation |
| 21 | Reports | Business intelligence and analytics |
| 22 | Users | User accounts and authentication |
| 23 | Permissions | Role-based access control |
| 24 | Audit Log | System activity tracking |
| 25 | Settings | System configuration |

## Languages

- English (LTR)
- Urdu (RTL)

## Technology Stack

- Next.js 16 (App Router)
- TypeScript (strict mode)
- Supabase (PostgreSQL, Auth, Storage, RLS)
- Tailwind CSS 4
- shadcn/ui
- React Hook Form + Zod
- Deployment: Vercel

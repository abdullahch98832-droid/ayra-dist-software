# Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────┐
│                   Client                     │
│  Next.js App Router (React Server Components)│
│  + Client Components for interactivity       │
├─────────────────────────────────────────────┤
│              Next.js API Layer               │
│  Server Actions / Route Handlers             │
├─────────────────────────────────────────────┤
│              Supabase Client                 │
│  Auth │ Database │ Storage │ Realtime        │
├─────────────────────────────────────────────┤
│              PostgreSQL                      │
│  Tables │ RLS Policies │ Functions │ Triggers│
└─────────────────────────────────────────────┘
```

## Application Architecture

### Frontend

- **Framework:** Next.js 16 with App Router
- **Rendering:** Server Components by default, Client Components where interactivity is needed
- **Styling:** Tailwind CSS 4 with shadcn/ui component library
- **Forms:** React Hook Form with Zod validation
- **State:** React Context for global state (auth, locale), server state via RSC
- **i18n:** Custom dictionary-based system with RTL support for Urdu

### Backend

- **Database:** Supabase PostgreSQL
- **Authentication:** Supabase Auth with email/password
- **Authorization:** Row Level Security (RLS) policies on all tables
- **File Storage:** Supabase Storage for documents, images, PDFs
- **API:** Next.js Server Actions and Route Handlers

### Key Design Decisions

1. **Exact money:** Postgres `numeric(18,2)`; in TypeScript converted to integer paisa (`bigint`) via `toPaisa()` before any arithmetic. Totals are computed in the database.

2. **Double-entry accounting:** Every financial transaction creates a balanced, immutable journal entry — see ACCOUNTING_RULES.md.

3. **Weighted average costing** (confirmed), company-wide per product — see INVENTORY_RULES.md.

4. **Business logic in the database:** Posting, stock movement and approvals are Postgres functions running in one transaction with row locks, so every client (web, future mobile) gets identical rules and concurrency safety.

5. **Audit trail:** All data-modifying operations are logged with user, timestamp, and before/after values.

6. **No deletion of posted records:** Drafts can be deleted; posted documents are corrected by voids, returns or reversing entries. Master data is deactivated (`is_active`) rather than deleted.

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Authentication pages (login, forgot-password)
│   ├── (dashboard)/       # Protected dashboard pages
│   └── api/               # API route handlers
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── layout/            # Header, sidebar, footer, navigation
│   ├── dashboard/         # Dashboard-specific components
│   ├── forms/             # Reusable form components
│   ├── tables/            # Data table components
│   └── shared/            # Shared components across features
├── features/              # Feature-specific logic
│   ├── inventory/
│   ├── purchasing/
│   ├── sales/
│   ├── customers/
│   ├── suppliers/
│   ├── sol/
│   ├── vehicles/
│   ├── expenses/
│   ├── accounting/
│   ├── employees/
│   ├── reports/
│   └── documents/
├── lib/                   # Shared libraries
│   ├── supabase/          # Supabase client configuration
│   ├── auth/              # Authentication utilities
│   ├── permissions/       # RBAC utilities
│   ├── validation/        # Shared Zod schemas
│   ├── accounting/        # Accounting engine
│   ├── inventory/         # Inventory calculations
│   ├── pdf/               # PDF generation
│   └── utils/             # General utilities
├── hooks/                 # Custom React hooks
├── types/                 # TypeScript type definitions
├── i18n/                  # Internationalization dictionaries
└── config/                # Application configuration
```

## Module Dependency Diagram

```
                    ┌──────────┐
                    │ Dashboard│
                    └────┬─────┘
                         │ reads from all modules
         ┌───────────────┼───────────────┐
         │               │               │
   ┌─────▼─────┐  ┌─────▼─────┐  ┌──────▼─────┐
   │ Purchasing │  │   Sales   │  │    SOL     │
   └─────┬─────┘  └─────┬─────┘  └──────┬─────┘
         │               │               │
         ▼               ▼               ▼
   ┌───────────────────────────────────────────┐
   │              Inventory / Warehouse         │
   │  (stock in, stock out, valuation)         │
   └────────────────────┬──────────────────────┘
                        │
                        ▼
   ┌───────────────────────────────────────────┐
   │              Accounting Engine             │
   │  (journal entries, ledgers, P&L)          │
   └────────────────────┬──────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
   ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
   │  Expenses │ │ Cash/Bank │ │  Payroll  │
   └───────────┘ └───────────┘ └───────────┘
```

## Authentication Architecture

- Supabase Auth handles user registration, login, password reset
- JWT tokens stored in HTTP-only cookies via Supabase SSR
- Middleware refreshes sessions on every request
- Server Components verify auth state before rendering

## Authorization Architecture

- Role-based access control (RBAC) with granular permissions
- Roles: admin, manager, accountant, warehouse_staff, order_taker, driver, viewer
- Permissions checked at three levels:
  1. **UI:** Navigation items and buttons hidden based on role
  2. **Server:** Server Actions verify permissions before execution
  3. **Database:** RLS policies enforce access at the data layer

## PDF Architecture

- Server-side PDF generation for invoices, reports, statements
- Support for Urdu text rendering with proper RTL layout
- Templates: Sales Invoice, Purchase Invoice, Delivery Note, Statement, P&L Report

## Deployment Architecture

- **Frontend + API:** Vercel (serverless)
- **Database:** Supabase (managed PostgreSQL)
- **Storage:** Supabase Storage
- **DNS:** Custom domain via Vercel

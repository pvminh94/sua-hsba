# Migration: React/Vite + TypeScript + Tailwind + shadcn/ui + Express/Node.js

This branch is the migration target for `pvminh94/sua-hsba`.

## Architecture

- `apps/web`: React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- `apps/api`: Express + Node.js + TypeScript
- SQLite is retained during migration to avoid changing the data model prematurely.
- Existing Flask routes and workflows are being migrated to JSON APIs.

## Migration order

1. Scaffold and shared development scripts
2. Port SQLite schema/data access
3. Port authentication, sessions, CSRF and role checks
4. Port request CRUD and three-stage electronic confirmation workflow
5. Port PDF export
6. Port admin user management
7. Rebuild all screens with shadcn/ui
8. Remove the Flask/Jinja runtime after parity verification

## Run

```bash
npm install
npm run dev
```

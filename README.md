# RailLog — Cloudflare Pages Version

This project has been converted from a Base44 export into a Cloudflare Pages app.

## What changed

- Removed the Base44 Vite plugin from the build config.
- Added a normal Vite alias for `@/` imports.
- Replaced the Base44 client with a Cloudflare Pages API client.
- Added Cloudflare Pages Functions under `functions/api/entities/`.
- Added a generic D1 table migration for all app data.
- Removed the invalid `_redirects` SPA rule and switched the app to `HashRouter`, so refresh/back/forward works without Cloudflare redirect warnings.
- Added `/api/health` to initialize and verify the D1 table.

## Cloudflare Pages build settings

Use these settings in Cloudflare Pages:

```txt
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Node version: 20 or later
```

## D1 setup

Create a D1 database, then add a Pages binding:

```txt
Binding name: DB
Database: your D1 database
```

The Pages Function will automatically create the required table when the app opens or when you visit `/api/health`. The migration is also included here:

```txt
migrations/0001_entity_records.sql
```

## Optional local Wrangler setup

A sample file is included:

```txt
wrangler.example.toml
```

To use Wrangler locally:

1. Rename `wrangler.example.toml` to `wrangler.toml`.
2. Replace `PUT_YOUR_D1_DATABASE_ID_HERE` with your real D1 Database ID.
3. Run the migration with Wrangler if you want to prepare the database manually.

## Install and run locally

```bash
npm install
npm run dev
```

For local Pages Functions testing with D1, use Wrangler/Cloudflare local development rather than plain Vite.


## After deploy checklist

1. Add the D1 Pages binding exactly as:

```txt
Variable name: DB
Database: railog-db or your selected D1 database
```

2. Redeploy the Pages project after saving the binding.
3. Open your deployed site once. This calls `/api/health` and creates the `entity_records` table.
4. Optional manual check: open this URL in your browser:

```txt
https://YOUR-PROJECT.pages.dev/api/health
```

A healthy response should show:

```json
{
  "ok": true,
  "databaseBinding": "DB",
  "tableReady": true,
  "tableName": "entity_records"
}
```

If your Cloudflare D1 page still shows 0 tables, open `/api/health` after the DB binding is added and redeploy once more.

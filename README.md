# Matt Training

Personal marathon + strength training app. Next.js, Supabase, deployed on Vercel.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in. Public Supabase configuration is bundled in
`lib/public-config.json`; new browsers need no key setup. Optional deployment
overrides: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
(legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is supported). Never put secret or
service-role keys in these values.

Then sign in with your existing email and password. The programme seeds on first
login only after a successful query confirms that the account has no exercises.

## Current handover

Read `PHASE-3-HANDOVER.md` for v2.3: Today cockpit, set editing, prescribed rest,
read-only Week, and independent complete programmes for both accounts.

## Phase 2 handover

Phase 2 here means the Claude handover's daily path: Dashboard, paired pain log,
shared timer engine, warm-up, and daily block. This is numbered Phase 1 in
`design/handoff-v2.md`; the gym loop was subsequently implemented as Phase 3.

Run `npm test` for isolated flow and timer tests, and `npm run build` for the
production build. Tests use synthetic in-memory data and never write to Supabase.
See `PHASE-2-HANDOVER.md` for verified behavior, release gates, and remaining work.

See `CLAUDE.md` for full project context.

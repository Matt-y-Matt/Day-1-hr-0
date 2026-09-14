# Matt Training

Personal marathon + strength training app. Next.js, Supabase, deployed on Vercel.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. On first load, paste the Supabase anon key when prompted
(Supabase dashboard → Project Settings → API Keys), or set it in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key_here
```

Then sign in with your existing email and password. The programme seeds on first
login only after a successful query confirms that the account has no exercises.

## Phase 2 handover

Phase 2 here means the Claude handover's daily path: Dashboard, paired pain log,
shared timer engine, warm-up, and daily block. This is numbered Phase 1 in
`design/handoff-v2.md`; the gym-loop redesign remains the following phase.

Run `npm test` for isolated flow and timer tests, and `npm run build` for the
production build. Tests use synthetic in-memory data and never write to Supabase.
See `PHASE-2-HANDOVER.md` for verified behavior, release gates, and remaining work.

See `CLAUDE.md` for full project context.

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

Then sign in with a magic link. The programme seeds itself on first login.

See `CLAUDE.md` for full project context.

# Deployment

The app lives at **two** addresses at once, and that is not a duplicate but a
consequence of the move.

| Address | What it is | TMDB |
|---|---|---|
| <https://film-table.vercel.app> | the primary one, static files + the `/api/tmdb` function | yes, its own proxy |
| <https://mrwd.github.io/film-table/> | the previous one, kept for libraries already built there | yes, through the Vercel proxy |

## Vercel — the primary one

On a push to `main`, Vercel builds and publishes on its own.

One environment variable: `TMDB_API_KEY` in **Settings → Environment Variables**
(both the short API Key and the long Read Access Token work). The key is not needed
anywhere else. Without it the proxy returns 503 and the client silently falls back
to Cinemeta and iTunes — the app works, but movie search quality drops.

```bash
curl -s "https://film-table.vercel.app/api/tmdb?path=search/movie&query=the+matrix" | head -c 200
```

## GitHub Pages — the previous address

`.github/workflows/deploy.yml` builds and publishes on a push to `main`. The
subpath is injected by the `BASE_PATH=/film-table/` variable.

**Important and non-obvious:** that build is given
`VITE_API_BASE=https://film-table.vercel.app`, so the old address reaches TMDB
through the Vercel proxy via CORS. In other words, Pages is a full version, not a
cut-down one. It can be verified from the bundle:

```bash
BUNDLE=$(curl -s https://mrwd.github.io/film-table/ | grep -o '/film-table/assets/index-[A-Za-z0-9_-]*\.js' | head -1)
curl -s "https://mrwd.github.io$BUNDLE" | grep -o 'https://film-table.vercel.app'
```

Pages has no `/api/tmdb` of its own and cannot have one — static hosting does not
execute server code. A direct request there returns 404, and that is expected.

### Why the old address is not switched off

`localStorage` is tied to a domain and **does not move** to a new one. A library
built on `mrwd.github.io` stayed there. That is why the old address carries a
`MigrationBanner` (`src/components/MigrationBanner.tsx`): it is shown only when
`hostname === OLD_HOST`, explains the situation and sends the user to Profile →
Export, with an Import needed at the new address.

Pages must not be switched off while there is any chance somebody's library sits
there without a backup. If the address does change, update `NEW_HOME` in the banner
and `VITE_API_BASE` in the workflow.

## Checking that the current version is deployed

The bundle hash in production must match the local one:

```bash
curl -s https://film-table.vercel.app/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html
```

**Do not poll production in a loop.** Frequent requests trip the Vercel Security
Checkpoint and production starts returning 403 to everything — it looks like the
app is broken, but it clears up on its own.

The service worker serves the previous build, so before checking in a browser:

```js
for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
for (const k of await caches.keys()) await caches.delete(k)
location.reload()
```

Navigating to an address that differs **only in the hash** does not reload the
page: the app keeps its previous in-memory state and data planted in
`localStorage` is not picked up. An explicit `location.reload()` is required.

## Testing the proxy locally without deploying

```bash
echo 'TMDB_API_KEY=<key>' > .env.local                # the file is in .gitignore
node --env-file=.env.local scripts/dev-api.mjs       # proxy on :3001
VITE_API_BASE=http://localhost:3001 npx vite         # frontend
```

Worth checking (all of this has already caught real defects):

```bash
curl -s "localhost:3001/api/tmdb?path=search/movie&query=the+matrix"       # 200, contains The Matrix
curl -s -o /dev/null -w "%{http_code}\n" "localhost:3001/api/tmdb?path=account/lists"  # 403
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://evil.example" \
     "localhost:3001/api/tmdb?path=search/movie&query=x"                   # 403
curl -s "localhost:3001/api/tmdb?path=movie/603" | grep -c "eyJhbGci"      # 0 — the key does not leak
```

## Alternative hosts

The project is static files plus a single function, so it ports to Netlify and
Cloudflare Pages as well. The key requirement: the function must answer at the
`/api/tmdb` path, otherwise the client will not find it and will silently fall back
to the key-free sources.

## Security rules

The TMDB key must not end up in the repository, in the client bundle or in chat.
Only the host's environment variables and a local `.env.local`, which is in
`.gitignore`.

If the key is ever exposed, reissue it in the TMDB settings and update the variable
in Vercel. The old one stops working after reissue.

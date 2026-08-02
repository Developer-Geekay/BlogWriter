# Deploying as a Node app

This is a **long-running Node process**, not a static site or a serverless bundle.
Every page is server-rendered on demand (`dynamic = 'force-dynamic'`) because posts and
settings live in MongoDB, so there is nothing to pre-render to a CDN.

Target for these instructions: `blog.gokulakannan.dev` on a Linux VPS, behind nginx.

---

## 1. Requirements

| Thing | Version | Notes |
|---|---|---|
| Node.js | **20 or newer** | `engines` in `package.json` |
| MongoDB | 5.0+ | Local `mongod`, Docker, or Atlas |
| Reverse proxy | nginx / Caddy | Terminates TLS; the app speaks plain HTTP |

The app listens on `PORT` (default 3000) and expects something in front of it doing TLS.
Do not expose it directly — session cookies are `Secure` in production and will not
survive a plain-HTTP origin.

---

## 2. Environment

Next reads `.env` from the project root automatically; the CLI reads it too. On a server
you can equally use `EnvironmentFile=` in systemd (see §5) and skip the file.

```bash
# ---- required ----
MONGODB_URI=mongodb://127.0.0.1:27017/blog
SESSION_SECRET=          # openssl rand -hex 32   (min 32 chars, else the app refuses to sign)
NODE_ENV=production

# ---- strongly recommended ----
SITE_URL=https://blog.gokulakannan.dev   # canonical links + the MCP endpoint shown in Settings

# ---- optional ----
MONGODB_DB=blog          # only if the URI has no database in its path
NEXT_PUBLIC_ANALYTICS_SITE_ID_PRODUCTION=   # analytics tenant; unset = no tracking (§8)
NEXT_PUBLIC_ANALYTICS_SITE_ID_DEVELOPMENT=
LINKEDIN_CLIENT_ID=      # LinkedIn cross-posting (npm run cli linkedin:auth)
LINKEDIN_CLIENT_SECRET=
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_PERSON_URN=
```

**The MCP endpoint's on/off switch and bearer token are not here.** They live in the
database and are managed at `/admin/settings`, so they change without a redeploy.

**`NEXT_PUBLIC_*` values are read at build time, not at startup.** Next inlines them
into the browser bundle, so they must be in the environment when `npm run build` runs.
Changing one means rebuilding — restarting the service is not enough. Because of that,
`EnvironmentFile=` in systemd covers the runtime variables only; export the analytics
host in the shell that builds, or keep it in the `.env` file the build reads.

`SESSION_SECRET` is what signs the admin cookie. Changing it signs every session out —
which is also how you force a logout if a laptop goes missing.

---

## 3. Build and run

```bash
git clone <repo> /srv/blog && cd /srv/blog
npm ci                 # full install — see the warning below
npm run build          # builds, then packages release/ (see §9)
npm start              # node release/server.js, listens on $PORT (default 3000)
```

`npm run build` finishes by running `scripts/after_prepare.mjs`, which assembles a
self-contained `release/` directory — that is what `npm start` serves and what you ship
to a server. §9 covers the artifact itself.

> ### Do not run `npm ci --omit=dev`
>
> Two things break:
>
> 1. **The build needs devDependencies.** `typescript`, `tailwindcss`,
>    `@tailwindcss/postcss`, and `postcss` are all dev dependencies. Without them
>    `npm run build` fails.
> 2. **The CLI needs `tsx`**, also a dev dependency. `create-admin`, `status`, and
>    `import-markdown` all run through it, so pruning leaves you unable to create an
>    admin account on the box.
>
> This applies to the machine that *builds*. The `release/` package it produces has
> neither problem — its dependencies are already pruned to what the server actually
> reaches, so nothing is installed on the deployment target at all.

Sanity-check the build before wiring up a service:

```bash
curl -sI http://127.0.0.1:3000/ | head -1        # expect 200
```

The home page returns **200 even when MongoDB is unreachable** — it renders a readable
"database is not reachable" notice instead of crashing. That makes it a good liveness
probe, but a poor database check. For the latter use `npm run status`.

---

## 4. Database

**Local mongod** — bind to localhost so it is not exposed:

```bash
# /etc/mongod.conf
net:
  bindIp: 127.0.0.1
```

**Atlas** — paste the SRV string into `MONGODB_URI` and allow-list the server's IP.

No migration step is needed: indexes (unique slug, status+date, tags, text search, unique
user email) are created on first connect.

---

## 5. Run it under systemd

`/etc/systemd/system/blog.service`:

```ini
[Unit]
Description=Scratchpad blog
After=network-online.target mongod.service
Wants=network-online.target

[Service]
Type=simple
User=blog
WorkingDirectory=/srv/blog/release
EnvironmentFile=/srv/blog/.env
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node /srv/blog/release/server.js
Restart=always
RestartSec=5

# Hardening — the app only needs to read its own directory.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/blog/release/.next

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R blog:blog /srv/blog
sudo chmod 600 /srv/blog/.env          # it holds SESSION_SECRET
sudo systemctl daemon-reload
sudo systemctl enable --now blog
sudo journalctl -u blog -f
```

<details>
<summary>PM2 instead of systemd</summary>

```bash
npm i -g pm2
pm2 start release/server.js --name blog
pm2 save && pm2 startup
```

systemd is preferable on a server you already administer — one less supervisor to keep
alive, and journald handles the logs.
</details>

---

## 6. nginx and TLS

`/etc/nginx/sites-available/blog.gokulakannan.dev`:

```nginx
server {
    listen 80;
    server_name blog.gokulakannan.dev;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name blog.gokulakannan.dev;

    ssl_certificate     /etc/letsencrypt/live/blog.gokulakannan.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/blog.gokulakannan.dev/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # X-Forwarded-Proto is load-bearing: Settings derives the MCP endpoint URL
        # from it, and without it the page shows an http:// address.
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # The MCP endpoint streams responses; do not let nginx buffer them,
        # and give a held-open stream longer than the 60s default.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/blog.gokulakannan.dev /etc/nginx/sites-enabled/
sudo certbot --nginx -d blog.gokulakannan.dev
sudo nginx -t && sudo systemctl reload nginx
```

Both of those exist for the MCP endpoint, which uses Streamable HTTP: buffering would
hold a streamed response back, and nginx's 60-second default read timeout would cut an
open stream. Ordinary page requests are unaffected either way.

---

## 7. First run

```bash
cd /srv/blog
npm run create-admin -- --email you@example.com --password 'at-least-12-chars'
npm run status          # confirms the DB is reachable and shows the MCP state
```

Then, in the browser:

1. Sign in at `https://blog.gokulakannan.dev/admin` — there is deliberately no public
   sign-in link, so navigate to it directly.
2. **Settings → Site** — set the title, byline, and description.
3. **Settings → MCP endpoint** — leave it off until you actually want an external AI
   client connected. Turning it on mints a bearer token, shown once.

Importing old Markdown posts, if you have any:

```bash
npm run import-markdown           # reads content/posts/, skips anything already imported
```

---

## 8. Analytics

Page visits are reported to `https://analytics.consoleapi.in`, a multi-tenant platform.
The host is fixed in `src/analytics/config.ts`; the tenant ("site") ID is not — it is a
per-deployment value and lives only in the environment. Get the two UUIDs from the
analytics dashboard and put them in the build environment:

```bash
NEXT_PUBLIC_ANALYTICS_SITE_ID_PRODUCTION=<uuid from the dashboard>
NEXT_PUBLIC_ANALYTICS_SITE_ID_DEVELOPMENT=<uuid from the dashboard>
```

`NODE_ENV` picks between them at build time, so a production build reports under the
production tenant and `npm run dev` under the development one — one file can safely hold
both. If you would rather set a single value, `NEXT_PUBLIC_ANALYTICS_SITE_ID` overrides
the pair; that is also how a staging deployment gets its own tenant.

**Nothing is sent until a tenant is set.** With none configured the SDK is never loaded,
so a fresh clone is silent by default. `NEXT_PUBLIC_ANALYTICS_HOST` overrides the server
origin if you ever need to point somewhere else.

Two deliberate choices in the integration:

- **Auto-tracking is off** (`data-auto-track="false"`). The SDK patches
  `history.pushState`, which the Next.js router also drives, so leaving it on
  double-counts every client-side navigation. Visits are reported once, from the
  router, in `components/Analytics.tsx`.
- **`/admin` is excluded.** Those URLs are one person editing their own site and they
  carry post IDs; tracking them would inflate the numbers and push internal identifiers
  into a third-party dataset.

Verify after deploying: load the site in a browser and look for a `POST` to
`https://analytics.consoleapi.in/api/analytics/visit` in the Network tab. A 200 with
`{"success": true}` means the tenant is receiving data. Check `data-site-id` on the
injected script tag if the visits land under the wrong tenant — remember that these are
build-time values, so a stale one means the last build had a stale environment.

---

## 9. The release package

`npm run build` ends by running `scripts/after_prepare.mjs`, which assembles everything
the server needs into `release/`:

```
release/
├── server.js          # the entry point — honours PORT
├── node_modules/      # pruned to the modules the server actually reaches
├── .next/             # compiled app + static assets
├── public/            # if the directory exists
├── package.json       # rewritten: start = node server.js
└── HOW-TO-RUN.md
```

**83 MB against 717 MB** for a full `node_modules` here, and nothing is installed on the
deployment target. Ship the directory and run it:

```bash
rsync -a release/ deploy@server:/srv/blog/release/
ssh deploy@server 'cd /srv/blog/release && PORT=3000 node server.js'
```

Next's standalone output does the pruning by tracing the modules reachable from the
server entry, so build-only packages (typescript, tailwind, vitest, tsx) never reach the
artifact. The script handles the parts Next leaves undone:

- **Static assets are copied in.** Next deliberately omits `.next/static` and `public`
  from the standalone directory. Without them the site serves 200s and renders unstyled,
  which is a confusing failure to debug.
- **The manifest is rewritten.** Next copies this repository's `package.json` verbatim,
  where `npm start` means `next start` — which refuses to serve a standalone build — and
  the dependency lists invite an `npm ci` that would delete the pruned `node_modules`.
  Both are stripped; `release/package.json` has one script, `start: node server.js`.
- **The analytics tenant is reported.** `NEXT_PUBLIC_*` values are inlined at build time,
  so the script prints which tenant the artifact carries. That is the last cheap moment
  to notice a release built with analytics off or against the wrong tenant.

Two things do not travel with the package:

- **The admin CLI.** `create-admin`, `status`, and `import-markdown` run through `tsx`,
  which is a build dependency. They only talk to MongoDB, so run them from the build
  machine or any checkout pointed at the same `MONGODB_URI` — there is no need for them
  to exist on the server.
- **`NEXT_PUBLIC_*` changes.** They are baked in. Changing the analytics tenant means
  rebuilding and re-shipping, not editing `.env` on the server.

`release/` is gitignored — it is a build artifact, rebuilt on every `npm run build`.

---

## 10. Updating

```bash
cd /srv/blog
git pull
npm ci
npm run build            # rebuilds release/ from scratch
sudo systemctl restart blog
```

If you build elsewhere, only `release/` needs to travel:

```bash
rsync -a --delete release/ deploy@server:/srv/blog/release/
ssh deploy@server 'sudo systemctl restart blog'
```

`--delete` matters: `release/` is rebuilt from scratch each time, and without it files
removed in this version linger on the server.

There is a visible gap between `npm run build` and the restart. To avoid it, build into a
fresh directory and swap a symlink:

```bash
DEPLOY=/srv/releases/$(date +%s)
git clone --depth 1 <repo> "$DEPLOY" && cd "$DEPLOY"
cp /srv/blog/.env . && npm ci && npm run build
ln -sfn "$DEPLOY" /srv/blog-current && sudo systemctl restart blog
```

Point `WorkingDirectory` at `/srv/blog-current` for that layout.

No database migrations to run — schema changes are handled by Zod defaults when a
document is read.

---

## 11. Backups

```bash
mongodump --uri="$MONGODB_URI" --out /backup/blog-$(date +%F)
```

`posts` is the collection that matters; `users` and `settings` are small but losing
`settings` means regenerating the MCP token and re-entering the site title.

Restore:

```bash
mongorestore --uri="$MONGODB_URI" --drop /backup/blog-2026-08-01/blog
```

---

## 12. Troubleshooting

| Symptom | Cause |
|---|---|
| "The database is not reachable" on every page | `MONGODB_URI` wrong or mongod down. The message quotes the underlying driver error. |
| App exits at boot with a `SESSION_SECRET` error | Missing or shorter than 32 characters — deliberate, since a weak secret makes the admin cookie forgeable. |
| Signed out on every request | `NODE_ENV=production` without HTTPS. The cookie is `Secure` and the browser drops it. |
| Settings shows an `http://` MCP URL | nginx is not sending `X-Forwarded-Proto`. Set `SITE_URL` as a belt-and-braces fix. |
| MCP client gets 503 | The toggle is off, which is its normal resting state. Enable it in Settings. |
| MCP client gets 401 | Wrong or rotated bearer token. |
| `/api/*` returns 503 "Storage is unavailable" | Same cause as the page-level notice — the database is unreachable. |
| `npm run create-admin` → "tsx: not found" | devDependencies were pruned, or you ran it inside `release/`. The CLI runs from a full checkout; see §9. |
| Site serves 200 but renders unstyled | `release/.next/static` is missing — an incomplete copy of the artifact. Re-run `npm run build`, or re-sync the whole directory. |
| `after_prepare.mjs`: ".next/standalone not found" | `next.config.ts` lost `output: 'standalone'`, or the build failed before it emitted. |
| Build fails on `tailwindcss` / `typescript` | Same cause — those are devDependencies. |

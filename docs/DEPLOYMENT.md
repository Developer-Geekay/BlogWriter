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
ANTHROPIC_API_KEY=       # enables "Draft with AI"; everything else works without it
LINKEDIN_CLIENT_ID=      # LinkedIn cross-posting (npm run cli linkedin:auth)
LINKEDIN_CLIENT_SECRET=
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_PERSON_URN=
```

**The MCP endpoint's on/off switch and bearer token are not here.** They live in the
database and are managed at `/admin/settings`, so they change without a redeploy.

`SESSION_SECRET` is what signs the admin cookie. Changing it signs every session out —
which is also how you force a logout if a laptop goes missing.

---

## 3. Build and run

```bash
git clone <repo> /srv/blog && cd /srv/blog
npm ci                 # full install — see the warning below
npm run build
npm start              # next start, listens on $PORT (default 3000)
```

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
> Either keep the full install, or use the standalone build in §8, which produces a
> slim runtime bundle without pruning your working tree.

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
WorkingDirectory=/srv/blog
EnvironmentFile=/srv/blog/.env
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

# Hardening — the app only needs to read its own directory.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/blog/.next

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
pm2 start npm --name blog -- start
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

        # The MCP endpoint streams responses; do not let nginx buffer them.
        proxy_buffering off;

        # "Draft with AI" runs a multi-minute research-and-write pipeline.
        proxy_read_timeout 900s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/blog.gokulakannan.dev /etc/nginx/sites-enabled/
sudo certbot --nginx -d blog.gokulakannan.dev
sudo nginx -t && sudo systemctl reload nginx
```

Two settings above are not boilerplate:

- **`proxy_read_timeout 900s`** — the AI drafting route declares `maxDuration = 800`.
  At nginx's 60-second default, drafting dies with a 504 mid-run.
- **`proxy_buffering off`** — the MCP endpoint uses Streamable HTTP.

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

## 8. Optional: standalone build (smaller runtime)

Next can emit a self-contained server with only the modules it actually needs — **79 MB
against 717 MB** for a full `node_modules` here. Worth it if you build elsewhere and ship
an artifact.

Add to `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
  // ...existing config
};
```

Then:

```bash
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public       .next/standalone/public        # if the directory exists
node .next/standalone/server.js                   # honours PORT
```

The two `cp` lines are required — Next deliberately leaves static assets out of the
standalone directory, and without them the site renders unstyled.

> **`npm start` stops being supported once you enable this.** Next prints
> *"next start does not work with output: standalone"*. Change `ExecStart` in the systemd
> unit to `/usr/bin/node /srv/blog/.next/standalone/server.js`.
>
> The CLI commands (`create-admin`, `status`) still need the full install, since they run
> through `tsx`. Run them from a checkout that has devDependencies.

This is why standalone is **not** enabled by default: the simpler `npm start` path stays
the supported one.

---

## 9. Updating

```bash
cd /srv/blog
git pull
npm ci
npm run build
sudo systemctl restart blog
```

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

## 10. Backups

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

## 11. Troubleshooting

| Symptom | Cause |
|---|---|
| "The database is not reachable" on every page | `MONGODB_URI` wrong or mongod down. The message quotes the underlying driver error. |
| App exits at boot with a `SESSION_SECRET` error | Missing or shorter than 32 characters — deliberate, since a weak secret makes the admin cookie forgeable. |
| Signed out on every request | `NODE_ENV=production` without HTTPS. The cookie is `Secure` and the browser drops it. |
| Settings shows an `http://` MCP URL | nginx is not sending `X-Forwarded-Proto`. Set `SITE_URL` as a belt-and-braces fix. |
| "Draft with AI" 504s after ~60s | nginx `proxy_read_timeout` still at its default. |
| MCP client gets 503 | The toggle is off, which is its normal resting state. Enable it in Settings. |
| MCP client gets 401 | Wrong or rotated bearer token. |
| `npm run create-admin` → "tsx: not found" | devDependencies were pruned; see §3. |
| Build fails on `tailwindcss` / `typescript` | Same cause — those are devDependencies. |

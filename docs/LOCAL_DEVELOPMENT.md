# Local Development Setup

How to run the full URY/bron stack on a developer machine. Two setups are
supported; pick one.

| | Path A — Native bench | Path B — Docker stack |
|---|---|---|
| Best for | Day-to-day app development | Getting a working site quickly, demos |
| Python edit loop | Auto-reload, ~1s | ~1s (gunicorn `--reload`) |
| Setup time | ~45 min first time | ~15 min, plus image build |
| Needs | WSL2 (Windows) or Linux/macOS | Docker Desktop |

Path A is the recommended developer setup. Path B is useful when you want a
disposable, reproducible environment.

---

## 1. Version matrix

The app versions must match across environments or a restored database will not
migrate cleanly.

| Component | Version | Notes |
|---|---|---|
| frappe | `15.120.1` (`version-15`) | |
| erpnext | `15.121.2` (`version-15`) | |
| hrms | `15.64.0` (`version-15`) | Required — employee reports depend on it |
| ury (this repo) | `3.0.0-beta.1` | `ury/__init__.py` is the source of truth |
| Python | 3.11+ (3.14 verified) | |
| Node | **≥ 22.22.2**, or 24.15+/26+ | `jsdom@30` enforces this; Ubuntu's 22.22.1 is one patch too old |
| Yarn | 1.x classic | The repo uses Yarn classic workspaces — **do not use npm** |
| MariaDB | 10.6–11.8 | 11.8 verified; Frappe prints an "untested" warning above 10.8 |
| Redis | 6+ | |
| bench CLI | 5.31+ | Requires `uv` to be installed separately |

---

## 2. Path A — Native bench

### 2.1 Prerequisites

On Windows, everything below happens inside WSL2. Verify you have it:

```powershell
wsl --status
wsl --list --verbose      # needs a distro at VERSION 2
```

If not installed: `wsl --install -d Ubuntu-24.04`, then reboot.

systemd must be enabled so MariaDB can run as a service. Check `ps -p 1 -o comm=`
prints `systemd`; if not, add to `/etc/wsl.conf` and run `wsl --shutdown`:

```ini
[boot]
systemd=true
```

### 2.2 System packages

```bash
sudo apt-get update
sudo apt-get install -y \
  mariadb-server mariadb-client redis-server redis-tools \
  python3-dev python3-venv python3-pip pipx pkg-config \
  build-essential libmariadb-dev \
  git curl xvfb libfontconfig libxrender1
sudo apt-get install -y wkhtmltopdf || true   # optional; PDF printing
```

### 2.3 MariaDB configuration

Frappe requires 4-byte UTF-8. Without this, `bench new-site` fails on collation.

```bash
sudo tee /etc/mysql/mariadb.conf.d/99-frappe.cnf >/dev/null <<'EOF'
[mysqld]
character-set-client-handshake = FALSE
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

[mysql]
default-character-set = utf8mb4
EOF

sudo systemctl enable --now mariadb
sudo systemctl restart mariadb
```

Set a root password (Ubuntu's MariaDB defaults to socket auth, which bench
cannot use over TCP):

```bash
sudo mariadb
```
```sql
ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('<your-password>');
CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED BY '<your-password>';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
FLUSH PRIVILEGES;
```

Leave the `redis-server` systemd unit disabled — `bench start` runs its own Redis
instances on ports 11000 and 13000:

```bash
sudo systemctl disable --now redis-server
```

### 2.4 Node

Ubuntu's packaged Node is usually too old for this repo's frontend deps. Use nvm:

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
. "$HOME/.nvm/nvm.sh"
nvm install 24
nvm alias default 24
npm install -g yarn
```

### 2.5 bench CLI

bench 5.29+ shells out to `uv` for virtualenv creation. Both are user-level
installs — no sudo:

```bash
pipx install frappe-bench
pipx install uv
pipx ensurepath
export PATH="$HOME/.local/bin:$PATH"     # add to ~/.bashrc
```

### 2.6 Create the bench and add apps

```bash
cd ~
bench init --frappe-branch version-15 frappe-bench
cd frappe-bench

bench get-app --branch version-15 --skip-assets erpnext
bench get-app --branch version-15 --skip-assets hrms
bench get-app ury https://github.com/<org>/bron.git --branch develop --skip-assets
```

`--skip-assets` defers the frontend build; it is run once at the end.

> **Verify `sites/apps.txt` lists all four apps** before migrating. If
> `bench get-app` aborts partway (e.g. on a yarn error) the app is cloned but
> never registered, and a subsequent `bench migrate` will *silently remove it
> from `Installed Application`*. See Troubleshooting.

```bash
ls -1 apps > sites/apps.txt
cat sites/apps.txt        # erpnext, frappe, hrms, ury
```

### 2.7 Bench configuration

```bash
bench set-config -g db_host 127.0.0.1
bench set-config -gp db_port 3306
bench set-config -g developer_mode 1
```

`bench init` already writes the Redis URLs (`redis://127.0.0.1:13000` for cache
and socketio, `redis://127.0.0.1:11000` for the queue).

### 2.8 Create the site

```bash
bench new-site ury.localhost        # prompts for DB root + Administrator passwords
bench --site ury.localhost install-app erpnext
bench --site ury.localhost install-app hrms
bench --site ury.localhost install-app ury
bench --site ury.localhost set-config developer_mode 1
bench use ury.localhost
```

To start from an existing dataset instead, see [Backup and restore](#6-backup-and-restore).

### 2.9 Build assets and run

```bash
cd ~/frappe-bench/apps/ury
yarn install
yarn build                 # all five frontends -> ury/public/* and ury/www/*.html

cd ~/frappe-bench
bench build --app ury      # Frappe-side Desk bundles
bench start
```

`bench start` runs everything: web (`:8000`), socketio (`:9000`), both Redis
instances, a background worker, the scheduler, and the asset watcher.

Open **http://localhost:8000**.

---

## 3. Path B — Docker stack with live source

Uses [frappe_docker](https://github.com/frappe/frappe_docker) plus a wrapper that
bakes this repo into a custom image, then bind-mounts your working tree over it
so Python edits need no rebuild.

### 3.1 Build and deploy

```powershell
cd <frappe_docker checkout>
python easy-install-local.py build --local-app-path C:\path\to\bron --tag bron-ury:latest ...
python easy-install-local.py deploy --project bron-local --image bron-ury ...
```

This generates `~/bron-local-compose.yml`. The stack publishes nginx on `:8080`.

### 3.2 Overlay the working tree

The image installs the app at `/home/frappe/frappe-bench/apps/ury` and registers
it via a plain `ury.pth` containing that exact path — so a bind mount at the same
path resolves correctly.

`bron-dev-override.yml`:

```yaml
x-bron-source: &bron-source
  - type: bind
    source: C:/path/to/bron
    target: /home/frappe/frappe-bench/apps/ury

services:
  backend:
    volumes: *bron-source
    # --preload removed so --reload works; poll engine because inotify does
    # not cross Windows bind mounts.
    command:
      - /home/frappe/frappe-bench/env/bin/gunicorn
      - --chdir=/home/frappe/frappe-bench/sites
      - --bind=0.0.0.0:8000
      - --threads=4
      - --workers=2
      - --worker-class=gthread
      - --worker-tmp-dir=/dev/shm
      - --timeout=120
      - --reload
      - --reload-engine=poll
      - frappe.app:application
  websocket:   { volumes: *bron-source }
  queue-short: { volumes: *bron-source }
  queue-long:  { volumes: *bron-source }
  scheduler:   { volumes: *bron-source }
  frontend:    { volumes: *bron-source }   # nginx follows sites/assets/ury -> apps/ury/ury/public
```

```powershell
docker compose -p bron-local `
  -f "$env:USERPROFILE\bron-local-compose.yml" `
  -f .\bron-dev-override.yml up -d
```

### 3.3 Seed generated assets first

`ury/public/{pos,ury,order,mosaic,urypos}` and `ury/www/*.html` are **gitignored
build output** that exists only inside the image. Mounting your tree hides them
and every SPA route 404s. Either run `yarn build` on the host, or copy them out
of the image once:

```powershell
$c = docker create bron-ury:latest
foreach ($d in @("pos","ury","order","mosaic","urypos")) {
  docker cp "${c}:/home/frappe/frappe-bench/apps/ury/ury/public/$d" ".\ury\public\$d"
  docker cp "${c}:/home/frappe/frappe-bench/apps/ury/ury/www/$d.html" ".\ury\www\$d.html"
}
docker rm $c
```

Note the mount also hides the image's `apps/ury/node_modules`, so
`bench build --app ury` **inside** the container will fail. Build on the host.

---

## 4. Where the source lives

The bench needs the app at `~/frappe-bench/apps/ury`. Three arrangements, in
descending order of how well they work:

### 4.1 Source in WSL, edited from Windows (recommended)

The source stays on the Linux filesystem — where the bench reads it at full speed
— while you edit from your normal Windows desktop. See
[§4.4](#44-editing-wsl-files-from-a-windows-editor) for editor setup.

Everything works at full speed: auto-reload, `bench watch`, Vite HMR.

### 4.2 Symlink the bench at a Windows checkout

For editing with Windows-native tools. One copy, nothing to synchronize:

```bash
cd ~/frappe-bench
mv apps/ury ~/ury-wsl-backup
ln -s /mnt/c/Users/<you>/source/repos/bron apps/ury
```

Required adjustments:

- **Run all `yarn` commands on Windows.** `node_modules` holds
  platform-specific binaries (esbuild, swc, rollup); whichever OS installs last
  owns them. Build output is portable, so the Linux bench serves it fine.
- **Line endings.** Set `git config core.autocrlf false` and re-checkout, or
  CRLF files reach Linux. Python tolerates CRLF; shell scripts do not.

Known costs: `/mnt/c` I/O is far slower (Frappe imports thousands of modules at
boot and the reloader `stat()`s them continuously), and inotify does not fire for
Windows-side edits — `bench watch` and Vite HMR will miss changes unless you
enable polling.

### 4.3 Two copies kept in sync

Possible with Syncthing/unison, but two writable copies means conflict handling
and a real risk of corrupting a git index. Not recommended.

**Never copy files between copies with Explorer or `cp`** — that is how CRLF
contamination and index desynchronization happen. Use git.

### 4.4 Editing WSL files from a Windows editor

WSL2 keeps its files in a virtual disk, so there is no plain Windows folder to
open. Two access methods exist, and the difference matters a lot.

| | Remote/client-server | UNC path `\\wsl.localhost\` |
|---|---|---|
| How | Editor runs a helper process *inside* Linux | Windows reads the disk over the 9p network protocol |
| File watching | Works (inotify) | Unreliable — hot reload misses saves |
| Search / git | Native speed | Slow on large repos |
| Terminal | Already inside WSL | Windows shell; needs `wsl` prefix |
| Verdict | **Use this** | Emergencies only |

#### VS Code

Install the **WSL** extension (`ms-vscode-remote.remote-wsl`), then:

```powershell
wsl -d Ubuntu -- bash -lc "cd ~/frappe-bench/apps/ury && code ."
```

Or from an open window: `Ctrl+Shift+P` → **WSL: Open Folder in WSL** → pick
`/home/<you>/frappe-bench/apps/ury`.

The first launch downloads the VS Code server into WSL (a few seconds, one time).
Confirm the bottom-left status bar reads **WSL: Ubuntu** — that is how you know
you are editing the live files.

After it opens:

- `Ctrl+Shift+P` → **Python: Select Interpreter** →
  `~/frappe-bench/env/bin/python`, so Pylance resolves `frappe`, `erpnext`, and
  `ury` imports.
- Extensions split into local and remote sets. UI themes stay on Windows;
  language tooling (Pylance, ESLint, Prettier) must be installed *in* WSL — the
  Extensions panel shows an "Install in WSL: Ubuntu" button for each.
- The integrated terminal already runs in Ubuntu with `bench` on `PATH`; no
  `wsl -d Ubuntu --` prefix needed.
- Ports are forwarded automatically, so `localhost:8000` works from your Windows
  browser.

#### Cursor / Windsurf / other VS Code forks

Same mechanism — they ship their own fork of the Remote-WSL extension. Open the
folder via the command palette's WSL command; the `code .` equivalent is
`cursor .` run from inside WSL.

#### JetBrains (PyCharm, WebStorm)

Use **WSL** as the project interpreter type: *Settings → Python Interpreter → Add
→ WSL*, point at `~/frappe-bench/env/bin/python`. Open the project via the
`\\wsl.localhost\Ubuntu\home\<you>\frappe-bench\apps\ury` path — JetBrains
handles WSL projects natively and does not suffer the watcher problem the way
plain UNC access does.

#### Editors without WSL support (Sublime, Notepad++, Zed on Windows)

Only the UNC path is available:

```
\\wsl.localhost\Ubuntu\home\<you>\frappe-bench\apps\ury
```

Usable for a quick one-file edit. Do not run a dev server or a build against it —
file watching will not fire and large operations crawl.

#### Terminal-only

```powershell
wsl -d Ubuntu        # drops you into Ubuntu at ~
```

Then `vim`, `nano`, or `nvim` as usual. Useful for quick config edits while the
bench is running in another window.

---

## 5. Frontend development

The five frontends build into `ury/public/*`. For a fast loop, run the Vite dev
server and proxy API calls at the bench.

Each React app's `vite.config.ts` should proxy to wherever the bench is listening
(`:8000` native, `:8080` Docker):

```ts
const backend = process.env.URY_PROXY_TARGET ?? 'http://localhost:8000'
const proxy = { target: backend, changeOrigin: true }

server: {
  port: 5173,                 // frontend 5174, self-order 5175
  fs: { allow: ['..'] },
  proxy: {
    '/api': proxy,
    '/app': proxy,
    '/assets': proxy,
    '/files': proxy,
    '/private': proxy,
    '/socket.io': { ...proxy, ws: true },
  },
},
```

`changeOrigin: true` is required — Frappe resolves the site from the `Host`
header.

```bash
yarn workspace pos dev          # :5173
yarn workspace frontend dev     # :5174
yarn workspace self-order dev   # :5175
```

**CSRF:** in production the SPA HTML is Jinja-rendered and carries
`window.csrf_token`. Vite serves static HTML, so that token is missing and every
POST fails. On a dev site only:

```bash
bench --site ury.localhost set-config ignore_csrf 1
```

Never set this on a site reachable from outside your machine.

A proxy is preferred over `VITE_FRAPPE_BASE_URL` because it keeps everything
same-origin, so session cookies and socket.io work with no CORS configuration.
`createFrappeClient()` falls back to same-origin when that variable is unset.

---

## 6. Backup and restore

Moving a dataset between environments (Docker → native, machine → machine):

```bash
# export
bench --site ury.localhost backup --with-files
# files land in sites/ury.localhost/private/backups/

# import
bench --site ury.localhost restore <timestamp>-database.sql.gz \
  --db-root-password <pw> \
  --with-public-files <timestamp>-files.tar \
  --with-private-files <timestamp>-private-files.tar
bench --site ury.localhost migrate
```

From a Docker stack, pull the files out first:

```powershell
docker compose -p bron-local cp backend:/home/frappe/frappe-bench/sites/ury.localhost/private/backups .\backups
```

---

## 7. Daily commands

```bash
cd ~/frappe-bench
bench start                                   # everything; Ctrl+C to stop
bench --site ury.localhost console            # Python REPL with frappe loaded
bench --site ury.localhost mariadb            # SQL shell
bench --site ury.localhost migrate
bench --site ury.localhost clear-cache
bench --site ury.localhost list-apps
```

| You change | What's needed |
|---|---|
| Python in `apps/ury` | Nothing — the dev server auto-reloads |
| DocType JSON, patches, fixtures | `bench --site ury.localhost migrate` |
| `hooks.py` | Restart `bench start` |
| React app | `yarn workspace <app> dev` (HMR) or `yarn build` |
| Desk JS/CSS | The `watch` process rebuilds automatically |

### Ports

| Service | Native | Docker |
|---|---|---|
| Web | 8000 | 8080 (nginx) |
| Socket.io | 9000 | via nginx |
| Redis cache / queue | 13000 / 11000 | internal |
| MariaDB | 3306 | internal |
| Vite dev (pos / frontend / self-order) | 5173 / 5174 / 5175 | same |

---

## 8. Troubleshooting

### `FileNotFoundError: 'uv'` during `bench init`

bench 5.29+ requires it. `pipx install uv`, then re-run. Answer `y` to the
rollback prompt first so the half-built bench is cleaned up.

### `The engine "node" is incompatible` on `yarn install`

`jsdom@30` requires `^22.22.2 || ^24.15.0 || >=26.0.0`. Ubuntu ships 22.22.1.
Install Node 24 via nvm (§2.4).

### App missing after restore — `Module URY not found`, `list-apps` omits `ury`

`bench migrate` prunes apps from `Installed Application` when they are absent
from `sites/apps.txt`. The tables and data survive; only the registration is
lost. Fix:

```bash
ls -1 apps > sites/apps.txt
bench --site ury.localhost execute frappe.installer.add_to_installed_apps --kwargs "{'app_name': 'ury'}"
bench --site ury.localhost clear-cache
bench --site ury.localhost migrate
```

### Every file shows as modified in `git status`

The checkout came from a CRLF (Windows) tree. Verify with
`git diff --ignore-cr-at-eol --stat` — if that shows nothing, it is purely line
endings:

```bash
git config core.autocrlf input
git config core.eol lf
git checkout -- .      # stash real changes first
```

### `Service redis_cache is not running` during `bench migrate`

bench's Redis instances only run under `bench start`. Either start the bench in
another terminal, or launch them detached:

```bash
redis-server config/redis_cache.conf --daemonize yes
redis-server config/redis_queue.conf --daemonize yes
```

Shut them down (`redis-cli -p 13000 shutdown nosave`) before running
`bench start`, or it will fail to bind the ports.

### 404 on `http://localhost:8000`

Frappe resolves the site from the `Host` header, and `localhost` is not a site.
Set a default site — note modern bench writes `default_site` into
`sites/common_site_config.json`, *not* `sites/currentsite.txt`:

```bash
bench use ury.localhost
```

Restart the web process so it picks up the change.

### `bench start` exits immediately after `schedule.1` stops

The scheduler takes a `FileLock` on `config/scheduler_process`. An orphaned
process from a previous run still holds it, and honcho tears down the whole
stack when one process dies. Find and kill the holder:

```bash
fuser -v ~/frappe-bench/config/scheduler_process
pkill -f 'frappe schedule'      # matches the real process, not 'bench schedule'
```

### `PermissionError: No permission for <DocType>`

A configuration issue, not a code one. Check the user's roles, then whether
`Custom DocPerm` rows exist for that DocType — once anyone edits permissions in
Role Permission Manager, Frappe **ignores the app's JSON DocPerms entirely** for
that DocType. See `docs/AI_ENGINEERING_GUIDE.md` for the full diagnostic order.

### PDF/print output is broken

`wkhtmltopdf` is missing or is the non-patched Qt build. Install the patched
binary from wkhtmltopdf.org rather than the distro package.

---

## 9. Things not to do

- Do not use `npm` in this repo — it is a Yarn classic workspace. A stray
  `package-lock.json` will fight `yarn.lock`.
- Do not hand-edit generated output: `ury/public/{pos,ury,order,mosaic,urypos}`
  or `ury/www/*.html`.
- Do not enable `pos_stock_authority_v2` in `URY Feature Flags` outside a
  disposable test bench — it moves stock authority away from ERPNext's native
  POS posting.
- Do not commit `ignore_csrf`, `developer_mode`, or credentials to a shared site
  config.

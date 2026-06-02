# Donelist Pi clients

Two thin device drivers that bridge the Donelist Supabase backend to the
physical hardware on a Raspberry Pi:

- **`printer/`** consumes queued `print_jobs` rows and renders them to a
  thermal receipt printer over ESC/POS.
- **`scanner/`** reads a USB barcode scanner (HID keyboard) and posts each
  scan to the `resolve-scan` edge function.

These clients contain **no business logic** — they only move bytes. All
routing (what a scan means, what gets printed) lives in the backend's
edge functions. The shared `PrintPayload` contract is in
`pi-clients/shared/models.py` and mirrors `supabase/functions/_shared/types.ts`
and `src/types/print.ts`; keep all three in sync.

Build and validate the v2 backend (migration `0004_v2_hardware.sql` +
`resolve-scan` + `enqueue-print`) **before** standing these clients up.

---

## Quick start (no hardware)

You can exercise the full loop on a laptop with the `dummy` printer
backend and stdin-driven scanner:

```bash
cd pi-clients
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env: set SUPABASE_URL, SUPABASE_ANON_KEY, DEVICE_REFRESH_TOKEN_PATH
# Put the refresh token (see "Pairing the device" below) into the path you set.

# Terminal A — printer reads queued jobs and writes to /tmp/donelist-printer.out
python -m printer.main

# Terminal B — scanner reads codes from stdin
python -m scanner.main
# then type a UPC or ticket URL and press Enter:
#   049000028904
#   https://your-app.vercel.app/t/abc123def
```

Trigger a real print via the backend:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/enqueue-print" \
  -H "Authorization: Bearer $DEVICE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"shopping_list","list_id":"<your-list-uuid>"}'
```

Then `cat /tmp/donelist-printer.out` to inspect the ESC/POS bytes.

Run the test suite (no hardware, no Supabase):

```bash
pip install pydantic pytest
pytest -q
```

---

## Pairing the device

The Pi runs as **the same Supabase user** as the web app, authenticated
via a long-lived refresh token. The clients refresh it on every poll and
persist the rotated token back to disk.

To obtain the initial token:

1. Sign in to the web app on a laptop using the same Google account you
   want the Pi to act as.
2. Open DevTools → Application → Local Storage and find the key named
   `sb-<project-ref>-auth-token`. Its value is a JSON blob with
   `access_token` and `refresh_token` fields.
3. Copy the **refresh_token** value (a long string) to the Pi:
   ```bash
   sudo mkdir -p /var/lib/donelist
   sudo bash -c 'echo "<paste-refresh-token>" > /var/lib/donelist/refresh_token'
   sudo chown donelist:donelist /var/lib/donelist/refresh_token
   sudo chmod 600 /var/lib/donelist/refresh_token
   ```

That's it. The Pi self-rotates from here. If you ever need to revoke it,
sign the user out in Supabase Studio → Authentication → Users.

> **Why a refresh token and not the service-role key?** RLS still applies,
> so a compromised Pi can't see other users' data and the row-level checks
> we built into the schema keep working. The service-role key bypasses RLS
> entirely and is much harder to scope.

---

## Production install (Raspberry Pi)

The systemd units + udev rules assume the layout below. Adapt paths if
yours differ.

```text
/opt/donelist/
    pi-clients/        # this repo's pi-clients directory, checked out
    venv/              # python venv with requirements.txt installed

/etc/donelist/
    config.env         # all the env vars from .env.example

/var/lib/donelist/
    refresh_token      # owned by donelist:donelist, mode 0600
    buffer.sqlite      # created on first run
```

### 1. System user and directories

```bash
sudo useradd --system --home /var/lib/donelist --shell /usr/sbin/nologin donelist
sudo usermod -a -G input donelist
sudo mkdir -p /opt/donelist /etc/donelist /var/lib/donelist
sudo chown -R donelist:donelist /var/lib/donelist
sudo chmod 750 /var/lib/donelist
```

### 2. Code + venv

```bash
sudo git clone https://github.com/jski21/todo.git /opt/donelist/src
sudo ln -s /opt/donelist/src/pi-clients /opt/donelist/pi-clients
sudo python3 -m venv /opt/donelist/venv
sudo /opt/donelist/venv/bin/pip install -r /opt/donelist/pi-clients/requirements.txt
sudo chown -R donelist:donelist /opt/donelist
```

### 3. Config

```bash
sudo install -m 0640 -o root -g donelist \
  /opt/donelist/pi-clients/.env.example /etc/donelist/config.env
sudoedit /etc/donelist/config.env       # fill in real values
```

### 4. Discover the devices

```bash
lsusb                                   # find vendor:product for printer + scanner
sudo evtest                             # confirm which /dev/input/event* the scanner emits
```

Plug the values into `/etc/donelist/udev/99-donelist.rules` (VID/PID placeholders),
then install + reload:

```bash
sudo cp /opt/donelist/pi-clients/udev/99-donelist.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules && sudo udevadm trigger
ls -l /dev/donelist-scanner             # should now exist, owned by root:input
```

Set `SCANNER_DEVICE_PATH=/dev/donelist-scanner` in `/etc/donelist/config.env`.

### 5. systemd

```bash
sudo cp /opt/donelist/pi-clients/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now donelist-printer.service donelist-scanner.service
journalctl -u donelist-printer -f
journalctl -u donelist-scanner -f
```

Both units have `Restart=always`, so they self-recover from crashes,
Supabase outages, and printer power-cycles.

---

## What's in the box

```text
pi-clients/
  shared/
    config.py            env-driven Config dataclass
    supabase_client.py   refresh-token session; edge-function invoker
    models.py            pydantic models for the on-the-wire shapes
    buffer.py            SQLite offline scan queue
  printer/
    main.py              poll-claim-print-mark loop with retry/backoff
    render.py            PrintPayload -> ESC/POS (and a Dummy file backend)
  scanner/
    main.py              evdev or stdin -> resolve-scan -> log
    keymap.py            HID scancode -> char (with shift)
  systemd/               two units with sandboxing
  udev/                  template rule for stable device paths
  tests/                 keymap, render, buffer, model round-trip
```

## Failure-mode notes

- **Atomic print claim** uses `UPDATE ... WHERE id=? AND status='queued'`
  — the row only flips once. A second worker on the same job sees no
  returned row and skips.
- **Retries** are coarse: on print error we bump `attempts`, requeue, and
  the next poll picks it up. After `PRINTER_MAX_ATTEMPTS` we leave it in
  `error` with the message stored, for human review.
- **Offline scans** buffer to `BUFFER_DB_PATH`. The drain runs as a
  background thread and stops on the first network error so we don't
  thrash. Re-sending a ticket scan is idempotent (completing twice is a
  no-op). Re-sending a UPC may bump quantity by one extra — this is the
  documented and accepted tradeoff.
- **Scanner exclusivity**: `SCANNER_GRAB_EXCLUSIVE=true` (default) calls
  `evdev.InputDevice.grab()` so the kiosk Chromium never sees scanner
  keystrokes. Set to `false` only for debugging.

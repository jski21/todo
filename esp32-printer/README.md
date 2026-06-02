# Donelist ESP32 printer client

Firmware that polls Supabase for queued `print_jobs` and drives a TTL
thermal printer over UART2 via ESC/POS. Built on the Arduino-on-ESP32
toolchain with PlatformIO.

This is a **standalone embedded project**. It only talks to the database
over HTTPS (PostgREST) — no Realtime, no WebSocket — and depends on the
v2 backend (`supabase/migrations/0004_v2_hardware.sql` + the
`enqueue-print` edge function) already being live.

## Hardware

- ESP32 dev board (WROOM-32, WROVER, or S3 — `esp32dev` env builds for the original)
- Serial/TTL thermal printer (e.g. CSN-A2, BTHC2-58, Adafruit "Tiny Thermal Printer")
- Wiring (default; reconfigurable in `src/config.h`):

  | ESP32       | Printer    |
  |-------------|------------|
  | GPIO 16 (RX) ← | TX        |
  | GPIO 17 (TX) → | RX        |
  | GND          | GND       |
  | 5V supply (separate!) | VCC |

  **The printer needs its own 5V supply**, often 1.5A+ on a heavy print.
  Don't try to power it from the ESP32's 5V pin — sag during a print
  will brown out the MCU.

## Build / flash

```bash
# install PlatformIO if you haven't
pip install platformio

# fill in your WiFi + Supabase config
cd esp32-printer
cp src/config.h.example src/config.h
$EDITOR src/config.h

# build + flash
pio run -e esp32dev -t upload
pio device monitor          # 115200 baud — watch the boot log
```

## Smoke test without a printer

Add `-DMOCK_PRINTER` to `build_flags` in `platformio.ini` (the line is
already there, commented out) and reflash. Now every ESC/POS write goes
to the USB serial monitor as readable text — you can exercise the full
poll-claim-print-mark loop with no hardware attached.

Trigger a print from the laptop:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/enqueue-print" \
  -H "Authorization: Bearer <user-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"type":"shopping_list","list_id":"<uuid>"}'
```

…or insert a row by hand in Supabase Studio. Within ~10 seconds the
device claims it, "renders" it (mock or real), and flips `status` to
`done` in the table.

## Auth model — service role key, deliberately

This device authenticates with the **service_role** key, not a user JWT.
The service_role key bypasses RLS, which is acceptable here because:

1. The key never leaves the device — it's compiled into `src/config.h`,
   which is gitignored.
2. There's no UI on the device; nothing reads, parses, or forwards the
   key to a browser, an HTTP endpoint, or another process.
3. The other clients (web app, Pi clients) use user JWTs and respect RLS;
   the service-role path is firmware-only.

If this stops being acceptable (e.g. you ever expose the device to a
shared network), swap it for a long-lived user refresh token using the
device-identity pattern documented in the project README.

## QR codes

Set `QR_MODE` in `src/config.h`:

- `QR_MODE_TEXT` (default) — prints `Scan:` then the URL wrapped to
  `PAPER_COLS`. Always works.
- `QR_MODE_NATIVE` — sends the ESC/POS `GS ( k` sequence. Works on most
  Epson-compatible and many generic 58mm/80mm printers, but **many cheap
  clones silently ignore it** (no error, no QR code). Try this once on
  your printer; if a QR doesn't appear, flip back to `QR_MODE_TEXT`.

## Reliability features

- **Atomic claim.** `PATCH /rest/v1/print_jobs?id=eq.<id>&status=eq.queued`
  flips queued → printing in one round-trip. Two devices racing on the
  same job: only one's response will include the row. Loser skips.
- **Stale claim recovery.** On boot, after NTP, the device PATCHes any
  rows stuck in `printing` for longer than `CLAIM_TIMEOUT_MIN` back to
  `queued`. Handles a crash-mid-print on the previous run.
- **Watchdog.** Hardware task watchdog is initialised with
  `WDT_TIMEOUT_S` (60s default) and reset at the top of each loop. A
  hung print reboots the device — and the same job is still `queued`
  (or gets requeued via the stale-claim path).
- **WiFi dropout.** A disconnected radio is detected before each poll;
  the loop reconnects and skips that cycle. Jobs sit safely in `queued`
  until WiFi comes back.

## Files

```text
esp32-printer/
  platformio.ini         board, libs, build flags
  src/
    main.cpp             setup() + loop() + WiFi/NTP
    config.h.example     template; copy to config.h (gitignored)
    supabase.h/.cpp      PostgREST calls + ISO timestamps
    renderer.h/.cpp      JSON payload -> printer commands
    printer.h/.cpp       Adafruit_Thermal + raw ESC/POS (QR, barcode, cut)
```

## What's deliberately not in scope

- USB scanner support (separate device / separate prompt)
- Bluetooth, OTA, web config portal
- Daily-print scheduling (lives in the backend; this client just prints
  whatever lands in `print_jobs`)
- TLS certificate pinning (set `HTTPS_INSECURE=0` and bundle the Supabase
  root CA yourself if you want it)

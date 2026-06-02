// Donelist ESP32 printer client. Polls Supabase for queued print jobs,
// claims them atomically, renders the payload via ESC/POS, and updates
// the job's terminal state.
//
// Loop: WiFi → NTP → fetch queued → for each: claim → parse → render →
// mark done|error. Watchdog feeds at the top of each iteration so a
// hung print (or a printer that pulls flow control low forever) reboots
// the device cleanly. Jobs in 'queued' state survive any reboot.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <esp_task_wdt.h>
#include <time.h>

#include "config.h"
#include "printer.h"
#include "renderer.h"
#include "supabase.h"

// ---- WiFi ----------------------------------------------------------

static void wifiBoot() {
  Serial.printf("connecting to %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long deadline = millis() + 30000;
  while (WiFi.status() != WL_CONNECTED && millis() < deadline) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nIP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\nWiFi: not connected; will retry in main loop");
  }
}

static bool wifiUp() { return WiFi.status() == WL_CONNECTED; }

// ---- NTP -----------------------------------------------------------

static void ntpSync() {
  // pool.ntp.org → UTC; our timestamps render as ISO-Z anyway.
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  unsigned long deadline = millis() + 8000;
  time_t now = 0;
  while (millis() < deadline) {
    time(&now);
    if (now > 1700000000) { Serial.println("NTP synced"); return; }
    delay(250);
  }
  Serial.println("NTP: timed out; timestamps will be empty until sync");
}

// ---- one job ------------------------------------------------------

static void processJob(const QueuedJob& j) {
  Serial.printf("claiming %s (%s)\n", j.id.c_str(), j.type.c_str());
  if (!supabaseClaim(j.id)) {
    Serial.printf("  skip — already claimed\n");
    return;
  }

  // Parse the payload JSON string into a fresh document and hand off.
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, j.payload);
  if (err) {
    String msg = String("payload parse error: ") + err.c_str();
    Serial.println(msg);
    supabaseMarkError(j.id, msg, j.attempts);
    return;
  }
  PrintJobPayload payload;
  if (!deserialisePayload(doc.as<JsonVariantConst>(), payload)) {
    supabaseMarkError(j.id, "payload schema invalid", j.attempts);
    return;
  }

  // Render. Worth noting: ESC/POS over serial is fire-and-forget — we
  // can't detect a print failure unless the printer reports it via
  // GS r 1 (which most clones don't). If serial throws, we'll bubble up.
  renderPayload(payload);

  if (!supabaseMarkDone(j.id)) {
    // The print succeeded but we couldn't mark it; next poll will
    // re-claim a queued row (this one is already 'printing'), and on
    // the next reboot supabaseResetStaleClaims requeues it.
    Serial.println("  warn: print done but markDone failed");
  } else {
    Serial.println("  done");
  }
}

// ---- main loop ----------------------------------------------------

static unsigned long lastPollAt = 0;

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\ndonelist esp32 printer booting");

  esp_task_wdt_init(WDT_TIMEOUT_S, true);
  esp_task_wdt_add(NULL);

  printerInit();
  printerBegin();
  printerSelfTest();

  wifiBoot();
  if (wifiUp()) {
    ntpSync();
    supabaseResetStaleClaims(CLAIM_TIMEOUT_MIN);
  }
  // Force the first poll to fire immediately.
  lastPollAt = millis() - POLL_INTERVAL_MS;
}

void loop() {
  esp_task_wdt_reset();

  if (!wifiUp()) {
    Serial.println("WiFi down; reconnecting");
    WiFi.reconnect();
    delay(2000);
    return;
  }

  unsigned long now = millis();
  if (now - lastPollAt < POLL_INTERVAL_MS) {
    delay(200);
    return;
  }
  lastPollAt = now;

  std::vector<QueuedJob> jobs;
  if (!supabaseFetchQueued(jobs, 5)) {
    return;
  }
  if (jobs.empty()) {
    Serial.println("no queued jobs");
    return;
  }
  Serial.printf("fetched %u queued job(s)\n", (unsigned)jobs.size());
  for (const auto& j : jobs) {
    esp_task_wdt_reset();
    processJob(j);
  }
}

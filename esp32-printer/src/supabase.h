// Thin Supabase REST (PostgREST) client for the ESP32. All four endpoints
// we need: fetch queued jobs, atomic claim, mark done, mark error, plus a
// startup helper to reset stale claimed rows from a crashed run.
//
// Auth uses the service_role key in the Authorization + apikey headers,
// which bypasses RLS. That's only acceptable because this key never
// leaves the device. Do not embed it in any browser-facing build.

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <vector>

struct QueuedJob {
  String id;
  String type;
  int    attempts = 0;
  // Raw payload JSON as a string; parsed downstream by renderer.cpp.
  String payload;
};

// Fetch oldest queued jobs (up to `limit`). Returns true on HTTP success.
bool supabaseFetchQueued(std::vector<QueuedJob>& out, int limit);

// Atomic claim: PATCH only if still status='queued'. Returns true iff
// this device successfully claimed (Supabase returned a row).
bool supabaseClaim(const String& jobId);

// Terminal states.
bool supabaseMarkDone(const String& jobId);
bool supabaseMarkError(const String& jobId, const String& errMsg, int prevAttempts);

// Reset any jobs left in 'printing' for too long (typically from a
// crashed/rebooted device). Run once on boot.
bool supabaseResetStaleClaims(int olderThanMinutes);

// Best-effort: stamp printed_at on a ticket whose linked occurrence
// matches a job we just printed. The job table doesn't track ticket id
// directly; enqueue-print already stamps printed_at when minting, so
// this is a no-op for normal paths. Provided for completeness.
bool supabaseStampTicketPrinted(const String& token);

// ISO 8601 "Z" timestamp via the current system clock. Returns empty
// string if time hasn't been NTP-synced yet.
String isoNowUtc();
String isoOffsetUtc(int offsetSeconds);

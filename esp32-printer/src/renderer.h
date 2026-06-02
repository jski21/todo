// Turns a print_jobs.payload (jsonb) into printer commands. The struct
// shape mirrors the contract in supabase/functions/_shared/types.ts and
// src/types/print.ts — if you change one, change all three.

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <vector>

struct PrintLine {
  String text;
  String qty;      // empty if absent
  bool   checkbox;
};

struct PrintJobPayload {
  String              format;    // "list" | "ticket" | "daily" | "custom"
  String              title;
  String              subtitle;  // empty if absent
  std::vector<PrintLine> lines;
  String              qr;        // empty if absent
  String              barcode;   // empty if absent
  String              footer;    // empty if absent
  bool                cut;
};

// Returns true on success, false on schema error. Errors are logged.
bool deserialisePayload(JsonVariantConst doc, PrintJobPayload& out);

// Render a fully-populated payload to the wired printer.
void renderPayload(const PrintJobPayload& payload);

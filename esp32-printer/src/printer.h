// Thin wrapper over the thermal printer.
//
// Talks to the printer over UART2 via Adafruit_Thermal for the easy bits
// (bold, justify, feed, cut) and drops to raw ESC/POS for QR / barcode
// commands the library doesn't expose.
//
// When MOCK_PRINTER is defined, all output is routed to USB serial as
// human-readable text so the full poll-claim-print-mark loop is testable
// with no physical printer attached.

#pragma once

#include <Arduino.h>

void printerInit();              // init UART, hand off to library, brief self-test
void printerBegin();              // called once printer is wired and warm
void printerSelfTest();           // feed + cut so you can see UART is working

void printerSetTitle();           // bold + double-height, centre
void printerSetNormal();          // unset everything for body text
void printerSetCentre();
void printerSetLeft();

void printerWriteLine(const String& s);
void printerFeed(uint8_t lines);
void printerCut();

// QR — uses QR_MODE from config.h: NATIVE attempts the ESC/POS sequence,
// TEXT prints "Scan: <url>" wrapped to PAPER_COLS.
void printerQR(const String& data);

// Code128 barcode — falls back to plain text if the printer ignores it.
void printerBarcode(const String& data);

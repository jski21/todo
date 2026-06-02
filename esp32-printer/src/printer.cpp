#include "printer.h"
#include "config.h"

#ifndef MOCK_PRINTER
#include <Adafruit_Thermal.h>
#include <HardwareSerial.h>

static HardwareSerial PrinterSerial(2); // UART2
static Adafruit_Thermal thermal(&PrinterSerial);

// Raw ESC/POS write helper.
static inline void rawWrite(const uint8_t* b, size_t n) {
  PrinterSerial.write(b, n);
}
static inline void rawWriteByte(uint8_t b) { PrinterSerial.write(b); }

#else
// MOCK_PRINTER: everything goes to USB serial as readable text.
static inline void mockLog(const String& s) {
  Serial.print("[mock printer] ");
  Serial.println(s);
}
#endif

void printerInit() {
#ifndef MOCK_PRINTER
  PrinterSerial.begin(PRINTER_BAUD, SERIAL_8N1, PRINTER_RX_PIN, PRINTER_TX_PIN);
  thermal.begin();
#else
  Serial.println("[mock printer] init");
#endif
}

void printerBegin() {
#ifndef MOCK_PRINTER
  thermal.wake();
  thermal.setDefault();
#else
  Serial.println("[mock printer] begin");
#endif
}

void printerSelfTest() {
#ifndef MOCK_PRINTER
  thermal.feed(2);
  thermal.println(F("donelist online"));
  thermal.feed(2);
  thermal.cut();
#else
  Serial.println("[mock printer] self test (feed + cut)");
#endif
}

void printerSetTitle() {
#ifndef MOCK_PRINTER
  thermal.boldOn();
  thermal.setSize('L');           // double height + width
  thermal.justify('C');
#else
  Serial.println("[mock printer] set title (bold, L, centre)");
#endif
}

void printerSetNormal() {
#ifndef MOCK_PRINTER
  thermal.boldOff();
  thermal.setSize('S');
  thermal.justify('L');
#else
  Serial.println("[mock printer] set normal");
#endif
}

void printerSetCentre() {
#ifndef MOCK_PRINTER
  thermal.justify('C');
#else
  Serial.println("[mock printer] centre");
#endif
}

void printerSetLeft() {
#ifndef MOCK_PRINTER
  thermal.justify('L');
#else
  Serial.println("[mock printer] left");
#endif
}

void printerWriteLine(const String& s) {
#ifndef MOCK_PRINTER
  thermal.println(s);
#else
  Serial.print("[mock printer] line: ");
  Serial.println(s);
#endif
}

void printerFeed(uint8_t lines) {
#ifndef MOCK_PRINTER
  thermal.feed(lines);
#else
  Serial.print("[mock printer] feed ");
  Serial.println(lines);
#endif
}

void printerCut() {
#ifndef MOCK_PRINTER
  // Adafruit_Thermal::cut() isn't present on all clones; many use ESC/POS
  // GS V 0 for full cut. Send both — the library's no-op is harmless and
  // GS V 0 will be honored by most cutters.
  thermal.feed(3);
  const uint8_t cut[] = {0x1D, 0x56, 0x00};
  rawWrite(cut, sizeof(cut));
#else
  Serial.println("[mock printer] cut");
#endif
}

void printerQR(const String& data) {
#if QR_MODE == QR_MODE_TEXT
  // Always-works fallback: print the URL wrapped to PAPER_COLS.
  printerSetCentre();
  printerWriteLine("Scan:");
  // Wrap to PAPER_COLS so long URLs stay readable.
  String s = data;
  while ((int)s.length() > PAPER_COLS) {
    printerWriteLine(s.substring(0, PAPER_COLS));
    s = s.substring(PAPER_COLS);
  }
  if (s.length() > 0) printerWriteLine(s);
  printerSetLeft();
  return;
#else
  // ESC/POS native QR (GS ( k). Many cheap printers silently ignore this.
  // Sequence: model 2 → module size 6 → ECC L → store data → print.
  #ifndef MOCK_PRINTER
  // Model 2
  const uint8_t model[]    = {0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00};
  // Module size 6 (1..16)
  const uint8_t modSize[]  = {0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06};
  // Error correction L (48), M(49), Q(50), H(51)
  const uint8_t ecc[]      = {0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30};
  rawWrite(model,   sizeof(model));
  rawWrite(modSize, sizeof(modSize));
  rawWrite(ecc,     sizeof(ecc));

  // Store data: pL pH 31 50 30 d1...dn  where pL + pH*256 = (n + 3)
  size_t len = data.length();
  size_t store = len + 3;
  uint8_t pL = (uint8_t)(store & 0xFF);
  uint8_t pH = (uint8_t)((store >> 8) & 0xFF);
  const uint8_t storeHdr[] = {0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30};
  rawWrite(storeHdr, sizeof(storeHdr));
  rawWrite((const uint8_t*)data.c_str(), len);

  // Print
  const uint8_t prn[] = {0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30};
  rawWrite(prn, sizeof(prn));
  #else
  mockLog(String("QR: ") + data);
  #endif
#endif
}

void printerBarcode(const String& data) {
#ifndef MOCK_PRINTER
  // ESC/POS Code128: GS k 73 n d1..dn (function 73 = Code128).
  // Many printers want a control char prefix ({A/{B/{C); we use {B for ASCII.
  String payload = "{B" + data;
  size_t n = payload.length();
  if (n > 255) {
    // Too long for Code128 in one symbol; fall back to text.
    printerWriteLine(data);
    return;
  }
  const uint8_t hdr[] = {0x1D, 0x6B, 73, (uint8_t)n};
  rawWrite(hdr, sizeof(hdr));
  rawWrite((const uint8_t*)payload.c_str(), n);
  // Some printers want HRI text under; the user can configure that out
  // via the printer's own buttons.
#else
  Serial.print("[mock printer] barcode: ");
  Serial.println(data);
#endif
}

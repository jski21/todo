#include "renderer.h"
#include "printer.h"
#include "config.h"

// ---- helpers ---------------------------------------------------------

static String dashes(int n) {
  String s;
  s.reserve(n);
  for (int i = 0; i < n; ++i) s += '-';
  return s;
}

static String truncated(const String& s, int width) {
  if ((int)s.length() <= width) return s;
  if (width <= 1) return s.substring(0, width);
  return s.substring(0, width - 1) + "~";   // "~" reads better than "…" on ASCII printers
}

// Layout a single PrintLine into one or more visual lines within `width`.
//
// Layout (width = 32 example):
//   [ ] <text padded with spaces><qty right-aligned>
// Continuation lines indent under the text column.
static std::vector<String> layoutLine(const PrintLine& ln, int width) {
  std::vector<String> out;
  String prefix = ln.checkbox ? "[ ] " : "";
  String qty = ln.qty;
  int bodyWidth = width - (int)prefix.length();
  int qtyPad = qty.length() ? (int)qty.length() + 1 : 0; // " <qty>"
  int textRoom = bodyWidth - qtyPad;
  if (textRoom < 8) {
    out.push_back(prefix + truncated(ln.text, bodyWidth));
    if (qty.length()) {
      String pad;
      for (size_t i = 0; i < prefix.length(); ++i) pad += ' ';
      out.push_back(pad + qty);
    }
    return out;
  }

  // Greedy word wrap on textRoom.
  String text = ln.text;
  // First chunk fills (textRoom) chars; remaining chunks fill bodyWidth.
  std::vector<String> wrapped;
  String cur;
  int i = 0;
  while (i < (int)text.length()) {
    // Skip leading whitespace
    while (i < (int)text.length() && text[i] == ' ') i++;
    int wordStart = i;
    while (i < (int)text.length() && text[i] != ' ') i++;
    String word = text.substring(wordStart, i);
    if (word.length() == 0) break;

    int limit = (wrapped.size() == 0) ? textRoom : bodyWidth;
    if ((int)cur.length() == 0) {
      // Hard-split words longer than limit.
      while ((int)word.length() > limit) {
        wrapped.push_back(word.substring(0, limit));
        word = word.substring(limit);
        limit = bodyWidth;
      }
      cur = word;
    } else if ((int)cur.length() + 1 + (int)word.length() <= limit) {
      cur = cur + " " + word;
    } else {
      wrapped.push_back(cur);
      while ((int)word.length() > bodyWidth) {
        wrapped.push_back(word.substring(0, bodyWidth));
        word = word.substring(bodyWidth);
      }
      cur = word;
    }
  }
  if (cur.length()) wrapped.push_back(cur);
  if (wrapped.empty()) wrapped.push_back("");

  for (size_t k = 0; k < wrapped.size(); ++k) {
    if (k == 0) {
      String pad;
      int spaces = textRoom - (int)wrapped[k].length();
      while (spaces-- > 0) pad += ' ';
      if (qty.length()) {
        out.push_back(prefix + wrapped[k] + pad + " " + qty);
      } else {
        out.push_back(prefix + wrapped[k]);
      }
    } else {
      String pad;
      for (size_t j = 0; j < prefix.length(); ++j) pad += ' ';
      out.push_back(pad + wrapped[k]);
    }
  }
  return out;
}

// ---- deserialise ----------------------------------------------------

bool deserialisePayload(JsonVariantConst doc, PrintJobPayload& out) {
  if (!doc.is<JsonObjectConst>()) {
    Serial.println("payload: not an object");
    return false;
  }
  out.format   = doc["format"]   | "custom";
  out.title    = doc["title"]    | "";
  out.subtitle = doc["subtitle"] | "";
  out.qr       = doc["qr"]       | "";
  out.barcode  = doc["barcode"]  | "";
  out.footer   = doc["footer"]   | "";
  out.cut      = doc["cut"]      | true;

  out.lines.clear();
  JsonArrayConst arr = doc["lines"].as<JsonArrayConst>();
  if (!arr.isNull()) {
    for (JsonVariantConst v : arr) {
      PrintLine ln;
      ln.text     = v["text"]     | "";
      ln.qty      = v["qty"]      | "";
      ln.checkbox = v["checkbox"] | false;
      out.lines.push_back(ln);
    }
  }
  return true;
}

// ---- render --------------------------------------------------------

void renderPayload(const PrintJobPayload& payload) {
  const int width = PAPER_COLS;

  // Title
  printerSetTitle();
  printerWriteLine(truncated(payload.title, width));
  printerSetNormal();
  printerSetCentre();

  if (payload.subtitle.length()) {
    printerWriteLine(truncated(payload.subtitle, width));
  }
  printerWriteLine(dashes(width));
  printerSetLeft();

  // Body
  for (size_t i = 0; i < payload.lines.size(); ++i) {
    auto visual = layoutLine(payload.lines[i], width);
    for (auto& v : visual) printerWriteLine(v);
  }

  // QR
  if (payload.qr.length()) {
    printerFeed(1);
    printerSetCentre();
    printerQR(payload.qr);
    printerSetLeft();
  }

  // Code128 barcode
  if (payload.barcode.length()) {
    printerFeed(1);
    printerSetCentre();
    printerBarcode(payload.barcode);
    printerSetLeft();
  }

  // Footer
  if (payload.footer.length()) {
    printerFeed(1);
    printerSetCentre();
    printerWriteLine(truncated(payload.footer, width));
    printerSetLeft();
  }

  // Always feed a few before the cut so the blade clears the content.
  printerFeed(3);
  if (payload.cut) {
    printerCut();
  }
}

#include "supabase.h"
#include "config.h"

#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>

// ---- HTTPS client helper -------------------------------------------

static WiFiClientSecure& secureClient() {
  static WiFiClientSecure client;
  static bool inited = false;
  if (!inited) {
#if HTTPS_INSECURE
    client.setInsecure();  // skip cert verification — see config.h
#else
    // To verify, set the project's root CA into a PEM constant and call:
    //   client.setCACert(SUPABASE_ROOT_CA_PEM);
#endif
    inited = true;
  }
  return client;
}

static void addCommonHeaders(HTTPClient& http) {
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=representation");
}

// urlencode for path parameters (PostgREST tolerates raw `:` and `,` but
// not `+` / `&` / spaces; encode defensively).
static String urlEncode(const String& in) {
  String out;
  for (size_t i = 0; i < in.length(); ++i) {
    char c = in[i];
    if ((c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') ||
        (c >= 'a' && c <= 'z') || c == '-' || c == '_' || c == '.' || c == '~') {
      out += c;
    } else {
      char buf[4];
      snprintf(buf, sizeof(buf), "%%%02X", (uint8_t)c);
      out += buf;
    }
  }
  return out;
}

// ---- time -----------------------------------------------------------

String isoNowUtc() { return isoOffsetUtc(0); }

String isoOffsetUtc(int offsetSeconds) {
  time_t now;
  time(&now);
  if (now < 1700000000) return "";   // clock not yet NTP-synced
  now += offsetSeconds;
  struct tm t;
  gmtime_r(&now, &t);
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &t);
  return String(buf);
}

// ---- generic GET / PATCH wrappers ----------------------------------

static int httpGet(const String& path, String& outBody) {
  WiFiClientSecure& client = secureClient();
  HTTPClient http;
  String url = String(SUPABASE_URL) + path;
  if (!http.begin(client, url)) return -1;
  addCommonHeaders(http);
  int code = http.GET();
  if (code > 0) outBody = http.getString();
  http.end();
  return code;
}

static int httpPatch(const String& path, const String& body, String& outBody) {
  WiFiClientSecure& client = secureClient();
  HTTPClient http;
  String url = String(SUPABASE_URL) + path;
  if (!http.begin(client, url)) return -1;
  addCommonHeaders(http);
  int code = http.PATCH(body);
  if (code > 0) outBody = http.getString();
  http.end();
  return code;
}

// ---- queries -------------------------------------------------------

bool supabaseFetchQueued(std::vector<QueuedJob>& out, int limit) {
  out.clear();
  String path = String("/rest/v1/print_jobs?status=eq.queued")
              + "&order=created_at.asc"
              + "&limit=" + String(limit)
              + "&select=id,type,attempts,payload";
  String body;
  int code = httpGet(path, body);
  if (code != 200) {
    Serial.printf("fetchQueued: HTTP %d\n", code);
    return false;
  }
  // Parse top-level array; for each, store payload as a re-serialised string
  // so the renderer can parse it with its own JsonDocument.
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.printf("fetchQueued: JSON err %s\n", err.c_str());
    return false;
  }
  for (JsonVariantConst row : doc.as<JsonArrayConst>()) {
    QueuedJob j;
    j.id       = row["id"]       | "";
    j.type     = row["type"]     | "";
    j.attempts = row["attempts"] | 0;
    String s;
    serializeJson(row["payload"], s);
    j.payload = s;
    if (j.id.length()) out.push_back(j);
  }
  return true;
}

bool supabaseClaim(const String& jobId) {
  // Filter on status=queued so only the first claimant wins.
  String path = String("/rest/v1/print_jobs?id=eq.") + urlEncode(jobId)
              + "&status=eq.queued";
  String now = isoNowUtc();
  String body = String("{\"status\":\"printing\",\"claimed_at\":\"") + now + "\"}";
  String resp;
  int code = httpPatch(path, body, resp);
  if (code != 200) {
    Serial.printf("claim %s: HTTP %d\n", jobId.c_str(), code);
    return false;
  }
  // Empty array → another worker beat us to it.
  return resp.indexOf("\"id\"") >= 0;
}

bool supabaseMarkDone(const String& jobId) {
  String path = String("/rest/v1/print_jobs?id=eq.") + urlEncode(jobId);
  String now = isoNowUtc();
  String body = String("{\"status\":\"done\",\"printed_at\":\"") + now + "\",\"error\":null}";
  String resp;
  int code = httpPatch(path, body, resp);
  if (code != 200) {
    Serial.printf("markDone %s: HTTP %d\n", jobId.c_str(), code);
    return false;
  }
  return true;
}

static String escapeJsonString(const String& s) {
  String out;
  out.reserve(s.length() + 4);
  for (size_t i = 0; i < s.length(); ++i) {
    char c = s[i];
    switch (c) {
      case '"':  out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if ((uint8_t)c < 0x20) {
          char buf[8];
          snprintf(buf, sizeof(buf), "\\u%04X", (uint8_t)c);
          out += buf;
        } else {
          out += c;
        }
    }
  }
  return out;
}

bool supabaseMarkError(const String& jobId, const String& errMsg, int prevAttempts) {
  String path = String("/rest/v1/print_jobs?id=eq.") + urlEncode(jobId);
  String msg = errMsg.length() > 800 ? errMsg.substring(0, 800) : errMsg;
  String body = String("{\"status\":\"error\",\"error\":\"")
              + escapeJsonString(msg)
              + "\",\"attempts\":" + String(prevAttempts + 1) + "}";
  String resp;
  int code = httpPatch(path, body, resp);
  if (code != 200) {
    Serial.printf("markError %s: HTTP %d\n", jobId.c_str(), code);
    return false;
  }
  return true;
}

bool supabaseResetStaleClaims(int olderThanMinutes) {
  String cutoff = isoOffsetUtc(-olderThanMinutes * 60);
  if (cutoff.length() == 0) {
    Serial.println("resetStale: skipping — clock not yet synced");
    return false;
  }
  String path = String("/rest/v1/print_jobs?status=eq.printing")
              + "&claimed_at=lt." + cutoff;
  String body = "{\"status\":\"queued\",\"claimed_at\":null}";
  String resp;
  int code = httpPatch(path, body, resp);
  if (code != 200) {
    Serial.printf("resetStale: HTTP %d\n", code);
    return false;
  }
  Serial.printf("resetStale: response len=%u\n", (unsigned)resp.length());
  return true;
}

bool supabaseStampTicketPrinted(const String& token) {
  String path = String("/rest/v1/tickets?token=eq.") + urlEncode(token);
  String body = String("{\"printed_at\":\"") + isoNowUtc() + "\"}";
  String resp;
  int code = httpPatch(path, body, resp);
  return code == 200;
}

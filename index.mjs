import { createServer } from "node:http";

// Inline acronym definitions to avoid reading a separate JSON file
const ACRONYMS = {
  MAAG: "MAAG — Military Assistance Advisory Group (U.S. advisory mission).",
  MACV: "MACV — Military Assistance Command, Vietnam (U.S. command in Vietnam).",
  ARVN: "ARVN — Army of the Republic of Vietnam (South Vietnamese army).",
  VC: "VC — Viet Cong (Vietnamese communist forces).",
  NVA: "NVA — North Vietnamese Army (regular forces of North Vietnam).",
  DMZ: "DMZ — Demilitarized Zone (border zone between North and South Vietnam).",
  KIA: "KIA — Killed in Action (military casualty classification).",
  MIA: "MIA — Missing in Action (personnel unaccounted for).",
  POW: "POW — Prisoner of War (captured military personnel).",
  USMC: "USMC — United States Marine Corps (military branch).",
  USAF: "USAF — United States Air Force (military branch).",
  USN: "USN — United States Navy (military branch).",
  "R&R": "R&R — Rest and Recuperation (leave period for military personnel).",
  FOB: "FOB — Forward Operating Base (tactical military base).",
  LZ: "LZ — Landing Zone (helicopter landing area)."
};

const SUPPORTED_PATHS = ["/", "/slacronym"];
const SUGGESTION_TEXT = "Try: MAAG, MACV, ARVN, VC, NVA, DMZ, KIA, MIA, POW, USMC, USAF, USN, R&R, FOB, or LZ";

function lookupAcronym(term) {
  if (!term) return null;

  const key = term.trim().toUpperCase();
  return ACRONYMS[key] ?? null;
}

function slackEphemeral(text) {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      response_type: "ephemeral",
      text
    })
  };
}

function notFound() {
  return {
    statusCode: 404,
    headers: { "content-type": "text/plain" },
    body: "not found"
  };
}

function extractMethod(event = {}) {
  const method =
    event.requestContext?.http?.method ||
    event.httpMethod ||
    "GET";

  return method.toUpperCase();
}

function extractPath(event = {}) {
  return event.rawPath || event.path || "/";
}

function extractQuery(event = {}) {
  return event.queryStringParameters || {};
}

function isKnownPath(path) {
  return SUPPORTED_PATHS.includes(path);
}

function extractTextFromQuery(qs) {
  return qs.text || qs.term || "";
}

function parseBody(event) {
  const body = event.body || "";
  const isBase64 = event.isBase64Encoded === true;

  if (!body) return "";
  
  try {
    return isBase64 ? Buffer.from(body, "base64").toString("utf8") : body;
  } catch (error) {
    console.error("Error parsing body:", error);
    return "";
  }
}

function normalizeHeaderName(name) {
  return name?.toLowerCase() || "";
}

function extractContentType(headers = {}) {
  if (!headers || typeof headers !== "object") return "";
  
  const raw =
    headers["content-type"] ||
    headers["Content-Type"] ||
    "";

  return normalizeHeaderName(raw);
}

function textFromFormUrlencoded(encodedBody) {
  const params = new URLSearchParams(encodedBody);
  return params.get("text") || params.get("term") || "";
}

function textFromJson(body) {
  if (!body || typeof body !== "string") return "";
  try {
    const obj = JSON.parse(body);
    return obj.text || obj.term || "";
  } catch (error) {
    // Not valid JSON, return empty string
    return "";
  }
}

function extractTextFromEvent(event = {}) {
  const method = extractMethod(event);
  const qs = extractQuery(event);

  if (method !== "POST") return extractTextFromQuery(qs);

  const decodedBody = parseBody(event);
  if (!decodedBody) return extractTextFromQuery(qs);
  
  const headers = event.headers || {};
  const contentType = extractContentType(headers);

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const fromBody = textFromFormUrlencoded(decodedBody);
    if (fromBody) return fromBody;
  }

  if (contentType.includes("application/json")) {
    const fromBody = textFromJson(decodedBody);
    if (fromBody) return fromBody;
  }

  return extractTextFromQuery(qs);
}

// Works for:
// - Lambda Function URL / API Gateway (exports.handler)
// - Local node server (node index.mjs)
export async function handler(event = {}) {
  try {
    console.log("Handler invoked, event keys:", Object.keys(event));
    const path = extractPath(event);
    console.log("Path:", path);

    if (!isKnownPath(path)) {
      return notFound();
    }

    const rawText = extractTextFromEvent(event);
    const normalized = rawText.trim();
    console.log("Normalized text:", normalized);

    const found = lookupAcronym(normalized);
    if (found) return slackEphemeral(found);

    if (!normalized) {
      return slackEphemeral(SUGGESTION_TEXT);
    }

    const message = `Unknown acronym: ${normalized.toUpperCase()}`;
    return slackEphemeral(message);
  } catch (error) {
    console.error("Handler error:", error);
    console.error("Error stack:", error.stack);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        response_type: "ephemeral",
        text: `Error: ${error.message}`
      })
    };
  }
}

function toLambdaLikeEvent(req, body) {
  const url = new URL(req.url, "http://localhost");

  return {
    requestContext: { http: { method: req.method } },
    rawPath: url.pathname,
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    headers: req.headers,
    body,
    isBase64Encoded: false
  };
}

function startLocalServer(port = 3000) {
  const server = createServer((req, res) => {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const event = toLambdaLikeEvent(req, body);

      const out = await handler(event);

      res.statusCode = out.statusCode || 200;
      for (const [key, value] of Object.entries(out.headers || {})) {
        res.setHeader(key, value);
      }
      res.end(out.body || "");
    });
  });

  server.listen(port, () => {
    console.log(`slacronym listening on http://localhost:${port}`);
  });
}

/* Local dev server:
   node index.mjs
   curl "http://localhost:3000/slacronym?text=MAAG"
*/
if (import.meta.url === `file://${process.argv[1]}`) {
  startLocalServer();
}


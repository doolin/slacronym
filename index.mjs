import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = dirname(moduleFilename);
const ACRONYMS_PATH = join(moduleDirname, "acronyms.json");
const HTML_PATH = join(moduleDirname, "public", "index.html");
const VERSION_PATH = join(moduleDirname, "version.json");

function loadAcronyms() {
  try {
    const raw = readFileSync(ACRONYMS_PATH, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("acronyms.json must contain a JSON object at the root");
    }

    return Object.freeze(parsed);
  } catch (error) {
    console.error("Failed to load acronyms.json:", error);
    return Object.freeze({});
  }
}

const ACRONYMS = loadAcronyms();

function loadBuildSha() {
  try {
    const raw = readFileSync(VERSION_PATH, "utf8");
    return JSON.parse(raw).sha || "";
  } catch {
    return "";
  }
}

const BUILD_SHA = loadBuildSha();

function loadHtmlPage() {
  try {
    const raw = readFileSync(HTML_PATH, "utf8");
    const shortSha = BUILD_SHA.slice(0, 7);
    const display = shortSha ? shortSha : "dev";
    return raw.replace("<!-- BUILD_SHA -->", display);
  } catch (error) {
    console.error("Failed to load index.html:", error);
    return "<html><body>slacronym</body></html>";
  }
}

const HTML_PAGE = loadHtmlPage();

const SUPPORTED_PATHS = ["/", "/slacronym"];
function buildSuggestionText() {
  const keys = Object.keys(ACRONYMS);
  if (keys.length === 0) return "No acronyms configured.";
  if (keys.length === 1) return `Try: ${keys[0]}`;

  const prefix = keys.slice(0, -1).join(", ");
  const suffix = keys[keys.length - 1];
  return `Try: ${prefix}, or ${suffix}`;
}

const SUGGESTION_TEXT = buildSuggestionText();

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
      text,
    }),
  };
}

function htmlResponse(body) {
  return {
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body,
  };
}

function jsonResponse(content) {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: content,
  };
}

function wantsHtml(event) {
  const accept = (event.headers?.accept || event.headers?.Accept || "").toLowerCase();
  return accept.includes("text/html");
}

function notFound() {
  return {
    statusCode: 404,
    headers: { "content-type": "text/plain" },
    body: "not found",
  };
}

function extractMethod(event = {}) {
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";

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

  const raw = headers["content-type"] || headers["Content-Type"] || "";

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
  } catch {
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
export function handler(event = {}) {
  try {
    const path = extractPath(event);

    if (path === "/acronyms.json") {
      return jsonResponse(JSON.stringify(ACRONYMS));
    }

    if (!isKnownPath(path)) {
      return notFound();
    }

    const rawText = extractTextFromEvent(event);
    const normalized = rawText.trim();

    if (wantsHtml(event) && !normalized) {
      return htmlResponse(HTML_PAGE);
    }

    const found = lookupAcronym(normalized);
    if (found) return slackEphemeral(found);

    if (!normalized) {
      return slackEphemeral(SUGGESTION_TEXT);
    }

    const message = `Unknown acronym: ${normalized.toUpperCase()}`;
    return slackEphemeral(message);
  } catch (error) {
    console.error("Handler error:", error);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        response_type: "ephemeral",
        text: `Error: ${error.message}`,
      }),
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
    isBase64Encoded: false,
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
  startLocalServer(Number(process.env.PORT) || 3000);
}

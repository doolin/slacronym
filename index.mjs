import { readFileSync } from "node:fs";

const ACRONYMS = JSON.parse(
  readFileSync(new URL("./acronyms.json", import.meta.url), "utf8")
);

function lookup(term) {
  if (!term) return null;
  const key = term.trim().toUpperCase();
  return ACRONYMS[key] ?? null;
}

function slackishResponse(text) {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      response_type: "ephemeral",
      text
    })
  };
}

// Works for:
// - Lambda Function URL / API Gateway (exports.handler)
// - Local node server (node index.mjs)
export async function handler(event = {}) {
  const method = (event.requestContext?.http?.method || event.httpMethod || "GET").toUpperCase();
  const rawPath = event.rawPath || event.path || "/";
  const qs = event.queryStringParameters || {};

  if (rawPath !== "/" && rawPath !== "/slacronym") {
    return { statusCode: 404, headers: { "content-type": "text/plain" }, body: "not found" };
  }

  // Accept:
  // - GET /slacronym?text=MAAG
  // - POST x-www-form-urlencoded with "text=MAAG" (Slack-like)
  let text = qs.text || qs.term || "";

  if (method === "POST") {
    const body = event.body || "";
    const isB64 = event.isBase64Encoded === true;
    const decoded = isB64 ? Buffer.from(body, "base64").toString("utf8") : body;

    const contentType =
      (event.headers?.["content-type"] || event.headers?.["Content-Type"] || "").toLowerCase();

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(decoded);
      text = params.get("text") || params.get("term") || "";
    } else if (contentType.includes("application/json")) {
      try {
        const obj = JSON.parse(decoded);
        text = obj.text || obj.term || "";
      } catch {
        // ignore
      }
    }
  }

  const result = lookup(text);
  if (result) return slackishResponse(result);

  const normalized = (text || "").trim();
  if (!normalized) {
    return slackishResponse("Try: MAAG or MACV");
  }

  return slackishResponse(`Unknown acronym: ${normalized.toUpperCase()}`);
}

/* Local dev server:
   node index.mjs
   curl "http://localhost:3000/slacronym?text=MAAG"
*/
if (import.meta.url === `file://${process.argv[1]}`) {
  const http = await import("node:http");

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const body = Buffer.concat(chunks).toString("utf8");

      const event = {
        requestContext: { http: { method: req.method } },
        rawPath: url.pathname,
        queryStringParameters: Object.fromEntries(url.searchParams.entries()),
        headers: req.headers,
        body,
        isBase64Encoded: false
      };

      const out = await handler(event);
      res.statusCode = out.statusCode || 200;
      for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
      res.end(out.body || "");
    });
  });

  server.listen(3000, () => {
    console.log("slacronym listening on http://localhost:3000");
  });
}


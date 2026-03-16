/**
 * Handler tests — no server required.
 *
 * These tests call the exported `handler` directly with Lambda Function URL–style
 * event objects. No HTTP server is started and no network calls are made:
 * the handler is a pure function (event → response), so we just pass in
 * a mock event and assert on the returned status and body.
 *
 * That keeps tests fast, deterministic, and safe to run in CI without
 * binding ports or dealing with timeouts.
 */

import { test } from "node:test";
import assert from "node:assert";
import { handler } from "./index.mjs";

function functionUrlEvent({ method = "GET", path = "/", query = {}, body, headers = {} } = {}) {
  return {
    requestContext: { http: { method } },
    rawPath: path,
    queryStringParameters: Object.keys(query).length ? query : undefined,
    headers,
    body: body ?? undefined,
    isBase64Encoded: false,
  };
}

test("handler returns 200 and definition for known acronym (GET)", () => {
  const event = functionUrlEvent({ path: "/slacronym", query: { text: "MAAG" } });
  const res = handler(event);

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body);
  const data = JSON.parse(res.body);
  assert.strictEqual(data.response_type, "ephemeral");
  assert.ok(data.text.includes("Military Assistance Advisory Group"));
});

test("handler returns 200 and definition for known acronym (term param)", () => {
  const event = functionUrlEvent({ path: "/slacronym", query: { term: "VC" } });
  const res = handler(event);

  assert.strictEqual(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.ok(data.text.includes("Viet Cong"));
});

test("handler returns 200 and definition for added Vietnam War ally acronym", () => {
  const event = functionUrlEvent({ path: "/slacronym", query: { text: "ROK" } });
  const res = handler(event);

  assert.strictEqual(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.ok(data.text.includes("Republic of Korea"));
});

test("handler returns 200 and suggestion when text is empty", () => {
  const event = functionUrlEvent({ path: "/slacronym", query: {} });
  const res = handler(event);

  assert.strictEqual(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.ok(data.text.includes("Try:"));
  assert.ok(data.text.includes("FSB"));
});

test("handler returns 200 and unknown message for unknown acronym", () => {
  const event = functionUrlEvent({ path: "/slacronym", query: { text: "UNKNOWN" } });
  const res = handler(event);

  assert.strictEqual(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.ok(data.text.includes("Unknown acronym"));
  assert.ok(data.text.includes("UNKNOWN"));
});

test("handler returns 404 for unsupported path", () => {
  const event = functionUrlEvent({ path: "/other" });
  const res = handler(event);

  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.body, "not found");
});

test("handler accepts POST with form-urlencoded body", () => {
  const event = functionUrlEvent({
    method: "POST",
    path: "/slacronym",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "text=MACV",
  });
  const res = handler(event);

  assert.strictEqual(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.ok(data.text.includes("Military Assistance Command"));
});

test("handler accepts POST with JSON body", () => {
  const event = functionUrlEvent({
    method: "POST",
    path: "/slacronym",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "KIA" }),
  });
  const res = handler(event);

  assert.strictEqual(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.ok(data.text.includes("Killed in Action"));
});

test("handler accepts root path", () => {
  const event = functionUrlEvent({ path: "/", query: { text: "LZ" } });
  const res = handler(event);

  assert.strictEqual(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.ok(data.text.includes("Landing Zone"));
});

test("GET / with Accept: text/html returns HTML page", () => {
  const event = functionUrlEvent({ path: "/", headers: { accept: "text/html" } });
  const res = handler(event);

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.headers["content-type"].includes("text/html"));
  assert.ok(res.body.includes("Slacronym"));
});

test("GET /slacronym with Accept: text/html and no term returns HTML page", () => {
  const event = functionUrlEvent({ path: "/slacronym", headers: { accept: "text/html" } });
  const res = handler(event);

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.headers["content-type"].includes("text/html"));
});

test("GET /slacronym with Accept: text/html and a term returns JSON", () => {
  const event = functionUrlEvent({
    path: "/slacronym",
    query: { term: "MAAG" },
    headers: { accept: "text/html" },
  });
  const res = handler(event);

  assert.strictEqual(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.ok(data.text.includes("Military Assistance Advisory Group"));
});

test("GET /acronyms.json returns JSON with acronym keys", () => {
  const event = functionUrlEvent({ path: "/acronyms.json" });
  const res = handler(event);

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.headers["content-type"].includes("application/json"));
  const data = JSON.parse(res.body);
  assert.ok(data.MAAG);
});

test("handler normalizes acronym to uppercase", () => {
  const event = functionUrlEvent({ path: "/slacronym", query: { text: "maag" } });
  const res = handler(event);

  assert.strictEqual(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.ok(data.text.includes("Military Assistance Advisory Group"));
});

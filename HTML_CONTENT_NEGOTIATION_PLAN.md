# Plan: HTML Content Negotiation for Slacronym

## Goal
Serve an interactive HTML page for browser requests while preserving JSON responses for Slack.

## What's Already Done
- `public/index.html` has been created. It's a self-contained page with:
  - Dark theme, search input + submit button
  - Uses `fetch('/slacronym?term=...')` with `Accept: application/json` to look up acronyms
  - Loads `/acronyms.json` to render clickable acronym tags
  - Fully functional once the server changes below are made

## Remaining Changes to `index.mjs`

### 1. Add HTML_PATH constant (line ~9)
```js
const HTML_PATH = join(moduleDirname, "public", "index.html");
```

### 2. Add an `htmlPage` loader alongside `loadAcronyms()`
Read and cache `public/index.html` at startup, similar to how acronyms are loaded:
```js
function loadHtmlPage() {
  try {
    return readFileSync(HTML_PATH, "utf8");
  } catch (error) {
    console.error("Failed to load index.html:", error);
    return "<html><body>slacronym</body></html>";
  }
}
const HTML_PAGE = loadHtmlPage();
```

### 3. Add helper to detect browser requests
Check the `Accept` header — browsers send `text/html`, Slack never does:
```js
function wantsHtml(event) {
  const accept = (event.headers?.accept || event.headers?.Accept || "").toLowerCase();
  return accept.includes("text/html");
}
```

### 4. Add response helpers
```js
function htmlResponse(body) {
  return {
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body,
  };
}

function jsonFileResponse(content) {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: content,
  };
}
```

### 5. Update `handler()` function
At the top of the handler, before the existing logic:
- If the path is `/acronyms.json`, serve the raw acronyms file (the HTML page fetches this for the tag list)
- If `wantsHtml(event)` and the path is `/` or `/slacronym` and there's no `term`/`text` param, return the HTML page
- Otherwise fall through to existing JSON/Slack logic

```js
export function handler(event = {}) {
  try {
    const path = extractPath(event);

    // Serve acronyms data for the HTML frontend
    if (path === "/acronyms.json") {
      return jsonFileResponse(JSON.stringify(ACRONYMS));
    }

    if (!isKnownPath(path)) {
      return notFound();
    }

    // Serve HTML page for browser requests with no search term
    const rawText = extractTextFromEvent(event);
    const normalized = rawText.trim();

    if (wantsHtml(event) && !normalized) {
      return htmlResponse(HTML_PAGE);
    }

    // Existing Slack JSON logic continues unchanged...
    const found = lookupAcronym(normalized);
    if (found) return slackEphemeral(found);
    // ...etc
```

### 6. Update `SUPPORTED_PATHS` (optional)
You could add `/acronyms.json` to it, or just handle it as a special case before the `isKnownPath` check (shown above).

## Testing

### Manual tests
```bash
# Browser-like request — should return HTML
curl -H "Accept: text/html" http://localhost:3000/

# Slack-like request — should return JSON as before
curl -X POST -d "text=MAAG" http://localhost:3000/slacronym

# HTML page's fetch call — JSON with Accept header
curl -H "Accept: application/json" "http://localhost:3000/slacronym?term=MAAG"

# Acronym list for the frontend
curl http://localhost:3000/acronyms.json
```

### Automated tests to add in `index.test.mjs`
- GET `/` with `Accept: text/html` returns 200 with `content-type: text/html`
- GET `/` without `Accept: text/html` returns JSON (existing behavior preserved)
- GET `/acronyms.json` returns JSON with all acronym keys
- GET `/slacronym?term=MAAG` with `Accept: application/json` returns JSON (the fetch path)
- GET `/slacronym?term=MAAG` with `Accept: text/html` still returns JSON (has a search term, so it's a lookup not a page serve)

## Deployment Notes
- `public/index.html` needs to be included in `deploy.zip` — update `deploy.sh` if it currently only bundles `index.mjs`, `acronyms.json`, and `package.json`
- No new dependencies required

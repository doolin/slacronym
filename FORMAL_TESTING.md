# Formal Testing and Analysis

An assessment of formal techniques applicable to slacronym, a single-file
Node.js acronym lookup service deployed as an AWS Lambda function.

## Current state

The handler is a pure function (`Event → Response`) tested with Node's
built-in test runner. Tests call `handler` directly with synthetic Lambda
Function URL events — no server, no network. The runtime has zero npm
dependencies.

## Applicable techniques

### 1. Property-based testing

The pure-function design makes slacronym an ideal candidate for
property-based testing (e.g., [fast-check](https://github.com/dubzzz/fast-check)).
Generate arbitrary events and verify that invariants hold for all inputs:

- `handler` always returns `{ statusCode, headers, body }`.
- `statusCode` is always one of `200`, `404`, `500`.
- Known paths never produce `404`; unknown paths always do.
- `lookupAcronym` is idempotent and case-insensitive.
- Every key in `acronyms.json` round-trips: `lookupAcronym(key)` returns
  a non-null string.
- Response `body` is always a string (never `undefined` or `null`).

This is the highest-leverage formal technique for this codebase. It would
catch edge cases (empty strings, unicode, very long input) that
example-based tests miss.

### 2. Schema validation

Formally specify the shapes that are currently enforced only by convention:

| Artifact           | Schema constraint                                      |
| ------------------ | ------------------------------------------------------ |
| `acronyms.json`    | Object, all keys non-empty uppercase strings, all values non-empty strings |
| JSON response body | `{ response_type: "ephemeral", text: string }`         |
| `/acronyms.json`   | Same shape as `acronyms.json`                          |

This can be done with `zod`, `ajv`, or plain assertions — no build step
required. Validate `acronyms.json` at load time and response shape in
tests.

### 3. Finite state analysis of request routing

The handler's control flow is a small decision tree:

```
path
 ├─ /acronyms.json → JSON dictionary response
 ├─ unknown path   → 404
 └─ / or /slacronym
     └─ extract text
         ├─ empty + wants HTML → HTML page
         ├─ empty              → suggestion text
         ├─ known acronym      → definition
         └─ unknown acronym    → "Unknown acronym: …"
```

This can be modeled as a table of (path × method × content-type × has-term
× accepts-html) → expected response. Verify completeness: every
combination produces a defined response. Even a manual enumeration is
valuable — there are few enough branches to be exhaustive.

### 4. Threat modeling (input surface)

Systematic analysis of untrusted input flowing through the handler:

- **Query parameters** (`text`, `term`): passed through `.trim().toUpperCase()`
  then used as a dictionary key. Safe — no injection vector, but worth
  verifying that `.toUpperCase()` behaves correctly for non-ASCII input.
- **POST body** (form-urlencoded, JSON, base64-decoded): parsed and
  extracted. Check for prototype pollution via `JSON.parse` (Node is safe
  here, but explicit `Object.hasOwn` checks would document the assumption).
- **Reflected input**: `Unknown acronym: ${normalized.toUpperCase()}` echoes
  user input into a JSON string. Safe for JSON consumers, but if the
  response were ever rendered as HTML, this would be an XSS vector.
  Worth a test that confirms the content-type is `application/json` for
  this path.
- **Path traversal**: `extractPath` returns `rawPath` verbatim; only exact
  matches against `SUPPORTED_PATHS` are accepted. Safe.
- **Input size**: No length limit on query params or body. A formal threat
  model would note this and decide whether Lambda's 6 MB payload limit is
  sufficient mitigation.

### 5. Contract / specification testing

Write an OpenAPI spec for the three endpoints (`/`, `/slacronym`,
`/acronyms.json`) and test conformance. This gives a single source of truth
for request/response shapes that can also generate documentation and client
stubs.

### 6. Information flow analysis

Trace data from input to output:

```
user input → extractTextFromEvent → .trim().toUpperCase() → ACRONYMS[key] → JSON.stringify → response body
```

The flow is short and linear. Verify:
- User input is never placed into response headers.
- User input is always normalized before dictionary lookup.
- The HTML page is static (loaded once at startup); user input does not
  flow into it.

### 7. Zero-dependency verification

The runtime has no npm dependencies — only devDependencies. This is a
strong supply-chain property worth asserting in CI:

```bash
node -e "const p = require('./package.prod.json'); assert(!p.dependencies || Object.keys(p.dependencies).length === 0)"
```

This prevents accidental introduction of runtime dependencies.

## Techniques that are overkill

| Technique                | Why it doesn't fit                                      |
| ------------------------ | ------------------------------------------------------- |
| Model checking (TLA+)   | No concurrency, no distributed state                    |
| Theorem proving (Coq)   | Logic is too simple to justify the overhead              |
| Abstract interpretation  | TypeScript or zod gives 90% of the value                |

## On porting to TypeScript

TypeScript without `any` would make the implicit contracts (event shape,
response shape, dictionary type) machine-checkable at compile time. The
main benefit is typing the Lambda event parameter, which currently relies
on `?.` chains and convention.

However, the tradeoff is modest for this codebase:

- **Adds**: build step, `tsconfig.json`, `@types/node`, source map
  concerns in Lambda.
- **Doesn't help with**: runtime input validation, bad dictionary entries,
  unexpected content types — the actual risk surface.
- **Alternative**: Runtime validation with `zod` or plain assertions at
  the two entry points (`loadAcronyms`, `handler`) catches the same class
  of bugs TypeScript catches plus the ones it cannot, with no build step.

TypeScript would become more valuable if the codebase grows beyond a
single file or gains runtime dependencies with untyped APIs.

## Recommended priority

1. **Property-based tests** on `handler` — highest coverage-per-effort.
2. **Schema validation** on `acronyms.json` at load time — catches data
   errors before they reach users.
3. **Routing completeness table** — small enough to enumerate by hand;
   encode as a parameterized test.
4. **Zero-dependency CI assertion** — trivial to add, high value for
   supply-chain integrity.
5. **Threat model documentation** — lightweight, informs future decisions.

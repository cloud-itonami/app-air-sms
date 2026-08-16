# Operator quickstart — app-air-sms

23 tracked files: an airline safety management system (safety reports, hazard
register, IOSA findings, occurrence reporting, dangerous-goods screening, security
alerts, regulatory filings). It carries the family's second-largest domain registry.

Steps marked ✅ were run on 2026-08-16. §5 says what was not.

**Read `cloud-itonami/app-air-crew/docs/operator-quickstart.md` §0 first.** Five
environment traps are identical across all nine `app-air-*` repositories and are
documented there rather than repeated here — the short version is that the remote is
named `cloud-itonami` and not `origin`, `error: could not read IPC response` is the
fsmonitor daemon rather than your command, and npm 11.16 cannot install `kotoba/`'s
git dependencies without the workaround in §4 below.

**Structural facts about the scaffolding are family-wide**; the table and the command
that measured them are in `app-air-mro`'s quickstart §1. `APP_CAPABILITIES` here holds
`submitSafetyReport`, `assessRisk`, `recordIosaFinding` — the **first three of the
eight** methods in `src/app.ts`'s header comment, in order. The five it omits are
`fileRegulatoryReport`, `reportOccurrence`, `distributeSafetyBulletin`,
`screenDangerousGoods`, `handleSecurityAlert`. It is a truncation, not a curated
subset, and it is documentation rather than enforcement.

---

## 1. ✅ What this repository actually contains

```bash
wc -l src/app.ts kotoba/src/registry.ts kotoba/src/types.ts kotoba/test/air-sms.test.ts
#    76 src/app.ts                     (not deployed — see below)
#   472 kotoba/src/registry.ts         (the domain logic)
#   457 kotoba/src/types.ts
#   212 kotoba/test/air-sms.test.ts
```

**The file that looks like the entry point is not the one that gets deployed.**
`wrangler.jsonc`'s `main` is the SvelteKit build under `svelte/.svelte-kit/cloudflare/`;
`src/app.ts` — which answers `/health` and `/_app/meta` and forwards `/xrpc/*` — is not
in it. `assets.not_found_handling` is `"none"`, so a GET `/health` against the deployed
worker is a 404. A monitor pointed there is watching a path that does not exist.

The nine siblings share this scaffolding and differ in `kotoba/`:

| repo | registry | types | tests |
|---|---|---|---|
| app-air-dcs | 499 | 456 | 10 |
| **app-air-sms** | **472** | **457** | **12** (470 lines / 11 tests before this commit) |
| app-air-crew | 449 | 487 | 11 |
| app-air-mro | 434 | 406 | 12 |
| app-air-ops | 414 | 394 | 11 |
| app-air-yield | 393 | 408 | 9 |
| app-air-cargo | 319 | 287 | 7 |
| app-air-ffp | 301 | 327 | 8 |
| app-air-sched | 287 | 259 | 5 |

**Family-wide findings transfer between siblings; the contents of `kotoba/` do not.**

The registry splits its eight collections deliberately, and the split is the most
important thing to know before reading it:

- **plaintext** (`sdk.write` / `sdk.read`) — operational events, the hazard register,
  safety bulletins, dangerous-goods checks. Public operational safety facts and
  reference catalogs. `safetyBulletin` validates its `hazardId` foreign key via
  `exists()`.
- **E2E-sealed** (`sdk.encryptedWrite` / `sdk.encryptedRead`) — safety reports, IOSA
  findings, security alerts, regulatory filings. Just-culture narratives, confidential
  audit findings and AVSEC content sealed in the kotoba envelope; read-cap is owner DID
  plus recipients. The substrate never sees these in plaintext.

The E2E claim is load-bearing and the tests check it (§4).

## 2. ✅ `coverage()` reported a capped scan as a complete one — fixed here

`coverage()` walks all eight collections under one `maxScan` and returns eight counts
plus a `truncated` flag telling the caller whether it hit the cap. Before this commit
the flag was a hand-listed disjunction over **five** of the eight:

```javascript
truncated:
  operationalEventCount >= maxScan ||
  safetyReportCount     >= maxScan ||
  iosaFindingCount      >= maxScan ||
  securityAlertCount    >= maxScan ||
  regulatoryReportCount >= maxScan,
```

`hazardCount`, `safetyBulletinCount` and `dangerousGoodsCheckCount` are missing. All
three come from the same `countPlaintext(…, maxScan)` as the count that *is* checked,
so all three can hit the cap the same way. **A `coverage()` call that stopped early on
the hazard register returned `truncated: false` — byte-identical to the answer for a
scan that saw everything.** The caller cannot tell a partial hazard register from a
complete one, which is the failure mode the flag exists to prevent.

The predicate is now derived from the counts themselves, so a count added later cannot
be left out of it:

```javascript
const counts = { operationalEventCount, hazardCount, /* …all eight… */ };
return { ...counts, eventsByType, truncated: Object.values(counts).some((n) => n >= maxScan) };
```

This is not a new invention: `app-air-crew` and `app-air-mro` already compute
`truncated` this way. This repository is being brought to the shape its siblings use.

**Verified in both directions.** The new test in `kotoba/test/air-sms.test.ts` fills one
collection at a time to exactly `maxScan: 2` and asserts the flag rises for each of the
eight. Against the registry as it stood on `cloud-itonami/main` it fails — and it fails
on the *hazard* case, after the operationalEvent case has passed, which is what
distinguishes this defect from "coverage is broken in general":

```
git show cloud-itonami/main:kotoba/src/registry.ts > src/registry.ts
npx vitest run     # → Tests  1 failed | 11 passed (12)
                   #   expected true, received false, at the hazardCount case
```

With the fix, `Tests 12 passed (12)`. Three mutants against the fixed code confirm the
test is not passing for free:

| # | mutation | result |
|---|---|---|
| M1 | cap test `n >= maxScan` → `n > maxScan` | **1 failed** / 11 passed |
| M2 | `hazardCount` dropped from the `counts` object | **2 failed** / 10 passed |
| M3 | `truncated` hardcoded `false` | **1 failed** / 11 passed |

Baseline restored afterwards: `Tests 12 passed (12)`. A mutation that silently fails to
apply produces a green run that looks exactly like a surviving mutant, so each edit
above was confirmed to have changed the file before its suite was run.

**Family survey ✅.** Comparing the count keys each sibling's `coverage()` returns
against the ones its `truncated` predicate tests:

```
app-air-cargo   returns 5 counts; all covered      app-air-mro     returns 7; all covered
app-air-crew    returns 8 counts; all covered      app-air-ops     returns 6; all covered
app-air-dcs     returns 7 counts; all covered      app-air-sched   returns 3; all covered
app-air-yield   returns 6 counts; all covered
app-air-ffp     returns 4 counts; NOT covered: tierSummaryCount
app-air-sms     returns 8 counts; NOT covered: hazardCount, safetyBulletinCount, dangerousGoodsCheckCount
```

**Two of nine**, and only `app-air-ffp` still has it — one count, `tierSummaryCount`
(its `memberProfileCount` and `milesLedgerCount` *are* covered, through
`members.length >= maxScan` and `ledger.length >= maxScan`; a survey that matches on
key names alone reports those as gaps and is wrong). Fixing ffp is not attempted here —
this round changed one repository.

## 3. ✅ The landing page told visitors it had no routes and no vars — fixed here

`svelte/src/routes/+page.svelte` embeds a summary object and renders it. Before this
commit it said `"routeCount": 0, "routes": [], "vars": []`, with a `relativePath` still
pointing into the monorepo this repository was extracted from. Each list has an
`{:else}` branch, so the page displayed `Routes 0` and then, verbatim:

> No public route is declared next to this app surface.
> No public vars are declared in the nearest wrangler config.

Both sentences name the wrangler config and both were false: `wrangler.jsonc` declares
two route patterns — one of which is the address the page is served at — and eight vars.

The summary is now populated from `wrangler.jsonc`: `routeCount: 2`, both patterns, the
eight var **names** (the page prints keys only, never values), and a `relativePath`
inside this repository.

**Server-rendering the component shows which branch actually renders.** The sibling
rounds could only show that the strings entered the bundle — Svelte compiles both
branches of an `{#if}` into the component, so a bundle grep cannot answer this. Render
it instead, from inside `svelte/` so that `svelte/internal/server` resolves:

```bash
cd svelte && npm install --no-audit --no-fund
node --input-type=module -e '
import { compile } from "svelte/compiler";
import { render } from "svelte/server";
import fs from "node:fs";
const { js } = compile(fs.readFileSync("src/routes/+page.svelte","utf8"),
                       { generate: "server", name: "Page" });
fs.writeFileSync("./page.ssr.js", js.code);
const out = render((await import("./page.ssr.js")).default);
console.log(out.body.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());
'
rm -f page.ssr.js        # not tracked; do not leave it behind
```

Rendered text, before and after:

```
before: … Routes 0 XRPC enabled Public Routes No public route is declared next to
        this app surface. Runtime Bindings No public vars are declared in the
        nearest wrangler config. Source 60-apps/etzhayyim-project-air-sms/…
after:  … Routes 2 XRPC enabled Public Routes a1rsms01.etzhayyim.com/*
        air-sms.etzhayyim.com/* Runtime Bindings AGENTGATEWAY_MCP_ROUTER_URL
        APP_CAPABILITIES … APP_UI_TYPE Source svelte/src/routes/+page.svelte
```

`npm run build` also succeeds before and after. If you grep the bundle instead, pick the
marker carefully: the two route patterns go 0 → 1 and the monorepo path goes 1 → 0, but
**`AGENTGATEWAY_MCP_ROUTER_URL` goes 3 → 4, not 0 → 1** — the xrpc route reads that
variable, so it is already in the unfixed bundle and is not evidence of anything.

There is no generator for this object in this repository or in the root's `scripts/`,
so it is hand-maintained: **if you change routes or vars in `wrangler.jsonc`, this
object does not follow.**

## 4. ✅ Run the tests

npm 11.16 refuses `kotoba/`'s two git dependencies. The workaround and the two facts it
rests on — the `@etzhayyim/sdk` import is `import type` and therefore erased at runtime,
and `@etzhayyim/sdk-mock` imports nothing from the real SDK — are documented in
`app-air-crew`'s quickstart §6. Both hold here:

```bash
git grep -n '@etzhayyim/sdk' HEAD -- kotoba/src
# → kotoba/src/registry.ts:20:import type { Etzhayyim } from "@etzhayyim/sdk";
```

Applied to this repository, into a copy so the checkout is never edited:

```bash
rm -rf /tmp/sms-sdk && mkdir -p /tmp/sms-sdk && cd /tmp/sms-sdk
git clone -q https://github.com/etzhayyim/com-etzhayyim-sdk-mock.git sdk-mock
git -C sdk-mock checkout -q c857ff9be5310bf433bfe1e8d3c0f677e213d667
node -e 'const fs=require("fs"),f="/tmp/sms-sdk/sdk-mock/package.json";
const p=JSON.parse(fs.readFileSync(f,"utf8"));delete p.dependencies;
fs.writeFileSync(f,JSON.stringify(p,null,2));'

cp -R "$REPO" /tmp/sms-build && cd /tmp/sms-build/kotoba
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));
delete p.dependencies;
p.devDependencies={"@etzhayyim/sdk-mock":"file:/tmp/sms-sdk/sdk-mock","typescript":"^5.6.0","vitest":"^4.1.0"};
fs.writeFileSync("package.json",JSON.stringify(p,null,2));'

npm install --ignore-scripts && npx vitest run
# → Test Files  1 passed (1)
#         Tests  12 passed (12)
```

Twelve tests over the 472-line registry: dedup and range validation on the plaintext
side, and on the E2E side a read-cap check that a non-recipient DID sees nothing.
`svelte/` installs and builds with plain `npm install` — it has no git dependencies.

## 5. ⚠ NOT WALKED, and what that costs

**Neither declared route resolves.** Measured 2026-08-16:

```bash
dig +short A air-sms.etzhayyim.com     # (empty)
dig +short A a1rsms01.etzhayyim.com    # (empty)
dig +short A etzhayyim.com             # 104.21.51.111   — the zone itself is live
curl -o /dev/null -w '%{http_code}' https://air-sms.etzhayyim.com/   # 000
```

So the page fixed in §3 is not currently reachable at either address, and nothing here
was verified against a deployed worker. The fix is correct in the artifact; whether it
ever reaches a visitor depends on a deploy that has not happened.

**The repository declares itself an unremediated seed.** `MIGRATION-TODO.md` says
`Status: 🔄 TRANSFORM — seed copied 2026-05-21, codemod pending`, with seven unticked
boxes of invariants "likely violated and MUST be remediated". Its own closing paragraph
qualifies them, and the qualification belongs with the list:

> The TRANSFORM classification was based on the app's domain pattern …, not on detected
> violations. Manual review is still required.

So they are a category-derived review checklist, not seven confirmed defects. What is
certain is that the review has not happened.

**Also not done here:** the title string is still the mangled `"Ai etzhayyim Project
Air Sms"`; `APP_CAPABILITIES` is still the truncated first three of eight (changing it
would need to be a family-wide decision, since all nine are truncated identically); the
`total` field returned by the four plaintext `list*` functions counts matches **within
the current page** while the four E2E ones count matches across the whole scan — an
inconsistency that is visible in the code but that no test pins down, and that this
round did not change; and `app-air-ffp`'s `tierSummaryCount` gap from §2 is left for a
later round.

## 6. What the maturity instrument sees here ✅

```
· orgs/cloud-itonami/app-air-sms  own=0.049  axis-docs=0bp → +2500bp
    ⚠ README が .md ではないので docs の README 成分は 0（README.edn 等が 1 件）
    ⚠ taxonomy に :repo/kind の行が無い → :default の重みで採点されている
```

Both warnings are about the instrument, not this repository. `README.edn` declares
`:canonical-metadata :edn`, so EDN is deliberately canonical here while the score reads
`README.md`; and this repository has no row in `manifest/repo-taxonomy.edn`, so it is
scored against a guessed weight profile and its `own` is not comparable to a repository
whose kind is known. Recorded in ADR-2608052000 — neither is a gap to close by adding a
second README.

# operator-quickstart — app-air-sms

**この repo で今日実際にできることを、踏める形で上から書く。** 所要 5 分。
Cloudflare のアカウントは要らない（§6 の deploy だけが要る）。

出力はすべて実際に walk した結果である（2026-08-18）。

> この文書は移行（`docs/adr/0001`）で全面的に書き直した。旧版は appview が
> TypeScript/Svelte だった頃の手順（`npm run build`、`svelte/` の install、
> `+page.svelte` の手編集）を書いており、移行がそれを偽にした。
> `kotoba/` の walk（§5）だけは旧版の内容が今も正しいので引き継いでいる。

## 0. 前提と、この機械の罠

| 要るもの | 確認 | この walk で使った版 |
|---|---|---|
| git | `git --version` | 2.51.0 |
| nbb | `npx --yes nbb --version` | v1.4.208 |
| node | `node --version` | ビルドと smoke に必要 |
| clojure | `clojure --version` | ビルド時のみ |

**west checkout の remote は `origin` ではなく org 名（`cloud-itonami`）である。**
`git fetch origin` は失敗するが、それは repo が無いという意味ではない。

**`error: could not read IPC response` は fsmonitor daemon の雑音**であって、
実行したコマンドの失敗ではない。気になるなら `-c core.fsmonitor=false` を付ける。

**`/tmp` に決め打ちの名前で一時ファイルを置かない。** この機械では複数の agent が
同時に走っており、実測 2026-08-18、`/tmp/worker.bak` が別 repo の作業に
**上書きされ**、復元したら他の repo の namespace が入った。`mktemp -d` を 1 回
呼んでその下に置くこと。

## 1. ✅ 取得して、書いてあることが本当か検査する

```bash
git clone git@github.com:cloud-itonami/app-air-sms.git
cd app-air-sms
REPO=$PWD
npx --yes nbb scripts/verify-docs-claims.cljs .
```

実際の出力（末尾）:

```
SCANNED	25
PASS	tracked-files	expected=25	actual=25
PASS	inherited-bytes	expected=54531	actual=54531
PASS	preserved-files-unchanged	expected=[]	actual=[]
PASS	removed-by-migration-absent	expected=[]	actual=[]
PASS	svelte-artifacts	expected=0	actual=0
PASS	appview-ts-files	expected=0	actual=0
PASS	kotoba-files	expected=7	actual=7
PASS	kotoba-ts-files	expected=5	actual=5
PASS	production-canonical-files	expected=4	actual=4
PASS	wrangler-main	expected="dist/worker.js"	actual="dist/worker.js"
PASS	declared-vars	expected=8	actual=8
PASS	declared-routes	expected=2	actual=2
PASS	no-stale-assets-binding	expected=true	actual=true
PASS	sveltekit-compat-flags	expected=0	actual=0
PASS	shadow-builds-that-main	expected=true	actual=true
PASS	warnings-as-errors-in-compiler-options	expected=true	actual=true
PASS	warnings-as-errors-not-misplaced	expected=true	actual=true
PASS	page-renders-route-table	expected=true	actual=true
SCANNED-ADR	1
PASS	adr-reads-as-edn	expected=[]	actual=[]
OK	every claim in README.md and docs/operator-quickstart.md holds (19 claims)
```

**`<dir>` は引数の先頭に置く**（多くの gate が最初の非フラグ引数を tree のパスと
読むため）。**exit 2（UNDETERMINED）は 0 ではない** —— tree を読み切れなかった
という別の答えで、「検査して問題なし」と混ぜない。

この検査には移行の不変条件が入っている: appview の TypeScript が戻っていないこと
（撤去した 9 パスの不在 + `.ts` の総数）、`kotoba/` が黙って増えていないこと、
`wrangler.jsonc` の `main` が shadow の出力先を指していること、ページが route 表から
描かれていること、そして `:warnings-as-errors` が **shadow が実際に読む map に
在ること**。

## 2. ✅ テストを走らせる（ビルド不要・ブラウザ不要）

判断（`route.cljc`）と描画（`view.cljc`）は純 `.cljc` なので、nbb だけで回る。

```bash
W=$(mktemp -d)                                   # 決め打ちの /tmp 名を使わない
K=~/github/com-junkawasaki/orgs/kotoba-lang
CP="src:test:$K/jp-go-digital-design-system/src:$K/html/src:$K/css/src"
cat > "$W/run-tests.cljs" <<'EOF'
(require '[cljs.test :refer [run-tests]] 'airsms.route-test)
(run-tests 'airsms.route-test)
EOF
npx --yes nbb --classpath "$CP" "$W/run-tests.cljs"
```

実際の出力:

```
Testing airsms.route-test

Ran 6 tests containing 30 assertions.
0 failures, 0 errors.
```

何を固定しているか: `/xrpc/` は**空の nsid だけ** 400 にする（`/xrpc/a/b` は
移行前の rest parameter と同じく転送する。1 セグメントに絞るのは移行ではなく
方針変更）、`/_app/meta` は**持ち越していない**こと、MCP router の URL 解決
（空白だけの設定は未設定として扱う）、`result` / `structuredContent` の剥がし方、
そして**ページが route 表から描かれること**（固定値を焼いていたら落ちる）。

## 3. ✅ ページを描画して採点する

```bash
K=~/github/com-junkawasaki/orgs/kotoba-lang
CP="src:$K/jp-go-digital-design-system/src:$K/html/src:$K/css/src"
cat > "$W/render.cljs" <<EOF
(require '["node:fs" :as fs] '[airsms.view :as view] '[airsms.route :as route])
(let [css (.readFileSync fs "$K/jp-go-digital-design-system/resources/jp_go_dds/dds.css" "utf8")]
  (.writeFileSync fs "$W/page.html"
    (view/render {:css css :routes route/routes
                  :vars [:AGENTGATEWAY_MCP_ROUTER_URL :APP_CAPABILITIES :APP_DESCRIPTION
                         :APP_DISPLAY_NAME :APP_FRAMEWORK :APP_NANOID
                         :APP_PERFORMER_TYPE :APP_UI_TYPE]
                  :mcp-url "https://mcp.etzhayyim.com/xrpc/com.etzhayyim.mcp.message"}))
  (println "rendered" (.-length (.readFileSync fs "$W/page.html" "utf8")) "chars"))
EOF
npx --yes nbb --classpath "$CP" "$W/render.cljs"
cd $K/design-quality && npx --yes nbb -m design-quality.cli score "$W/page.html" --min 95
```

実際の出力:

```
rendered 81479 chars
  100.00  …/page.html
aggregate: 100.00
axes scored: 10 (viewport, safe-area, dynamic-viewport, tap-targets, focus-visible,
                 reduced-motion, overflow-guard, color-scheme, responsive, semantics)
NOT scored: input-zoom, contrast — pass --extra-axes to include the optional ones
gate: aggregate 100.00 >= min 95.00 -> PASS
```

`--extra-axes` で 12 軸すべてを適用しても **100.00 / PASS**。

### ⚠ この 100.00 が保証しないこと（実測）

| このページに加えた変更 | score | gate(95) |
|---|---|---|
| そのまま | 100.00 | PASS |
| **DADS の stylesheet を 1 バイトも入れない** | **96.63** | **PASS** |
| viewport meta を外す | 88.76 | FAIL |

**デザインシステムを完全に外しても通る。** 「デザインシステムが入っている」と
言えるのは §5 の smoke の 2 本目だけである。

## 4. ✅ bundle をビルドする

**高負荷ビルドは同時 1 本に制限されている**（superproject `CLAUDE.md` の
resource governor）。直接叩かず、必ず guard 経由で:

```bash
cd "$REPO"
node ~/github/com-junkawasaki/scripts/resource-guard.mjs run build -- \
  npx --yes shadow-cljs release worker
ls -la dist/worker.js
```

lock を他セッションが持っていると **exit 2** で拒否される。**迂回しない** ——
`resource-guard: build is already running (pid=…)` はエラーではなく順番待ちで
ある（この walk では 11 回待った回もある）。

実際の出力（末尾）:

```
[:worker] Build completed. (55 files, 12 compiled, 0 warnings, 16.30s)
-rw-r--r--  1 junkawasaki  wheel  246005  dist/worker.js
```

### 壊れた var はビルドを **落とす**（実測）

`shadow-cljs.edn` の `:compiler-options` に `:warnings-as-errors true` を入れた。
入れる前は、存在しない var を参照しても shadow は **WARNING** を出して **exit 0**
し、最初のリクエストで落ちる bundle を書く ——「ビルドが通った」は検査ではなかった
（**落ちようがなかった**）。

この repo で実際に落として確かめた。`src/airsms/worker.cljs:109` の
`route/dispatch` を、存在しない `route/dispatch-nonexistent` に改名して再ビルド:

```
------ ERROR -------------------------------------------------------------------
 File: /private/tmp/app-air-sms-cljs/src/airsms/worker.cljs:109:44
Use of undeclared Var airsms.route/dispatch-nonexistent
{:warning :undeclared-var, :line 109, :column 45,
 :shadow.build.compiler/warning-as-error true}
```

| | exit | `dist/worker.js` sha256 | bytes |
|---|---|---|---|
| 改名前 | **0** | `2a4bdb80…508eda3d` | 246005 |
| 改名後 | **1** | `2a4bdb80…508eda3d`（**不変**） | 246005 |
| 戻して再ビルド | **0** | `2a4bdb80…508eda3d` | 246005 |

**落ちたビルドは bundle を出荷しない** —— sha256 が 1 バイトも動いていないことが
それを言っている。

キーは `:build-options` ではなく **`:compiler-options`** に置く。shadow が読むのは
`[:compiler-options :warnings-as-errors]` で、置き場所を間違えると**黙って無視される**
—— この option が防ぐはずの失敗そのものになる。`scripts/verify-docs-claims.cljs` は
これを **EDN として parse して**検査する（grep では捕まらない: 移した状態でも
`grep -c warnings-as-errors` は 3 を返して通ってしまう。実測）。

## 4.5 ✅ ビルドした成果物を実際に叩く

ここが deploy されるものに触る唯一の検査である。

```bash
cd "$REPO" && npx --yes nbb scripts/smoke-worker.cljs dist/worker.js
```

実際の出力（22 項目、末尾）:

```
PASS	default export has fetch	expected=true	actual=true
PASS	GET / status	expected=200	actual=200
…
PASS	single-segment nsid is relayed (unreachable -> 502)	expected=502	actual=502
PASS	multi-segment nsid is relayed the same way	expected=502	actual=502
PASS	ran the whole suite	expected=true	actual=true
OK	the built bundle answers as the route table says (22 checks)
```

**bundle が無ければ exit 2**（「判定できなかった」であって合格ではない）:

```
$ npx --yes nbb scripts/smoke-worker.cljs /nonexistent.js ; echo $?
UNDETERMINED	no bundle at /nonexistent.js
Refusing to report a pass: build it first (see docs/operator-quickstart.md S4).
2
```

> ⚠ exit code をパイプの先で測らない。`… | tail -3; echo $?` は **`tail` の**
> 終了コードを見せる。この walk で一度踏んだ。

### デザインシステムの検査が 2 本ある理由（実測）

`dads-table` が在ることを 1 本で見る形は**落ちない検査**である —— それは view が
出力する markup であって、CSS が 1 バイトも入っていないページにも現れる。

| 探す文字列 | CSS 込み | CSS 無し |
|---|---|---|
| `dads-table` | 74 | **6**（0 にならない） |
| `class="dads-table"` | 1 | **1**（落ちない） |
| `--color-primitive-blue` | 45 | **0** |

`shadow.resource/inline` を `""` に置き換えて**再ビルドし**、smoke を回した:

```
PASS	page uses the design system components	expected=true	actual=true
FAIL	page carries the stylesheet itself	expected=true	actual=false
FAILED	1 check(s): page carries the stylesheet itself     (exit 1)
```

**component を使ったか**と**stylesheet が実際に入ったか**は別の主張である。

## 4.6 ✅ Workers ランタイム（workerd）で動かす

Node で import する smoke より強い検査。実際の workerd で起こす。

```bash
cd "$REPO"
npx --yes wrangler@latest dev --local --port 8811 --ip 127.0.0.1
# 別シェルで
B=http://127.0.0.1:8811
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' $B/
curl -s $B/health
curl -s -X POST $B/xrpc/
curl -s -X OPTIONS -o /dev/null -w '%{http_code}\n' $B/xrpc/x
curl -s $B/nope
curl -s -X POST $B/xrpc/a/b
```

実際の出力:

```
200 text/html; charset=utf-8
{"ok":true,"app":"air-sms","runtime":"cljs","routes":["/","/health","/xrpc/:nsid"]}
{"error":"Missing XRPC method"}                                    [400]
204
{"error":"Not Found","routes":["GET /","GET /health","POST /xrpc/:nsid"]}   [404]
{"error":"MCP router unreachable","detail":"internal error; reference = …",
 "url":"https://mcp.etzhayyim.com/xrpc/com.etzhayyim.mcp.message"}  [502]
```

`POST /health` は **405** で `Allow: GET` を返す。ページの中身も確認した ——
`--color-primitive-blue` 45 回 / `class="dads-table"` 1 回 / env のキーは出て、
env の値 `yoro` は **0 回**。

`compatibility_flags`（`nodejs_compat` / `nodejs_als`）は SvelteKit の
adapter-cloudflare 由来で、この bundle には要らない。**撤去は憶測ではなく
この実測で確かめてから行った**（flags を外した設定のまま上記を全部通した）。

## 5. ✅ `kotoba/` のテスト（移行の対象外・旧版から引き継ぎ）

`kotoba/` は appview ではなく自己完結したドメインライブラリで、移行は**触っていない**
（README の「`kotoba/` は appview ではない」）。手順は移行前から変わらない。

npm 11.16 は `kotoba/` の 2 つの git 依存を拒否する。回避策が依拠する 2 つの事実
（`@etzhayyim/sdk` の import は `import type` で実行時に消える、`@etzhayyim/sdk-mock`
は実 SDK から何も import しない）はどちらも成り立つ:

```bash
git grep -n '@etzhayyim/sdk' HEAD -- kotoba/src
# → kotoba/src/registry.ts:20:import type { Etzhayyim } from "@etzhayyim/sdk";
```

checkout を編集しないよう、コピーに対して適用する（手順の全文は
`app-air-crew` の quickstart §6）。旧版の walk では
`Test Files 1 passed (1) / Tests 12 passed (12)`。

**依存の pin は GitHub API に訊かない。** 実測 2026-08-18:

```
gh api repos/etzhayyim/com-etzhayyim-sdk/commits/12314a0c…      → 404
git fetch https://github.com/etzhayyim/com-etzhayyim-sdk.git 12314a0c…
git cat-file -t 12314a0c…                                       → commit
```

**API の方が間違っている。** SHA の存在が判断を左右するときは git に訊くこと。

> zsh は変数を単語分割しない。`set -- $pair` のような書き方は 1 語のままになり、
> `git fetch "<url> <sha>"` が `Malformed input to a URL function` で落ちる ——
> **これを「SHA が無い」と読み違えない**。この walk で一度踏んだ。

## 6. ⚠ deploy — この walk では**していない**

```bash
cd "$REPO"
npx wrangler deploy
```

**ただし route が指すホストは解決しない。** 実測 2026-08-18（`dig @1.1.1.1`）:

| ホスト | 結果 |
|---|---|
| `air-sms.etzhayyim.com` | NXDOMAIN |
| `a1rsms01.etzhayyim.com` | NXDOMAIN |
| `mcp.etzhayyim.com` | NXDOMAIN |
| `dispatcher.etzhayyim.com` | NXDOMAIN |
| `etzhayyim.com`（zone 自体） | 104.21.51.111 |

deploy が成功しても誰も到達できない。`/xrpc/` の中継先も同様なので、到達できた
としても中継は **502 を返す**（成功と同じ形で隠さない）。

superproject の deploy guard は `origin/main` を含む checkout からの deploy しか
許さない点も併せて注意。

## 7. ここに無いもの

- **dispatcher への転送** と **`/_app/meta`** —— 移行前の `src/app.ts` にあり、
  どこにも deploy されていなかった経路。宛先が NXDOMAIN、または binding が
  `wrangler.jsonc` に無いので**持ち越していない**（README の「持ち越さなかったもの」）
- **`kotoba/` の cljs 化** —— appview ではないので移行の対象外。移すなら
  `@etzhayyim/sdk` の cljs 面が要る別の決定
- **`MIGRATION-TODO.md` の 7 項目の憲章適合レビュー**（未実施と文書自身が書いている）
- **`APP_CAPABILITIES` の切り詰めの是正**（8 メソッド中 3 つ。9 つの `app-air-*`
  兄弟すべてが同じ形なので、ファミリー全体の決定）

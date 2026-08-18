# app-air-sms

**航空会社の安全管理システム（SMS, Safety Management System）の appview。**
安全報告・ハザード登録簿・IOSA 指摘・当局への届出・発生事象報告・安全速報・
危険物スクリーニング・セキュリティ警報を扱う面である。

`etzhayyim/root` の `60-apps/etzhayyim-project-air-sms` からの抽出物で、
**2026-08-18 に appview を TypeScript/Svelte から ClojureScript へ移行した**
（`docs/adr/0001`）。数字はすべて `scripts/verify-docs-claims.cljs` が tree から
再計算して検査する。

## deploy されるものは、いま読んでいるソースである

```
src/airsms/route.cljc    判断（どの handler が答えるか）  ← 純 .cljc、テスト対象
src/airsms/view.cljc     ページ（jp-go-dds の hiccup）    ← 純 .cljc、テスト対象
src/airsms/worker.cljs   Request/Response に触る唯一の層
        ↓ shadow-cljs :target :esm
dist/worker.js           ← wrangler.jsonc の "main" が指すもの
```

移行前、`main` は `svelte/.svelte-kit/cloudflare/_worker.js` を指していた。
**この repo に `.svelte-kit` 配下の tracked file は 0 件**である（ビルド成果物）。
そして読み手が「アプリ本体」として開く `src/app.ts`（76 行）は、
grep して**どこからも参照されていなかった**。deploy されるものと、読めるものが
別だった。

いまは `main` が指す bundle が上のソースからコンパイルされたものなので、その形は
構造的に起こり得ない。`scripts/verify-docs-claims.cljs` が
**shadow の出力先と wrangler の `main` と export の ns 名の 3 つが噛み合っている
こと**を検査し、噛み合わなくなれば落ちる。

## 公開ルート

| METHOD | PATH | 何をするか |
|---|---|---|
| GET | `/` | この appview の説明ページ |
| GET | `/health` | 生存確認。deploy された面が答えることを外から確かめられる |
| POST | `/xrpc/:nsid` | XRPC を MCP router へ中継する |
| OPTIONS | `/xrpc/*` | CORS preflight（204） |

**この表の出所は `airsms.route/routes` で、ページもそこから描く。** 移行前の
`+page.svelte` は route 一覧・var 一覧・`routeCount` を literal の object として
手で持っており、隣の `wrangler.jsonc` が変わっても追随しなかった —— 移行前の
`docs/operator-quickstart.md` 自身が
*if you change routes or vars in wrangler.jsonc, this object does not follow*
と書いている。いまは route 表を渡す側が持ち、ページは描くだけなので、両者が
ずれる余地が無い。

### `/health` は移行された挙動ではなく、追加された挙動である

`/health` は `src/app.ts`（どの bundle にも入っていなかったファイル）にあり、
**deploy されていた SvelteKit worker はこれに 404 を返していた**
（`assets.not_found_handling` が `none`）。移行前の quickstart 自身が
*a monitor pointed there is watching a path that does not exist* と書いている。

cljs の worker はこれに答える。持ち越した理由は下記 dispatcher 経路と対照的
だから —— `/health` は上流も binding も必要とせず、自分の route 表を名乗るだけ
なので、実際に答えられる。

### 持ち越さなかったもの（黙って消していない）

`src/app.ts` にあってどこにも deploy されていなかった経路のうち:

- **dispatcher への転送** —— 宛先 `dispatcher.etzhayyim.com` は NXDOMAIN、かつ
  `DISPATCHER_URL` / `DISPATCHER_INTERNAL_SECRET` は `wrangler.jsonc` に
  **1 つも宣言されていない**。二重に死んでいる。
- **`/_app/meta`** —— `src/app.ts` 内で `/health` と同じハンドラの別名。

**動かない経路を移植して「移行済み」と言わないため**である。必要になった時点で
`route.cljc` に足し、テストと binding を伴って戻す。

### XRPC の多段パスは移行前と同じく転送する

移行前の SvelteKit route は rest parameter `[...path]` で受けており、
`if (!nsid)` —— つまり**空文字だけ**を 400 にし、`a/b` はそのまま tool 名として
転送していた。1 セグメントに絞ると失敗の起きる場所と応答が変わる。
**それは移行ではなく方針変更**なので、ここではしない。

## `kotoba/` は appview ではない —— 移行の対象外

**この repo の TypeScript を全部消す、という形の作業はしていない。**

`kotoba/` は自前の `package.json` / `tsconfig.json` / `vitest.config.ts` を持つ
自己完結したドメインライブラリである（`registry.ts` 472 行 / `types.ts` 457 行 /
`test/air-sms.test.ts` 212 行）。plaintext 側（operational event・hazard register・
safety bulletin・dangerous goods check）と E2E 封緘側（safety report・IOSA
finding・security alert・regulatory report）を分ける設計を持つ。

移行にあたって測ったこと（2026-08-18）:

| 問い | 測り方 | 答え |
|---|---|---|
| appview から参照されているか | `src/` `svelte/` `wrangler.jsonc` root `package.json` を grep | **0 件** |
| どれかの bundle に入るか | wrangler の `main` は SvelteKit 出力 → いまは `dist/worker.js` | **入らない** |
| 依存は解決するか | `git ls-remote` + pin SHA を `git fetch` | **する**（下記） |

参照されておらず bundle にも入っていないが、**依存が解決し、テストがあり、
appview の一部でもない。** よって dead ではなく、この移行の対象でもない。
消せば移行ではなく破壊になる。`scripts/verify-docs-claims.cljs` が
**ファイル数 7 と `.ts` 数 5 を pin している**ので、「TypeScript は消えた」の陰で
黙って増えることもない。

移行するなら、それは別の決定であり、`@etzhayyim/sdk` の cljs 面が要る。

### 依存の pin —— GitHub API は 404 を返すが、commit は存在する

```
etzhayyim/com-etzhayyim-sdk       12314a0c…  gh api → 404   git fetch → type=commit
etzhayyim/com-etzhayyim-sdk-mock  c857ff9b…  gh api → 404   git fetch → type=commit
```

**API の方が間違っている。** SHA の存在が判断を左右するときは git に訊くこと
（この罠はこのファミリーで複数回観測されている）。

## いま在るもの — 25 ファイル

| 面 | ファイル |
|---|---|
| 判断・描画・edge | `src/airsms/{route.cljc, view.cljc, worker.cljs}` |
| テスト | `test/airsms/route_test.cljc`（6 tests / 30 assertions） |
| ビルド | `deps.edn` / `shadow-cljs.edn` / `.gitignore` |
| 検査 | `scripts/{smoke-worker.cljs, verify-docs-claims.cljs}` |
| Worker 設定 | `wrangler.jsonc` |
| ドメインライブラリ（対象外） | `kotoba/`（7 ファイル、うち `.ts` 5 本） |
| actor 記述子 | `kotodama.jsonld` |
| 由来・権利・識別 | `NOTICE` / `README.edn` / `migration.edn` / `MIGRATION-TODO.md` |
| 文書 | `README.md` / `docs/operator-quickstart.md` / `docs/adr/0001-*.edn` |

**appview の TypeScript は 0 本、正本言語（`.cljs`/`.cljc`）が 4 本**（+ `scripts/` に 2 本）。
移行前は appview だけで `.ts` 3 本 + `.svelte` 1 本 + Svelte 設定 4 本、正本言語 0 本だった。
`kotoba/` の `.ts` 5 本は移行前後で**不変**。

これらは別々の claim なので、TS が戻れば別々に落ちる —— 撤去した 9 パスに戻る場合
（`removed-by-migration-absent`）、appview に別名で入る場合（`appview-ts-files`）、
`kotoba/` が膨らむ場合（`kotoba-files` / `kotoba-ts-files`）。

## ページが出す値・出さない値

env の**キー名**は出すが、値は出さない —— **中継先を除いて**。
`AGENTGATEWAY_MCP_ROUTER_URL` の値だけは、どこへ中継するかを運用者が見る
必要があるので意図的に表示する。

smoke はこれを**2 つの独立した印**で見る: 別の var に置いた sentinel が
出ていないこと、そして中継先の値が出ていること。**片方だけだと「全部隠す」実装も
「全部出す」実装も通ってしまう。**

## UI

基盤は `kotoba-lang/jp-go-digital-design-system`（デジタル庁デザインシステム）。
色・寸法は `--hig-*` トークン契約だけで書き、raw hex も px フォントサイズも
置かない。app 固有 CSS は 3 行。CSS は外部リクエストゼロの方針どおり
`shadow.resource/inline` で bundle に焼く。

決定論的 audit（`kotoba-lang/design-quality`）で **100.00 / 100**（gate 95）。
`--extra-axes` で 12 軸すべてを適用しても 100.00。

### そのスコアが保証しないこと — 実測

| このページに加えた変更 | score | gate(95) |
|---|---|---|
| そのまま | 100.00 | PASS |
| **DADS の stylesheet を 1 バイトも入れない** | **96.63** | **PASS** |
| viewport meta を外す | 88.76 | FAIL |

**デザインシステムを完全に外しても通る。** CLI 自身も 12 軸中 10 軸しか適用して
いないと出力に書く（`--extra-axes` で残り 2 軸）。

### だからデザインシステムの検査は 2 本ある

`dads-table` が在ることを 1 本で見る形は**落ちない検査**である —— それは view が
出力する markup であって、CSS が 1 バイトも入っていないページにも現れる。
実測（このページ、2026-08-18）:

| 探す文字列 | CSS 込み | CSS 無し |
|---|---|---|
| `dads-table` | 74 | **6**（0 にならない） |
| `class="dads-table"` | 1 | **1**（落ちない） |
| `--color-primitive-blue` | 45 | **0** |

だから 2 本に割った。**component を使ったか**（`class="dads-table"`）と、
**stylesheet が実際に入ったか**（`--color-primitive-blue`）は別の主張である。
`shadow.resource/inline` を空文字に置き換えて**再ビルドし**、後者だけが赤くなる
ことを確認した（1 check FAIL / exit 1、前者は PASS のまま）。

## ビルドが通ることは、それ自体では検査ではない

`shadow-cljs.edn` の `:compiler-options` に `:warnings-as-errors true` を入れて
ある。入れる前は、存在しない var を参照しても shadow は **WARNING** を出して
**exit 0** し、最初のリクエストで落ちる bundle を書く。

この repo で実際に落として確かめた（`route/dispatch` → `route/dispatch-nonexistent`）:

| | exit | `dist/worker.js` sha256 | bytes |
|---|---|---|---|
| 改名前 | **0** | `2a4bdb80…508eda3d` | 246005 |
| 改名後 | **1** | `2a4bdb80…508eda3d`（**不変**） | 246005 |
| 戻して再ビルド | **0** | `2a4bdb80…508eda3d` | 246005 |

**落ちたビルドは bundle を出荷しない。**

キーは `:build-options` ではなく **`:compiler-options`** に置く。置き場所を
間違えると**黙って無視され**、この option が防ぐはずの失敗そのものになる。
検証器はこれを **EDN として parse して**検査し、grep しない ——
`shadow-cljs.edn` のコメント自身がこの文字列を含むので、grep ならキーが
間違った map に在っても通ってしまう。

## 呼び先が 1 つも解決しない（移行では直らない）

| ホスト | 役割 | DNS（2026-08-18、`dig @1.1.1.1`） |
|---|---|---|
| `air-sms.etzhayyim.com` | 公開ホスト（wrangler の route） | **NXDOMAIN** |
| `a1rsms01.etzhayyim.com` | 同（nanoid 側） | **NXDOMAIN** |
| `mcp.etzhayyim.com` | `/xrpc/:nsid` の中継先 | **NXDOMAIN** |
| `dispatcher.etzhayyim.com` | 持ち越さなかった経路の宛先 | **NXDOMAIN** |
| `etzhayyim.com` | zone 自体 | 104.21.51.111（生きている） |

deploy 先も中継先も、いま存在しない。`/xrpc/` は到達できなければ **502 を返す**
——成功と同じ形で隠さない。

`/xrpc/:nsid` を移した判断は、**deploy されていた経路であり binding
（`AGENTGATEWAY_MCP_ROUTER_URL`）が `wrangler.jsonc` に宣言されている**こと
による。dispatcher 経路はそのどちらでもなかった。

## 由来（custody）

`migration.edn` は出所を `etzhayyim/root` の tree `5c607478` と宣言する。移行後の状態:

- 継承した 12 ファイル（54,531 バイト）は**いまも 1 バイトも変わっていない**
  （sha256 を検証器に固定）。`kotoba/` の 7 ファイルはこの中に含まれる。
- `wrangler.jsonc` は**意図的に変更**した（`main` の付け替え、消えた SvelteKit
  client を指す `assets` の撤去、`APP_FRAMEWORK` の更新、SvelteKit 由来の
  `compatibility_flags` の撤去）
- `docs/operator-quickstart.md` は**意図的に書き直した**（移行が旧本文を偽にした）
- appview の TypeScript/Svelte 9 ファイルは**移行で撤去**した。検証器はその 9 パスを
  名指しで「不在であること」を検査する —— byte 合計は「TS が消えた」と言えない

`migration.edn` の `:allowed-additions` は `README.edn` と `migration.edn` の 2 つ
しか許していない。この repo は移行前の時点で既にそれを超えていた（23 ファイル）
ので、この移行はその逸脱を**増やしはするが作ってはいない**。是正は別の決定。

## 残っている欠陥（移行では直っていない）

1. **`MIGRATION-TODO.md` のチェックボックス 7 件が未チェック**のまま。憲章適合の
   手動レビューは未実施であると文書自身が書いている。
2. **`APP_CAPABILITIES` は 8 メソッド中 3 つしか宣言していない**
   （`submitSafetyReport` / `assessRisk` / `recordIosaFinding`）。残り 5 つは
   `fileRegulatoryReport` / `reportOccurrence` / `distributeSafetyBulletin` /
   `screenDangerousGoods` / `handleSecurityAlert`。切り詰めであって選抜ではない。
   9 つの `app-air-*` 兄弟すべてが同じ形なので、直すならファミリー全体の決定。
3. **ホストが NXDOMAIN**（上記）。deploy するか retire するかは別の決定。

## 検証

```bash
npx --yes nbb scripts/verify-docs-claims.cljs .     # <dir> は先頭に置く
```

exit 0 = 全一致 / 1 = 食い違い / **2 = 判定できなかった**（0 と区別する）。
テストとビルドと smoke は `docs/operator-quickstart.md`。

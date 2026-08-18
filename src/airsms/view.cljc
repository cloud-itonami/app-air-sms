(ns airsms.view
  "この appview の説明ページ。純 hiccup。

  基盤は `jp-go-dds`(デジタル庁デザインシステム) —— superproject の
  skill `kotoba-uiux` が定める新規 UI の base。色・寸法は `--hig-*` トークン
  契約で書き、raw hex も px フォントサイズも置かない。

  **表示する事実は引数で受け取る。ページの中に焼かない。**
  これは装飾の都合ではなく、docs/adr/0001 が記録した欠陥そのものへの答えで
  ある —— 移行前の `+page.svelte` は route 一覧・var 一覧・`routeCount` を
  literal の object で持っており、隣の `wrangler.jsonc` が変わっても追随しな
  かった（『if you change routes or vars in wrangler.jsonc, this object does
  not follow』と移行前の operator-quickstart 自身が書いている）。ここでは
  route 表と設定を渡す側が持ち、ページは描くだけなので、両者がずれる余地が
  無い。"
  (:require [jp-go-dds.core :as dds]
            [jp-go-dds.page :as page]
            [jp-go-dds.tokens :as tokens]
            [clojure.string :as str]))

(def app-css
  "app 固有の最小 CSS。`--hig-*` 契約だけを使う(bridge が DADS の上に再定義する)。
  DADS を base にした app の下には `shitsuke.hig` が居ないので、bridge が運んで
  いないトークンは何にも解決しない —— 使うのは運ばれている 71 個の中だけ。"
  (str/join
   "\n"
   [".sms-lede { color: var(--hig-color-secondary-label); max-width: 42rem; }"
    ".sms-note { color: var(--hig-color-secondary-label); font-size: var(--hig-text-footnote-font-size); }"
    ".sms-mono { font-family: var(--hig-font-mono); }"]))

(defn- route-rows [routes]
  (mapv (fn [r]
          [(str/upper-case (name (:route/method r)))
           [:span {:class "sms-mono"} (:route/path r)]
           (:route/doc r)])
        routes))

(defn body
  "opts:
   :routes    airsms.route/routes（この Worker が実際に答えるもの）
   :vars      wrangler が渡した env のキー（**キー名だけ**。値は出さない）
   :mcp-url   XRPC の中継先（route/mcp-router-url の戻り値）
   :built-at  bundle のビルド時刻（不明なら nil）"
  [{:keys [routes vars mcp-url built-at]}]
  (dds/container
   (dds/section
    {}
    (dds/heading 1 "Air Safety Management — air-sms")
    [:p {:class "sms-lede"}
     "航空会社の安全管理システム（SMS）の公開面。安全報告・ハザード登録簿・"
     "IOSA 指摘・当局への届出・発生事象報告・安全速報・危険物スクリーニング・"
     "セキュリティ警報を扱う。"
     [:strong "ドメイン実装そのものはこの Worker には無い"]
     " —— それは "
     [:span {:class "sms-mono"} "kotoba/"]
     " の TypeScript ライブラリと、この面が中継する先にある。"])

   (dds/section
    {:title "この面が答えるもの"}
    (dds/table {:caption "公開ルート"
                :headers ["METHOD" "PATH" "何をするか"]
                :rows (route-rows routes)})
    [:p {:class "sms-note"}
     "この表は Worker の route 表そのものから描いている。ページに焼いた値では"
     "ないので、実際に答えるものと表示がずれない。"
     [:span {:class "sms-mono"} "OPTIONS /xrpc/*"]
     " は CORS preflight として 204 を返す。"])

   (dds/section
    {:title "実行時の設定"}
    (if (seq vars)
      [:div (into [:p] (interpose " "
                                  (map (fn [k] (dds/chip-label (name k))) vars)))
       [:p {:class "sms-note"}
        "キー名のみ。" [:strong "ただし下の中継先だけは値そのもの"] "（"
        [:span {:class "sms-mono"} "AGENTGATEWAY_MCP_ROUTER_URL"]
        "）—— どこへ中継するかは運用者が見る必要があるので意図的に出している。"
        "それ以外の値は出さない。"]]
      [:p {:class "sms-note"} "env が渡されていない（ローカル描画）。"])
    [:p {:class "sms-note"} "XRPC の中継先: "
     [:span {:class "sms-mono"} mcp-url]])

   (dds/section
    {:title "現在地"}
    [:p {:class "sms-lede"}
     "この appview は TypeScript/Svelte から ClojureScript へ移行済み。"
     "deploy される bundle は、いま読んでいるソースからコンパイルされたもので"
     "ある（docs/adr/0001）。"]
    (when built-at
      [:p {:class "sms-note"} "bundle build: " built-at]))))

(defn render
  "完全な HTML 文書。`css` は呼び出し側が渡す(ライブラリは I/O を持たない)。"
  [{:keys [css] :as opts}]
  (page/->page
   {:title "Air Safety Management — air-sms"
    :description "航空会社の安全管理システム（SMS）の appview 公開面。"
    :lang "ja"
    :css css
    :app-css (str tokens/bridge-css "\n" app-css)}
   (body opts)))

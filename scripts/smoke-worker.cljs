#!/usr/bin/env nbb
;; smoke-worker — 実際にビルドされた bundle を import して叩く。
;;
;; ここが「deploy される成果物」に触る唯一の検査である。テスト
;; (test/airsms/route_test.cljc) はソースの判断を固定するが、bundle が
;; 本当に Worker の形で答えるかは言えない —— export の形、shadow の
;; :advanced-optimization、`shadow.resource/inline` で焼いた CSS は、
;; どれもビルドを通って初めて存在する。
;;
;; Usage:  nbb scripts/smoke-worker.cljs [<dist/worker.js>]
;; Exit:   0 全て期待どおり · 1 期待と違う · 2 判定できなかった（bundle が無い等）

(require '["node:fs" :as fs] '["node:path" :as path] '["node:url" :as url]
         '[clojure.string :as str])

(def bundle
  "ESM の import は相対パスを package 名と読むので、必ず絶対パスに直してから
  file:// URL にする（`dist/worker.js` をそのまま渡すと『Cannot find package dist』になる）。"
  (let [a (first (remove #(str/starts-with? % "--") *command-line-args*))]
    (.resolve path (or a "dist/worker.js"))))

(def failures (atom []))
(def checks (atom 0))
(defn check! [label expected actual]
  (swap! checks inc)
  (let [ok (= expected actual)]
    (println (str (if ok "PASS" "FAIL") "\t" label "\texpected=" (pr-str expected) "\tactual=" (pr-str actual)))
    (when-not ok (swap! failures conj label))))

(when-not (.existsSync fs bundle)
  (println (str "UNDETERMINED\tno bundle at " bundle))
  (println "Refusing to report a pass: build it first (see docs/operator-quickstart.md S4).")
  (js/process.exit 2))

(def sentinel
  "env の VALUE がページに出ていないことを確かめるための印。実在しそうな値
  （\"yoro\" 等）だと二つの問題がある: 他の文言と偶然一致しうるし、引用符ごと
  探すと renderer が \" を &quot; に escape するので**決して一致しない** ——
  つまり検査が構造的に落ちなくなる。app-ongakuka の移行で実測されたので印を使う。"
  "SENTINEL-4b71ef")

(def router-url
  "中継先は **値そのもの** がページに出る。ここを .invalid（RFC 2606 で必ず
  解決しない TLD。実測 2026-08-18: NXDOMAIN）にしておくと、出ていることを
  実 DNS に依存せず確かめられる。XRPC の中継が到達不能で 502 になることも、
  同じ理由で実 DNS に依存せず確かめられる。"
  "https://mcp.example.invalid/xrpc/probe")

(def env #js {"APP_NANOID" "a1rsms01"
              "APP_UI_TYPE" sentinel
              "AGENTGATEWAY_MCP_ROUTER_URL" router-url})

(defn- call [h method path]
  (let [req (js/Request. (str "https://air-sms.etzhayyim.com" path) #js {:method method})]
    (-> (js/Promise.resolve ((.-fetch h) req env #js {}))
        (.then (fn [res] (-> (.text res)
                             (.then (fn [body] {:status (.-status res)
                                                :ct (.get (.-headers res) "content-type")
                                                :allow (.get (.-headers res) "allow")
                                                :body body}))))))))

(-> (js/import (.-href (.pathToFileURL url bundle)))
    (.then
     (fn [m]
       (let [h (.-default m)]
         (check! "default export has fetch" true (fn? (.-fetch h)))
         (-> (js/Promise.all
              #js [(call h "GET" "/") (call h "GET" "/health")
                   (call h "POST" "/xrpc/") (call h "OPTIONS" "/xrpc/x")
                   (call h "GET" "/nope") (call h "POST" "/health")
                   (call h "POST" "/xrpc/com.etzhayyim.apps.airSms.assessRisk")
                   (call h "POST" "/xrpc/a/b")])
             (.then
              (fn [[page health bad pre nf mna one multi]]
                (check! "GET / status" 200 (:status page))
                (check! "GET / is html" true (str/includes? (or (:ct page) "") "text/html"))
                ;; ページは route 表から描かれる。表にある path が全部出ていること。
                (doseq [p ["/health" "/xrpc/:nsid"]]
                  (check! (str "page advertises " p) true (str/includes? (:body page) p)))
                ;; env のキーは出す、値は出さない
                (check! "page shows a var key" true (str/includes? (:body page) "APP_NANOID"))
                ;; 表示する値と表示しない値を **別々の印で** 見る。片方だけだと
                ;; 「全部隠す」実装も「全部出す」実装も通ってしまう。
                (check! "page hides other var values" false (str/includes? (:body page) sentinel))
                (check! "page shows the relay target it uses" true (str/includes? (:body page) router-url))
                ;; デザインシステムの検査は **2 本**。「dads-table が在る」だけでは
                ;; 落ちない —— それは view が出力する markup であって、CSS が 1 バイトも
                ;; 入っていないページにも現れる。実測 2026-08-18（このページ）:
                ;; `dads-table` は css 込み 74 / css 無し 6（0 にならない）、
                ;; `class="dads-table"` は 1 / 1、`--color-primitive-blue` は 45 / 0。
                ;; 前者は「view がライブラリを呼んだ」、後者は「stylesheet が実際に
                ;; 入った」—— 別の主張なので別の検査にする。
                (check! "page uses the design system components" true
                        (str/includes? (:body page) "class=\"dads-table\""))
                (check! "page carries the stylesheet itself" true
                        (str/includes? (:body page) "--color-primitive-blue"))
                (check! "GET /health status" 200 (:status health))
                (check! "health names its routes" true (str/includes? (:body health) "/xrpc/:nsid"))
                ;; nsid 無しの XRPC は 400。前方一致で素通ししない
                (check! "POST /xrpc/ status" 400 (:status bad))
                (check! "OPTIONS preflight" 204 (:status pre))
                (check! "unknown path" 404 (:status nf))
                (check! "wrong method" 405 (:status mna))
                (check! "wrong method names what is allowed" "GET" (:allow mna))
                ;; 多段パスは移行前の rest parameter と同じく **転送する**。
                ;; 単一セグメントと同じ結末になることを、.invalid の中継先で
                ;; 実 DNS に依存せず確かめる（どちらも到達不能なので 502）。
                (check! "single-segment nsid is relayed (unreachable -> 502)" 502 (:status one))
                (check! "multi-segment nsid is relayed the same way" 502 (:status multi))
                (check! "unreachable relay is not hidden as success" true
                        (str/includes? (:body multi) "MCP router unreachable"))
                (check! "unreachable relay names where it tried to go" true
                        (str/includes? (:body multi) router-url))
                ;; 実行本数の床。検査が 0 本でも「失敗ゼロ」で緑になるのを防ぐ。
                (check! "ran the whole suite" true (>= @checks 20))
                (let [f @failures]
                  (if (seq f)
                    (do (println (str "FAILED\t" (count f) " check(s): " (str/join ", " f)))
                        (js/process.exit 1))
                    (do (println (str "OK\tthe built bundle answers as the route table says ("
                                      @checks " checks)"))
                        (js/process.exit 0))))))))))
    (.catch (fn [e]
              (println (str "UNDETERMINED\tcould not exercise the bundle: " (.-message e)))
              (js/process.exit 2))))

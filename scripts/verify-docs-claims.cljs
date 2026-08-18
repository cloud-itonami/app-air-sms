#!/usr/bin/env nbb
;; verify-docs-claims — re-derive every number README.md and docs/operator-quickstart.md
;; state, from the tree itself, and fail when the tree and the prose disagree.
;;
;; Before the cljs migration this file's load-bearing claim would have been a GAP:
;; the Worker that would be deployed was a SvelteKit build output (with zero tracked
;; files in this repository) while src/app.ts -- the file that reads like the
;; application -- was referenced by nothing at all. That gap is closed, so the claims
;; assert the CLOSURE, and they are written so it cannot quietly come back: the
;; appview TypeScript is asserted ABSENT BY NAME, not merely absent from a byte total.
;;
;; It also pins `kotoba/`. That directory is a self-contained TypeScript domain
;; library which the migration measured and deliberately did NOT touch (README.md,
;; "kotoba/ is not the appview"). Pinning its file count means it cannot grow
;; silently under cover of "the TypeScript is gone".
;;
;; Usage:  nbb scripts/verify-docs-claims.cljs [<dir>]     (<dir> FIRST, default ".")
;; Exit:   0 every claim holds · 1 a claim is false · 2 could not answer

(require '["node:fs" :as fs]
         '["node:child_process" :as cp]
         '["node:crypto" :as crypto]
         '[cljs.reader :as reader]
         '[clojure.string :as str])

(def root (or (first (remove #(str/starts-with? % "--") *command-line-args*)) "."))

(def claims
  {:tracked-files 25
   :inherited-bytes 54531          ; the 12 inherited files still carried unchanged
   :svelte-artifacts 0             ; no .svelte / svelte.config / svelte-dir file survives
   :sveltekit-compat-flags 0       ; nodejs_compat / nodejs_als were adapter-cloudflare's
   :appview-ts-files 0             ; the appview's TypeScript, gone
   :kotoba-files 7                 ; the domain library, deliberately untouched -- PINNED
   :kotoba-ts-files 5              ; and its TypeScript is still exactly this much
   :production-canonical-files 4
   :declared-vars 8
   :declared-routes 2
   :wrangler-main "dist/worker.js"
   :shadow-output-dir "dist"
   :shadow-export "airsms.worker/handler"})

;; Inherited files this repository still carries BYTE-IDENTICAL. wrangler.jsonc is
;; deliberately NOT in this set -- the migration changed it on purpose (main, assets,
;; APP_FRAMEWORK, compatibility_flags) and it is checked by content below instead.
;; docs/operator-quickstart.md is likewise excluded: the migration made its old text
;; false, so it was rewritten.
(def preserved
  {"kotodama.jsonld" "6f3c72d99f3c7d70cb4922f430e1dd36d677ec5d29b7cf0012bc61307eb26c5a"
   "MIGRATION-TODO.md" "4faf4503c7926f9bedad922d5562a4a4d69d56705a4f4c61c1b2ce422b446077"
   "migration.edn" "227e4679911203f7b2f6f76607b5c783c8d9049c1d843b03eec514475cdab144"
   "NOTICE" "9d3bd5678f857c647a465987cd8538580215416648991fd9de47e6dc648544f0"
   "README.edn" "0ec1488231225f17789686d429b5547ae2af54bdf24a6da283188f494b8fc216"
   "kotoba/package.json" "75ffa2700cbd4a22bf688716c035af1f47c30ea44c585b61748c7fcf840e071a"
   "kotoba/src/index.ts" "958b443bb97515436b6c04257e4ddeb0c26802c26eaf2a1564e1dc8c7c70efc5"
   "kotoba/src/registry.ts" "be38b5f857162d30b6c776496ba25af106caaa0d94aa64ad83499efa213e549e"
   "kotoba/src/types.ts" "3dceec8d103d3fa0b1e6749ae0f4de58881e38a1493e186334bfd28f6ff7e81e"
   "kotoba/test/air-sms.test.ts" "400e232b5ebd60c977089ba15dd28639a1daacd1b936a2b4c5c3cab3319bec56"
   "kotoba/tsconfig.json" "95a429e51d6162cb7205b603f745e7604d93ffbb1ea6c346e5c6215a79ae541e"
   "kotoba/vitest.config.ts" "f82a551ef4da1c9cbf17985a3bee96eee450a3e4a46bff0d96c6150263121eff"})

;; What the migration REMOVED, by name. A byte total cannot say "the TypeScript is
;; gone"; this can, and it fails if any of it comes back.
(def removed-by-migration
  ["src/app.ts"
   "package.json"
   "svelte/package.json"
   "svelte/src/app.html"
   "svelte/src/routes/+page.svelte"
   "svelte/src/routes/xrpc/[...path]/+server.ts"
   "svelte/svelte.config.js"
   "svelte/tsconfig.json"
   "svelte/vite.config.ts"])

(def undetermined (atom []))
(def failures (atom []))
(def checks (atom 0))
(defn undet! [m] (swap! undetermined conj m))

(defn tracked-files []
  (try (->> (.execSync cp "git ls-files" #js {:cwd root :encoding "utf8"})
            str/split-lines (remove str/blank?) vec)
       (catch :default e (undet! (str "git ls-files failed: " (.-message e))) nil)))
(defn slurp* [rel] (try (.readFileSync fs (str root "/" rel) "utf8") (catch :default _ nil)))
(defn bytes-of [rel] (try (.-size (.statSync fs (str root "/" rel))) (catch :default _ nil)))
(defn sha256 [rel]
  (try (-> (.createHash crypto "sha256") (.update (.readFileSync fs (str root "/" rel))) (.digest "hex"))
       (catch :default _ nil)))
(defn strip-jsonc [s] (str/replace s #"(?m)^\s*//.*$" ""))

(defn check! [label expected actual]
  (swap! checks inc)
  (let [ok (= expected actual)]
    (println (str (if ok "PASS" "FAIL") "\t" (name label)
                  "\texpected=" (pr-str expected) "\tactual=" (pr-str actual)))
    (when-not ok (swap! failures conj label))
    ok))

(let [files (tracked-files)]
  (when (nil? files) (println "UNDETERMINED\tcould not list tracked files") (js/process.exit 2))
  (println (str "SCANNED\t" (count files)))
  (when (zero? (count files)) (println "UNDETERMINED\tscanned 0 files") (js/process.exit 2))

  (let [sizes (into {} (map (juxt identity bytes-of)) files)]
    (when-let [bad (seq (keep (fn [[f s]] (when (nil? s) f)) sizes))]
      (undet! (str "tracked but unreadable: " (str/join ", " bad))))

    (check! :tracked-files (:tracked-files claims) (count files))
    (check! :inherited-bytes (:inherited-bytes claims)
            (reduce + 0 (keep #(get sizes %) (keys preserved))))
    (check! :preserved-files-unchanged []
            (vec (keep (fn [[f want]] (let [got (sha256 f)]
                                        (when-not (= want got) (str f " " (or got "MISSING")))))
                       preserved)))

    ;; the appview's TypeScript is gone, by name
    (check! :removed-by-migration-absent []
            (vec (filter #(some? (bytes-of %)) removed-by-migration)))

    ;; Svelte is gone and must not come back. removed-by-migration names the seven
    ;; svelte files; this catches a return under ANY name -- a new .svelte file, a
    ;; svelte.config, or a svelte/ directory.
    (check! :svelte-artifacts (:svelte-artifacts claims)
            (count (filter #(or (str/ends-with? % ".svelte")
                                (str/includes? % "svelte.config")
                                (str/includes? % "/svelte/")
                                (str/starts-with? % "svelte/"))
                           files)))

    ;; Language of the source, split three ways because the three are different claims.
    ;; `kotoba/` is a self-contained domain library the migration measured and left
    ;; alone; its count is PINNED so "the TypeScript is gone" cannot quietly become
    ;; "except for the part that keeps growing".
    (let [prod (remove #(str/starts-with? % "scripts/") files)
          kotoba (filter #(str/starts-with? % "kotoba/") files)]
      (check! :appview-ts-files (:appview-ts-files claims)
              (count (filter #(and (str/ends-with? % ".ts")
                                   (not (str/starts-with? % "kotoba/")))
                             prod)))
      (check! :kotoba-files (:kotoba-files claims) (count kotoba))
      (check! :kotoba-ts-files (:kotoba-ts-files claims)
              (count (filter #(str/ends-with? % ".ts") kotoba)))
      (check! :production-canonical-files (:production-canonical-files claims)
              (count (filter #(re-find #"\.(cljs|cljc|clj|kotoba)$" %) prod))))

    ;; the deployed bundle is built from the source in this tree
    (let [w (some-> (slurp* "wrangler.jsonc") strip-jsonc)
          sh-text (slurp* "shadow-cljs.edn")]
      (if (or (nil? w) (nil? sh-text))
        (undet! "wrangler.jsonc or shadow-cljs.edn unreadable")
        (let [j (js->clj (.parse js/JSON w) :keywordize-keys false)
              sh (try (reader/read-string sh-text) (catch :default _ nil))]
          (check! :wrangler-main (:wrangler-main claims) (get j "main"))
          (check! :declared-vars (:declared-vars claims) (count (get j "vars")))
          (check! :declared-routes (:declared-routes claims) (count (get j "routes")))
          ;; the old config served a SvelteKit client dir that no longer exists
          (check! :no-stale-assets-binding true (nil? (get j "assets")))
          (check! :sveltekit-compat-flags (:sveltekit-compat-flags claims)
                  (count (filter #{"nodejs_compat" "nodejs_als"}
                                 (or (get j "compatibility_flags") []))))
          (if (nil? sh)
            (undet! "shadow-cljs.edn did not parse as EDN")
            (do
              (check! :shadow-builds-that-main true
                      (and (= (:shadow-output-dir claims)
                              (get-in sh [:builds :worker :output-dir]))
                           (= (symbol (:shadow-export claims))
                              (get-in sh [:builds :worker :modules :worker :exports 'default]))
                           (str/includes? (str (get j "main"))
                                          (str (:shadow-output-dir claims) "/worker.js"))))
              ;; A green build is not a check unless this option is BOTH present AND
              ;; in the place shadow reads. shadow reads
              ;; [:compiler-options :warnings-as-errors]; under :build-options it is
              ;; silently ignored -- which is the very failure the option exists to
              ;; prevent, a fix that cannot fail. Checked by PARSING, never by
              ;; grepping: the comment in shadow-cljs.edn contains the string, so a
              ;; grep would pass on a file where the key sits in the wrong map.
              (check! :warnings-as-errors-in-compiler-options true
                      (true? (get-in sh [:builds :worker :compiler-options :warnings-as-errors])))
              (check! :warnings-as-errors-not-misplaced true
                      (nil? (get-in sh [:builds :worker :build-options :warnings-as-errors]))))))))

    ;; The page renders the route TABLE rather than a baked count -- the defect
    ;; ADR-0001 records was a `+page.svelte` carrying a hand-maintained literal
    ;; object that could not follow wrangler.jsonc. Asserted structurally (the view
    ;; takes :routes, the worker passes the real table) and NOT by forbidding a
    ;; substring: a check a comment can fail is a check about prose.
    (let [v (slurp* "src/airsms/view.cljc")
          wk (slurp* "src/airsms/worker.cljs")]
      (if (or (nil? v) (nil? wk))
        (undet! "view.cljc or worker.cljs unreadable")
        (check! :page-renders-route-table true
                (and (str/includes? v "[{:keys [routes vars mcp-url built-at]}]")
                     (str/includes? v "(route-rows routes)")
                     (str/includes? wk ":routes route/routes")))))

    ;; docs/adr/*.edn must actually read as EDN tx-data (90-docs convention).
    ;;
    ;; Read the file WRAPPED IN A VECTOR, not bare. `cljs.reader/read-string`
    ;; returns the FIRST form and silently discards whatever follows, so a bare
    ;; read is a check that cannot fail: appending `{:unbalanced "` to a valid ADR
    ;; leaves it green. Measured 2026-08-18 --
    ;;   (read-string "[{:a 1}] {:unbalanced \"")  => [{:a 1}]        (green, wrongly)
    ;;   (read-string "[[{:a 1}] {:unbalanced \"]") => throws EOF     (red, rightly)
    ;; Wrapping forces the WHOLE file to be one form, and the assertion below
    ;; pins the shape: exactly one top-level form, a vector, of maps carrying
    ;; :adr/id -- so a file that reads but is not tx-data still fails.
    (let [dir (str root "/docs/adr")
          adrs (try (vec (.readdirSync fs dir)) (catch :default _ nil))]
      (if (nil? adrs)
        (undet! "docs/adr unreadable")
        (let [edns (filter #(str/ends-with? % ".edn") adrs)]
          (if (zero? (count edns))
            (undet! "docs/adr contains no .edn -- nothing to validate")
            (do
              (println (str "SCANNED-ADR\t" (count edns)))
              (check! :adr-reads-as-edn []
                      (vec (keep (fn [f]
                                   (let [txt (slurp* (str "docs/adr/" f))
                                         wrapped (try (reader/read-string (str "[" txt "\n]"))
                                                      (catch :default e
                                                        (str "ERR " (.-message e))))]
                                     (cond
                                       (string? wrapped) (str f ": " wrapped)
                                       (not (vector? wrapped)) (str f ": wrapper did not read as a vector")
                                       (not= 1 (count wrapped))
                                       (str f ": " (count wrapped)
                                            " top-level form(s); an ADR file must be exactly one")
                                       (not (vector? (first wrapped))) (str f ": not tx-data (a vector)")
                                       (zero? (count (first wrapped))) (str f ": tx-data is empty")
                                       (not (every? map? (first wrapped)))
                                       (str f ": tx-data contains a non-map element")
                                       (not (every? :adr/id (first wrapped)))
                                       (str f ": an entity has no :adr/id")
                                       :else nil)))
                                 edns))))))))))

;; Evidence floor: a run that asserted almost nothing must not read as a clean bill.
(when (< @checks 15)
  (undet! (str "only " @checks " claim(s) were evaluated; expected at least 15")))

(let [u @undetermined f @failures]
  (when (seq u)
    (doseq [m u] (println (str "UNDETERMINED\t" m)))
    (println "Refusing to report a pass: the tree could not be read completely.")
    (js/process.exit 2))
  (if (seq f)
    (do (println (str "FAILED\t" (count f) " claim(s): " (str/join ", " (map name f)))) (js/process.exit 1))
    (do (println (str "OK\tevery claim in README.md and docs/operator-quickstart.md holds ("
                      @checks " claims)"))
        (js/process.exit 0))))

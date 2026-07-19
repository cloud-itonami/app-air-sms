/**
 * air-sms kotoba — kotoba-E2E split for airline Safety Management System (SMS).
 *
 * Per ADR-2606011400 (Consensys) + ADR-2605172400 (3-axis) + ADR-2605181100
 * (kotoba E2E encrypted-record envelope). Founder directive 2026-06-03: PII /
 * CUI / LE / just-culture-protected reports may migrate to etzhayyim when made
 * safe via kotoba E2E. MAXIMAL migration — front every data layer; only the
 * irreducible regulated EXECUTION act stays etzhayyim.
 *
 * SPLIT (discriminator: a field is E2E if it carries a reporter/personnel
 * identity, a just-culture-protected narrative, a confidential audit result, or
 * an AVSEC/security-LE finding; pure operational safety facts + reference
 * catalogs are plaintext):
 *
 *   PUBLIC (plaintext AT records) — operational safety facts with NO protected
 *   identity: `operationalEvent` (public ops timeline; matches kotodama.jsonld
 *   subscribeRepos), `hazard` (hazard register / risk catalog), `safetyBulletin`
 *   (distributed safety bulletins) and `dangerousGoodsCheck` (DG screening
 *   result + UN hazard class). FK safetyBulletin → hazard via exists().
 *   Frontable open metadata + aggregate stats + read-views + timelines.
 *
 *   SENSITIVE (kotoba E2E, com.etzhayyim.encrypted.record) — `safetyReport`
 *   (just-culture protected: reporter DID + free-text narrative; merges
 *   occurrence reporting), `iosaFinding` (confidential IOSA/IATA audit finding +
 *   auditee), `securityAlert` (AVSEC / security-LE alert payload) and
 *   `regulatoryReport` (confidential mandatory-occurrence filing content).
 *   Written via sdk.encryptedWrite (read-cap = owner DID + explicit recipients);
 *   the substrate never sees these in plaintext.
 *
 *   STAYS etzhayyim (consumed via consent-capability, NOT a collection) — the
 *   irreducible regulated EXECUTION acts: (1) the authenticated regulatory-filing
 *   TRANSMISSION to the civil-aviation authority (FAA/EASA/CAA mandatory
 *   occurrence submission — fileRegulatoryReport's actual submit CALL), and
 *   (2) the AVSEC enforcement / blocking ACTION (handleSecurityAlert's response
 *   act: lockdown / authority notification / passenger block). The report DATA
 *   and alert DATA both migrate E2E; only the transmission/enforcement ACT stays
 *   etzhayyim.
 *
 * AT-Lexicon: no float — risk/likelihood/severity are integers (risk score
 * 0-100); UN DG hazard class is integer; no money fields.
 */

// ─── Plaintext public collections ───────────────────────────────────
export const OPERATIONAL_EVENT_COLLECTION = "com.etzhayyim.apps.airSms.operationalEvent";
export const HAZARD_COLLECTION = "com.etzhayyim.apps.airSms.hazard";
export const SAFETY_BULLETIN_COLLECTION = "com.etzhayyim.apps.airSms.safetyBulletin";
export const DG_CHECK_COLLECTION = "com.etzhayyim.apps.airSms.dangerousGoodsCheck";

// ─── E2E inner-type NSIDs (body shape inside the encrypted envelope) ──
export const SAFETY_REPORT_INNER_TYPE = "com.etzhayyim.apps.airSms.safetyReport";
export const IOSA_FINDING_INNER_TYPE = "com.etzhayyim.apps.airSms.iosaFinding";
export const SECURITY_ALERT_INNER_TYPE = "com.etzhayyim.apps.airSms.securityAlert";
export const REGULATORY_REPORT_INNER_TYPE = "com.etzhayyim.apps.airSms.regulatoryReport";

export const AIR_SMS_DID_PREFIX = "did:web:air-sms.etzhayyim.com:" as const;

// ─── Operational event (PLAINTEXT, public ops timeline) ──────────────

export interface OperationalEventRecord {
  did: string;
  eventId: string;
  /** e.g. delay | diversion | go-around | bird-strike | tech-log. */
  eventType: string;
  flightNo?: string;
  station?: string;
  phase?: string;
  occurredAt: string;
  createdAt: string;
}
export interface OperationalEventView extends OperationalEventRecord {
  eventUri: string;
}
export interface RecordEventInput {
  eventId: string;
  eventType: string;
  flightNo?: string;
  station?: string;
  phase?: string;
  occurredAt?: string;
}
export interface RecordEventOutput {
  status: "recorded" | "alreadyExists" | "rejected";
  eventUri?: string;
  did?: string;
  eventId?: string;
  error?: string;
}
export interface ListEventsInput {
  eventType?: string;
  limit?: number;
  cursor?: string;
}
export interface ListEventsOutput {
  items: OperationalEventView[];
  cursor?: string;
  total: number;
}

// ─── Hazard register (PLAINTEXT, public risk catalog) ────────────────

export interface HazardRecord {
  did: string;
  hazardId: string;
  category: string;
  description: string;
  /** integer 1-5. */
  likelihood: number;
  /** integer 1-5. */
  severity: number;
  /** integer 0-100 (assessed residual risk). */
  riskScore: number;
  status: string;
  createdAt: string;
}
export interface HazardView extends HazardRecord {
  hazardUri: string;
}
export interface RegisterHazardInput {
  hazardId: string;
  category: string;
  description: string;
  likelihood: number;
  severity: number;
  riskScore: number;
  status?: string;
}
export interface RegisterHazardOutput {
  status: "registered" | "alreadyExists" | "rejected";
  hazardUri?: string;
  did?: string;
  hazardId?: string;
  error?: string;
}
export interface ListHazardsInput {
  category?: string;
  limit?: number;
  cursor?: string;
}
export interface ListHazardsOutput {
  items: HazardView[];
  cursor?: string;
  total: number;
}

// ─── Safety bulletin (PLAINTEXT, public; FK → hazard) ────────────────

export interface SafetyBulletinRecord {
  did: string;
  bulletinId: string;
  /** FK → hazard.hazardId (validated via exists()). */
  hazardId: string;
  title: string;
  severity: string;
  issuedAt: string;
  createdAt: string;
}
export interface SafetyBulletinView extends SafetyBulletinRecord {
  bulletinUri: string;
}
export interface DistributeBulletinInput {
  bulletinId: string;
  hazardId: string;
  title: string;
  severity?: string;
  issuedAt?: string;
}
export interface DistributeBulletinOutput {
  status: "distributed" | "alreadyExists" | "rejected";
  bulletinUri?: string;
  did?: string;
  bulletinId?: string;
  error?: string;
}
export interface ListBulletinsInput {
  hazardId?: string;
  limit?: number;
  cursor?: string;
}
export interface ListBulletinsOutput {
  items: SafetyBulletinView[];
  cursor?: string;
  total: number;
}

// ─── Dangerous-goods check (PLAINTEXT, public DG screening result) ───

export interface DgCheckRecord {
  did: string;
  checkId: string;
  unNumber: string;
  properShippingName: string;
  /** integer 1-9 (UN/ICAO hazard class). */
  hazardClass: number;
  result: string;
  checkedAt: string;
  createdAt: string;
}
export interface DgCheckView extends DgCheckRecord {
  checkUri: string;
}
export interface ScreenDgInput {
  checkId: string;
  unNumber: string;
  properShippingName: string;
  hazardClass: number;
  result: string;
  checkedAt?: string;
}
export interface ScreenDgOutput {
  status: "screened" | "alreadyExists" | "rejected";
  checkUri?: string;
  did?: string;
  checkId?: string;
  error?: string;
}
export interface ListDgChecksInput {
  result?: string;
  limit?: number;
  cursor?: string;
}
export interface ListDgChecksOutput {
  items: DgCheckView[];
  cursor?: string;
  total: number;
}

// ─── Safety report (E2E, just-culture protected: reporter + narrative) ─

export interface SafetyReportBody {
  reportId: string;
  /** reporter identity — just-culture protected. */
  reporterDid: string;
  /** asr | occurrence | hazard | confidential. */
  reportKind: string;
  flightNo?: string;
  /** free-text narrative (confidential). */
  narrative: string;
  /** integer 0-100. */
  riskScore: number;
  reportedAt: string;
}
export interface SafetyReportView extends SafetyReportBody {
  uri: string;
  sender: string;
  createdAt: string;
}
export interface SubmitReportInput {
  reportId: string;
  reporterDid: string;
  reportKind: string;
  flightNo?: string;
  narrative: string;
  riskScore: number;
  reportedAt?: string;
  /** Extra DIDs to grant read-cap (owner always included). */
  recipients?: string[];
}
export interface SubmitReportOutput {
  status: "submitted" | "rejected";
  uri?: string;
  keyId?: string;
  reportId?: string;
  error?: string;
}
export interface ListReportsInput {
  reportKind?: string;
  limit?: number;
  cursor?: string;
}
export interface ListReportsOutput {
  items: SafetyReportView[];
  cursor?: string;
  total: number;
}
export interface GetReportInput {
  reportId: string;
}
export interface GetReportOutput {
  report?: SafetyReportView;
  error?: string;
}

// ─── IOSA finding (E2E, confidential audit result) ───────────────────

export interface IosaFindingBody {
  findingId: string;
  iosaSection: string;
  /** audited entity / station (confidential). */
  auditeeDid: string;
  /** finding | observation | conformance. */
  conformity: string;
  detail: string;
  /** integer 0-100 (severity). */
  severityScore: number;
  recordedAt: string;
}
export interface IosaFindingView extends IosaFindingBody {
  uri: string;
  sender: string;
  createdAt: string;
}
export interface RecordFindingInput {
  findingId: string;
  iosaSection: string;
  auditeeDid: string;
  conformity: string;
  detail: string;
  severityScore: number;
  recordedAt?: string;
  recipients?: string[];
}
export interface RecordFindingOutput {
  status: "recorded" | "rejected";
  uri?: string;
  keyId?: string;
  findingId?: string;
  error?: string;
}
export interface ListFindingsInput {
  iosaSection?: string;
  limit?: number;
  cursor?: string;
}
export interface ListFindingsOutput {
  items: IosaFindingView[];
  cursor?: string;
  total: number;
}

// ─── Security alert (E2E, AVSEC / security-LE) ───────────────────────

export interface SecurityAlertBody {
  alertId: string;
  /** avsec | cyber | insider | physical. */
  alertType: string;
  station?: string;
  /** confidential alert detail (LE-sensitive). */
  detail: string;
  /** low | elevated | high | critical. */
  threatLevel: string;
  raisedAt: string;
}
export interface SecurityAlertView extends SecurityAlertBody {
  uri: string;
  sender: string;
  createdAt: string;
}
export interface RaiseAlertInput {
  alertId: string;
  alertType: string;
  station?: string;
  detail: string;
  threatLevel: string;
  raisedAt?: string;
  recipients?: string[];
}
export interface RaiseAlertOutput {
  status: "raised" | "rejected";
  uri?: string;
  keyId?: string;
  alertId?: string;
  error?: string;
}
export interface ListAlertsInput {
  alertType?: string;
  limit?: number;
  cursor?: string;
}
export interface ListAlertsOutput {
  items: SecurityAlertView[];
  cursor?: string;
  total: number;
}

// ─── Regulatory report (E2E, confidential mandatory-filing content) ──

export interface RegulatoryReportBody {
  filingId: string;
  /** target authority: faa | easa | caa | jcab. */
  authority: string;
  /** mor | sdr | asap (mandatory occurrence / service difficulty). */
  filingType: string;
  /** confidential filing content. */
  content: string;
  /** prepared | transmitted | acknowledged (DATA status only — the actual
   *  authenticated transmission CALL stays etzhayyim). */
  filingStatus: string;
  preparedAt: string;
}
export interface RegulatoryReportView extends RegulatoryReportBody {
  uri: string;
  sender: string;
  createdAt: string;
}
export interface FileReportInput {
  filingId: string;
  authority: string;
  filingType: string;
  content: string;
  filingStatus?: string;
  preparedAt?: string;
  recipients?: string[];
}
export interface FileReportOutput {
  status: "filed" | "rejected";
  uri?: string;
  keyId?: string;
  filingId?: string;
  error?: string;
}
export interface ListRegReportsInput {
  authority?: string;
  limit?: number;
  cursor?: string;
}
export interface ListRegReportsOutput {
  items: RegulatoryReportView[];
  cursor?: string;
  total: number;
}

// ─── Coverage rollup ────────────────────────────────────────────────

export interface CoverageInput {
  maxScan?: number;
}
export interface CoverageOutput {
  operationalEventCount?: number;
  hazardCount?: number;
  safetyBulletinCount?: number;
  dangerousGoodsCheckCount?: number;
  safetyReportCount?: number;
  iosaFindingCount?: number;
  securityAlertCount?: number;
  regulatoryReportCount?: number;
  eventsByType?: Record<string, number>;
  truncated?: boolean;
  error?: string;
}

// ─── Validation + helpers ───────────────────────────────────────────

export function isUint(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}
export function isPct(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100;
}
export function isRange(n: unknown, lo: number, hi: number): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
}
export function airSmsDidFor(kind: string, id: string): string {
  return `${AIR_SMS_DID_PREFIX}${kind}:${id.toLowerCase()}`;
}
export function slugRkey(prefix: string, id: string): string {
  return `${prefix}-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

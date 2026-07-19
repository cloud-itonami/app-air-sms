/**
 * air-sms kotoba — kotoba-E2E registry.
 *
 * Plaintext path (operationalEvent / hazard / safetyBulletin /
 * dangerousGoodsCheck): sdk.write / sdk.read — public operational safety facts +
 * reference catalogs. safetyBulletin → hazard FK validated via exists().
 *
 * E2E path (safetyReport / iosaFinding / securityAlert / regulatoryReport):
 * sdk.encryptedWrite / sdk.encryptedRead — just-culture narratives, confidential
 * audit findings, AVSEC/security-LE alerts and mandatory-filing content sealed in
 * the kotoba envelope (ADR-2605181100), read-cap = owner DID + recipients. The
 * substrate never sees these in plaintext.
 *
 * STAYS etzhayyim (consent-capability, NOT a collection) — the authenticated
 * regulatory-filing TRANSMISSION to the civil-aviation authority and the AVSEC
 * enforcement/blocking ACTION. Only those execution acts stay etzhayyim; the report
 * and alert DATA migrate E2E here.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  OPERATIONAL_EVENT_COLLECTION,
  HAZARD_COLLECTION,
  SAFETY_BULLETIN_COLLECTION,
  DG_CHECK_COLLECTION,
  SAFETY_REPORT_INNER_TYPE,
  IOSA_FINDING_INNER_TYPE,
  SECURITY_ALERT_INNER_TYPE,
  REGULATORY_REPORT_INNER_TYPE,
  airSmsDidFor,
  slugRkey,
  isPct,
  isRange,
  type CoverageInput,
  type CoverageOutput,
  type OperationalEventRecord,
  type OperationalEventView,
  type RecordEventInput,
  type RecordEventOutput,
  type ListEventsInput,
  type ListEventsOutput,
  type HazardRecord,
  type HazardView,
  type RegisterHazardInput,
  type RegisterHazardOutput,
  type ListHazardsInput,
  type ListHazardsOutput,
  type SafetyBulletinRecord,
  type SafetyBulletinView,
  type DistributeBulletinInput,
  type DistributeBulletinOutput,
  type ListBulletinsInput,
  type ListBulletinsOutput,
  type DgCheckRecord,
  type DgCheckView,
  type ScreenDgInput,
  type ScreenDgOutput,
  type ListDgChecksInput,
  type ListDgChecksOutput,
  type SafetyReportBody,
  type SafetyReportView,
  type SubmitReportInput,
  type SubmitReportOutput,
  type ListReportsInput,
  type ListReportsOutput,
  type GetReportInput,
  type GetReportOutput,
  type IosaFindingBody,
  type IosaFindingView,
  type RecordFindingInput,
  type RecordFindingOutput,
  type ListFindingsInput,
  type ListFindingsOutput,
  type SecurityAlertBody,
  type SecurityAlertView,
  type RaiseAlertInput,
  type RaiseAlertOutput,
  type ListAlertsInput,
  type ListAlertsOutput,
  type RegulatoryReportBody,
  type RegulatoryReportView,
  type FileReportInput,
  type FileReportOutput,
  type ListRegReportsInput,
  type ListRegReportsOutput,
} from "./types.js";

const PAGE_LIMIT = 100;
const DEFAULT_MAX_SCAN = 10_000;

// ─── FK helper ──────────────────────────────────────────────────────

async function exists(e: Etzhayyim, collection: string, rkey: string): Promise<boolean> {
  const resp = await e.read<Record<string, unknown>>({ collection, rkey }).catch(() => ({ records: [] }));
  return Boolean(resp.records[0]);
}

// ─── Operational event (PLAINTEXT) ──────────────────────────────────

export async function recordEvent(e: Etzhayyim, input: RecordEventInput): Promise<RecordEventOutput> {
  if (!input.eventId || !input.eventType) return { status: "rejected", error: "missingRequiredFields" };
  const rkey = slugRkey("evt", input.eventId);
  const existing = await e.read<OperationalEventRecord>({ collection: OPERATIONAL_EVENT_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", eventUri: existing.records[0].uri, did: existing.records[0].value.did, eventId: input.eventId };
  }
  const now = new Date().toISOString();
  const did = airSmsDidFor("evt", input.eventId);
  const record: OperationalEventRecord = {
    did,
    eventId: input.eventId,
    eventType: input.eventType,
    flightNo: input.flightNo,
    station: input.station,
    phase: input.phase,
    occurredAt: input.occurredAt ?? now,
    createdAt: now,
  };
  const receipt = await e.write({ collection: OPERATIONAL_EVENT_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "recorded", eventUri: receipt.uri, did, eventId: input.eventId };
}

export async function listEvents(e: Etzhayyim, input: ListEventsInput = {}): Promise<ListEventsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<OperationalEventRecord>({ collection: OPERATIONAL_EVENT_COLLECTION, cursor: input.cursor, limit });
  const items: OperationalEventView[] = resp.records
    .filter((r) => !input.eventType || r.value.eventType === input.eventType)
    .map((r) => ({ ...r.value, eventUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Hazard register (PLAINTEXT) ────────────────────────────────────

export async function registerHazard(e: Etzhayyim, input: RegisterHazardInput): Promise<RegisterHazardOutput> {
  if (!input.hazardId || !input.category || !input.description) return { status: "rejected", error: "missingRequiredFields" };
  if (!isRange(input.likelihood, 1, 5)) return { status: "rejected", error: "invalidLikelihood" };
  if (!isRange(input.severity, 1, 5)) return { status: "rejected", error: "invalidSeverity" };
  if (!isPct(input.riskScore)) return { status: "rejected", error: "invalidRiskScore" };
  const rkey = slugRkey("haz", input.hazardId);
  const existing = await e.read<HazardRecord>({ collection: HAZARD_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", hazardUri: existing.records[0].uri, did: existing.records[0].value.did, hazardId: input.hazardId };
  }
  const now = new Date().toISOString();
  const did = airSmsDidFor("haz", input.hazardId);
  const record: HazardRecord = {
    did,
    hazardId: input.hazardId,
    category: input.category,
    description: input.description,
    likelihood: input.likelihood,
    severity: input.severity,
    riskScore: input.riskScore,
    status: input.status ?? "open",
    createdAt: now,
  };
  const receipt = await e.write({ collection: HAZARD_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "registered", hazardUri: receipt.uri, did, hazardId: input.hazardId };
}

export async function listHazards(e: Etzhayyim, input: ListHazardsInput = {}): Promise<ListHazardsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<HazardRecord>({ collection: HAZARD_COLLECTION, cursor: input.cursor, limit });
  const items: HazardView[] = resp.records
    .filter((r) => !input.category || r.value.category === input.category)
    .map((r) => ({ ...r.value, hazardUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Safety bulletin (PLAINTEXT; FK → hazard) ───────────────────────

export async function distributeBulletin(e: Etzhayyim, input: DistributeBulletinInput): Promise<DistributeBulletinOutput> {
  if (!input.bulletinId || !input.hazardId || !input.title) return { status: "rejected", error: "missingRequiredFields" };
  if (!(await exists(e, HAZARD_COLLECTION, slugRkey("haz", input.hazardId)))) {
    return { status: "rejected", error: "hazardNotFound" };
  }
  const rkey = slugRkey("bul", input.bulletinId);
  const existing = await e.read<SafetyBulletinRecord>({ collection: SAFETY_BULLETIN_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", bulletinUri: existing.records[0].uri, did: existing.records[0].value.did, bulletinId: input.bulletinId };
  }
  const now = new Date().toISOString();
  const did = airSmsDidFor("bul", input.bulletinId);
  const record: SafetyBulletinRecord = {
    did,
    bulletinId: input.bulletinId,
    hazardId: input.hazardId,
    title: input.title,
    severity: input.severity ?? "info",
    issuedAt: input.issuedAt ?? now,
    createdAt: now,
  };
  const receipt = await e.write({ collection: SAFETY_BULLETIN_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "distributed", bulletinUri: receipt.uri, did, bulletinId: input.bulletinId };
}

export async function listBulletins(e: Etzhayyim, input: ListBulletinsInput = {}): Promise<ListBulletinsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<SafetyBulletinRecord>({ collection: SAFETY_BULLETIN_COLLECTION, cursor: input.cursor, limit });
  const items: SafetyBulletinView[] = resp.records
    .filter((r) => !input.hazardId || r.value.hazardId === input.hazardId)
    .map((r) => ({ ...r.value, bulletinUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Dangerous-goods check (PLAINTEXT) ──────────────────────────────

export async function screenDg(e: Etzhayyim, input: ScreenDgInput): Promise<ScreenDgOutput> {
  if (!input.checkId || !input.unNumber || !input.properShippingName || !input.result) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (!isRange(input.hazardClass, 1, 9)) return { status: "rejected", error: "invalidHazardClass" };
  const rkey = slugRkey("dg", input.checkId);
  const existing = await e.read<DgCheckRecord>({ collection: DG_CHECK_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", checkUri: existing.records[0].uri, did: existing.records[0].value.did, checkId: input.checkId };
  }
  const now = new Date().toISOString();
  const did = airSmsDidFor("dg", input.checkId);
  const record: DgCheckRecord = {
    did,
    checkId: input.checkId,
    unNumber: input.unNumber,
    properShippingName: input.properShippingName,
    hazardClass: input.hazardClass,
    result: input.result,
    checkedAt: input.checkedAt ?? now,
    createdAt: now,
  };
  const receipt = await e.write({ collection: DG_CHECK_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "screened", checkUri: receipt.uri, did, checkId: input.checkId };
}

export async function listDgChecks(e: Etzhayyim, input: ListDgChecksInput = {}): Promise<ListDgChecksOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<DgCheckRecord>({ collection: DG_CHECK_COLLECTION, cursor: input.cursor, limit });
  const items: DgCheckView[] = resp.records
    .filter((r) => !input.result || r.value.result === input.result)
    .map((r) => ({ ...r.value, checkUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Safety report (E2E, just-culture protected) ────────────────────

export async function submitReport(e: Etzhayyim, input: SubmitReportInput): Promise<SubmitReportOutput> {
  if (!input.reportId || !input.reporterDid || !input.reportKind || !input.narrative) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (!isPct(input.riskScore)) return { status: "rejected", error: "invalidRiskScore" };
  const body: SafetyReportBody = {
    reportId: input.reportId,
    reporterDid: input.reporterDid,
    reportKind: input.reportKind,
    flightNo: input.flightNo,
    narrative: input.narrative,
    riskScore: input.riskScore,
    reportedAt: input.reportedAt ?? new Date().toISOString(),
  };
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: SAFETY_REPORT_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: slugRkey("rpt", input.reportId),
  });
  return { status: "submitted", uri: receipt.uri, keyId: receipt.keyId, reportId: input.reportId };
}

async function scanReports(e: Etzhayyim, maxScan: number): Promise<SafetyReportView[]> {
  const out: SafetyReportView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<SafetyReportBody>({ innerType: SAFETY_REPORT_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) out.push({ ...r.value, uri: r.uri, sender: r.sender, createdAt: r.createdAt });
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listReports(e: Etzhayyim, input: ListReportsInput = {}): Promise<ListReportsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanReports(e, DEFAULT_MAX_SCAN);
  const filtered = all.filter((r) => !input.reportKind || r.reportKind === input.reportKind);
  return { items: filtered.slice(0, limit), total: filtered.length };
}

export async function getReport(e: Etzhayyim, input: GetReportInput): Promise<GetReportOutput> {
  if (!input.reportId) return { error: "invalidReportId" };
  const all = await scanReports(e, DEFAULT_MAX_SCAN);
  const found = all.find((r) => r.reportId === input.reportId);
  if (!found) return { error: "notFound" };
  return { report: found };
}

// ─── IOSA finding (E2E, confidential audit) ─────────────────────────

export async function recordFinding(e: Etzhayyim, input: RecordFindingInput): Promise<RecordFindingOutput> {
  if (!input.findingId || !input.iosaSection || !input.auditeeDid || !input.conformity || !input.detail) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (!isPct(input.severityScore)) return { status: "rejected", error: "invalidSeverityScore" };
  const body: IosaFindingBody = {
    findingId: input.findingId,
    iosaSection: input.iosaSection,
    auditeeDid: input.auditeeDid,
    conformity: input.conformity,
    detail: input.detail,
    severityScore: input.severityScore,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: IOSA_FINDING_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: slugRkey("iosa", input.findingId),
  });
  return { status: "recorded", uri: receipt.uri, keyId: receipt.keyId, findingId: input.findingId };
}

async function scanFindings(e: Etzhayyim, maxScan: number): Promise<IosaFindingView[]> {
  const out: IosaFindingView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<IosaFindingBody>({ innerType: IOSA_FINDING_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) out.push({ ...r.value, uri: r.uri, sender: r.sender, createdAt: r.createdAt });
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listFindings(e: Etzhayyim, input: ListFindingsInput = {}): Promise<ListFindingsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanFindings(e, DEFAULT_MAX_SCAN);
  const filtered = all.filter((f) => !input.iosaSection || f.iosaSection === input.iosaSection);
  return { items: filtered.slice(0, limit), total: filtered.length };
}

// ─── Security alert (E2E, AVSEC / security-LE) ──────────────────────

export async function raiseAlert(e: Etzhayyim, input: RaiseAlertInput): Promise<RaiseAlertOutput> {
  if (!input.alertId || !input.alertType || !input.detail || !input.threatLevel) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const body: SecurityAlertBody = {
    alertId: input.alertId,
    alertType: input.alertType,
    station: input.station,
    detail: input.detail,
    threatLevel: input.threatLevel,
    raisedAt: input.raisedAt ?? new Date().toISOString(),
  };
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: SECURITY_ALERT_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: slugRkey("alert", input.alertId),
  });
  return { status: "raised", uri: receipt.uri, keyId: receipt.keyId, alertId: input.alertId };
}

async function scanAlerts(e: Etzhayyim, maxScan: number): Promise<SecurityAlertView[]> {
  const out: SecurityAlertView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<SecurityAlertBody>({ innerType: SECURITY_ALERT_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) out.push({ ...r.value, uri: r.uri, sender: r.sender, createdAt: r.createdAt });
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listAlerts(e: Etzhayyim, input: ListAlertsInput = {}): Promise<ListAlertsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanAlerts(e, DEFAULT_MAX_SCAN);
  const filtered = all.filter((a) => !input.alertType || a.alertType === input.alertType);
  return { items: filtered.slice(0, limit), total: filtered.length };
}

// ─── Regulatory report (E2E, confidential filing content) ───────────

export async function fileReport(e: Etzhayyim, input: FileReportInput): Promise<FileReportOutput> {
  if (!input.filingId || !input.authority || !input.filingType || !input.content) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const body: RegulatoryReportBody = {
    filingId: input.filingId,
    authority: input.authority,
    filingType: input.filingType,
    content: input.content,
    filingStatus: input.filingStatus ?? "prepared",
    preparedAt: input.preparedAt ?? new Date().toISOString(),
  };
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: REGULATORY_REPORT_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: slugRkey("reg", input.filingId),
  });
  return { status: "filed", uri: receipt.uri, keyId: receipt.keyId, filingId: input.filingId };
}

async function scanRegReports(e: Etzhayyim, maxScan: number): Promise<RegulatoryReportView[]> {
  const out: RegulatoryReportView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<RegulatoryReportBody>({ innerType: REGULATORY_REPORT_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) out.push({ ...r.value, uri: r.uri, sender: r.sender, createdAt: r.createdAt });
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listRegReports(e: Etzhayyim, input: ListRegReportsInput = {}): Promise<ListRegReportsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanRegReports(e, DEFAULT_MAX_SCAN);
  const filtered = all.filter((r) => !input.authority || r.authority === input.authority);
  return { items: filtered.slice(0, limit), total: filtered.length };
}

// ─── Coverage rollup ────────────────────────────────────────────────

async function countPlaintext(e: Etzhayyim, collection: string, maxScan: number, byType?: (v: any, acc: Record<string, number>) => void, acc?: Record<string, number>): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  while (total < maxScan) {
    const page = await e.read<any>({ collection, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      total += 1;
      if (byType && acc) byType(r.value, acc);
    }
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    cursor = page.cursor;
  }
  return total;
}

export async function coverage(e: Etzhayyim, input: CoverageInput = {}): Promise<CoverageOutput> {
  const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);
  const eventsByType: Record<string, number> = {};
  const operationalEventCount = await countPlaintext(e, OPERATIONAL_EVENT_COLLECTION, maxScan, (v, acc) => {
    acc[v.eventType] = (acc[v.eventType] ?? 0) + 1;
  }, eventsByType);
  const hazardCount = await countPlaintext(e, HAZARD_COLLECTION, maxScan);
  const safetyBulletinCount = await countPlaintext(e, SAFETY_BULLETIN_COLLECTION, maxScan);
  const dangerousGoodsCheckCount = await countPlaintext(e, DG_CHECK_COLLECTION, maxScan);
  const safetyReportCount = (await scanReports(e, maxScan)).length;
  const iosaFindingCount = (await scanFindings(e, maxScan)).length;
  const securityAlertCount = (await scanAlerts(e, maxScan)).length;
  const regulatoryReportCount = (await scanRegReports(e, maxScan)).length;
  return {
    operationalEventCount,
    hazardCount,
    safetyBulletinCount,
    dangerousGoodsCheckCount,
    safetyReportCount,
    iosaFindingCount,
    securityAlertCount,
    regulatoryReportCount,
    eventsByType,
    truncated:
      operationalEventCount >= maxScan ||
      safetyReportCount >= maxScan ||
      iosaFindingCount >= maxScan ||
      securityAlertCount >= maxScan ||
      regulatoryReportCount >= maxScan,
  };
}

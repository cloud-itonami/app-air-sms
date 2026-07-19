import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  recordEvent,
  listEvents,
  registerHazard,
  listHazards,
  distributeBulletin,
  listBulletins,
  screenDg,
  listDgChecks,
  submitReport,
  listReports,
  getReport,
  recordFinding,
  listFindings,
  raiseAlert,
  listAlerts,
  fileReport,
  listRegReports,
  coverage,
} from "../src/index.js";

const OWNER = "did:web:air-sms.etzhayyim.com";

describe("air-sms kotoba (kotoba-E2E split)", () => {
  let e: any;
  beforeEach(() => {
    e = new MockEtzhayyim({ did: OWNER });
  });

  describe("operationalEvent (PLAINTEXT public timeline)", () => {
    it("records, dedups, validates, lists/filters", async () => {
      expect((await recordEvent(e, { eventId: "e1", eventType: "diversion", flightNo: "XE100" })).status).toBe("recorded");
      expect((await recordEvent(e, { eventId: "e1", eventType: "diversion" })).status).toBe("alreadyExists");
      expect((await recordEvent(e, { eventId: "", eventType: "x" })).status).toBe("rejected");
      await recordEvent(e, { eventId: "e2", eventType: "go-around" });
      expect((await listEvents(e)).total).toBe(2);
      expect((await listEvents(e, { eventType: "diversion" })).total).toBe(1);
    });
  });

  describe("hazard register (PLAINTEXT catalog)", () => {
    it("registers, validates ranges, lists/filters", async () => {
      expect((await registerHazard(e, { hazardId: "h1", category: "runway", description: "wet rwy", likelihood: 3, severity: 4, riskScore: 70 })).status).toBe("registered");
      expect((await registerHazard(e, { hazardId: "h1", category: "runway", description: "dup", likelihood: 3, severity: 4, riskScore: 70 })).status).toBe("alreadyExists");
      expect((await registerHazard(e, { hazardId: "hX", category: "c", description: "d", likelihood: 9, severity: 4, riskScore: 70 })).status).toBe("rejected"); // likelihood>5
      expect((await registerHazard(e, { hazardId: "hY", category: "c", description: "d", likelihood: 3, severity: 4, riskScore: 200 })).status).toBe("rejected"); // riskScore>100
      await registerHazard(e, { hazardId: "h2", category: "weather", description: "icing", likelihood: 2, severity: 5, riskScore: 60 });
      expect((await listHazards(e)).total).toBe(2);
      expect((await listHazards(e, { category: "runway" })).total).toBe(1);
    });
  });

  describe("safetyBulletin (PLAINTEXT; FK → hazard via exists())", () => {
    it("rejects when hazard FK missing, distributes when present, dedups", async () => {
      expect((await distributeBulletin(e, { bulletinId: "b1", hazardId: "ghost", title: "t" })).status).toBe("rejected");
      await registerHazard(e, { hazardId: "h1", category: "runway", description: "wet", likelihood: 3, severity: 4, riskScore: 70 });
      expect((await distributeBulletin(e, { bulletinId: "b1", hazardId: "h1", title: "Wet runway advisory", severity: "high" })).status).toBe("distributed");
      expect((await distributeBulletin(e, { bulletinId: "b1", hazardId: "h1", title: "dup" })).status).toBe("alreadyExists");
      expect((await listBulletins(e, { hazardId: "h1" })).total).toBe(1);
    });
  });

  describe("dangerousGoodsCheck (PLAINTEXT screening result)", () => {
    it("screens, validates hazard class, lists/filters", async () => {
      expect((await screenDg(e, { checkId: "d1", unNumber: "UN1845", properShippingName: "Dry ice", hazardClass: 9, result: "accepted" })).status).toBe("screened");
      expect((await screenDg(e, { checkId: "dX", unNumber: "UN0000", properShippingName: "x", hazardClass: 12, result: "accepted" })).status).toBe("rejected"); // class>9
      await screenDg(e, { checkId: "d2", unNumber: "UN3480", properShippingName: "Lithium battery", hazardClass: 9, result: "rejected" });
      expect((await listDgChecks(e)).total).toBe(2);
      expect((await listDgChecks(e, { result: "accepted" })).total).toBe(1);
    });
  });

  describe("safetyReport (E2E-ENCRYPTED just-culture)", () => {
    it("seals via encryptedWrite, round-trips via encryptedRead, validates", async () => {
      const ok = await submitReport(e, { reportId: "r1", reporterDid: "did:web:pilot.example", reportKind: "asr", narrative: "TCAS RA in cruise", riskScore: 65 });
      expect(ok.status).toBe("submitted");
      expect(ok.keyId).toBeTruthy();
      expect((await submitReport(e, { reportId: "rX", reporterDid: "d", reportKind: "asr", narrative: "n", riskScore: 200 })).status).toBe("rejected"); // riskScore>100
      const got = await getReport(e, { reportId: "r1" });
      expect(got.report?.reporterDid).toBe("did:web:pilot.example");
      expect(got.report?.narrative).toBe("TCAS RA in cruise");
      await submitReport(e, { reportId: "r2", reporterDid: "did:web:cabin.example", reportKind: "occurrence", narrative: "spill", riskScore: 20 });
      expect((await listReports(e)).total).toBe(2);
      expect((await listReports(e, { reportKind: "asr" })).total).toBe(1);
    });

    it("enforces read-cap: a non-recipient DID cannot decrypt the report", async () => {
      await submitReport(e, { reportId: "r1", reporterDid: "did:web:pilot", reportKind: "asr", narrative: "secret", riskScore: 50 });
      const outsider: any = new MockEtzhayyim({ did: "did:web:outsider.example" });
      expect((await listReports(outsider)).total).toBe(0);
    });

    it("grants read-cap to an explicit recipient", async () => {
      const partner = "did:web:safety-board.example";
      const r = await submitReport(e, { reportId: "r1", reporterDid: "did:web:pilot", reportKind: "asr", narrative: "n", riskScore: 50, recipients: [partner] });
      expect(r.status).toBe("submitted");
      expect((await listReports(e)).total).toBe(1);
    });
  });

  describe("iosaFinding (E2E-ENCRYPTED confidential audit)", () => {
    it("seals + round-trips + validates severity", async () => {
      expect((await recordFinding(e, { findingId: "f1", iosaSection: "FLT-2", auditeeDid: "did:web:station.lax", conformity: "finding", detail: "missing record", severityScore: 80 })).status).toBe("recorded");
      expect((await recordFinding(e, { findingId: "fX", iosaSection: "x", auditeeDid: "d", conformity: "finding", detail: "d", severityScore: 200 })).status).toBe("rejected");
      await recordFinding(e, { findingId: "f2", iosaSection: "GRH-1", auditeeDid: "did:web:station.nrt", conformity: "observation", detail: "minor", severityScore: 30 });
      expect((await listFindings(e)).total).toBe(2);
      expect((await listFindings(e, { iosaSection: "FLT-2" })).total).toBe(1);
    });
  });

  describe("securityAlert (E2E-ENCRYPTED AVSEC/LE)", () => {
    it("seals + round-trips + validates", async () => {
      expect((await raiseAlert(e, { alertId: "a1", alertType: "avsec", station: "JFK", detail: "unattended bag", threatLevel: "high" })).status).toBe("raised");
      expect((await raiseAlert(e, { alertId: "", alertType: "avsec", detail: "x", threatLevel: "high" })).status).toBe("rejected");
      await raiseAlert(e, { alertId: "a2", alertType: "cyber", detail: "phishing", threatLevel: "elevated" });
      expect((await listAlerts(e)).total).toBe(2);
      expect((await listAlerts(e, { alertType: "avsec" })).total).toBe(1);
    });
  });

  describe("regulatoryReport (E2E-ENCRYPTED filing DATA; transmission stays etzhayyim)", () => {
    it("seals filing data + round-trips + validates", async () => {
      expect((await fileReport(e, { filingId: "g1", authority: "faa", filingType: "mor", content: "engine surge FL350" })).status).toBe("filed");
      expect((await fileReport(e, { filingId: "", authority: "faa", filingType: "mor", content: "x" })).status).toBe("rejected");
      await fileReport(e, { filingId: "g2", authority: "easa", filingType: "sdr", content: "hyd leak" });
      expect((await listRegReports(e)).total).toBe(2);
      expect((await listRegReports(e, { authority: "faa" })).total).toBe(1);
    });
  });

  describe("coverage rollup", () => {
    it("counts all plaintext + E2E collections", async () => {
      await recordEvent(e, { eventId: "e1", eventType: "diversion" });
      await recordEvent(e, { eventId: "e2", eventType: "diversion" });
      await registerHazard(e, { hazardId: "h1", category: "runway", description: "wet", likelihood: 3, severity: 4, riskScore: 70 });
      await distributeBulletin(e, { bulletinId: "b1", hazardId: "h1", title: "t" });
      await screenDg(e, { checkId: "d1", unNumber: "UN1845", properShippingName: "Dry ice", hazardClass: 9, result: "accepted" });
      await submitReport(e, { reportId: "r1", reporterDid: "did:web:p", reportKind: "asr", narrative: "n", riskScore: 50 });
      await recordFinding(e, { findingId: "f1", iosaSection: "FLT-2", auditeeDid: "did:web:s", conformity: "finding", detail: "d", severityScore: 60 });
      await raiseAlert(e, { alertId: "a1", alertType: "avsec", detail: "d", threatLevel: "high" });
      await fileReport(e, { filingId: "g1", authority: "faa", filingType: "mor", content: "c" });
      const cov = await coverage(e);
      expect(cov.operationalEventCount).toBe(2);
      expect(cov.hazardCount).toBe(1);
      expect(cov.safetyBulletinCount).toBe(1);
      expect(cov.dangerousGoodsCheckCount).toBe(1);
      expect(cov.safetyReportCount).toBe(1);
      expect(cov.iosaFindingCount).toBe(1);
      expect(cov.securityAlertCount).toBe(1);
      expect(cov.regulatoryReportCount).toBe(1);
      expect(cov.eventsByType?.diversion).toBe(2);
    });
  });
});

/**
 * air-sms kotoba — barrel. kotoba-E2E split (ADR-2605181100): public
 * operational safety facts + reference catalogs plaintext; just-culture
 * narratives, confidential audit findings, AVSEC/security-LE alerts and
 * mandatory-filing content sealed E2E. Only the regulatory-filing TRANSMISSION
 * and AVSEC enforcement/blocking ACTION stay etzhayyim (consent-capability).
 */
export * from "./types.js";
export {
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
} from "./registry.js";

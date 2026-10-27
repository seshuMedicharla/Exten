export type IndicatorTone = 'caution' | 'neutral' | 'info';
export interface UrlIndicator {
  id: 'http' | 'https' | 'ip-address' | 'credentials' | 'punycode' | 'custom-port';
  title: string;
  detail: string;
  tone: IndicatorTone;
}
export interface SiteReport {
  tabId: number;
  url: string;
  hostname: string;
  protocol: 'http:' | 'https:';
  inspectedAt: number;
  indicators: UrlIndicator[];
  ml: MlAssessment;
}
export type MlAssessment =
  | { status: 'analyzed'; score: number; classification: 'elevated_signal' | 'below_threshold'; threshold: number; modelVersion: string; limitations: string[] }
  | { status: 'not-analyzed' | 'unavailable' | 'timeout' | 'unsupported' | 'error'; reason: string };
export type ReportResult =
  | { status: 'ready'; report: SiteReport }
  | { status: 'unsupported'; reason: string }
  | { status: 'permission-denied'; reason: string }
  | { status: 'error'; reason: string };

export type ExtensionRequest =
  | { type: 'GET_ACTIVE_REPORT' }
  | { type: 'GET_TAB_REPORT'; tabId: number }
  | { type: 'OPEN_REPORT'; tabId: number }
  | { type: 'INSPECT_PAGE'; tabId: number };
export type ConsentCategory = 'essential' | 'analytics' | 'marketing' | 'other';
export interface PageDomObservation {
  version: 1;
  bannerDetected: boolean;
  categories: ConsentCategory[];
  passwordFieldPresent: boolean;
}
export interface PageInspectionData {
  bannerDetected: boolean;
  categories: ConsentCategory[];
  passwordFieldPresent: boolean;
  httpLoginWarning: boolean;
  inspectedAt: number;
}
export type PageInspectionResult =
  | { status: 'analyzed'; data: PageInspectionData }
  | { status: 'unavailable'; reason: string; kind: 'unsupported-page' | 'permission-denied' | 'page-changed' }
  | { status: 'error'; reason: string };
export type ExtensionResponse = ReportResult | { status: 'opened' | 'ignored' | 'suppressed' } | { status: 'show'; kind: 'first' | 'returning' } | { enabled: boolean } | { type: 'PAGE_INSPECTION_RESULT'; result: PageInspectionResult };

export interface Preferences {
  showUrlObservations: boolean;
  highlightHttp: boolean;
  showRecommendations: boolean;
  smartPasswordHintReminders: boolean;
}
export const DEFAULT_PREFERENCES: Preferences = {
  showUrlObservations: true,
  highlightHttp: true,
  showRecommendations: true,
  smartPasswordHintReminders: false,
};

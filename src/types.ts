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
}
export type ReportResult =
  | { status: 'ready'; report: SiteReport }
  | { status: 'unsupported'; reason: string }
  | { status: 'permission-denied'; reason: string }
  | { status: 'error'; reason: string };

export type ExtensionRequest =
  | { type: 'GET_ACTIVE_REPORT' }
  | { type: 'GET_TAB_REPORT'; tabId: number }
  | { type: 'OPEN_REPORT'; tabId: number };
export type ExtensionResponse = ReportResult | { status: 'opened' };

export interface Preferences {
  showUrlObservations: boolean;
  highlightHttp: boolean;
  showRecommendations: boolean;
}
export const DEFAULT_PREFERENCES: Preferences = {
  showUrlObservations: true,
  highlightHttp: true,
  showRecommendations: true,
};

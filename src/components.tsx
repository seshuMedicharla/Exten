import type { ReactNode } from 'react';
import type { Recommendation } from './advisor';
import type { PageInspectionState } from './use-page-inspection';
import type { MlAssessment, ReportResult, SiteReport, UrlIndicator } from './types';

type IconName = 'shield' | 'globe' | 'search' | 'lock' | 'users' | 'arrow' | 'settings' | 'alert' | 'check' | 'chevron' | 'eye' | 'spark' | 'info' | 'refresh';
const paths: Record<IconName, ReactNode> = {
  shield: <><path d="M12 2 4 5v6c0 5 3.4 8.6 8 11 4.6-2.4 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m2 9v-2a5 5 0 0 0-3-4.6"/></>,
  arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3l-.1.1V22h-4v-2.5l-.1-.1a1.7 1.7 0 0 0-1.9.3l-.1.1L6 17l.1-.1a1.7 1.7 0 0 0 .3-1.9l-.1-.1H4v-4h2.3l.1-.1a1.7 1.7 0 0 0-.3-1.9L6 8.8 8.8 6l.1.1a1.7 1.7 0 0 0 1.9.3l.1-.1V4h4v2.3l.1.1a1.7 1.7 0 0 0 1.9-.3L17 6l2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9l.1.1H22v4h-2.5Z"/></>,
  alert: <><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>,
  spark: <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Zm7 14 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.2 6M20 4v7h-7"/></>,
};
export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><span className="brand-mark"><Icon name="shield" size={compact ? 20 : 25}/></span><span className="brand-name">ExAi<span>Sec</span></span></div>;
}
export function StatusPill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warn' | 'teal' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
export function SectionTitle({ icon, title, right }: { icon: IconName; title: string; right?: ReactNode }) {
  return <div className="section-title"><span className="section-title-icon"><Icon name={icon} size={18}/></span><h2>{title}</h2>{right && <span className="section-right">{right}</span>}</div>;
}
export function StatePanel({ result, onRetry, spacious = false }: { result: ReportResult | {status:'loading'}; onRetry?: () => void; spacious?: boolean }) {
  const loading = result.status === 'loading';
  const title = loading ? 'Inspecting current tab' : result.status === 'unsupported' ? 'Page not supported' : result.status === 'permission-denied' ? 'URL access unavailable' : 'Something went wrong';
  const description = loading ? 'Checking the current address and contacting the local model. This may take a few seconds…' : 'reason' in result ? result.reason : '';
  return <div className={`state-panel ${spacious ? 'state-panel-spacious' : ''}`} role={loading ? 'status' : 'alert'}>
    <span className={`state-icon ${loading ? 'spin' : ''}`}><Icon name={loading ? 'refresh' : result.status === 'unsupported' ? 'globe' : 'alert'} size={25}/></span>
    <h2>{title}</h2><p>{description}</p>
    {!loading && onRetry && <button className="button button-secondary" onClick={onRetry}><Icon name="refresh" size={16}/> Try again</button>}
    {result.status === 'unsupported' && <p className="state-note">Chrome pages, extension pages, local files, and other nonwebsite addresses are not supported.</p>}
  </div>;
}
export function SiteIdentity({ report }: { report: SiteReport }) {
  return <div className="site-identity"><span className="site-icon"><Icon name="globe" size={22}/></span><div className="site-details"><strong>{report.hostname}</strong><span title={report.url}>{report.url}</span></div></div>;
}
export function IndicatorItem({ indicator }: { indicator: UrlIndicator }) {
  return <div className={`indicator indicator-${indicator.tone}`}><span className="indicator-symbol"><Icon name={indicator.tone === 'caution' ? 'alert' : indicator.id === 'https' ? 'lock' : 'info'} size={17}/></span><div><strong>{indicator.title}</strong><p>{indicator.detail}</p></div></div>;
}
export function MlSummary({ assessment }: { assessment: MlAssessment }) {
  if (assessment.status !== 'analyzed') return <><small>ML risk: Not Analyzed</small><small>{assessment.reason}</small></>;
  return <><small>Experimental ML: {assessment.classification === 'elevated_signal' ? 'Elevated signal' : 'Below provisional threshold'}</small><small>Unitless model score {assessment.score.toFixed(3)} · not a probability</small></>;
}
const adviceSourceLabels: Record<Recommendation['source'], string> = {
  'observed-url': 'Observed URL',
  'experimental-model': 'Experimental model',
  'analysis-status': 'Analysis status',
  general: 'General guidance',
};
export function RecommendationList({ items, compact = false }: { items: readonly Recommendation[]; compact?: boolean }) {
  return <div className={`recommendations ${compact ? 'recommendations-compact' : ''}`}>{items.map((item, index) => <div className="recommendation" key={item.id}><span aria-hidden="true">{index + 1}</span><div><small>{adviceSourceLabels[item.source]}</small><strong>{item.title}</strong><p>{item.detail}</p></div></div>)}</div>;
}
const categoryLabels = { essential: 'Essential', analytics: 'Analytics', marketing: 'Marketing', other: 'Other' } as const;
export function PageInspectionPanel({ state, onInspect, compact = false }: { state: PageInspectionState; onInspect: () => void; compact?: boolean }) {
  const label = state.status === 'idle' ? 'Not inspected' : state.status === 'loading' ? 'Inspecting' : state.status === 'analyzed' ? 'Inspected' : state.status === 'unavailable' ? 'Unavailable' : 'Error';
  return <section className={`${compact ? 'observation-card' : 'panel'} inspection-panel`} aria-label="Privacy and login page inspection">
    <SectionTitle icon="eye" title="Privacy & login inspection" right={<StatusPill tone={state.status === 'analyzed' ? 'teal' : 'muted'}>{label}</StatusPill>}/>
    <p className="muted-copy">Optional top-frame check of visible consent text and password-field structure. No values or cookie data are read.</p>
    <button className="button button-secondary inspection-button" type="button" disabled={state.status === 'loading'} onClick={onInspect}>Inspect page privacy &amp; login security</button>
    <div className="inspection-result" aria-live="polite">
      {state.status === 'idle' && <p className="muted-copy">Page content has not been inspected. Start this check only if you want it.</p>}
      {state.status === 'loading' && <p className="muted-copy" role="status">Inspecting the visible top frame…</p>}
      {state.status === 'unavailable' && <p className="inspection-message" role="status">Inspection unavailable: {state.reason}</p>}
      {state.status === 'error' && <p className="inspection-message" role="alert">Inspection error: {state.reason}</p>}
      {state.status === 'analyzed' && <>
        <h3>Observed on this page</h3>
        <p>{state.data.bannerDetected ? 'Visible cookie-consent banner detected.' : 'No visible cookie-consent banner found in the top frame.'}</p>
        {state.data.bannerDetected && (state.data.categories.length > 0
          ? <div className="category-list" aria-label="Visible category labels">{state.data.categories.map((category) => <span key={category}>{categoryLabels[category]}</span>)}</div>
          : <p>Categories could not be determined from the visible banner.</p>)}
        <p>{state.data.passwordFieldPresent ? 'Visible password field found; a login or account form is likely.' : 'No visible password field found in the top frame.'}</p>
        {state.data.httpLoginWarning && <p className="inspection-warning"><Icon name="alert" size={16}/> HTTP page with a likely password form. Avoid entering credentials here.</p>}
        <h3>General guidance</h3>
        <p>Review consent choices yourself; no choice was made for you. If you sign in, use a unique password and MFA where offered. ExAiSec cannot determine whether this site supports MFA.</p>
      </>}
    </div>
  </section>;
}
export function pageInspectionSummaries(state: PageInspectionState): { privacy: string; login: string } {
  if (state.status === 'analyzed') return {
    privacy: state.data.bannerDetected ? state.data.categories.length ? `Banner detected · ${state.data.categories.length} visible category label(s)` : 'Banner detected · categories unknown' : 'No visible banner found',
    login: state.data.httpLoginWarning ? 'HTTP page with likely password form' : state.data.passwordFieldPresent ? 'Visible password field found; MFA unknown' : 'No visible password field found',
  };
  if (state.status === 'loading') return { privacy: 'Inspection in progress', login: 'Inspection in progress' };
  if (state.status === 'unavailable') return { privacy: 'Inspection unavailable', login: 'Inspection unavailable' };
  if (state.status === 'error') return { privacy: 'Inspection error', login: 'Inspection error' };
  return { privacy: 'Page not inspected', login: 'Page not inspected' };
}
export function Footer() { return <footer className="footer"><Icon name="lock" size={14}/> Local URL observations · No browsing data sent externally</footer>; }

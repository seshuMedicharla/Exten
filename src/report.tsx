import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getRecommendations } from './advisor';
import { Brand, Footer, Icon, IndicatorItem, PageInspectionPanel, RecommendationList, SectionTitle, SiteIdentity, StatePanel, StatusPill, pageInspectionSummaries } from './components';
import { hasCaution, visibleIndicators } from './url-analysis';
import { usePreferences } from './use-preferences';
import { usePageInspection } from './use-page-inspection';
import { useReport } from './use-report';
import type { ExtensionRequest } from './types';
import './styles.css';

const tabIdValue = new URLSearchParams(location.search).get('tabId');
const parsedTabId = tabIdValue !== null && /^\d+$/.test(tabIdValue) ? Number(tabIdValue) : NaN;
const reportRequest: ExtensionRequest | null = Number.isSafeInteger(parsedTabId) ? { type: 'GET_TAB_REPORT', tabId: parsedTabId } : null;

function ReportPage() {
  const { result, reload } = useReport(reportRequest);
  const prefs = usePreferences();
  const report = result.status === 'ready' ? result.report : null;
  const { state: inspection, inspect } = usePageInspection(report?.tabId);
  const inspectionSummary = pageInspectionSummaries(inspection);
  const indicators = report ? visibleIndicators(report, prefs.highlightHttp) : [];
  const caution = report ? hasCaution(report, prefs.highlightHttp) : false;
  const recommendations = report ? getRecommendations(indicators, report.ml) : [];
  return <div className="page-shell"><header className="page-header"><div className="page-header-inner"><Brand/><button className="button button-secondary small" onClick={() => void chrome.runtime.openOptionsPage()}><Icon name="settings" size={16}/> Settings</button></div></header>
    <main className="page-main"><div className="page-intro"><div className="eyebrow">EXAISEC / SECURITY REPORT</div><h1>Website security report</h1><p>URL observations and experimental local model guidance for the address you opened.</p></div>
      {report ? <>
        <section className={`report-hero ${caution ? 'report-hero-caution' : ''}`}><div className="report-hero-top"><span className="report-hero-badge"><Icon name={caution ? 'alert' : 'shield'} size={22}/></span><StatusPill tone={caution ? 'warn' : 'muted'}>{caution ? 'Review URL' : 'Unverified'}</StatusPill></div><h2>{caution ? 'This URL has details to review' : 'This site has not been verified'}</h2><p>{caution ? 'The observations below describe the address only. They do not establish that the website is malicious.' : 'No enabled URL warnings are shown. This does not establish that the website is safe.'}</p></section>
        <div className="report-grid"><div className="report-primary">
          <section className="panel"><SectionTitle icon="globe" title="Website information"/><SiteIdentity report={report}/><dl className="facts"><div><dt>Inspected URL*</dt><dd className="break-all">{report.url}</dd></div><div><dt>Hostname</dt><dd>{report.hostname}</dd></div><div><dt>URL scheme</dt><dd>{report.protocol.replace(':','').toUpperCase()}</dd></div><div><dt>Checked at</dt><dd>{new Date(report.inspectedAt).toLocaleString()}</dd></div></dl><p className="muted-copy">*Credentials, query, and fragment are omitted before the URL is displayed or sent to the local API.</p></section>
          <section className="panel"><SectionTitle icon="spark" title="Experimental ML assessment" right={<StatusPill tone={report.ml.status === 'analyzed' && report.ml.classification === 'elevated_signal' ? 'warn' : 'muted'}>{report.ml.status === 'analyzed' ? 'Research only' : 'Not Analyzed'}</StatusPill>}/>{report.ml.status === 'analyzed' ? <div className="ml-result"><h3>{report.ml.classification === 'elevated_signal' ? 'Elevated model signal' : 'Below provisional threshold'}</h3><p className="ml-score">Unitless model score: <strong>{report.ml.score.toFixed(3)}</strong> <span>· provisional threshold {report.ml.threshold.toFixed(3)}</span></p><p className="muted-copy">This score is a model output, not a guaranteed probability of phishing. A below-threshold score does not verify safety.</p><p className="muted-copy">Model: {report.ml.modelVersion}</p><ul className="limitations">{report.ml.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul></div> : <div className="ml-result"><h3>Not Analyzed</h3><p className="muted-copy">{report.ml.reason}</p><p className="muted-copy">Start the local API and refresh to request an experimental assessment.</p></div>}</section>
          <section className="panel"><SectionTitle icon="search" title="URL indicators" right={<StatusPill>{prefs.showUrlObservations ? `${indicators.length} observed` : 'Hidden in settings'}</StatusPill>}/>{prefs.showUrlObservations ? (indicators.length ? <div className="indicator-list">{indicators.map((item) => <IndicatorItem key={item.id} indicator={item}/>)}</div> : <p className="muted-copy">No enabled URL indicators to show.</p>) : <p className="muted-copy">URL observations are hidden by your preference. You can change this in Settings.</p>}</section>
          <PageInspectionPanel state={inspection} onInspect={() => void inspect()}/>
          {prefs.showRecommendations && <section className="panel"><SectionTitle icon="spark" title="Recommended next steps"/><RecommendationList items={recommendations}/></section>}
        </div><aside className="report-side">
          <section className="panel"><SectionTitle icon="shield" title="Analysis status"/><div className="status-list"><div><span>Experimental ML</span><strong>{report.ml.status === 'analyzed' ? 'Analyzed locally' : 'Not Analyzed'}</strong></div><div><span>Threat intelligence</span><strong>Not available</strong></div><div><span>Consent banner</span><strong>{inspectionSummary.privacy}</strong></div><div><span>Password field</span><strong>{inspectionSummary.login}</strong></div><div><span>Parental protection</span><strong>Unavailable</strong></div></div></section>
          <section className="panel evidence-panel"><SectionTitle icon="info" title="Evidence & limits"/><p>ExAiSec reads the current tab URL and sends only a sanitized address to the loopback model service. Optional page inspection runs only after you click its button.</p><p>That inspection checks limited visible consent text and password-field structure in the top frame. It returns only category IDs and booleans; no raw page text, input values, cookie values, or browsing history are stored or transmitted. MFA availability is unknown. Historical model metrics do not establish real-world performance.</p></section>
          <button className="button button-secondary button-full" onClick={() => void reload()}><Icon name="refresh" size={16}/> Refresh report</button>
        </aside></div>
      </> : <StatePanel result={result} onRetry={() => void reload()} spacious/>}
    </main><Footer/></div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><ReportPage/></StrictMode>);

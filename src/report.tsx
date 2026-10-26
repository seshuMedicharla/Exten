import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand, Footer, Icon, IndicatorItem, SectionTitle, SiteIdentity, StatePanel, StatusPill } from './components';
import { hasCaution, visibleIndicators } from './url-analysis';
import { usePreferences } from './use-preferences';
import { useReport } from './use-report';
import type { ExtensionRequest, SiteReport } from './types';
import './styles.css';

const tabIdValue = new URLSearchParams(location.search).get('tabId');
const parsedTabId = tabIdValue !== null && /^\d+$/.test(tabIdValue) ? Number(tabIdValue) : NaN;
const reportRequest: ExtensionRequest | null = Number.isSafeInteger(parsedTabId) ? { type: 'GET_TAB_REPORT', tabId: parsedTabId } : null;

function Recommendations({ report }: { report: SiteReport }) {
  const tips = report.protocol === 'http:'
    ? ['Avoid entering passwords or payment details on this HTTP page.', 'Check that the address matches the service you intended to visit.', 'If available, navigate to the service through a trusted bookmark or official app.']
    : ['Check the hostname carefully before entering sensitive information.', 'Use a password manager and multifactor authentication where available.', 'Review privacy and cookie choices on the website itself; ExAiSec has not inspected them.'];
  return <div className="recommendations">{tips.map((tip, index) => <div className="recommendation" key={tip}><span>{index + 1}</span><p>{tip}</p></div>)}</div>;
}
function ReportPage() {
  const { result, reload } = useReport(reportRequest);
  const prefs = usePreferences();
  const report = result.status === 'ready' ? result.report : null;
  const indicators = report ? visibleIndicators(report, prefs.highlightHttp) : [];
  const caution = report ? hasCaution(report, prefs.highlightHttp) : false;
  return <div className="page-shell"><header className="page-header"><div className="page-header-inner"><Brand/><button className="button button-secondary small" onClick={() => void chrome.runtime.openOptionsPage()}><Icon name="settings" size={16}/> Settings</button></div></header>
    <main className="page-main"><div className="page-intro"><div className="eyebrow">EXAISEC / SECURITY REPORT</div><h1>Website security report</h1><p>Transparent, local observations about the address you opened.</p></div>
      {report ? <>
        <section className={`report-hero ${caution ? 'report-hero-caution' : ''}`}><div className="report-hero-top"><span className="report-hero-badge"><Icon name={caution ? 'alert' : 'shield'} size={22}/></span><StatusPill tone={caution ? 'warn' : 'muted'}>{caution ? 'Review URL' : 'Unverified'}</StatusPill></div><h2>{caution ? 'This URL has details to review' : 'This site has not been verified'}</h2><p>{caution ? 'The observations below describe the address only. They do not establish that the website is malicious.' : 'No enabled URL warnings are shown. This does not establish that the website is safe.'}</p></section>
        <div className="report-grid"><div className="report-primary">
          <section className="panel"><SectionTitle icon="globe" title="Website information"/><SiteIdentity report={report}/><dl className="facts"><div><dt>Inspected URL*</dt><dd className="break-all">{report.url}</dd></div><div><dt>Hostname</dt><dd>{report.hostname}</dd></div><div><dt>URL scheme</dt><dd>{report.protocol.replace(':','').toUpperCase()}</dd></div><div><dt>Checked at</dt><dd>{new Date(report.inspectedAt).toLocaleString()}</dd></div></dl><p className="muted-copy">*Credentials, query, and fragment are omitted from the displayed URL to protect sensitive data.</p></section>
          <section className="panel"><SectionTitle icon="search" title="URL indicators" right={<StatusPill>{prefs.showUrlObservations ? `${indicators.length} observed` : 'Hidden in settings'}</StatusPill>}/>{prefs.showUrlObservations ? (indicators.length ? <div className="indicator-list">{indicators.map((item) => <IndicatorItem key={item.id} indicator={item}/>)}</div> : <p className="muted-copy">No enabled URL indicators to show.</p>) : <p className="muted-copy">URL observations are hidden by your preference. You can change this in Settings.</p>}</section>
          {prefs.showRecommendations && <section className="panel"><SectionTitle icon="spark" title="Recommended next steps"/><Recommendations report={report}/></section>}
        </div><aside className="report-side">
          <section className="panel"><SectionTitle icon="shield" title="Analysis status"/><div className="status-list"><div><span>ML risk assessment</span><strong>Not Analyzed</strong></div><div><span>Threat intelligence</span><strong>Not available</strong></div><div><span>Cookie classification</span><strong>Not inspected</strong></div><div><span>Login security</span><strong>Not assessed</strong></div><div><span>Parental protection</span><strong>Unavailable</strong></div></div></section>
          <section className="panel evidence-panel"><SectionTitle icon="info" title="Evidence & limits"/><p>ExAiSec read the current tab URL through Chrome after you opened the extension. It inspected the address syntax locally.</p><p>It did not read page content, forms, cookies, or browsing history. Sensitive URL parts are omitted from the report. HTTPS in a URL does not prove a trustworthy site.</p></section>
          <button className="button button-secondary button-full" onClick={() => void reload()}><Icon name="refresh" size={16}/> Refresh report</button>
        </aside></div>
      </> : <StatePanel result={result} onRetry={() => void reload()} spacious/>}
    </main><Footer/></div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><ReportPage/></StrictMode>);

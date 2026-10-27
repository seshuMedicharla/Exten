import React from 'react';
import { createRoot } from 'react-dom/client';
import { getRecommendations } from './advisor';
import { Brand, Footer, Icon, MlSummary, PageInspectionPanel, RecommendationList, SectionTitle, SiteIdentity, StatePanel, StatusPill, pageInspectionSummaries } from './components';
import { sendRequest } from './messaging';
import { hasCaution, visibleIndicators } from './url-analysis';
import { usePreferences } from './use-preferences';
import { usePageInspection } from './use-page-inspection';
import { useReport } from './use-report';
import './styles.css';

const activeRequest = { type: 'GET_ACTIVE_REPORT' } as const;
function Popup() {
  const { result, reload } = useReport(activeRequest);
  const prefs = usePreferences();
  const [actionError, setActionError] = React.useState('');
  const openSettings = async () => { try { await chrome.runtime.openOptionsPage(); } catch { setActionError('Settings could not be opened.'); } };
  const openReport = async (tabId: number) => {
    setActionError('');
    try { const response = await sendRequest({ type: 'OPEN_REPORT', tabId }); if (!('status' in response) || response.status !== 'opened') setActionError('reason' in response ? response.reason : 'The report could not be opened.'); }
    catch { setActionError('The report could not be opened.'); }
  };
  const ready = result.status === 'ready';
  const report = ready ? result.report : null;
  const { state: inspection, inspect } = usePageInspection(report?.tabId);
  const inspectionSummary = pageInspectionSummaries(inspection);
  const caution = report ? hasCaution(report, prefs.highlightHttp) : false;
  const indicators = report ? visibleIndicators(report, prefs.highlightHttp) : [];
  const recommendations = report ? getRecommendations(indicators, report.ml) : [];
  return <main className="popup-shell">
    <div className="popup-fixed-top">
      <header className="popup-header"><Brand compact/><button className="icon-button" aria-label="Open settings" title="Settings" onClick={openSettings}><Icon name="settings" size={20}/></button></header>
      <div className="popup-site"><div className="eyebrow">CURRENT WEBSITE</div>{report ? <SiteIdentity report={report}/> : <div className="site-identity"><span className="site-icon"><Icon name="globe" size={22}/></span><div className="site-details"><strong>{result.status === 'loading' ? 'Checking current tab' : 'Website unavailable'}</strong><span>Website identity appears when available</span></div></div>}</div>
    </div>
    <div className="popup-scroll" tabIndex={0} aria-label="Security dashboard content"><div className="popup-content">
      <div className="eyebrow">SECURITY ADVISOR <span className="eyebrow-dot"/> PHASE 4</div>
      {report ? <>
        <section className={`hero-card ${caution ? 'hero-caution' : ''}`} aria-label="Site assessment">
          <div className="hero-top"><span className="hero-icon"><Icon name={caution ? 'alert' : 'shield'} size={25}/></span><StatusPill tone={caution ? 'warn' : 'muted'}>{caution ? 'Review URL' : 'Unverified'}</StatusPill></div>
          <h1>{caution ? 'Review this address' : 'No URL warning shown'}</h1>
          <p>{caution ? 'One or more URL details deserve a closer look.' : 'No URL warning is shown. This does not verify the website.'}</p>
        </section>
        {report.ml.status === 'analyzed' && report.ml.classification === 'elevated_signal' && <section className="ml-alert" aria-label="Experimental model warning"><Icon name="alert" size={18}/><div><strong>Experimental model signal elevated</strong><p>Review the destination independently. This result does not prove phishing.</p></div></section>}
        <section className="summary-card" aria-label="Security summary">
          <SectionTitle icon="search" title="Security overview" />
          <div className="summary-row"><span className="summary-icon red"><Icon name="shield" size={18}/></span><div><strong>Experimental ML assessment</strong><MlSummary assessment={report.ml}/></div><StatusPill tone={report.ml.status === 'analyzed' && report.ml.classification === 'elevated_signal' ? 'warn' : 'muted'}>{report.ml.status === 'analyzed' ? 'Experimental' : 'Not Analyzed'}</StatusPill></div>
          <div className="summary-row"><span className="summary-icon amber"><Icon name="eye" size={18}/></span><div><strong>Privacy & cookies</strong><small>{inspectionSummary.privacy}</small></div><StatusPill>{inspection.status === 'analyzed' ? 'Inspected' : inspection.status === 'unavailable' ? 'Unavailable' : inspection.status === 'error' ? 'Error' : inspection.status === 'loading' ? 'Checking' : 'Optional'}</StatusPill></div>
          <div className="summary-row"><span className="summary-icon blue"><Icon name="lock" size={18}/></span><div><strong>Login security</strong><small>{inspectionSummary.login}</small></div></div>
          <div className="summary-row"><span className="summary-icon purple"><Icon name="users" size={18}/></span><div><strong>Parental protection</strong><small>Unavailable</small></div></div>
        </section>
        <PageInspectionPanel state={inspection} onInspect={() => void inspect()} compact/>
        {prefs.showUrlObservations && <section className="observation-card"><div className="observation-heading"><Icon name="globe" size={16}/><strong>URL observations</strong><span>{indicators.length}</span></div>{indicators.length ? indicators.map((item) => <p key={item.id} className="observation-line">{item.title}</p>) : <p className="observation-line">No enabled URL indicators to show.</p>}</section>}
        {prefs.showRecommendations && <section className="advice-card"><SectionTitle icon="spark" title="Recommended next steps"/><RecommendationList items={recommendations.slice(0, 2)} compact/></section>}
        <button className="button button-primary button-full" onClick={() => void openReport(report.tabId)}>View detailed report <Icon name="arrow" size={17}/></button>
      </> : <StatePanel result={result} onRetry={() => void reload()}/>}
      {actionError && <p className="inline-error" role="alert">{actionError}</p>}
    </div></div><Footer/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Popup/></React.StrictMode>);

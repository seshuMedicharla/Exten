import React from 'react';
import { createRoot } from 'react-dom/client';
import { Brand, Footer, Icon, SectionTitle, SiteIdentity, StatePanel, StatusPill } from './components';
import { sendRequest } from './messaging';
import { hasCaution, visibleIndicators } from './url-analysis';
import { usePreferences } from './use-preferences';
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
    try { const response = await sendRequest({ type: 'OPEN_REPORT', tabId }); if (response.status !== 'opened') setActionError('reason' in response ? response.reason : 'The report could not be opened.'); }
    catch { setActionError('The report could not be opened.'); }
  };
  const ready = result.status === 'ready';
  const report = ready ? result.report : null;
  const caution = report ? hasCaution(report, prefs.highlightHttp) : false;
  const indicators = report ? visibleIndicators(report, prefs.highlightHttp) : [];
  return <main className="popup-shell">
    <header className="popup-header"><Brand compact/><button className="icon-button" aria-label="Open settings" title="Settings" onClick={openSettings}><Icon name="settings" size={20}/></button></header>
    <div className="popup-content">
      <div className="eyebrow">BROWSER SECURITY ADVISOR <span className="eyebrow-dot"/> PHASE 1</div>
      {report ? <>
        <SiteIdentity report={report}/>
        <section className={`hero-card ${caution ? 'hero-caution' : ''}`} aria-label="Site assessment">
          <div className="hero-top"><span className="hero-icon"><Icon name={caution ? 'alert' : 'shield'} size={25}/></span><StatusPill tone={caution ? 'warn' : 'muted'}>{caution ? 'Review URL' : 'Unverified'}</StatusPill></div>
          <h1>{caution ? 'Review this address' : 'No URL warning shown'}</h1>
          <p>{caution ? 'One or more URL details deserve a closer look.' : 'This website has not been verified or assessed by an ML model.'}</p>
        </section>
        <section className="summary-card" aria-label="Security summary">
          <SectionTitle icon="search" title="Security overview" />
          <div className="summary-row"><span className="summary-icon red"><Icon name="shield" size={18}/></span><div><strong>Threat detection</strong><small>ML risk: Not Analyzed</small></div><StatusPill>Not Analyzed</StatusPill></div>
          <div className="summary-row"><span className="summary-icon amber"><Icon name="eye" size={18}/></span><div><strong>Privacy & cookies</strong><small>Cookies not inspected</small></div><StatusPill>Unknown</StatusPill></div>
          <div className="summary-row"><span className="summary-icon blue"><Icon name="lock" size={18}/></span><div><strong>Login security</strong><small>{report.protocol === 'https:' ? 'HTTPS URL observed; login not assessed' : 'HTTP URL observed; login not assessed'}</small></div></div>
          <div className="summary-row"><span className="summary-icon purple"><Icon name="users" size={18}/></span><div><strong>Parental protection</strong><small>Unavailable in Phase 1</small></div></div>
        </section>
        {prefs.showUrlObservations && <section className="observation-card"><div className="observation-heading"><Icon name="globe" size={16}/><strong>URL observations</strong><span>{indicators.length}</span></div>{indicators.length ? indicators.map((item) => <p key={item.id} className="observation-line">{item.title}</p>) : <p className="observation-line">No enabled URL indicators to show.</p>}</section>}
        <button className="button button-primary button-full" onClick={() => void openReport(report.tabId)}>View detailed report <Icon name="arrow" size={17}/></button>
      </> : <StatePanel result={result} onRetry={() => void reload()}/>}
      {actionError && <p className="inline-error" role="alert">{actionError}</p>}
    </div><Footer/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Popup/></React.StrictMode>);

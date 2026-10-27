import React from 'react';
import { createRoot } from 'react-dom/client';
import { getRecommendations } from './advisor';
import { Brand, Footer, Icon, MlSummary, PageInspectionPanel, RecommendationList, SectionTitle, SiteIdentity, StatePanel, StatusPill, pageInspectionSummaries } from './components';
import { sendRequest } from './messaging';
import { hasCaution, visibleIndicators } from './url-analysis';
import { usePreferences } from './use-preferences';
import { usePageInspection } from './use-page-inspection';
import { useReport } from './use-report';
import { activateReminderForSite, beginSitePermissionRequest, describeReminderError, finishSitePermissionRequest, isReminderScriptRegistered, loadAuthorizedReminderOrigins, loadSuppressedReminderHosts, reminderTargetForUrl, ReminderPermissionError, requestOptionalHostPermission, type LoginReminderDebugStatus } from './login-reminders';
import './styles.css';

const activeRequest = { type: 'GET_ACTIVE_REPORT' } as const;
const debugMessageType = 'GET_LOGIN_REMINDER_DEBUG_STATUS';
function boolLabel(value: boolean | null): string { return value === null ? 'Not available' : value ? 'Yes' : 'No'; }
function Popup() {
  const { result, reload } = useReport(activeRequest);
  const prefs = usePreferences();
  const [actionError, setActionError] = React.useState('');
  const [reminderError, setReminderError] = React.useState('');
  const [reminderDebug, setReminderDebug] = React.useState<LoginReminderDebugStatus | null>(null);
  const [debugLoading, setDebugLoading] = React.useState(false);
  const [debugError, setDebugError] = React.useState('');
  const ready = result.status === 'ready';
  const report = ready ? result.report : null;
  const reportTabId = report?.tabId;
  const reportUrl = report?.url;
  const [reminderState, setReminderState] = React.useState<'idle' | 'loading' | 'enabled' | 'muted' | 'denied' | 'unsupported' | 'error'>('idle');
  const openSettings = async () => { try { await chrome.runtime.openOptionsPage(); } catch { setActionError('Settings could not be opened.'); } };
  const openVault = async () => { try { await chrome.tabs.create({ url: chrome.runtime.getURL('vault.html') }); } catch { setActionError('The password hint vault could not be opened.'); } };
  const openReport = async (tabId: number) => {
    setActionError('');
    try { const response = await sendRequest({ type: 'OPEN_REPORT', tabId }); if (!('status' in response) || response.status !== 'opened') setActionError('reason' in response ? response.reason : 'The report could not be opened.'); }
    catch { setActionError('The report could not be opened.'); }
  };
  const refreshReminderDebug = React.useCallback(async () => {
    if (reportTabId === undefined || !reportUrl) { setReminderDebug(null); return; }
    const target = reminderTargetForUrl(reportUrl);
    if (!target) { setReminderDebug(null); return; }
    setDebugLoading(true); setDebugError('');
    try {
      const [permissionGranted, authorizedOrigins, contentScriptRegistered, suppressedHosts] = await Promise.all([
        chrome.permissions.contains({ origins: [target.permissionPattern] }),
        loadAuthorizedReminderOrigins(),
        isReminderScriptRegistered(target),
        loadSuppressedReminderHosts(),
      ]);
      let content: Record<string, unknown> | null = null;
      try {
        const response: unknown = await chrome.tabs.sendMessage(reportTabId, { type: debugMessageType, origin: target.origin }, { frameId: 0 });
        if (response && typeof response === 'object' && !Array.isArray(response)) {
          const value = response as Record<string, unknown>;
          if (value.type === 'LOGIN_REMINDER_DEBUG_STATUS' && value.origin === target.origin &&
              typeof value.contentScriptActive === 'boolean' && typeof value.passwordFieldDetected === 'boolean' &&
              typeof value.reminderRendered === 'boolean' && typeof value.dismissedThisDocument === 'boolean' &&
              typeof value.detectionSentThisDocument === 'boolean') content = value;
        }
      } catch { /* No receiver means the content script is not active in this frame. */ }
      setReminderDebug({
        permissionGranted,
        siteOriginAuthorized: authorizedOrigins.includes(target.origin),
        contentScriptRegistered,
        contentScriptActive: content?.contentScriptActive === true,
        passwordFieldDetected: content ? content.passwordFieldDetected === true : null,
        reminderSuppressed: suppressedHosts.includes(target.hostname),
        reminderRendered: content ? content.reminderRendered === true : null,
        dismissedThisDocument: content ? content.dismissedThisDocument === true : null,
        detectionSentThisDocument: content ? content.detectionSentThisDocument === true : null,
      });
    } catch (error) {
      setReminderDebug(null);
      setDebugError(`Status could not be read: ${describeReminderError(error)}`);
    } finally { setDebugLoading(false); }
  }, [reportTabId, reportUrl]);
  const enableRemindersForCurrentSite = () => {
    if (!report) return;
    setReminderError('');
    // This call must remain synchronous in the click handler to retain Chrome's user gesture.
    const request = beginSitePermissionRequest(report.url, (origins) => requestOptionalHostPermission(origins));
    if (!request) { setReminderState('unsupported'); return; }
    setReminderState('loading'); setActionError('');
    void finishSitePermissionRequest(request, async (target) => {
      const result = await activateReminderForSite(target, report.tabId,
        (tabId) => chrome.tabs.get(tabId),
        (tabId) => chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['login-content.js'], world: 'ISOLATED' }),
      );
      if (result === 'tab-changed') setActionError('Site access is saved for future visits. The active tab changed before detection could start.');
    }).then((outcome) => {
      if (outcome === 'denied') {
        setReminderError('Chrome did not grant access to this site. You can retry from this popup.');
        setReminderState('denied');
      } else setReminderState('enabled');
    }).catch((error: unknown) => {
      const detail = describeReminderError(error);
      if (error instanceof ReminderPermissionError && error.stage === 'permission') {
        setReminderError(`Chrome could not complete the site permission request: ${detail}`);
      } else if (error instanceof ReminderPermissionError && error.stage === 'registration') {
        setReminderError(`Chrome granted site access, but reminder registration failed: ${detail}`);
      } else if (error instanceof ReminderPermissionError && error.stage === 'activation') {
        setReminderError(`Site access and future-visit registration succeeded, but detection could not start in this tab: ${detail}`);
      } else setReminderError(`Smart reminders could not be enabled: ${detail}`);
      setReminderState('error');
    });
  };
  const { state: inspection, inspect } = usePageInspection(report?.tabId);
  const inspectionSummary = pageInspectionSummaries(inspection);
  const caution = report ? hasCaution(report, prefs.highlightHttp) : false;
  const indicators = report ? visibleIndicators(report, prefs.highlightHttp) : [];
  const recommendations = report ? getRecommendations(indicators, report.ml) : [];
  React.useEffect(() => {
    if (!reportUrl || !prefs.smartPasswordHintReminders) { setReminderState('idle'); return; }
    const target = reminderTargetForUrl(reportUrl);
    if (!target) { setReminderState('unsupported'); return; }
    let active = true;
    setReminderState('loading');
    void Promise.all([loadAuthorizedReminderOrigins(), loadSuppressedReminderHosts(), chrome.permissions.contains({ origins: [target.permissionPattern] })]).then(([origins, suppressed, permitted]) => {
      if (active) setReminderState(suppressed.includes(target.hostname) ? 'muted' : permitted && origins.includes(target.origin) ? 'enabled' : 'idle');
    }).catch(() => { if (active) setReminderState('error'); });
    return () => { active = false; };
  }, [reportUrl, prefs.smartPasswordHintReminders]);
  React.useEffect(() => { void refreshReminderDebug(); }, [refreshReminderDebug]);
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
        <section className="observation-card reminder-opt-in"><div className="observation-heading"><Icon name="lock" size={16}/><strong>Smart Password Hint Reminders</strong></div>
          {!prefs.smartPasswordHintReminders ? <p className="observation-line">Off. Turn on the optional setting first, then grant access separately for each website.</p>
            : reminderState === 'enabled' ? <p className="observation-line">Enabled for this exact origin. Detection checks password-field structure only.</p>
              : reminderState === 'muted' ? <p className="observation-line">Reminders are muted for this hostname. Change this in Settings if needed.</p>
                : reminderState === 'unsupported' ? <p className="observation-line">Site-specific reminders are available on HTTP or HTTPS pages only.</p>
                  : <><p className="observation-line">{reminderState === 'denied' ? 'Chrome access was declined. You can try again.' : reminderState === 'error' ? reminderError : 'Grant optional host access to enable structural login detection on this website.'}</p><button className="button button-secondary small" type="button" disabled={reminderState === 'loading'} onClick={enableRemindersForCurrentSite}>{reminderState === 'loading' ? 'Checking permission…' : reminderState === 'denied' ? 'Try again' : reminderState === 'error' ? 'Retry activation' : 'Enable for this site'}</button></>}
          <details className="reminder-debug"><summary>Privacy-safe reminder status</summary>
            <p>These checks report permissions and structure only. No form values or page text are read.</p>
            {debugLoading ? <small>Checking…</small> : reminderDebug ? <ul>
              <li><span>Site permission granted</span><strong>{boolLabel(reminderDebug.permissionGranted)}</strong></li>
              <li><span>Exact origin enabled</span><strong>{boolLabel(reminderDebug.siteOriginAuthorized)}</strong></li>
              <li><span>Content script registered</span><strong>{boolLabel(reminderDebug.contentScriptRegistered)}</strong></li>
              <li><span>Content script active in this tab</span><strong>{boolLabel(reminderDebug.contentScriptActive)}</strong></li>
              <li><span>Password field detected</span><strong>{boolLabel(reminderDebug.passwordFieldDetected)}</strong></li>
              <li><span>Reminder suppressed for this site</span><strong>{boolLabel(reminderDebug.reminderSuppressed)}</strong></li>
              <li><span>Reminder rendered</span><strong>{boolLabel(reminderDebug.reminderRendered)}</strong></li>
              <li><span>Dismissed on this page</span><strong>{boolLabel(reminderDebug.dismissedThisDocument)}</strong></li>
              <li><span>Detection already attempted on this page</span><strong>{boolLabel(reminderDebug.detectionSentThisDocument)}</strong></li>
            </ul> : <small>{debugError || 'Status is not available for this page.'}</small>}
            <button className="button button-secondary small" type="button" onClick={() => void refreshReminderDebug()} disabled={debugLoading}>{debugLoading ? 'Refreshing…' : 'Refresh status'}</button>
          </details>
        </section>
        {prefs.showUrlObservations && <section className="observation-card"><div className="observation-heading"><Icon name="globe" size={16}/><strong>URL observations</strong><span>{indicators.length}</span></div>{indicators.length ? indicators.map((item) => <p key={item.id} className="observation-line">{item.title}</p>) : <p className="observation-line">No enabled URL indicators to show.</p>}</section>}
        {prefs.showRecommendations && <section className="advice-card"><SectionTitle icon="spark" title="Recommended next steps"/><RecommendationList items={recommendations.slice(0, 2)} compact/></section>}
        <button className="button button-secondary button-full" type="button" onClick={() => void openVault()}><Icon name="lock" size={16}/> Open Password Hint Vault</button>
        <button className="button button-primary button-full" onClick={() => void openReport(report.tabId)}>View detailed report <Icon name="arrow" size={17}/></button>
      </> : <StatePanel result={result} onRetry={() => void reload()}/>}
      {actionError && <p className="inline-error" role="alert">{actionError}</p>}
    </div></div><Footer/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Popup/></React.StrictMode>);

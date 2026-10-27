import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand, Footer, Icon, SectionTitle, StatusPill } from './components';
import { loadPreferences, savePreferences } from './preferences';
import { DEFAULT_PREFERENCES, type Preferences } from './types';
import { disableAllReminderSites, loadAuthorizedReminderOrigins, loadSuppressedReminderHosts, removeReminderOrigin, updateSuppressedReminderHost } from './login-reminders';
import './styles.css';

function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="setting-row"><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="switch-input"/><span className="switch" aria-hidden="true"/></label>;
}
function SettingsPage() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [reminderOrigins, setReminderOrigins] = useState<string[]>([]);
  const [suppressedHosts, setSuppressedHosts] = useState<string[]>([]);
  const [reminderError, setReminderError] = useState('');
  const refreshReminderSettings = async () => {
    const [origins, suppressed] = await Promise.all([loadAuthorizedReminderOrigins(), loadSuppressedReminderHosts()]);
    setReminderOrigins(origins); setSuppressedHosts(suppressed);
  };
  useEffect(() => { let active = true; void Promise.all([loadPreferences(), refreshReminderSettings()]).then(([value]) => { if (active) { setPrefs(value); setLoaded(true); } }).catch(() => { if (active) { setLoaded(true); setSaveState('error'); } }); return () => { active = false; }; }, []);
  const update = async (key: keyof Preferences, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next); setSaveState('idle');
    let saved = false;
    try {
      await savePreferences(next);
      saved = true;
      if (key === 'smartPasswordHintReminders' && !value) await disableAllReminderSites();
      setSaveState('saved');
      if (key === 'smartPasswordHintReminders') await refreshReminderSettings();
    }
    catch { if (!saved) setPrefs(prefs); setSaveState('error'); }
  };
  return <div className="page-shell"><header className="page-header"><div className="page-header-inner"><Brand/><StatusPill tone="teal">Phase 4 · Local beta</StatusPill></div></header>
    <main className="page-main settings-main"><div className="page-intro"><div className="eyebrow">EXAISEC / PREFERENCES</div><h1>Settings</h1><p>Choose how local URL observations and guidance appear.</p></div>
      <div className="settings-grid"><div>
        <section className="panel"><SectionTitle icon="eye" title="Display preferences"/><p className="panel-lead">These settings are saved in Chrome extension storage on this device.</p>
          <Toggle label="Show URL observations" detail="Display address details in the popup and report." checked={prefs.showUrlObservations} onChange={(v) => void update('showUrlObservations', v)}/>
          <Toggle label="Highlight HTTP pages" detail="Show a caution when the address uses HTTP." checked={prefs.highlightHttp} onChange={(v) => void update('highlightHttp', v)}/>
          <Toggle label="Show recommendations" detail="Display evidence-based next steps in the popup and report." checked={prefs.showRecommendations} onChange={(v) => void update('showRecommendations', v)}/>
          <p className={`save-message ${saveState === 'error' ? 'save-error' : ''}`} role="status">{!loaded ? 'Loading preferences…' : saveState === 'saved' ? 'Preferences saved.' : saveState === 'error' ? 'Preferences could not be saved. Try again.' : 'Changes save automatically.'}</p>
        </section>
        <section className="panel"><SectionTitle icon="shield" title="Protection preferences"/><div className="unavailable"><Icon name="info" size={18}/><div><strong>Automatic blocking is not active</strong><p>Experimental model results provide guidance only. ExAiSec does not block sites or read sign-in values.</p></div></div></section>
        <section className="panel"><SectionTitle icon="lock" title="Smart Password Hint Reminders"/><p className="panel-lead">Optional structural login detection. ExAiSec never reads form values, usernames, passwords, keystrokes, tokens, or submissions.</p>
          <Toggle label="Enable smart reminders" detail="Off by default. This does not grant site access; allow each website separately from its popup." checked={prefs.smartPasswordHintReminders} onChange={(v) => void update('smartPasswordHintReminders', v)}/>
          <p className="muted-copy">Chrome host access is scoped to a scheme and hostname (across paths and ports). ExAiSec additionally checks the exact origin you approved before observing login structure. Subdomains are not included.</p>
          {reminderOrigins.length > 0 && <div className="reminder-site-list"><h3>Authorized exact origins</h3>{reminderOrigins.map((origin) => <div key={origin}><code>{origin}</code><button className="button button-secondary small" onClick={() => { setReminderError(''); void removeReminderOrigin(origin).then(refreshReminderSettings).catch(() => setReminderError('Site access could not be removed.')); }}>Remove access</button></div>)}</div>}
          {suppressedHosts.length > 0 && <div className="reminder-site-list"><h3>Sites muted by “Don’t Remind Me”</h3>{suppressedHosts.map((host) => <div key={host}><code>{host}</code><button className="button button-secondary small" onClick={() => { setReminderError(''); void updateSuppressedReminderHost(host, false).then(refreshReminderSettings).catch(() => setReminderError('The site suppression could not be removed.')); }}>Allow reminders</button></div>)}</div>}
          {reminderError && <p className="save-error" role="alert">{reminderError}</p>}
        </section>
      </div><aside className="report-side"><section className="panel"><SectionTitle icon="spark" title="Modules"/><p className="panel-lead">Local ML is experimental. Password hints are encrypted locally.</p><nav className="module-nav" aria-label="Modules"><a href="#ml-detection"><Icon name="search" size={17}/> Experimental ML <Icon name="chevron" size={15}/></a><a href="vault.html"><Icon name="lock" size={17}/> Password hint vault <Icon name="chevron" size={15}/></a><a href="#parental-protection"><Icon name="users" size={17}/> Parental protection <Icon name="chevron" size={15}/></a></nav></section></aside></div>
      <section className="future-grid" aria-label="Module details"><div id="ml-detection" className="future-card"><Icon name="search"/><h2>Experimental ML</h2><p>Requires the local API at 127.0.0.1:8765, authorized for this extension ID. Results are research guidance, not safety verdicts.</p><StatusPill tone="teal">Local beta</StatusPill></div><div id="password-hints" className="future-card"><Icon name="lock"/><h2>Password hint vault</h2><p>Encrypted hints stay in local extension storage. No actual passwords are stored or filled.</p><a className="button button-secondary small" href="vault.html">Open hint vault <Icon name="arrow" size={15}/></a></div><div id="parental-protection" className="future-card"><Icon name="users"/><h2>Parental protection</h2><p>No categories or website blocking are active in this release.</p><StatusPill>Unavailable</StatusPill></div></section>
    </main><Footer/></div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><SettingsPage/></StrictMode>);

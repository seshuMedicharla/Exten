import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand, Footer, Icon, SectionTitle, StatusPill } from './components';
import { loadPreferences, savePreferences } from './preferences';
import { DEFAULT_PREFERENCES, type Preferences } from './types';
import './styles.css';

function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="setting-row"><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="switch-input"/><span className="switch" aria-hidden="true"/></label>;
}
function SettingsPage() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  useEffect(() => { let active = true; void loadPreferences().then((value) => { if (active) { setPrefs(value); setLoaded(true); } }).catch(() => { if (active) { setLoaded(true); setSaveState('error'); } }); return () => { active = false; }; }, []);
  const update = async (key: keyof Preferences, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next); setSaveState('idle');
    try { await savePreferences(next); setSaveState('saved'); }
    catch { setPrefs(prefs); setSaveState('error'); }
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
        <section className="panel"><SectionTitle icon="shield" title="Protection preferences"/><div className="unavailable"><Icon name="info" size={18}/><div><strong>Automatic protection is not active</strong><p>Experimental model results provide guidance only. ExAiSec does not block sites, scan page content, or inspect sign-in fields.</p></div></div></section>
      </div><aside className="report-side"><section className="panel"><SectionTitle icon="spark" title="Modules"/><p className="panel-lead">Local ML is experimental. Other modules are unavailable.</p><nav className="module-nav" aria-label="Modules"><a href="#ml-detection"><Icon name="search" size={17}/> Experimental ML <Icon name="chevron" size={15}/></a><a href="#password-hints"><Icon name="lock" size={17}/> Password hint vault <Icon name="chevron" size={15}/></a><a href="#parental-protection"><Icon name="users" size={17}/> Parental protection <Icon name="chevron" size={15}/></a></nav></section></aside></div>
      <section className="future-grid" aria-label="Module details"><div id="ml-detection" className="future-card"><Icon name="search"/><h2>Experimental ML</h2><p>Requires the local API at 127.0.0.1:8765, authorized for this extension ID. Results are research guidance, not safety verdicts.</p><StatusPill tone="teal">Local beta</StatusPill></div><div id="password-hints" className="future-card"><Icon name="lock"/><h2>Password hint vault</h2><p>No hint storage or encryption workflow has been implemented yet.</p><StatusPill>Unavailable</StatusPill></div><div id="parental-protection" className="future-card"><Icon name="users"/><h2>Parental protection</h2><p>No categories or website blocking are active in this release.</p><StatusPill>Unavailable</StatusPill></div></section>
    </main><Footer/></div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><SettingsPage/></StrictMode>);

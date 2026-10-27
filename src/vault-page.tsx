import { StrictMode, useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand, Footer, Icon, SectionTitle, StatusPill } from './components';
import { chromeVaultStorage, inspectStoredVault, isExactHostnameMatch, normalizeVaultHostname, VaultError, VaultSession, type VaultEntry } from './vault';
import './styles.css';

type Screen = 'loading' | 'setup' | 'locked' | 'unlocked' | 'error';
const routeParams = new URLSearchParams(window.location.search);
const requestedHostname = normalizeVaultHostname(routeParams.get('siteHost'));
const createForRequestedSite = requestedHostname !== null && routeParams.get('create') === '1';

function VaultPage() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [session, setSession] = useState<VaultSession | null>(null);
  const sessionRef = useRef<VaultSession | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [hint, setHint] = useState('');
  const [siteHostname, setSiteHostname] = useState(requestedHostname ?? '');
  const [siteConfirmed, setSiteConfirmed] = useState(false);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [, refresh] = useState(0);
  const entries = session ? session.list() : [];
  const visibleEntries = requestedHostname ? (siteConfirmed ? entries.filter((entry) => isExactHostnameMatch(entry.hostname, requestedHostname)) : []) : entries;

  const refreshVaultStatus = async () => {
    setScreen('loading'); setError('');
    try { setScreen(await inspectStoredVault(chromeVaultStorage) === 'empty' ? 'setup' : 'locked'); }
    catch (caught) { setError(caught instanceof VaultError ? caught.message : 'The vault could not be read.'); setScreen('error'); }
  };
  useEffect(() => { void refreshVaultStatus(); }, []);
  useEffect(() => {
    const clearSession = () => {
      sessionRef.current?.lock(); sessionRef.current = null;
      setSession(null); setScreen((current) => current === 'unlocked' ? 'locked' : current);
      setPassphrase(''); setConfirmation(''); setLabel(''); setHint(''); setEditing(null); setSiteConfirmed(false);
    };
    window.addEventListener('pagehide', clearSession);
    return () => { window.removeEventListener('pagehide', clearSession); clearSession(); };
  }, []);

  const authenticate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setNotice('');
    const secret = passphrase;
    setPassphrase('');
    if (screen === 'setup' && secret !== confirmation) { setConfirmation(''); setError('The passphrases do not match.'); return; }
    setConfirmation(''); setBusy(true);
    try {
      const next = screen === 'setup'
        ? await VaultSession.create(secret, chromeVaultStorage)
        : await VaultSession.unlock(secret, chromeVaultStorage);
      sessionRef.current?.lock(); sessionRef.current = next; setSession(next); setScreen('unlocked'); setNotice(screen === 'setup' ? 'Encrypted vault created.' : 'Vault unlocked.');
    } catch (caught) {
      setError(caught instanceof VaultError ? caught.message : 'The vault could not be opened. Stored data was not changed.');
    } finally { setBusy(false); }
  };

  const saveEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!session) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      if (editing) await session.update(editing.id, label, hint, siteHostname.trim() || null);
      else await session.add(label, hint, siteHostname.trim() || null);
      setLabel(''); setHint(''); setSiteHostname(requestedHostname ?? ''); setEditing(null); refresh((version) => version + 1); setNotice(editing ? 'Hint updated and encrypted.' : 'Hint added and encrypted.');
    } catch (caught) { setError(caught instanceof VaultError ? caught.message : 'The hint could not be saved. Existing vault data was kept.'); }
    finally { setBusy(false); }
  };

  const lockVault = () => {
    sessionRef.current?.lock(); sessionRef.current = null; setSession(null); setScreen('locked');
    setPassphrase(''); setConfirmation(''); setLabel(''); setHint(''); setEditing(null); setConfirmDelete(null); setSiteConfirmed(false); setError(''); setNotice('Vault locked.');
  };

  const beginEdit = (entry: VaultEntry) => { setEditing(entry); setLabel(entry.label); setHint(entry.hint); setSiteHostname(entry.hostname ?? ''); setError(''); };
  const deleteEntry = async () => {
    if (!session || !confirmDelete) return;
    setBusy(true); setError(''); setNotice('');
    try { await session.delete(confirmDelete); setConfirmDelete(null); refresh((version) => version + 1); setNotice('Hint deleted from the encrypted vault.'); }
    catch (caught) { setError(caught instanceof VaultError ? caught.message : 'The hint could not be deleted.'); }
    finally { setBusy(false); }
  };

  return <div className="page-shell vault-page"><header className="page-header"><div className="page-header-inner"><Brand/><a className="button button-secondary small" href="settings.html">Settings</a></div></header>
    <main className="page-main vault-main"><div className="page-intro"><div className="eyebrow">EXAISEC / LOCAL MODULE</div><h1>Password Hint Vault</h1><p>Store non-sensitive reminders encrypted on this device. This vault does not store or fill passwords.</p></div>
      <section className="panel vault-panel" aria-labelledby="vault-title">
        <SectionTitle icon="lock" title={screen === 'unlocked' ? 'Vault unlocked' : screen === 'loading' ? 'Checking vault' : 'Encrypted hint vault'} right={<StatusPill tone={screen === 'unlocked' ? 'teal' : 'muted'}>{screen === 'unlocked' ? 'Unlocked' : screen === 'loading' ? 'Loading' : 'Local only'}</StatusPill>}/>
        <div className="vault-warning" role="note"><Icon name="info" size={19}/><p><strong>Hints can expose information.</strong> Do not store passwords, recovery codes, answers to security questions, or details that would let someone access an account. Anyone who obtains your passphrase can read the hints.</p></div>
        {screen === 'loading' && <p className="muted-copy" role="status">Loading encrypted vault status…</p>}
        {screen === 'error' && <div className="vault-state"><p className="save-error" role="alert">{error}</p><p className="muted-copy">Stored vault data was not treated as an empty vault or replaced.</p><button className="button button-secondary" onClick={() => void refreshVaultStatus()}>Try again</button></div>}
        {(screen === 'setup' || screen === 'locked') && <form className="vault-form" onSubmit={(event) => void authenticate(event)}>
          <h2 id="vault-title">{screen === 'setup' ? 'Create your vault' : 'Unlock your vault'}</h2>
          <p className="muted-copy">{screen === 'setup' ? 'Choose a passphrase you can remember. ExAiSec never saves or sends it.' : 'Enter the passphrase used when this encrypted vault was created.'}</p>
          <label className="vault-field"><span>Master passphrase</span><input type="password" autoComplete={screen === 'setup' ? 'new-password' : 'current-password'} value={passphrase} onChange={(event) => setPassphrase(event.target.value)} maxLength={1024} required disabled={busy}/></label>
          {screen === 'setup' && <label className="vault-field"><span>Confirm passphrase</span><input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} maxLength={1024} required disabled={busy}/></label>}
          {error && <p className="save-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Working…' : screen === 'setup' ? 'Create encrypted vault' : 'Unlock vault'}</button>
          {screen === 'locked' && <p className="vault-recovery-note">There is no recovery backdoor. If you lose this passphrase, the encrypted hints may be unrecoverable.</p>}
        </form>}
        {screen === 'unlocked' && session && <div className="vault-open">
          <div className="vault-session-row"><p className="muted-copy">This page holds decrypted hints only in memory. Closing or navigating away locks the vault.</p><button className="button button-secondary small" type="button" onClick={lockVault}>Lock Vault</button></div>
          {notice && <p className="save-message" role="status">{notice}</p>}
          {error && <p className="save-error" role="alert">{error}</p>}
          {requestedHostname && <div className="vault-site-scope"><strong>Website context: {requestedHostname}</strong><p>Only hints saved for this exact normalized hostname will be shown. Sibling domains are not included. The website cannot see whether a matching hint exists.</p><button className="button button-secondary small" type="button" onClick={() => setSiteConfirmed(true)}>{siteConfirmed ? 'Hostname confirmed' : 'Confirm hostname and show matching hints'}</button></div>}
          <form className="vault-form vault-entry-form" onSubmit={(event) => void saveEntry(event)}>
            <h2>{editing ? 'Edit hint' : createForRequestedSite ? 'Create a site-specific hint' : 'Add a hint'}</h2>
            <label className="vault-field"><span>Website or account label</span><input type="text" autoComplete="off" maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="For example, personal email" required disabled={busy}/></label>
            <label className="vault-field"><span>Exact website hostname (optional)</span><input type="text" autoComplete="off" maxLength={253} value={siteHostname} onChange={(event) => setSiteHostname(event.target.value)} placeholder="example.com" disabled={busy}/></label>
            <label className="vault-field"><span>Non-sensitive hint</span><textarea autoComplete="off" maxLength={500} rows={3} value={hint} onChange={(event) => setHint(event.target.value)} placeholder="A reminder that does not reveal a password or recovery answer" required disabled={busy}/></label>
            <p className="vault-recovery-note">Never enter a password, username, recovery code, security answer, or anything you would not want exposed if this device or unlocked vault is compromised.</p>
            <div className="vault-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add encrypted hint'}</button>{editing && <button className="button button-secondary" type="button" onClick={() => { setEditing(null); setLabel(''); setHint(''); setSiteHostname(requestedHostname ?? ''); }}>Cancel</button>}</div>
          </form>
          <div className="vault-list-heading"><h2>{requestedHostname ? `Hints for ${requestedHostname}` : 'Saved hints'}</h2><StatusPill>{visibleEntries.length}</StatusPill></div>
          {requestedHostname && !siteConfirmed ? <div className="vault-empty"><Icon name="lock" size={22}/><p>Matching hints remain hidden until you confirm the exact hostname above.</p></div>
            : visibleEntries.length === 0 ? <div className="vault-empty"><Icon name="lock" size={22}/><p>{requestedHostname ? 'No hints saved for this exact hostname.' : 'No hints saved yet. Add a non-sensitive reminder above.'}</p></div>
              : <div className="vault-entry-list">{visibleEntries.map((entry) => <article className="vault-entry" key={entry.id}><div className="vault-entry-copy"><h3>{entry.label}</h3>{entry.hostname && <small>Exact hostname: {entry.hostname}</small>}<p>{entry.hint}</p></div><div className="vault-entry-actions"><button type="button" className="button button-secondary small" onClick={() => beginEdit(entry)} disabled={busy}>Edit</button><button type="button" className="button button-secondary small vault-delete" onClick={() => setConfirmDelete(entry.id)} disabled={busy}>Delete</button></div></article>)}</div>}
          {confirmDelete && <div className="vault-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><div><h2 id="delete-title">Delete this hint?</h2><p>This removes the hint from the encrypted vault. The change cannot be undone.</p><div className="vault-actions"><button className="button button-secondary vault-delete" type="button" onClick={() => setConfirmDelete(null)} disabled={busy}>Keep hint</button><button className="button button-primary" type="button" onClick={() => void deleteEntry()} disabled={busy}>{busy ? 'Deleting…' : 'Delete hint'}</button></div></div></div>}
        </div>}
      </section>
      <p className="vault-threat-note">Vault contents stay in Chrome extension storage and are encrypted locally. Malware, a malicious extension, or anyone with access to an unlocked vault could still read hints. The vault does not use recovery, sync, autofill, or external services.</p>
    </main><Footer/></div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><VaultPage/></StrictMode>);

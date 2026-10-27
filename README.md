# ExAiSec — evidence-based security advisor

ExAiSec is a Chrome Manifest V3 extension with local URL observations, an **experimental** phishing model assessment, deterministic security recommendations, optional click-triggered page inspection, an encrypted hint vault, and opt-in structural login reminders. It never labels a website verified or safe. The model is a research artifact, and results are guidance only.

## Requirements

- Node.js 20.19+ or 22.12+, npm, Chrome
- Python 3.11 and the trusted local `ml/models/rf_mendeley_v2_calibrated.joblib` artifact
- `ml/src/feature_extraction.py` from the same training project

The model artifact, datasets, and Python virtual environment are excluded from Git and from the extension bundle. A fresh clone needs a trusted copy of the artifact at the exact path above. Do not download or load an untrusted `.joblib` file.

## Build and load the extension

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this repository's `dist` folder. Copy the 32-character extension **ID** shown on that page. Rebuild and reload after extension source changes.

The manifest requests `activeTab`, `storage`, and `scripting`, plus access to `http://127.0.0.1/*` for the local API. The new optional HTTP/HTTPS host patterns are only permission-request capabilities; no site is granted at install. **Inspect page privacy & login security** uses temporary `activeTab` access. Smart reminders request a single scheme/hostname only after you enable the global preference and click **Enable for this site**. A content script is registered only for the approved host pattern and is removed when reminders are globally disabled or that site access is revoked. No remote executable script is used.

## Start the local API

From the repository root:

```sh
python3.11 -m venv ml/.venv
ml/.venv/bin/python -m pip install -r api/requirements.txt
export EXAISEC_EXTENSION_ID=PASTE_THE_ID_FROM_CHROME_EXTENSIONS
ml/.venv/bin/python -m api
```

The launcher binds to **127.0.0.1:8765 only**. Leave it running while using the extension. In another terminal, `curl http://127.0.0.1:8765/health` should report `status: ok` and `extension_origin_configured: true`. If the extension ID changes, update `EXAISEC_EXTENSION_ID` and restart the API.

For tests, install `api/requirements-dev.txt` instead and run:

```sh
ml/.venv/bin/python -m pytest api/tests -q -p no:cacheprovider
```

The environment variable and loopback launcher are **local development settings**. There is no public API deployment configuration. The `/predict` endpoint requires the configured `chrome-extension://<id>` Origin and the extension request header; CORS allows only that origin. This protects against ordinary webpage requests, but it is not authentication against another program running on the same computer that can forge HTTP headers.

## What is analyzed

The extension reads the active tab URL when opened. It strips URL credentials, query strings, and fragments before displaying or sending the address to the local API. The API rejects those fields, validates the remaining URL, does **not** fetch the destination, and runs the existing Python `build_features` function in its saved feature order. The API launcher disables access logs; application errors do not log submitted URLs.

The API returns a calibrated **model score** and a classification relative to the provisional `0.62` threshold. The score is **not** a guaranteed probability of phishing. A below-threshold result does not verify safety, and an elevated result does not prove phishing. URL observations remain separate from the model result. The extension never blocks sites. If the API is unavailable, times out, rejects the URL, or returns invalid data, the ML status is **Not Analyzed**.

The artifact's held-out Mendeley 2021 test measurements were 83.76% accuracy, 71.70% recall, and 7.63% false-positive rate. These are historical dataset measurements, not validated real-world performance. Because query strings are removed before inference, live inputs differ from the training data; the historical metrics should not be used to estimate live accuracy.

## Evidence-based advice

`src/advisor.ts` generates recommendations from the extension's URL observations and explicit model state. Each recommendation identifies its basis: **Observed URL**, **Experimental model**, **Analysis status**, or **General guidance**. HTTP, URL credentials, IP hostnames, encoded labels, and nondefault ports each have a specific rule. An elevated model signal receives its own cautious recommendation. A low score adds no safety claim. If the model result is missing, the advisor says so and suggests independent verification.

General account guidance is conditional: if you sign in, a password manager can help check the domain and MFA can be enabled where the service offers it. ExAiSec does not inspect whether login or MFA is present. No URLs or personal information go to an external AI provider. The advisor reads no page content, passwords, cookies, or form values.

## Optional privacy and login inspection

Click **Inspect page privacy & login security** in the popup or report to request a one-time check of the current site's **top frame only**. The injected function checks visible text in likely cookie-consent containers and the presence of visible `input[type=password]` elements. It returns only booleans and up to four category IDs (`essential`, `analytics`, `marketing`, `other`). It does **not** return or store raw page text, input values, cookie values, usernames, form submissions, or the inspected page URL. It never accepts or rejects consent and never sends inspection results to the FastAPI model or an external service. Results stay in the current popup or report view and are discarded when that view closes.

Category labels are reported only when the visible banner contains matching evidence. A visible generic banner can be detected while its categories remain **undetermined**. “No visible banner found” does not imply that a site has no cookies. A visible password field suggests a login or account form, but its absence does not prove there is no login. An HTTP page with a likely password field gets a warning. MFA availability remains unknown; advice to use MFA and a unique password is general guidance.

Inspection can miss banners in cross-origin frames, closed shadow roots, images, or elements outside the visible viewport. It is unavailable on restricted Chrome pages and may fail when temporary page access is unavailable. No automatic phishing blocking, parental blocking, or external AI integration is implemented.

## Encrypted password hint vault

Open the toolbar popup and choose **Open Password Hint Vault**, or open **Settings → Password hint vault**. On first use, create a master passphrase and confirm it. Later visits require that passphrase to unlock the existing vault. The vault page provides add, edit, delete-with-confirmation, and **Lock Vault** actions. Closing or navigating away from the vault page clears the in-memory session; reopening always starts locked. The vault does not auto-lock merely because the tab is backgrounded. The passphrase is never written to storage, a URL, a message, or the API. The derived AES key is non-extractable and held only by the vault page session.

Only non-sensitive reminders belong in this feature. It stores no actual passwords, usernames, recovery codes, or security-question answers, and never reads or fills website forms. A hint can still reveal information, so the UI warns against storing anything that could help someone access an account.

The single `chrome.storage.local` key `exaisec.encryptedHintVault` contains a version-1 envelope: `version`, PBKDF2 metadata (`PBKDF2`, `SHA-256`, 600,000 iterations, 16-byte random salt), and AES metadata (`AES-256-GCM`, 12-byte random IV, ciphertext). The ciphertext is the complete serialized hint list, including labels and timestamps. Every add, edit, or delete encrypts the entire payload again with a fresh IV; AES-GCM's 128-bit authentication tag detects tampering. Fixed KDF parameters and authenticated format context prevent unsupported metadata from being interpreted silently. No plaintext labels or hints are used as storage keys or written separately. The existing `storage` permission is sufficient; the vault adds no broad site permission and makes no network request.

There is no recovery key or backdoor. If the passphrase is lost, the encrypted hints are unrecoverable. A weak passphrase can be guessed offline by someone who obtains the extension's local storage; use a unique passphrase you can remember. The 600,000-iteration PBKDF2 operation may take noticeable time on slower devices. Browser JavaScript cannot reliably erase immutable strings or guarantee removal of all copies from process memory. Malware, a malicious extension or compromised extension code, or anyone who can use the device while the vault is unlocked can read the displayed hints. Extension removal or profile data loss can also destroy the local ciphertext. This is a local encrypted hint store, not a password manager or a defense against a compromised device.

## Smart Password Hint Reminders (optional)

The **Smart Password Hint Reminders** setting is off by default. Turn it on in Settings, then use **Enable for this site** in the toolbar popup to request Chrome host access during that click. The manifest declares optional HTTP/HTTPS host patterns so Chrome can ask for a single scheme and hostname at a time; no site host is granted at install. Chrome's pattern permission spans paths and ports for that scheme/hostname. To keep observation narrower, ExAiSec separately records the exact approved origin and the service worker checks that exact origin before the content script examines DOM structure. Subdomains are not granted by the request. The popup and Settings list authorized exact origins; removing one unregisters the detector and revokes its permission where no other approved origin needs it. Turning the global setting off stops open-page observers, unregisters reminder scripts, revokes the granted site hosts, and clears first/returning markers. Suppressed hostnames can be re-enabled in Settings.

The packaged isolated content script first asks the service worker whether global opt-in, exact-origin authorization, Chrome permission, and per-host suppression checks all pass. Only then does it look for enabled `input[type=password]` structure in the top frame. A lightweight `MutationObserver` watches inserted nodes and a small set of structural attributes, disconnecting after the first match. It never reads input values or page text, and does not monitor usernames, keystrokes, tokens, or form submissions. It does not inspect cross-origin frames. First/returning status is based on a local hostname-only marker, never on whether an encrypted hint exists. Reminder messages remain generic on the website; no hint count, label, or content is returned to the page.

The first reminder offers **Create Hint**, **Not Now**, and **Don't Remind Me on This Site**. Later reminders offer an explicit **Open ExAiSec** action. Both open the trusted extension vault page; the page asks for the master passphrase there and never sends it through extension messages. A reminder route carries only a normalized hostname. Website-scoped hints store that hostname inside the encrypted vault payload. Matching is exact normalized hostname equality (not registrable-domain or suffix matching); after unlock, the extension page asks the user to confirm the displayed hostname before showing matching hints. Existing hints without a hostname do not match any site. The content script never receives decrypted vault state and never places vault data into the page DOM.

Detection can miss login forms rendered in closed shadow roots or unusual controls that do not use password inputs. Chrome host patterns cannot restrict ports, so site access metadata and an exact-origin worker check are used as an additional gate. Browser UI and permission prompts still require manual verification in Chrome. The website can always remove or cover the dismissible reminder, and Chrome permission denial or restricted pages prevent detection.

## Browser checks still needed

Automated tests do not prove the Chrome UI works end to end. In Chrome, verify HTTPS and HTTP tabs, an unsupported `chrome://` tab, report navigation, settings persistence, API available/offline/timeout states, and a changed extension ID. Click the inspection button on pages with and without visible consent banners, on HTTPS and HTTP password forms, and after page navigation; check permission failures and the top-frame limitation. Check that the popup keeps the brand and current website visible while its content scrolls. Open the vault from both the popup and Settings; verify setup, confirmation mismatch, correct and incorrect unlock, add/edit/delete, explicit lock, and locked state after closing/reopening the page. Inspect `chrome.storage.local` and confirm it contains only the ciphertext envelope, not the passphrase, labels, or hints. For smart reminders, verify the global setting starts off, permission is requested only after the site button click, approval and denial behavior, first and returning copy, dynamic form appearance, dismissal/suppression, hostname confirmation, and global disable/revocation. Confirm the page cannot observe whether a hint matched, and that no reminder appears on a different port unless that exact origin was enabled. Confirm that `dist` has no Python or `.joblib` files and that the service worker has no errors in `chrome://extensions`.

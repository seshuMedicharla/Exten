# ExAiSec — evidence-based security advisor

ExAiSec is a Chrome Manifest V3 extension with local URL observations, an **experimental** phishing model assessment, deterministic security recommendations, and optional click-triggered page inspection. It never labels a website verified or safe. The model is a research artifact, and results are guidance only.

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

The manifest requests `activeTab`, `storage`, and `scripting`, plus access to `http://127.0.0.1/*` for the local API. `scripting` is used only after you click **Inspect page privacy & login security**; `activeTab` supplies temporary access to the current site. There is no permanent permission for all websites, no persistent content script, and no remote executable script.

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

Inspection can miss banners in cross-origin frames, closed shadow roots, images, or elements outside the visible viewport. It is unavailable on restricted Chrome pages and may fail when temporary page access is unavailable. No automatic phishing blocking, password vault, parental blocking, or external AI integration is implemented.

## Browser checks still needed

Automated tests do not prove the Chrome UI works end to end. In Chrome, verify HTTPS and HTTP tabs, an unsupported `chrome://` tab, report navigation, settings persistence, API available/offline/timeout states, and a changed extension ID. Click the inspection button on pages with and without visible consent banners, on HTTPS and HTTP password forms, and after page navigation; check permission failures and the top-frame limitation. Check that the popup keeps the brand and current website visible while its content scrolls. Confirm that `dist` has no Python or `.joblib` files and that the service worker has no errors in `chrome://extensions`.

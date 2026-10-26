# ExAiSec — Phase 1

A local Chrome Manifest V3 extension that shows transparent URL observations and general security guidance. The ML model, cookie analysis, login assessment, password hints, and parental protection are **not implemented** in this phase.

## Development

Requirements: Node.js 20.19+ or 22.12+, npm.

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

The packaged extension is in `dist/`. To install it, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and choose this repository's `dist` folder. Pin ExAiSec if desired, then open a normal HTTP or HTTPS website and click the extension icon.

## What works

- Popup dashboard for the current tab with clear loading, unsupported page, permission, and error states.
- Full report with URL syntax observations, evidence, limitations, and general recommendations.
- Settings persisted with `chrome.storage.local`: show URL observations, highlight HTTP, show recommendations.
- Local Manifest V3 service worker, typed requests, active tab inspection, and safe URL parsing.
- No host permissions, content scripts, external requests, remote scripts, cookie reads, form reads, or site blocking.

An HTTP URL, embedded credentials, IP hostname, encoded hostname label, or nondefault port may produce an observation. These observations are **not** a threat verdict. HTTPS does not prove a website is safe. ML risk always reads **Not Analyzed**. Displayed URLs omit credentials, query strings, and fragments to avoid exposing sensitive values.

## Manual browser checks

Automated unit tests and a production build do not exercise Chrome UI permissions. In Chrome, verify: open the popup on an HTTPS site, an HTTP site, `chrome://extensions`, and `about:blank`; use **View detailed report**; reload the original tab and refresh the report; change each setting and reopen the popup/report; close the original tab and refresh the report. Confirm the service worker loads under `chrome://extensions` without errors. A headless smoke test was attempted, but this Google Chrome build ignored command line extension loading, so browser interactions remain unverified.

import { useCallback, useEffect, useState } from 'react';
import { asReportResult, sendRequest } from './messaging';
import type { ExtensionRequest, ReportResult } from './types';

export function useReport(request: ExtensionRequest | null) {
  const [result, setResult] = useState<ReportResult | { status: 'loading' }>({ status: 'loading' });
  const reload = useCallback(async () => {
    if (!request) { setResult({ status: 'error', reason: 'No valid tab was selected for this report.' }); return; }
    setResult({ status: 'loading' });
    try { setResult(asReportResult(await sendRequest(request))); }
    catch { setResult({ status: 'error', reason: 'Could not contact the extension service worker. Try again.' }); }
  }, [request]);
  useEffect(() => { void reload(); }, [reload]);
  return { result, reload };
}

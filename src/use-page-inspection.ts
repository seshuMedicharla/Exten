import { useCallback, useEffect, useRef, useState } from 'react';
import { sendRequest } from './messaging';
import type { PageInspectionResult } from './types';

export type PageInspectionState = { status: 'idle' | 'loading' } | PageInspectionResult;

export function usePageInspection(tabId: number | undefined) {
  const [state, setState] = useState<PageInspectionState>({ status: 'idle' });
  const generation = useRef(0);
  useEffect(() => { generation.current += 1; setState({ status: 'idle' }); }, [tabId]);
  const inspect = useCallback(async () => {
    const requestId = ++generation.current;
    if (tabId === undefined) { setState({ status: 'unavailable', kind: 'unsupported-page', reason: 'No website is available for inspection.' }); return; }
    setState({ status: 'loading' });
    try {
      const response = await sendRequest({ type: 'INSPECT_PAGE', tabId });
      if (generation.current !== requestId) return;
      setState('type' in response && response.type === 'PAGE_INSPECTION_RESULT'
        ? response.result
        : { status: 'error', reason: 'The extension returned an unexpected inspection response.' });
    } catch {
      if (generation.current === requestId) setState({ status: 'error', reason: 'The extension could not complete page inspection.' });
    }
  }, [tabId]);
  return { state, inspect };
}

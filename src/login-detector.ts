/** Detects only enabled password-field structure. It never reads field values or form text. */
export function isLikelyLoginForm(root: ParentNode): boolean {
  const candidates = Array.from(root.querySelectorAll('input[type="password"]'));
  if ('matches' in root && (root as Element).matches('input[type="password"]')) candidates.unshift(root as Element);
  for (const candidate of candidates) {
    const input = candidate as HTMLInputElement;
    if (input.disabled || input.closest('[hidden], [aria-hidden="true"]')) continue;
    return true;
  }
  return false;
}

/** Observes inserted nodes and a small allowlist of structural attributes, then stops after one detection. */
export function watchForLoginForm(document: Document, onDetected: () => void): () => void {
  let detected = false;
  const observerRef: { current?: MutationObserver } = {};
  const check = (root: ParentNode) => {
    if (detected || !isLikelyLoginForm(root)) return;
    detected = true;
    observerRef.current?.disconnect();
    onDetected();
  };

  check(document);
  if (detected || !document.body) return () => observerRef.current?.disconnect();

  const MutationObserverConstructor = document.defaultView?.MutationObserver;
  if (!MutationObserverConstructor) return () => undefined;
  const observer = new MutationObserverConstructor((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        const target = record.target;
        if (target instanceof document.defaultView!.HTMLInputElement || record.attributeName !== 'type') check(target as Element);
      }
      for (const node of record.addedNodes) if (node.nodeType === 1) check(node as Element);
      if (detected) break;
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['type', 'disabled', 'hidden', 'aria-hidden'],
  });
  observerRef.current = observer;
  return () => observer.disconnect();
}

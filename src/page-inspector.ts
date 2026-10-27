import type { ConsentCategory, PageDomObservation } from './types';

/**
 * Self-contained function for chrome.scripting.executeScript. It reads only visible
 * text nodes inside likely consent containers and structural password-input types.
 * No raw text, input value, cookie, URL, or form data is returned.
 */
export function inspectPageDom(): PageDomObservation {
  const doc = document;
  const view = doc.defaultView;
  const visible = (element: Element): boolean => {
    if (!view) return false;
    for (let current: Element | null = element; current; current = current.parentElement) {
      if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') return false;
      const style = view.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < view.innerHeight && rect.left < view.innerWidth;
  };
  const displayedText = (container: Element): string => {
    const walker = doc.createTreeWalker(container, 4 /* SHOW_TEXT */);
    let text = '';
    let nodes = 0;
    while (nodes < 120 && text.length < 2000) {
      const node = walker.nextNode();
      if (!node) break;
      nodes += 1;
      if (node.parentElement && visible(node.parentElement)) text += ` ${node.nodeValue?.slice(0, 160) ?? ''}`;
    }
    return text.toLowerCase();
  };

  let bannerDetected = false;
  const categories = new Set<ConsentCategory>();
  const candidates = doc.querySelectorAll('[role="dialog"], [id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="gdpr" i], [class*="gdpr" i]');
  for (let index = 0; index < Math.min(candidates.length, 40); index += 1) {
    const candidate = candidates[index];
    if (!visible(candidate)) continue;
    const text = displayedText(candidate);
    if (!/\bcookies?\b|\bconsent\b|\btracking\b/.test(text) || !/\baccept\b|\breject\b|\bagree\b|\ballow\b|\bdecline\b|\bmanage\b|\bsettings\b/.test(text)) continue;
    bannerDetected = true;
    if (/\bessential\b|\bstrictly necessary\b|\bnecessary cookies?\b/.test(text)) categories.add('essential');
    if (/\banalytics?\b|\bstatistics?\b|\bperformance cookies?\b/.test(text)) categories.add('analytics');
    if (/\bmarketing\b|\badvertising\b|\btargeting\b/.test(text)) categories.add('marketing');
    if (/\bfunctional cookies?\b|\bpersonalization cookies?\b|\bother cookies?\b/.test(text)) categories.add('other');
  }

  let passwordFieldPresent = false;
  const passwordFields = doc.querySelectorAll('input[type="password"]');
  for (let index = 0; index < Math.min(passwordFields.length, 30); index += 1) {
    if (visible(passwordFields[index])) { passwordFieldPresent = true; break; }
  }
  return { version: 1, bannerDetected, categories: [...categories], passwordFieldPresent };
}

export function validatePageDomObservation(value: unknown): PageDomObservation | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<PageDomObservation>;
  const allowed: ConsentCategory[] = ['essential', 'analytics', 'marketing', 'other'];
  if (input.version !== 1 || typeof input.bannerDetected !== 'boolean' || typeof input.passwordFieldPresent !== 'boolean' ||
      !Array.isArray(input.categories) || input.categories.length > 4 ||
      !input.categories.every((category) => allowed.includes(category)) ||
      new Set(input.categories).size !== input.categories.length ||
      (!input.bannerDetected && input.categories.length > 0)) return null;
  return { version: 1, bannerDetected: input.bannerDetected, categories: input.categories, passwordFieldPresent: input.passwordFieldPresent };
}

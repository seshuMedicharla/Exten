import type { MlAssessment, UrlIndicator } from './types';

export type AdviceSource = 'observed-url' | 'experimental-model' | 'analysis-status' | 'general';
export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  source: AdviceSource;
  evidence: UrlIndicator['id'][];
}

/** Deterministic advice from displayed URL facts and the explicit model state. */
export function getRecommendations(indicators: readonly UrlIndicator[], model: MlAssessment): Recommendation[] {
  const observed = new Set(indicators.map((indicator) => indicator.id));
  const advice: Recommendation[] = [];
  const add = (id: string, title: string, detail: string, evidence: UrlIndicator['id'][]) => {
    advice.push({ id, title, detail, source: 'observed-url', evidence });
  };

  if (observed.has('http')) add('http-entry', 'Avoid sensitive entry on HTTP', 'This address uses HTTP. Avoid entering passwords or payment details; use an official HTTPS address if the service offers one.', ['http']);
  if (observed.has('credentials')) add('check-destination', 'Confirm the actual destination', 'The address contained URL credentials before an @ sign. Check the hostname through a trusted bookmark or official app.', ['credentials']);
  if (model.status === 'analyzed' && model.classification === 'elevated_signal') {
    advice.push({ id: 'model-review', title: 'Verify the destination independently', detail: 'The experimental model signal is elevated. This does not prove phishing; confirm the address through an official channel before sharing sensitive data.', source: 'experimental-model', evidence: [] });
  }
  if (observed.has('ip-address')) add('ip-host', 'Check the IP destination', 'The address uses an IP hostname. Confirm that this is the destination you intended; IP addresses are not inherently malicious.', ['ip-address']);
  if (observed.has('punycode')) add('encoded-host', 'Review the encoded hostname', 'The hostname contains an encoded label. Compare it with the expected domain; encoded labels can also be legitimate.', ['punycode']);
  if (observed.has('custom-port')) add('port-check', 'Confirm the port', 'The URL specifies a nondefault port. Check that the service expects this port.', ['custom-port']);
  if (model.status !== 'analyzed') {
    advice.push({ id: 'no-model', title: 'Verify without a model result', detail: 'ML risk is Not Analyzed. Use the URL observations and an independent official source to assess the destination.', source: 'analysis-status', evidence: [] });
  }

  // Keep the advice concise. This is conditional guidance, not a claim about this site's login setup.
  const selected = advice.slice(0, 3);
  selected.push({ id: 'account-hygiene', title: 'Protect accounts you use here', detail: 'If you sign in, use a password manager to check the domain and enable MFA where the service offers it. ExAiSec has not inspected the site’s sign-in or MFA setup.', source: 'general', evidence: [] });
  return selected;
}

import { describe, expect, it } from 'vitest';
import { getRecommendations } from './advisor';
import { inspectUrl } from './url-analysis';
import type { MlAssessment, UrlIndicator } from './types';

const lowModel: MlAssessment = { status: 'analyzed', score: 0.1, classification: 'below_threshold', threshold: 0.62, modelVersion: 'rf-mendeley-v2-calibrated', limitations: ['Research only'] };
const highModel: MlAssessment = { ...lowModel, score: 0.8, classification: 'elevated_signal' };
const missingModel: MlAssessment = { status: 'unavailable', reason: 'Local service unavailable' };
const indicator = (id: UrlIndicator['id']): UrlIndicator => ({ id, title: id, detail: id, tone: 'neutral' });

describe('evidence-based recommendations', () => {
  it('explains observed HTTP without deriving a site verdict from a low model score', () => {
    const advice = getRecommendations([indicator('http')], lowModel);
    expect(advice[0]).toMatchObject({ id: 'http-entry', source: 'observed-url', evidence: ['http'] });
    expect(advice.some((item) => item.source === 'experimental-model')).toBe(false);
    expect(advice.map((item) => item.detail).join(' ')).not.toMatch(/safe|MFA is absent/i);
  });
  it('labels elevated model advice as inference, separate from observed URL structure', () => {
    const advice = getRecommendations([indicator('credentials'), indicator('punycode')], highModel);
    expect(advice.map((item) => item.id)).toContain('check-destination');
    expect(advice.find((item) => item.id === 'model-review')).toMatchObject({ source: 'experimental-model', evidence: [] });
    expect(advice.some((item) => item.id === 'http-entry')).toBe(false);
  });
  it('handles missing model results without inventing URL warnings', () => {
    const advice = getRecommendations([indicator('https')], missingModel);
    expect(advice.map((item) => item.id)).toEqual(['no-model', 'account-hygiene']);
    expect(advice.every((item) => item.source !== 'observed-url')).toBe(true);
  });
  it('gives conditional password-manager and MFA guidance without asserting site capabilities', () => {
    const advice = getRecommendations([indicator('https')], lowModel);
    expect(advice).toHaveLength(1);
    expect(advice[0].detail).toContain('If you sign in');
    expect(advice[0].detail).toContain('where the service offers it');
    expect(advice[0].detail).toContain('has not inspected');
  });
  it('uses only observed structure and caps the number of suggestions', () => {
    const ids: UrlIndicator['id'][] = ['ip-address', 'punycode', 'custom-port'];
    const advice = getRecommendations(ids.map(indicator), lowModel);
    expect(advice.map((item) => item.id)).toEqual(['ip-host', 'encoded-host', 'port-check', 'account-hygiene']);
    expect(advice).toHaveLength(4);
  });
  it('does not copy a sensitive URL into generated advice', () => {
    const result = inspectUrl('https://user:secret@example.com/path?token=private#fragment', 1);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const advice = getRecommendations(result.report.indicators, missingModel);
    const text = JSON.stringify({ url: result.report.url, advice });
    expect(text).not.toMatch(/secret|private|fragment/);
    expect(result.report.url).toBe('https://example.com/path');
  });
});

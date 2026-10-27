import type { MlAssessment } from './types';

const API_URL = 'http://127.0.0.1:8765/predict';
export const ML_TIMEOUT_MS = 3500;
const MODEL_VERSION = 'rf-mendeley-v2-calibrated';

type PredictionPayload = {
  model_score: number;
  classification: 'elevated_signal' | 'below_threshold';
  threshold: number;
  model_version: string;
  observed_url_indicators: Array<{ id: string; title: string; detail: string }>;
  limitations: string[];
};

export function parsePrediction(value: unknown): MlAssessment {
  if (!value || typeof value !== 'object') return { status: 'error', reason: 'The local model returned an invalid response.' };
  const data = value as Partial<PredictionPayload>;
  if (typeof data.model_score !== 'number' || !Number.isFinite(data.model_score) || data.model_score < 0 || data.model_score > 1 ||
      typeof data.threshold !== 'number' || !Number.isFinite(data.threshold) || data.threshold <= 0 || data.threshold >= 1 ||
      data.model_version !== MODEL_VERSION ||
      (data.classification !== 'elevated_signal' && data.classification !== 'below_threshold') ||
      data.classification !== (data.model_score >= data.threshold ? 'elevated_signal' : 'below_threshold') ||
      !Array.isArray(data.observed_url_indicators) || data.observed_url_indicators.length > 10 ||
      !data.observed_url_indicators.every((item) => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.detail === 'string') ||
      !Array.isArray(data.limitations) || data.limitations.length === 0 || data.limitations.length > 10 ||
      !data.limitations.every((item) => typeof item === 'string' && item.length <= 500)) {
    return { status: 'error', reason: 'The local model returned an invalid response.' };
  }
  return { status: 'analyzed', score: data.model_score, classification: data.classification, threshold: data.threshold, modelVersion: data.model_version, limitations: data.limitations };
}

export async function analyzeWithLocalApi(sanitizedUrl: string, timeoutMs = ML_TIMEOUT_MS): Promise<MlAssessment> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-ExAiSec-Client': '1' },
      body: JSON.stringify({ url: sanitizedUrl }),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (response.status === 422) return { status: 'unsupported', reason: 'The local model does not support this sanitized URL.' };
    if (response.status === 403) return { status: 'error', reason: 'The API has not authorized this extension ID.' };
    if (!response.ok) return { status: 'error', reason: 'The local model could not complete the assessment.' };
    if (!response.headers.get('content-type')?.includes('application/json')) return { status: 'error', reason: 'The local model returned an invalid response.' };
    const size = Number(response.headers.get('content-length'));
    if (size > 16384) return { status: 'error', reason: 'The local model returned an invalid response.' };
    try { return parsePrediction(await response.json()); }
    catch { return { status: 'error', reason: 'The local model returned an invalid response.' }; }
  } catch (error) {
    if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return { status: 'timeout', reason: 'The local model did not respond in time.' };
    }
    if (error instanceof TypeError) return { status: 'unavailable', reason: 'The local model service is unavailable. Start the API and try again.' };
    return { status: 'error', reason: 'The local model request failed.' };
  } finally {
    clearTimeout(timer);
  }
}

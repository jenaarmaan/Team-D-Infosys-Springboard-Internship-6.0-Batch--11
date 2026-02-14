// /lib/identity/voiceAuth.ts

/* =========================================================
   Voice Authentication Core
   ---------------------------------------------------------
   - Voice print capture
   - Voice matching
   - Confidence threshold logic
   - No UI, no storage, no side effects
   ========================================================= */

export type VoicePrint = {
  embedding: number[];
  createdAt: number;
};

export type VoiceMatchResult = {
  matched: boolean;
  confidence: number;
};

const DEFAULT_CONFIDENCE_THRESHOLD = 0.82;

/* ---------------------------------------------------------
   Utility: Normalize vector
--------------------------------------------------------- */
function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vector;
  return vector.map(v => v / magnitude);
}

/* ---------------------------------------------------------
   Utility: Cosine similarity
--------------------------------------------------------- */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (magA === 0 || magB === 0) return 0;

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/* ---------------------------------------------------------
   Capture voice print
   NOTE:
   - `embedding` must come from your ASR / ML pipeline
--------------------------------------------------------- */
export function createVoicePrint(
  rawEmbedding: number[]
): VoicePrint {
  return {
    embedding: normalizeVector(rawEmbedding),
    createdAt: Date.now(),
  };
}

/* ---------------------------------------------------------
   Match voice sample against stored print
--------------------------------------------------------- */
export function matchVoicePrint(
  sampleEmbedding: number[],
  storedVoicePrint: VoicePrint,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD
): VoiceMatchResult {
  const normalizedSample = normalizeVector(sampleEmbedding);

  const confidence = cosineSimilarity(
    normalizedSample,
    storedVoicePrint.embedding
  );

  return {
    matched: confidence >= threshold,
    confidence,
  };
}

/* ---------------------------------------------------------
   Threshold helper (for future tuning / A/B testing)
--------------------------------------------------------- */
export function getDefaultConfidenceThreshold(): number {
  return DEFAULT_CONFIDENCE_THRESHOLD;
}

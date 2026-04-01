/**
 * Calibration Surface — alive-mind
 * src/calibration/calibration-surface.ts
 *
 * Typed interfaces and placeholder implementations for the four calibration
 * subsystems. Replaces the four empty stubs (confidence.ts, drift.ts,
 * error-attribution.ts, threshold-adjustment.ts).
 *
 * All calibration subsystems are doctrine-sensitive. The formulas that compute
 * offsets, drift scores, and threshold changes require locked policy before
 * they can be finalized. This module exposes:
 *   - Typed interfaces for each subsystem
 *   - Placeholder implementations that return structured zeroed output
 *   - Explicit TODO markers for each unresolved policy question
 *   - Stable export surface so callers compile without stubs
 *
 * Doctrine-sensitive (intentionally not finalized):
 *   - confidence calibration offset formulas
 *   - drift detection window and severity thresholds
 *   - error attribution weight assignment
 *   - threshold adjustment step sizes and feedback loops
 *
 * Design rules:
 *   - No side effects.
 *   - All inputs and outputs are typed.
 *   - Placeholder implementations return valid structured output — never null.
 *   - Callers can inject real implementations via the function signatures.
 */

// ── 1. Confidence Calibrator ──────────────────────────────────────────────────

/** A single prediction-outcome pair for calibration input. */
export interface PredictionRecord {
  /** The predicted probability at prediction time (0.0–1.0). */
  predicted:   number;
  /** Whether the predicted outcome actually happened. */
  actual:      boolean;
  /** Epoch ms when this prediction was made. */
  timestamp:   number;
}

export interface CalibrationOffset {
  /**
   * Additive offset to apply to future predictions from this source.
   * Positive = predictions were overconfident (reduce them).
   * Negative = predictions were underconfident (increase them).
   *
   * TODO(doctrine): formula (Expected Calibration Error, Platt scaling, etc.) not finalized.
   */
  offset: number;

  /**
   * How many prediction records were used in this calibration.
   */
  sample_size: number;

  /**
   * Whether there are enough records for a statistically meaningful calibration.
   * Default threshold: 20 records.
   * TODO(doctrine): sample size threshold not finalized.
   */
  is_significant: boolean;

  /** Epoch ms when this calibration was computed. */
  computed_at: number;
}

/**
 * Compute a confidence calibration offset from prediction history.
 *
 * TODO(doctrine): formula not finalized — returns zero offset (no-op).
 * Replace with ECE or Platt scaling when policy is locked.
 */
export function computeCalibrationOffset(records: PredictionRecord[]): CalibrationOffset {
  // TODO(doctrine): implement calibration formula
  return {
    offset:         0,    // no-op placeholder
    sample_size:    records.length,
    is_significant: records.length >= 20,
    computed_at:    Date.now(),
  };
}

// ── 2. Drift Detector ─────────────────────────────────────────────────────────

export interface DriftWindow {
  /** Observations in the reference (historical) window. */
  reference: number[];
  /** Observations in the current (recent) window. */
  current:   number[];
}

export interface DriftScore {
  /**
   * 0.0 = no drift, 1.0 = complete distribution shift.
   * TODO(doctrine): metric (KL divergence, PSI, etc.) not finalized.
   */
  score: number;

  /** Whether drift crossed the alert threshold. */
  is_alert: boolean;

  /**
   * Alert threshold applied.
   * TODO(doctrine): threshold not finalized — default placeholder 0.3.
   */
  threshold: number;

  /** Epoch ms when drift was computed. */
  computed_at: number;
}

/**
 * Compute a drift score comparing reference vs current distributions.
 *
 * TODO(doctrine): metric formula not finalized — returns zero score (no-op).
 */
export function detectDrift(window: DriftWindow): DriftScore {
  // TODO(doctrine): implement drift metric (KL, PSI, or policy-specific method)
  const threshold = 0.30;
  return {
    score:       0,       // no-op placeholder
    is_alert:    false,
    threshold,
    computed_at: Date.now(),
  };
}

// ── 3. Error Attributor ───────────────────────────────────────────────────────

/** Classification of what type of error occurred. */
export type ErrorType =
  | 'model_error'    // ALIVE's reasoning model was wrong
  | 'data_error'     // Input signal was noisy or corrupted
  | 'signal_error'   // Signal classification was wrong
  | 'unknown';       // Could not determine attribution

export interface ErrorRecord {
  /** What was predicted. */
  predicted:  unknown;
  /** What actually happened. */
  actual:     unknown;
  /** Context that was available at prediction time. */
  context:    Record<string, unknown>;
  /** Epoch ms when the error occurred. */
  occurred_at: number;
}

export interface ErrorAttribution {
  error_type: ErrorType;

  /**
   * Confidence in this attribution (0.0–1.0).
   * TODO(doctrine): attribution confidence formula not finalized.
   */
  confidence: number;

  /** Human-readable reason for the attribution. */
  reason: string;

  /** Epoch ms when attribution was computed. */
  computed_at: number;
}

/**
 * Attribute an error to its likely cause.
 *
 * TODO(doctrine): attribution algorithm not finalized — returns 'unknown' (no-op).
 */
export function attributeError(record: ErrorRecord): ErrorAttribution {
  // TODO(doctrine): implement error attribution algorithm
  void record;
  return {
    error_type:  'unknown',
    confidence:  0,
    reason:      'Error attribution not yet implemented. TODO(doctrine): algorithm pending.',
    computed_at: Date.now(),
  };
}

// ── 4. Threshold Adjuster ─────────────────────────────────────────────────────

/**
 * A threshold that can be adjusted based on calibration feedback.
 * E.g., the CCE MIN_CONFIDENCE_TO_PROCEED threshold.
 */
export interface AdjustableThreshold {
  /** Identifier for this threshold (e.g., 'cce_min_confidence'). */
  id:      string;
  /** Current value. */
  current: number;
  /** Allowed range. */
  min:     number;
  max:     number;
}

export interface ThresholdAdjustment {
  threshold_id: string;

  /** Suggested new value for the threshold. */
  suggested_value: number;

  /**
   * Magnitude of suggested change.
   * TODO(doctrine): step size formula not finalized.
   */
  delta: number;

  /** Reason for the adjustment. */
  reason: string;

  /** Whether to apply this adjustment or just record it. */
  should_apply: boolean;

  /** Epoch ms when this adjustment was computed. */
  computed_at: number;
}

/**
 * Suggest a threshold adjustment based on calibration feedback.
 *
 * TODO(doctrine): feedback loop formula not finalized — returns no-op adjustment.
 */
export function suggestThresholdAdjustment(
  threshold:  AdjustableThreshold,
  _feedback:  CalibrationOffset,  // will be used when formula is finalized
): ThresholdAdjustment {
  // TODO(doctrine): implement adjustment formula (gradient, bandit, or policy-specific)
  return {
    threshold_id:    threshold.id,
    suggested_value: threshold.current,  // no change
    delta:           0,
    reason:          'Threshold adjustment not yet implemented. TODO(doctrine): formula pending.',
    should_apply:    false,
    computed_at:     Date.now(),
  };
}

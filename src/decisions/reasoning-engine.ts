/**
 * Reasoning Engine — alive-mind's core decision loop.
 *
 * Implements a three-tier lazy reasoning hierarchy:
 *
 *   Tier 1 — NEW_SENSOR_DETECTED handler: When a novel sensor registers,
 *             the engine queries its World Model to deduce utility.
 *
 *   Tier 2 — Local derived memory: Fast pattern match against known stories.
 *             Returns immediately if a high-trust match exists.
 *
 *   Tier 3 — Universal Learning Protocol: When no local match exists,
 *             abstract the signal → cross-domain search → emit a low-risk
 *             reversible probe action ("25% Rule: learn by doing").
 *
 *   Tier 4 — LLM Teacher: Last resort for truly novel signals.
 *
 * Invariant: MIND_CANNOT_EXECUTE — this module produces Actions only.
 */

import type { Signal } from '../../../alive-constitution/contracts/signal';
import type { Action, DisplayTextAction } from '../../../alive-constitution/contracts/action';
import type { ASMState } from '../spine/state-model';
import { findMatchingStory, findStrongLocalMatch } from '../memory/derived-memory';
import { askTeacher } from './llm-teacher';
import { stm } from '../memory/stm/short-term-memory';

// ---------------------------------------------------------------------------
// Sensor schema shape (mirrors alive-body/src/sensors/sensor-registry.ts)
// Redefined here to avoid alive-mind importing from alive-body (layer violation)
// ---------------------------------------------------------------------------
interface SensorSchema {
  id: string;
  name: string;
  data_type: string;
  unit: string;
  expected_range: Record<string, unknown>;
  description?: string;
}

interface NewSensorContent {
  event: 'NEW_SENSOR_DETECTED';
  schema: SensorSchema;
}

function isNewSensorSignal(raw: unknown): raw is NewSensorContent {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as Record<string, unknown>)['event'] === 'NEW_SENSOR_DETECTED'
  );
}

// ---------------------------------------------------------------------------
// Tier 1 — NEW_SENSOR_DETECTED handler
// ---------------------------------------------------------------------------

/**
 * Unit → domain knowledge mappings sourced from the Science & Tech and
 * Survival stacks in the World Model. This table lets the engine reason
 * about a novel sensor purely from its declared unit.
 */
const UNIT_DOMAIN_MAP: Record<string, { domain: string; utility: string; threat_threshold: string }> = {
  // Thermal
  celsius:     { domain: 'Science & Tech / Survival', utility: 'Monitor temperature; map to thermal survival limits (hypothermia <35°C, hyperthermia >40°C, fire >250°C)', threat_threshold: 'below 10°C or above 50°C' },
  fahrenheit:  { domain: 'Science & Tech / Survival', utility: 'Monitor temperature (convert to Celsius for survival mapping)', threat_threshold: 'below 50°F or above 122°F' },
  kelvin:      { domain: 'Science & Tech', utility: 'Absolute temperature; use for physics calculations; map extremes to safety margins', threat_threshold: 'below 283K or above 323K' },
  // Radiation
  sieverts:    { domain: 'Science & Tech / Survival', utility: 'Monitor ionizing radiation dose; escalate to THREAT at hazardous levels', threat_threshold: '≥ 0.1 Sv/hr (occupational limit); ≥ 1 Sv (acute radiation risk)' },
  grays:       { domain: 'Science & Tech', utility: 'Absorbed radiation dose; correlate with biological damage models', threat_threshold: '≥ 1 Gy (tissue damage risk)' },
  // Distance / Spatial
  meters:      { domain: 'Science & Tech', utility: 'Spatial measurement; use for proximity, navigation, obstacle avoidance', threat_threshold: 'context-dependent; flag near-zero values for collision risk' },
  centimeters: { domain: 'Science & Tech', utility: 'Fine-grained spatial measurement; precision positioning', threat_threshold: '< 5cm may indicate contact risk' },
  // Pressure
  pascals:     { domain: 'Science & Tech', utility: 'Atmospheric or mechanical pressure; map to structural safety margins', threat_threshold: 'deviation > 20% from ambient baseline' },
  // Chemistry
  ph:          { domain: 'Science & Tech / Survival', utility: 'Acidity/alkalinity; map to water safety (drinkable: pH 6.5–8.5)', threat_threshold: '< 5.5 or > 9 (chemical hazard)' },
  ppm:         { domain: 'Science & Tech / Survival', utility: 'Parts per million concentration; monitor for toxicity or contamination', threat_threshold: 'substance-specific; requires cross-reference' },
  // Audio / Language
  text:        { domain: 'Language & Communication', utility: 'Text transcription; process via language stack for intent and ambiguity detection', threat_threshold: 'any content matching threat-dictionary patterns' },
  decibels:    { domain: 'Science & Tech', utility: 'Sound pressure level; monitor for hearing damage or environmental alerts', threat_threshold: '≥ 85 dB sustained (OSHA limit)' },
  // Visual
  visual_proximity_alert: { domain: 'Science & Tech / Survival', utility: 'Proximity detection; map to obstacle avoidance and collision prevention', threat_threshold: 'object_contact or obstruction values' },
  // Generic
  boolean:     { domain: 'Science & Tech', utility: 'Binary state sensor; monitor for state transitions and anomalies', threat_threshold: 'unexpected state change' },
  percent:     { domain: 'Science & Tech', utility: 'Proportional measurement; monitor for threshold crossings', threat_threshold: 'near 0% or 100% depending on context' },
};

function deduceSensorUtility(schema: SensorSchema): DisplayTextAction {
  const unitKey = schema.unit.toLowerCase().replace(/[^a-z_]/g, '_');
  const known = UNIT_DOMAIN_MAP[unitKey];

  if (known) {
    const deduction = [
      `Unit: ${schema.unit} → Domain: ${known.domain}.`,
      `Utility: ${known.utility}.`,
      `Threat threshold: ${known.threat_threshold}.`,
      `Probe: begin monitoring ${schema.name} (id: ${schema.id}) at minimum sample rate. Log first 10 readings. Escalate if threshold breached.`,
    ].join(' ');

    console.log(`[ALIVE-MIND] New sensor detected. Deduced utility: ${deduction}`);

    return {
      type: 'display_text',
      payload: `NEW_SENSOR_INDEXED: ${schema.name}. ${deduction}`,
      is_reversible: true,
    };
  }

  // Unit not in local map — fall back to Universal Learning Protocol probe
  const fallback = universalProbe(
    `Novel sensor "${schema.name}" with unit "${schema.unit}" — no direct domain match found.`,
    `novel_sensor_unit_${schema.unit}`,
  );
  console.log(`[ALIVE-MIND] New sensor detected. Unit "${schema.unit}" unknown. Applying Universal Learning Protocol: ${fallback.payload}`);
  return fallback;
}

// ---------------------------------------------------------------------------
// Universal Learning Protocol (25% Rule)
// ---------------------------------------------------------------------------

/**
 * Step 1 — Abstract the signal to structural base terms.
 * Strips domain-specific vocabulary and maps to universal structural patterns.
 */
function abstractToStructural(content: string): string {
  return content
    .replace(/\b(sensor|device|hardware|peripheral)\b/gi, 'data_source')
    .replace(/\b(reading|measurement|value|output)\b/gi, 'data_point')
    .replace(/\b(high|elevated|above threshold)\b/gi, 'excess_detected')
    .replace(/\b(low|below|insufficient)\b/gi, 'deficit_detected')
    .replace(/\b(unknown|novel|unfamiliar|new)\b/gi, 'incomplete_information')
    .replace(/\b(unit|measurement type)\b/gi, 'domain_indicator')
    .toLowerCase();
}

/**
 * Step 2 — Cross-domain search using abstracted terms.
 * Allows matches from completely unrelated domains (Poker → incomplete info,
 * Sun Tzu → supply lines, Survival → orientation).
 */
function crossDomainSearch(abstractedContent: string): string {
  const signal: Signal = {
    id: 'ulp-abstract',
    source: 'system_api',
    raw_content: abstractedContent,
    timestamp: Date.now(),
    threat_flag: false,
    firewall_status: 'cleared',
  };
  const story = findMatchingStory(signal);
  return `[${story.id} / ${story.context}] → "${story.outcome}"`;
}

/**
 * Step 3 — Generate a low-risk reversible probe action.
 * Instead of trying to fully understand the input, probe it to learn by doing.
 */
function universalProbe(description: string, tag: string): DisplayTextAction {
  const abstracted = abstractToStructural(description);
  const crossDomainInsight = crossDomainSearch(abstracted);

  const payload = [
    `PROBE[${tag}]:`,
    `Cross-domain insight: ${crossDomainInsight}.`,
    `Action: emit minimal stimulus, observe response, log delta. Do not commit to full execution until 3 feedback cycles complete.`,
  ].join(' ');

  return {
    type: 'display_text',
    payload,
    is_reversible: true,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Lazy Hybrid reasoning path:
 *   1) NEW_SENSOR_DETECTED fast-path (world model deduction)
 *   2) Local derived memory (high-trust story match)
 *   3) Universal Learning Protocol (cross-domain probe)
 *   4) LLM Teacher (last resort)
 */
export async function evaluateNovelSignal(signal: Signal, state: ASMState): Promise<Action> {
  stm.push(signal);

  // Tier 1 — Sensor registration fast-path
  if (isNewSensorSignal(signal.raw_content)) {
    return deduceSensorUtility(signal.raw_content.schema);
  }

  // Tier 2 — Local derived memory
  const localAction = findStrongLocalMatch(signal, state);
  if (localAction) {
    return localAction;
  }

  // Tier 3 — Universal Learning Protocol
  const story = findMatchingStory(signal);

  // If the matched story has decent trust but didn't pass the strong-match
  // threshold, use it as a cross-domain analogy and emit a probe
  if (story.trust >= 0.5) {
    const probePayload = [
      `CROSS-DOMAIN ANALOGY [${story.id}]:`,
      `"${story.context}" → "${story.outcome}".`,
      `Probe: apply low-risk reversible action to gather feedback before full commitment (25% Rule).`,
    ].join(' ');

    console.log(`[reasoning-engine] Universal Learning Protocol activated. Analogy: ${story.id}`);

    return {
      type: 'display_text',
      payload: probePayload,
      is_reversible: true,
    };
  }

  // Tier 4 — LLM Teacher (genuinely novel — no analogy available)
  console.log('[reasoning-engine] No local match or analogy. Consulting Teacher.');
  return askTeacher(signal, state);
}

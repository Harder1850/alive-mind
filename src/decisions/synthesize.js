"use strict";
/**
 * Synthesizer — alive-mind
 * alive-mind/src/decisions/synthesize.ts
 *
 * Cognitive module. Imports contracts from alive-constitution only.
 * Does NOT execute actions. Does NOT define law.
 * Called by alive-runtime via mind-bridge — does NOT call alive-runtime.
 *
 * Slice 4: SVE + CCE + ARE wired into the validation pipeline.
 * Candidates rejected by SVE or CCE fall through to the next level.
 *
 * Fail closed: unimplemented levels return null — never throw, never simulate.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.synthesize = synthesize;
const rule_store_1 = require("../memory/rule-store");
const sve_1 = require("../cognition/sve");
const cce_1 = require("../cognition/cce");
const are_1 = require("../cognition/are");
// Optional Slice 3 memory modules — fail closed if absent
let episodeStore = null;
let semanticGraph = null;
try {
    episodeStore = require('../memory/episode-store');
}
catch { /* Slice 3 absent */ }
try {
    semanticGraph = require('../memory/semantic-graph');
}
catch { /* Slice 3 absent */ }
function tryProcedure(_s) { return null; }
function tryLLM(_s) { return null; }
function validateCandidate(candidate, signal, predictionAccuracy, evidenceCount) {
    const sve = (0, sve_1.validate)(candidate);
    if (!sve.proceed) {
        console.log(`[SVE] FAIL — ${sve.reason}`);
        return null;
    }
    const cce = (0, cce_1.scoreCandidate)({ candidate, signal, prediction_accuracy: predictionAccuracy, evidence_count: evidenceCount, source_trust: candidate.confidence });
    const are = (0, are_1.challenge)(candidate, signal);
    const finalConfidence = Math.min(1.0, Math.max(0.0, cce.adjusted_confidence + are.confidence_adjustment));
    const finalRisk = Math.min(1.0, Math.max(0.0, candidate.risk + are.risk_adjustment));
    const validated = { ...candidate, confidence: finalConfidence, risk: finalRisk, sve, cce, are };
    if (!cce.proceed) {
        console.log(`[CCE] REJECT — ${cce.reason}`);
        return null;
    }
    if (sve.verdict === 'warn')
        console.log(`[SVE] WARN — ${sve.reason}`);
    if (are.fired)
        console.log(`[ARE] ${are.summary}`);
    return validated;
}
function tryRule(signal) {
    const match = (0, rule_store_1.matchRule)(signal);
    if (!match)
        return null;
    return { id: crypto.randomUUID(), action: match.action, level: 'rule', reason: `rule:${match.rule.id} — ${match.rule.description}`, confidence: match.confidence, risk: match.risk, source_memories: [] };
}
function tryEpisode(signal) {
    return episodeStore?.recall(signal) ?? null;
}
function trySemantic(signal) {
    return semanticGraph?.query(signal) ?? null;
}
function fallback(signal) {
    return { id: crypto.randomUUID(), action: { type: 'display_text', payload: `[ALIVE] Signal received (kind=${signal.kind}, urgency=${signal.urgency.toFixed(2)}). No specific response pattern matched. Monitoring.` }, level: 'fallback', reason: 'No rule, episode, or semantic match found. Surfacing to human.', confidence: 0.5, risk: 0.0, source_memories: [] };
}
function synthesize(signal, predictionAccuracy, evidenceCount) {
    const tried = [];
    const attempt = (level, raw) => {
        tried.push(level);
        if (!raw)
            return null;
        if (level === 'fallback')
            return raw;
        return validateCandidate(raw, signal, predictionAccuracy, evidenceCount);
    };
    const procedure = attempt('procedure', tryProcedure(signal));
    if (procedure)
        return { candidate: procedure, levelsTriedBeforMatch: tried };
    const rule = attempt('rule', tryRule(signal));
    if (rule)
        return { candidate: rule, levelsTriedBeforMatch: tried };
    const episode = attempt('episode', tryEpisode(signal));
    if (episode)
        return { candidate: episode, levelsTriedBeforMatch: tried };
    const semantic = attempt('semantic', trySemantic(signal));
    if (semantic)
        return { candidate: semantic, levelsTriedBeforMatch: tried };
    const llm = attempt('llm', tryLLM(signal));
    if (llm)
        return { candidate: llm, levelsTriedBeforMatch: tried };
    tried.push('fallback');
    return { candidate: fallback(signal), levelsTriedBeforMatch: tried };
}

"use strict";
/**
 * Self-Validation Engine (SVE) — alive-mind
 * alive-mind/src/cognition/sve.ts
 *
 * Cognitive module. Imports contracts from alive-constitution only.
 * Does NOT execute actions. Does NOT define law.
 *
 * Checks proposed ActionCandidate for internal consistency.
 * Runs on EVERY synthesis cycle with a candidate.
 * Unlike ARE, SVE is not conditional.
 *
 * Slice 4 implementation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const PROTECTED_WRITE_PATHS = ['alive-constitution', 'alive-runtime', 'alive-mind', 'alive-body', 'alive-interface', 'system-invariants', 'package.json', 'tsconfig'];
function checkConfidenceRange(c) {
    if (c.confidence < 0 || c.confidence > 1)
        return { name: 'confidence_range', verdict: 'fail', detail: `confidence=${c.confidence} outside [0,1]` };
    if (c.confidence < 0.1)
        return { name: 'confidence_range', verdict: 'warn', detail: `confidence=${c.confidence.toFixed(3)} very low` };
    return { name: 'confidence_range', verdict: 'pass', detail: `confidence=${c.confidence.toFixed(3)}` };
}
function checkRiskRange(c) {
    if (c.risk < 0 || c.risk > 1)
        return { name: 'risk_range', verdict: 'fail', detail: `risk=${c.risk} outside [0,1]` };
    if (c.risk > 0.8)
        return { name: 'risk_range', verdict: 'warn', detail: `risk=${c.risk.toFixed(3)} high — ARE should challenge` };
    return { name: 'risk_range', verdict: 'pass', detail: `risk=${c.risk.toFixed(3)}` };
}
function checkReasonPresent(c) {
    if (!c.reason || c.reason.trim().length < 5)
        return { name: 'reason_present', verdict: 'fail', detail: 'No meaningful reason — unexplained candidates rejected' };
    return { name: 'reason_present', verdict: 'pass', detail: `reason="${c.reason.slice(0, 60)}"` };
}
function checkActionIntegrity(action) {
    if (action.type === 'display_text') {
        if (!action.payload || action.payload.trim().length === 0)
            return { name: 'action_integrity', verdict: 'fail', detail: 'display_text has empty payload' };
        return { name: 'action_integrity', verdict: 'pass', detail: `display_text len=${action.payload.length}` };
    }
    if (action.type === 'write_file') {
        if (!action.filename || action.filename.trim().length === 0)
            return { name: 'action_integrity', verdict: 'fail', detail: 'write_file has empty filename' };
        if (action.filename.includes('..'))
            return { name: 'action_integrity', verdict: 'fail', detail: `path traversal in filename: ${action.filename}` };
        if (PROTECTED_WRITE_PATHS.some(p => action.filename.includes(p)))
            return { name: 'action_integrity', verdict: 'fail', detail: `protected path: ${action.filename}` };
        if (!action.content || action.content.length === 0)
            return { name: 'action_integrity', verdict: 'warn', detail: 'write_file empty content' };
        return { name: 'action_integrity', verdict: 'pass', detail: `write_file ${action.filename} (${action.content.length}b)` };
    }
    return { name: 'action_integrity', verdict: 'fail', detail: `Unknown action type: ${action.type}` };
}
function checkLevelConsistency(c) {
    if (c.level === 'fallback' && c.confidence > 0.8)
        return { name: 'level_consistency', verdict: 'warn', detail: `Fallback candidate unusually high confidence=${c.confidence.toFixed(3)}` };
    if (c.level === 'rule' && c.confidence === 0)
        return { name: 'level_consistency', verdict: 'fail', detail: 'Rule candidate has zero confidence' };
    return { name: 'level_consistency', verdict: 'pass', detail: `level=${c.level}` };
}
function validate(candidate) {
    const checks = [checkConfidenceRange(candidate), checkRiskRange(candidate), checkReasonPresent(candidate), checkActionIntegrity(candidate.action), checkLevelConsistency(candidate)];
    const verdict = checks.some(c => c.verdict === 'fail') ? 'fail' : checks.some(c => c.verdict === 'warn') ? 'warn' : 'pass';
    const proceed = verdict !== 'fail';
    const failed = checks.filter(c => c.verdict === 'fail');
    const warned = checks.filter(c => c.verdict === 'warn');
    const reason = verdict === 'fail' ? `SVE failed: ${failed.map(c => c.detail).join('; ')}` : verdict === 'warn' ? `SVE warnings: ${warned.map(c => c.detail).join('; ')}` : 'SVE passed';
    return { verdict, checks, proceed, reason };
}

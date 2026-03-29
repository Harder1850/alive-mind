"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MindLoop = void 0;
exports.think = think;
const decision_1 = require("../../../alive-constitution/contracts/decision");
const synthesize_1 = require("../decisions/synthesize");
class MindLoop {
    think(signal) {
        return think(signal);
    }
}
exports.MindLoop = MindLoop;
function think(signal) {
    const { candidate } = (0, synthesize_1.synthesize)(signal);
    const partial = {
        id: crypto.randomUUID(),
        selected_action: candidate.action,
        confidence: candidate.confidence,
        admissibility_status: 'pending',
        reason: candidate.reason,
    };
    const integrity_hash = (0, decision_1.computeDecisionIntegrityHash)(partial);
    return { ...partial, integrity_hash };
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MindLoop = void 0;
exports.think = think;
const decision_1 = require("../../../alive-constitution/contracts/decision");
class MindLoop {
    think(signal) {
        return think(signal);
    }
}
exports.MindLoop = MindLoop;
function think(signal) {
    const text = signal.raw_content.toLowerCase().trim();
    let decision;
    if (text.includes('hello')) {
        decision = {
            id: crypto.randomUUID(),
            selected_action: {
                type: 'display_text',
                payload: 'Hello from ALIVE.',
            },
            confidence: 0.9,
            admissibility_status: 'pending',
            reason: 'Matched greeting pattern.',
        };
    }
    else {
        decision = {
            id: crypto.randomUUID(),
            selected_action: {
                type: 'display_text',
                payload: `Received: ${signal.raw_content}`,
            },
            confidence: 0.6,
            admissibility_status: 'pending',
            reason: 'Default echo response for initial vertical slice.',
        };
    }
    // PATCH 2: Compute integrity hash immediately after decision creation
    const integrity_hash = (0, decision_1.computeDecisionIntegrityHash)(decision);
    return {
        ...decision,
        integrity_hash,
    };
}
//# sourceMappingURL=mind-loop.js.map
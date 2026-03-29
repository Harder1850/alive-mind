"use strict";
/**
 * Rule Store — alive-mind
 * alive-mind/src/memory/rule-store.ts
 *
 * Cognitive module. Imports contracts from alive-constitution only.
 * Does NOT execute actions. Does NOT define law.
 *
 * Level 2 in the synthesizer priority stack.
 * First match wins — evaluated in priority order (lower = higher priority).
 *
 * Slice 1 seeded rules (v16 §31.7):
 *   rule_cpu_high    — condition: cpu_utilization AND urgency > 0.7
 *   rule_disk_low    — condition: disk_available AND urgency > 0.6
 *   rule_file_change — condition: file_change_event (always)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchRule = matchRule;
exports.getAllRules = getAllRules;
const SEEDED_RULES = [
    {
        id: 'rule_cpu_high',
        description: 'Sustained high CPU utilization — log a system alert',
        priority: 1,
        confidence: 0.85,
        risk: 0.10,
        condition: (signal) => {
            if (signal.kind !== 'cpu_utilization')
                return false;
            const cpuRisk = signal.payload?.cpu_risk;
            return typeof cpuRisk === 'number' && signal.urgency > 0.7;
        },
        produce: (signal) => {
            const cpuRisk = signal.payload?.cpu_risk ?? 0;
            const usagePct = signal.payload?.usage_percent ?? 0;
            const level = cpuRisk >= 0.90 ? 'CRITICAL' : cpuRisk >= 0.80 ? 'HIGH' : 'ELEVATED';
            return {
                type: 'write_file',
                filename: 'cpu-alert.log',
                content: `[${new Date().toISOString()}] CPU ALERT — Level: ${level}\n  usage: ${usagePct.toFixed(2)}%  cpu_risk: ${cpuRisk.toFixed(4)}\n  signal_id: ${signal.id}\n`,
                is_reversible: true,
            };
        },
    },
    {
        id: 'rule_disk_low',
        description: 'Available disk space below threshold — log a system alert',
        priority: 2,
        confidence: 0.80,
        risk: 0.10,
        condition: (signal) => signal.kind === 'disk_available' && signal.urgency > 0.6,
        produce: (signal) => {
            const bytes = signal.payload?.bytes_available ?? 0;
            const gb = (bytes / 1e9).toFixed(2);
            return {
                type: 'write_file',
                filename: 'disk-alert.log',
                content: `[${new Date().toISOString()}] DISK ALERT — ${gb} GB available\n  signal_id: ${signal.id}\n`,
                is_reversible: true,
            };
        },
    },
    {
        id: 'rule_file_change',
        description: 'File change event detected — log state change',
        priority: 3,
        confidence: 0.90,
        risk: 0.05,
        condition: (signal) => signal.kind === 'file_change_event',
        produce: (signal) => {
            const filePath = signal.payload?.file_path ?? 'unknown';
            const eventType = signal.payload?.event_type ?? 'change';
            return {
                type: 'write_file',
                filename: 'file-changes.log',
                content: `[${new Date().toISOString()}] FILE ${eventType.toUpperCase()} — ${filePath}\n  signal_id: ${signal.id}\n`,
                is_reversible: true,
            };
        },
    },
];
function matchRule(signal) {
    const sorted = [...SEEDED_RULES].sort((a, b) => a.priority - b.priority);
    for (const rule of sorted) {
        try {
            if (rule.condition(signal)) {
                return { rule, action: rule.produce(signal), confidence: rule.confidence, risk: rule.risk };
            }
        }
        catch {
            continue;
        }
    }
    return null;
}
function getAllRules() {
    return [...SEEDED_RULES];
}

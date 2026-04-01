import type { DecisionPackage } from './decision-package';

export interface MindInput { signalText: string; source?: string; timestamp: number; }
export interface MindOutput { summary: string; decision: DecisionPackage | null; notes: string[]; }
export interface BaselineCycleInput { hint?: string; timestamp: number; }
export interface BaselineCycleOutput { status: 'ok' | 'deferred'; summary: string; }

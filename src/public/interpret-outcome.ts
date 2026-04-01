import type { OutcomeInterpretation } from '../contracts/outcome';
export function interpretOutcome(note: string): OutcomeInterpretation { return { summary: note }; }

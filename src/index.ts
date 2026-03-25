/**
 * ALIVE Mind — Entry Point
 * Exports the cognitive interface and core ASM components.
 */
export { think } from './spine/mind-loop';
export { StateModel } from './spine/state-model';
export type { ASMState, MindState, State } from './spine/state-model';
export { findMatchingStory, findStrongLocalMatch } from './memory/derived-memory';
export type { Story } from './memory/derived-memory';
export { evaluateNovelSignal } from './decisions/reasoning-engine';

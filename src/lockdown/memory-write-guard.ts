/**
 * Memory Write Guard — alive-mind
 * src/lockdown/memory-write-guard.ts
 *
 * Enforces the memory write protection constraint during passive/LOCKDOWN mode.
 *
 * When alive-mind is in passive mode (isPassive() === true), all memory
 * mutation operations — episodic encoding, outcome recording, reference
 * upserts, thread updates — must be suppressed.
 *
 * Read operations are always permitted. Only writes are guarded.
 *
 * Usage pattern at a write site:
 *
 *   // Void-returning write:
 *   if (!guardMemoryWrite('Phase1Memory.encode')) return;
 *   this.encoder.encode(event);
 *
 *   // Value-returning write (still need to return a plausible value):
 *   if (!guardMemoryWrite('MemoryOrchestrator.encode')) {
 *     return chooseEncodingTarget(observation);  // skip the actual writes
 *   }
 *
 * Design rules:
 *   - Imports only from alive-mind internals (no alive-runtime, alive-body)
 *   - No FS writes, no async operations
 *   - guardMemoryWrite returns boolean — callers decide how to handle false
 *   - All suppressions are logged at warn level for auditability
 */

import { isPassive } from '../spine/passive-mode';

/**
 * Check whether a memory write is permitted.
 *
 * Returns true  → write is allowed, caller should proceed.
 * Returns false → write is suppressed (passive mode active), caller should skip.
 *
 * @param context  Label identifying the write site (for audit log).
 */
export function guardMemoryWrite(context: string): boolean {
  if (isPassive()) {
    console.warn(
      `[MEMORY-WRITE-GUARD] Write suppressed at "${context}" — mind is in passive mode (LOCKDOWN).`,
    );
    return false;
  }
  return true;
}

/**
 * Assert that a memory write is permitted.
 * Throws if passive mode is active.
 *
 * Use this variant in paths where a suppressed write would leave the
 * caller in an inconsistent state — throwing is safer than silently skipping.
 *
 * @param context  Label identifying the write site.
 * @throws Error if passive mode is active.
 */
export function assertMemoryWriteAllowed(context: string): void {
  if (isPassive()) {
    throw new Error(
      `[MEMORY-WRITE-GUARD] Write refused at "${context}" — mind is in passive mode (LOCKDOWN). ` +
      `No memory mutations are permitted while the system is locked down.`,
    );
  }
}

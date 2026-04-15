/**
 * Semantic Graph — alive-mind  (Slice 3, v16 §25)
 *
 * Long-term memory stub. Stores episodes promoted by the LTG as semantic nodes.
 * Each node is keyed by kind:source (MemoryKey) — the same structural key used
 * by the episode store — so that a promoted episode and its STM counterpart
 * share a consistent identity.
 *
 * Slice 3 scope:
 *   promote(episode)         — accept a promoted episode; create or update node
 *   query(kind, source)      — return matching node if present
 *   getAll()                 — return all nodes (for diagnostics / demo trace)
 *   size()                   — node count
 *
 * Relationship traversal, edge weights, and semantic similarity search are
 * deferred to Slice 4+.  Do not add them here.
 */

import type { Episode, MemoryKey } from '../../../alive-constitution/contracts';

// ─── SemanticNode ─────────────────────────────────────────────────────────────

export interface SemanticNode {
  /** The promoted episode snapshot. Updated if the same key is promoted again. */
  episode:      Episode;
  /** Epoch ms when the first promotion occurred. Preserved on subsequent updates. */
  promoted_at:  number;
  /** Number of times this node has been queried (not promoted). */
  access_count: number;
}

// ─── SemanticGraph ────────────────────────────────────────────────────────────

export class SemanticGraph {
  private readonly nodes = new Map<MemoryKey, SemanticNode>();

  // ── promote ──────────────────────────────────────────────────────────────────

  /**
   * Accept a promoted episode from the LTG and store it as a semantic node.
   * If a node already exists for the same kind:source key, the episode snapshot
   * is updated while the original promoted_at timestamp is preserved.
   */
  promote(episode: Episode): void {
    const key: MemoryKey = `${episode.kind}:${episode.source}`;
    const existing = this.nodes.get(key);

    if (existing) {
      this.nodes.set(key, {
        ...existing,
        episode,   // refreshed snapshot
      });
      console.log(
        `[SEMANTIC-GRAPH] UPDATE  node=${key}` +
        `  mvi=${episode.mvi.toFixed(3)}  trust=${episode.trust_score.toFixed(2)}`,
      );
    } else {
      this.nodes.set(key, {
        episode,
        promoted_at:  Date.now(),
        access_count: 0,
      });
      console.log(
        `[SEMANTIC-GRAPH] PROMOTE node=${key}` +
        `  mvi=${episode.mvi.toFixed(3)}  trust=${episode.trust_score.toFixed(2)}`,
      );
    }
  }

  // ── query ────────────────────────────────────────────────────────────────────

  /**
   * Return the semantic node for the given kind + source pair, or undefined.
   * Increments access_count on each hit.
   *
   * Slice 3 stub: no relationship traversal.  Returns a direct key match only.
   */
  query(kind: string, source: string): SemanticNode | undefined {
    const key: MemoryKey = `${kind}:${source}`;
    const node = this.nodes.get(key);
    if (node) {
      node.access_count++;
    }
    return node;
  }

  // ── getAll ───────────────────────────────────────────────────────────────────

  /** Return all nodes — used for diagnostics and demo trace output. */
  getAll(): SemanticNode[] {
    return [...this.nodes.values()];
  }

  // ── size ─────────────────────────────────────────────────────────────────────

  size(): number {
    return this.nodes.size;
  }
}

// ── Module singleton ──────────────────────────────────────────────────────────

export const semanticGraph = new SemanticGraph();

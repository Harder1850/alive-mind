import type { Episode, ID } from "./memory-types";

export interface EpisodeQuery {
  entity?: ID;
  contextFragment?: string;
  fromTime?: number;
  toTime?: number;
}

export class EpisodicMemory {
  private readonly episodes: Episode[] = [];

  append(episode: Episode): void {
    this.episodes.push(episode);
  }

  list(limit = 20): Episode[] {
    return [...this.episodes].sort((a, b) => b.time - a.time).slice(0, limit);
  }

  query(input: EpisodeQuery): Episode[] {
    return this.episodes
      .filter((ep) => {
        if (input.entity && !ep.entities.includes(input.entity)) return false;
        if (input.contextFragment) {
          const frag = input.contextFragment.toLowerCase();
          const has = ep.context.some((c) => c.toLowerCase().includes(frag));
          if (!has) return false;
        }
        if (typeof input.fromTime === "number" && ep.time < input.fromTime) return false;
        if (typeof input.toTime === "number" && ep.time > input.toTime) return false;
        return true;
      })
      .sort((a, b) => b.salience - a.salience);
  }
}

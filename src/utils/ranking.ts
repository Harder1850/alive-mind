export function rankByScore<T extends { score: number }>(items: T[]): T[] { return [...items].sort((a,b) => b.score - a.score); }

export function classifyKnowledge(text: string): 'seeded' | 'injected' | 'learned' { return text.includes('inject') ? 'injected' : 'seeded'; }

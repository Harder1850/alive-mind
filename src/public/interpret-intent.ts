export function interpretIntent(text: string): { intent: string; confidence: number } { return { intent: text.trim(), confidence: 0.5 }; }

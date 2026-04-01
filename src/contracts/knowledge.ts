export type KnowledgeSource = 'seeded' | 'injected' | 'learned';
export interface KnowledgeRecord { id: string; source: KnowledgeSource; payloadRef: string; }

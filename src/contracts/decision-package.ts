export interface DecisionPackage {
  id: string;
  candidateType: string;
  rationale: string;
  confidence: number;
  risk?: number;
}

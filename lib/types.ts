export interface GameRules { maxTurns: number; thresholds: Record<string,number>; }
export interface GameRecord extends GameRules { turns:number; remaining:number; outcome:'playing'|'cleared'|'failed'; grade:string|null; bonus?:string|null; scope:string; }
export interface PublicCase {
  game?: GameRules;
  id: string;
  name: string;
  age: number;
  schoolLevel?: string;
  gender: string;
  level: number;
  color: string;
  motif: string;
  title: string;
  subtitle: string;
  interest: string;
  strength: string;
  skill: string;
  brief: string;
}

export interface Catalog {
  cases: PublicCase[];
  mode: string;
  ai?: { model?: string; label?: string } | null;
}

export interface Message {
  id: string;
  role: 'user' | 'child' | 'guide' | 'scene';
  delivery?: { initiative: boolean };
  text: string;
}

export interface Note {
  id: string;
  label: string;
  text: string;
  evidence: { childTurnId: string };
}

export interface Session {
  game?: GameRecord;
  sessionId?: string;
  recoveryToken?: string;
  case: PublicCase;
  mode: string;
  version: number;
  stage: string;
  turns: number;
  feedback: string;
  safetyHold: boolean;
  messages: Message[];
  notes: Note[];
  suggestions: string[];
  guidance?: { title: string; hint: string; checks: { id: string; label: string; done: boolean }[]; examples: string[] };
  plan: { text: string; agreed: boolean } | null;
  milestones: Record<string, boolean>;
  result: { title: string; change: string; finalResponse?: string; disclaimer: string;
    reflection?: { evidence: { label: string; text: string; messageId: string }[];
      question: string; nextStep: string; supportToConsider?: string | null; scope: string };
  } | null;
}

export type Action = { kind: 'say'; text: string } | { kind: 'support' } | { kind: 'resume' };

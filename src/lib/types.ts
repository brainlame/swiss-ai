export type Constitution = { number: number; text: string; is_sample: boolean };
export type Screenshot = {
  storage_path: string;
  display_order: number;
  url: string;
};
export type CaseRecord = {
  id: string;
  constitution_number: number;
  description: string;
  improvement: string;
  created_at: string;
  updated_at: string;
  status: string;
  version: number;
  transcript: import('#lib/chat-evidence.js').Transcript | null;
  behavior: 'good' | 'bad' | null;
  chat_prompt: string | null;
  chat_response: string | null;
  screenshots: Screenshot[];
};
export const date = (value: string) =>
  new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));

export const behaviorLabel = (value: 'good' | 'bad' | null) =>
  value === 'good'
    ? 'Good / wanted behavior'
    : value === 'bad'
      ? 'Bad / unwanted behavior'
      : 'Unclassified';

// Browse responses omit full evidence; include a proposal for useful case discussion.
export type CaseSummary = Pick<
  CaseRecord,
  | 'id'
  | 'constitution_number'
  | 'description'
  | 'improvement'
  | 'created_at'
  | 'updated_at'
  | 'status'
  | 'version'
  | 'behavior'
  | 'screenshots'
> & { discussion: import('#lib/discussion.js').Discussion | null };

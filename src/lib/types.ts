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
  chat_prompt: string | null;
  chat_response: string | null;
  screenshots: Screenshot[];
};
export const date = (value: string) =>
  new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));

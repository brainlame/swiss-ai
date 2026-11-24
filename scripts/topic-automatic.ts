import type pg from 'pg';
import { TopicError } from './topic-model.ts';
import { readClassificationContent } from './topic-synthesis.ts';

// Conservative pattern filtering, not a guarantee of anonymity or confidentiality.
export function sanitizeTopicText(text: string) {
  if (
    /(?:api[_ -]?key|password|secret|token)\s*(?:[:=]|\bis\b)\s*\S|\b(?:sk-|sb_secret_|ghp_|AKIA)[\w-]{8,}|-----BEGIN|\b(?:confidential|private information|not for sharing)\s*:/iu.test(
      text,
    )
  )
    throw new TopicError('Potential credentials or confidential content');
  return text
    .replace(/https?:\/\/[^\s<>]+|www\.[^\s<>]+/giu, '[link removed]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu, '[email removed]')
    .replace(
      /\b[\w-]{8}-[\w-]{4}-[\w-]{4}-[\w-]{4}-[\w-]{12}\b/gu,
      '[identifier removed]',
    )
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu, '[address removed]')
    .replace(
      /\b\d+\s+(?:[\p{L}]+\s+){1,4}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd)\b\.?/giu,
      '[address removed]',
    )
    .replace(/\+?\d(?:[\d .()-]*\d){6,}/gu, '[number removed]')
    .replace(/\bmy name is\s+[^.!?\n]+/giu, '[name removed]')
    .replace(/(^|\s)@[\w.-]+/gu, '$1[handle removed]')
    .trim();
}

export async function automaticManifest(db: pg.Client) {
  const rows = await readClassificationContent(db);
  return rows.map((row, index) => {
    try {
      return {
        issueId: row.id,
        fingerprint: row.fingerprint,
        // Internal payload validation flag; no human approval is implied.
        approved: true,
        description: sanitizeTopicText(row.description),
        improvement: sanitizeTopicText(row.improvement),
        principle: sanitizeTopicText(row.principle),
      };
    } catch {
      throw new TopicError(
        `Issue ${index + 1} may contain credentials or confidential text. Remove those details before retrying. Previous topics were preserved.`,
      );
    }
  });
}

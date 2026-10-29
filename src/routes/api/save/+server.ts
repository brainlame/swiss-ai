import { json, error } from '@sveltejs/kit';
import {
  validateText,
  validateTranscript,
  validateBehavior,
  UUID,
} from '#lib/validation.js';
import { selectReply } from '#lib/chatbot.js';

export const POST = async ({ locals, request, url }) => {
  if (!locals.user)
    error(
      401,
      'Your session expired. Sign in again in another tab, then retry. Your text is preserved.',
    );
  if (request.headers.get('origin') !== url.origin)
    error(403, 'Invalid request origin.');
  // Bound streamed bodies as well as requests with Content-Length.
  const reader = request.body?.getReader();
  if (!reader) error(400, 'Missing case data.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 512000) {
      await reader.cancel();
      error(
        413,
        'This conversation is too large. Start a shorter conversation.',
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    error(400, 'Invalid case data.');
  }
  if (!body || typeof body !== 'object') error(400, 'Invalid case data.');
  const { id, description, improvement, constitution, version, behavior } =
    body;
  const transcript: unknown = body.transcript ?? null;
  if (
    typeof id !== 'string' ||
    !UUID.test(id) ||
    typeof description !== 'string' ||
    typeof improvement !== 'string' ||
    !Number.isInteger(version) ||
    version < 1
  )
    error(400, 'Invalid case data.');
  try {
    validateText(description, improvement, constitution);
    validateBehavior(behavior);
    if (transcript !== null) validateTranscript(transcript);
  } catch (e) {
    error(400, (e as Error).message);
  }
  if (Array.isArray(transcript)) {
    for (let i = 0; i < transcript.length; i += 2)
      if (selectReply(transcript[i].text).text !== transcript[i + 1].text)
        error(
          400,
          'An attached reply does not match the simulated chatbot. Return to Chatbot and capture the conversation again.',
        );
  }
  const { error: e } = await locals.supabase.rpc('save_case', {
    p_id: id,
    p_version: version,
    p_constitution: constitution,
    p_description: description,
    p_improvement: improvement,
    p_transcript: transcript,
    p_behavior: behavior,
  });
  if (e)
    error(
      400,
      e.message.includes('Reload')
        ? 'This case changed in another tab. Reload before saving again.'
        : e.message.includes('read-only')
          ? 'The attached conversation is read-only. Reload before saving.'
          : 'Could not save this case. Check your session and conversation, then retry. Your text is preserved.',
    );
  return json({ id });
};

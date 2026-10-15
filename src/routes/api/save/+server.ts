import { json, error } from '@sveltejs/kit';
import {
  validateText,
  validateCount,
  validateExchange,
  UUID,
} from '#lib/validation.js';
import { selectReply } from '#lib/chatbot.js';
import { cleanup } from '#lib/server/data.js';
export const POST = async ({ locals, request, url }) => {
  if (!locals.user)
    error(
      401,
      'Your session expired. Sign in again in another tab, then retry. Your text is preserved.',
    );
  if (request.headers.get('origin') !== url.origin)
    error(403, 'Invalid request origin.');
  const body = await request.json();
  const { id, description, improvement, constitution, version, paths, stage } =
    body;
  const exchange: unknown = body.exchange ?? null;
  if (
    !UUID.test(id) ||
    typeof description !== 'string' ||
    typeof improvement !== 'string' ||
    !Number.isInteger(version) ||
    !['begin', 'commit'].includes(stage)
  )
    error(400, 'Invalid case data.');
  try {
    validateText(description, improvement, constitution);
    validateExchange(exchange);
  } catch (e) {
    error(400, (e as Error).message);
  }
  if (stage === 'begin') {
    if (exchange && selectReply(exchange.prompt).text !== exchange.response)
      error(
        400,
        'The attached response does not match this simulated chatbot exchange. Select the response again from Chatbot.',
      );
    const { data, error: e } = await locals.supabase.rpc('begin_case', {
      p_id: id,
      p_constitution: constitution,
      p_description: description,
      p_improvement: improvement,
      p_chat_prompt: exchange?.prompt ?? null,
      p_chat_response: exchange?.response ?? null,
    });
    if (e)
      error(
        400,
        'Could not start this submission. Check your session and retry.',
      );
    return json({ id: data });
  }
  if (
    !Array.isArray(paths) ||
    !paths.every((p: unknown) => typeof p === 'string')
  )
    error(400, 'Invalid screenshots.');
  const { data: existing, error: caseError } = await locals.supabase
    .from('cases')
    .select('chat_prompt,chat_response')
    .eq('id', id)
    .maybeSingle();
  if (caseError)
    error(503, 'Could not read the case evidence. Retry your save.');
  if (!existing) error(404, 'Case not found.');
  if (
    (exchange?.prompt ?? null) !== existing.chat_prompt ||
    (exchange?.response ?? null) !== existing.chat_response
  )
    error(
      400,
      'The attached chat exchange is read-only. Reload this case before saving.',
    );
  try {
    validateCount(
      paths.length,
      existing.chat_prompt !== null && existing.chat_response !== null,
    );
  } catch (e) {
    error(400, (e as Error).message);
  }
  const { data: previous, error: readError } = await locals.supabase
    .from('case_screenshots')
    .select('storage_path')
    .eq('case_id', id);
  if (readError)
    error(503, 'Could not read existing evidence. Retry your save.');
  const { error: e } = await locals.supabase.rpc('commit_case', {
    p_id: id,
    p_version: version,
    p_constitution: constitution,
    p_description: description,
    p_improvement: improvement,
    p_paths: paths,
  });
  if (e)
    error(
      400,
      e.message.includes('Reload')
        ? 'This case changed in another tab. Reload before saving again.'
        : 'Could not save the case. Check the screenshots and retry. Your text is preserved.',
    );
  const discarded = Array.isArray(body.discardedPaths)
    ? body.discardedPaths.filter(
        (p: unknown): p is string => typeof p === 'string',
      )
    : [];
  const candidates = [
    ...(previous ?? [])
      .map((s) => s.storage_path)
      .filter((p) => !paths.includes(p)),
    ...discarded,
  ];
  const cleaned = await cleanup(locals.supabase, id, candidates);
  return json({ id, cleanupWarning: !cleaned });
};

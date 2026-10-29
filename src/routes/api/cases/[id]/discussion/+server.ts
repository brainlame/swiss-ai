import { error, json } from '@sveltejs/kit';
import { UUID } from '#lib/validation.js';
import { validateComment, validateVote } from '#lib/discussion.js';
import { discussions } from '#lib/server/discussion.js';
const checkedId = (id: string) => {
  if (!UUID.test(id)) error(404, 'Case not found.');
};
export const GET = async ({ params, url, locals }) => {
  checkedId(params.id);
  if (url.searchParams.get('view') !== 'comments') {
    const data = await discussions(locals.supabase, [params.id]);
    if (!data) error(503, 'Voting and comments are unavailable. Please retry.');
    if (!data[0]) error(404, 'Case not found.');
    return json(data[0]);
  }
  const parent = url.searchParams.get('parent'),
    time = url.searchParams.get('time'),
    cursor = url.searchParams.get('cursor');
  if (
    (parent !== null && !UUID.test(parent)) ||
    !!time !== !!cursor ||
    (cursor && !UUID.test(cursor)) ||
    (time && Number.isNaN(Date.parse(time)))
  )
    error(400, 'Invalid comment page.');
  const { data, error: e } = await locals.supabase.rpc('discussion_comments', {
    p_case: params.id,
    p_parent: parent,
    p_time: time,
    p_id: cursor,
  });
  if (e)
    error(
      e.code === 'P0002' ? 404 : 503,
      'Comments could not be loaded. Please retry.',
    );
  return json(data);
};
export const POST = async ({ params, url, locals, request }) => {
  checkedId(params.id);
  if (!locals.user) error(401, 'Sign in to vote or join the discussion.');
  if (request.headers.get('origin') !== url.origin)
    error(403, 'Invalid request origin.');
  if (Number(request.headers.get('content-length')) > 16384)
    error(413, 'This comment is too long.');
  const reader = request.body?.getReader();
  if (!reader) error(400, 'Missing discussion request.');
  const decoder = new TextDecoder();
  let size = 0,
    text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) {
      await reader.cancel();
      error(413, 'This comment is too long.');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    error(400, 'Invalid discussion request.');
  }
  if (!body || typeof body !== 'object')
    error(400, 'Invalid discussion request.');
  let rpc: string, args: Record<string, unknown>;
  if (body.action === 'vote') {
    try {
      validateVote(body.value);
    } catch (e) {
      error(400, (e as Error).message);
    }
    rpc = 'vote_case';
    args = { p_case: params.id, p_value: body.value };
  } else if (body.action === 'comment') {
    try {
      validateComment(body.body);
    } catch (e) {
      error(400, (e as Error).message);
    }
    if (
      typeof body.id !== 'string' ||
      !UUID.test(body.id) ||
      (body.parent !== null &&
        (typeof body.parent !== 'string' || !UUID.test(body.parent)))
    )
      error(400, 'Invalid comment or thread.');
    rpc = 'post_case_comment';
    args = {
      p_case: params.id,
      p_id: body.id,
      p_body: body.body,
      p_parent: body.parent,
    };
  } else if (body.action === 'delete') {
    if (typeof body.id !== 'string' || !UUID.test(body.id))
      error(400, 'Invalid comment.');
    rpc = 'delete_case_comment';
    args = { p_case: params.id, p_id: body.id };
  } else error(400, 'Invalid discussion action.');
  const { data, error: e } = await locals.supabase.rpc(rpc, args);
  if (e)
    error(
      e.code === '42501' ? 403 : e.code === 'P0002' ? 404 : 400,
      e.code === '42501'
        ? body.action === 'delete'
          ? 'You can only delete your own comments.'
          : 'Your session could not be verified. Sign in again and retry.'
        : e.code === 'P0002'
          ? 'This case or thread is no longer available.'
          : 'Could not save your change. Your text is preserved; please retry.',
    );
  // Return the saved public message so a new reply is visible immediately,
  // even when older replies still have unloaded pages. No account fields.
  if (body.action === 'comment' && typeof data === 'string') {
    const { data: comment } = await locals.supabase
      .from('case_comments')
      .select('id,parent_id,body,created_at,is_deleted')
      .eq('id', data)
      .maybeSingle();
    return json({
      saved: true,
      id: data,
      comment: comment
        ? { ...comment, author: 'Anonymous', can_delete: true, reply_count: 0 }
        : null,
    });
  }
  return json({ saved: true, id: data });
};

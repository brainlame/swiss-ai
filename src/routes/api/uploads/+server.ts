import { json, error } from '@sveltejs/kit';
import { validateFile, imageSignature, UUID } from '#lib/validation.js';

export const POST = async ({ locals, request, url }) => {
  if (!locals.user)
    error(
      401,
      'Your session expired. Sign in again; your draft is kept on this page.',
    );
  if (request.headers.get('origin') !== url.origin)
    error(403, 'Invalid request origin.');
  const length = Number(request.headers.get('content-length'));
  if (length > 11 * 1024 * 1024)
    error(413, 'Each image must be no larger than 10 MB.');
  const form = await request.formData(),
    file = form.get('file'),
    id = String(form.get('caseId'));
  if (!(file instanceof File) || !UUID.test(id))
    error(400, 'Choose an image for this case.');
  try {
    validateFile(file);
  } catch (e) {
    error(400, (e as Error).message);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!imageSignature(bytes, file.type))
    error(
      400,
      'The image contents do not match its format. Export it as PNG, JPEG, or WebP.',
    );
  const { data: path, error: e } = await locals.supabase.rpc('reserve_upload', {
    p_case: id,
    p_mime: file.type,
    p_size: file.size,
  });
  if (e)
    error(
      400,
      'Upload could not be reserved. Check your session and try again.',
    );
  const { error: uploadError } = await locals.supabase.storage
    .from('screenshots')
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) {
    await locals.supabase.storage.from('screenshots').remove([path]);
    await locals.supabase.rpc('prune_uploads', { p_id: id });
    error(500, 'Image upload failed. Check your connection and retry.');
  }
  return json({ path });
};

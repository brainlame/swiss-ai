import { fail, redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/data.js';
import { myProfile } from '#lib/server/profiles.js';
import { validateNames, avatarBytes } from '#lib/profile.js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$app/env/private';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';
import { createClient } from '@supabase/supabase-js';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = async (event) => {
  requireUser(event);
  return { profile: await myProfile(event.locals.supabase) };
};
export const actions: Actions = {
  save: async (event) => {
    requireUser(event);
    const db = event.locals.supabase;
    const form = await event.request.formData();
    const first = form.get('first_name'),
      last = form.get('last_name');
    const values = {
      first_name: typeof first === 'string' ? first : '',
      last_name: typeof last === 'string' ? last : '',
    };
    let names;
    let bytes: Uint8Array | undefined;
    const file = form.get('picture');
    try {
      names = validateNames(first, last);
      if (
        file instanceof File &&
        file.size &&
        form.get('remove_picture') !== 'on'
      )
        bytes = await avatarBytes(file);
    } catch (e) {
      return fail(400, { ...values, message: (e as Error).message });
    }
    const current = await myProfile(db);
    let path = form.get('remove_picture') === 'on' ? null : current.avatar_path;
    let pending: string | null = null;
    if (bytes && file instanceof File) {
      const reserved = await db.rpc('reserve_avatar', {
        p_mime: file.type,
        p_size: bytes.length,
      });
      if (reserved.error)
        return fail(400, {
          ...values,
          message:
            'Picture could not be prepared. Save without a new picture once, then select it again and retry.',
        });
      pending = reserved.data;
      path = pending;
      const upload = await db.storage
        .from('avatars')
        .upload(path!, bytes, { contentType: file.type, upsert: false });
      if (upload.error) {
        await db.rpc('prune_avatars');
        return fail(503, {
          ...values,
          message: 'Picture upload failed. Select it again and retry.',
        });
      }
    }
    const saved = await db.rpc('save_profile', {
      p_first: names.first,
      p_last: names.last,
      p_avatar: path,
    });
    if (saved.error) {
      if (pending) await db.storage.from('avatars').remove([pending]);
      await db.rpc('prune_avatars');
      return fail(400, {
        ...values,
        message: 'Profile could not be saved. Your text is preserved; retry.',
      });
    }
    const paths = await db.rpc('my_avatar_paths');
    const unused = (paths.data ?? []).filter((p: string) => p !== path);
    const cleanup = unused.length
      ? await db.storage.from('avatars').remove(unused)
      : { error: null };
    await db.rpc('prune_avatars');
    return {
      ...values,
      success: true,
      message: cleanup.error
        ? 'Profile saved. An old picture could not be removed; save again to retry cleanup.'
        : 'Profile saved.',
    };
  },
  delete: async (event) => {
    const user = requireUser(event);
    const form = await event.request.formData();
    if (form.get('confirmation') !== 'DELETE')
      return fail(400, {
        deleteError: 'Type DELETE to confirm account deletion.',
      });
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return fail(503, {
        deleteError:
          'Account deletion is not configured. Contact the site owner.',
      });
    const admin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const paths = await event.locals.supabase.rpc('my_avatar_paths');
    if (paths.error)
      return fail(503, {
        deleteError: 'Could not prepare account deletion. Retry.',
      });
    if (paths.data?.length) {
      const removed = await admin.storage.from('avatars').remove(paths.data);
      if (removed.error)
        return fail(503, {
          deleteError:
            'Profile picture cleanup failed. Your account has not been deleted; retry.',
        });
    }
    const released = await admin.rpc('release_account_storage', {
      p_user: user.id,
    });
    if (released.error)
      return fail(503, {
        deleteError:
          'Could not prepare issue evidence. Your account has not been deleted; retry.',
      });
    const deleted = await admin.auth.admin.deleteUser(user.id);
    if (deleted.error)
      return fail(503, {
        deleteError:
          'Account deletion could not be confirmed. Refresh the page before retrying. Your profile picture may already have been removed.',
      });
    await event.locals.supabase.auth.signOut();
    redirect(303, '/signin?accountDeleted=1');
  },
};

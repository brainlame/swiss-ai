import type { SupabaseClient } from '@supabase/supabase-js';
import { error } from '@sveltejs/kit';
export async function avatarUrls<T>(db: SupabaseClient, value: T): Promise<T> {
  const paths = new Set<string>();
  const visit = (v: any) => {
    if (!v || typeof v !== 'object') return;
    if (typeof v.avatar_path === 'string') paths.add(v.avatar_path);
    Object.values(v).forEach(visit);
  };
  visit(value);
  const { data, error: e } = paths.size
    ? await db.storage.from('avatars').createSignedUrls([...paths], 3600)
    : { data: [], error: null };
  if (e) error(503, 'Profile pictures could not be loaded.');
  const attach = (v: any): any => {
    if (!v || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(attach);
    return {
      ...Object.fromEntries(
        Object.entries(v).map(([k, item]) => [k, attach(item)]),
      ),
      ...('avatar_path' in v
        ? {
            avatar_url:
              data?.find((item) => item.path === v.avatar_path)?.signedUrl ??
              null,
          }
        : {}),
    };
  };
  return attach(value);
}
export async function myProfile(db: SupabaseClient) {
  const { data, error: e } = await db.rpc('my_profile');
  if (e)
    error(
      503,
      'Profile could not be loaded. Apply the profile migration and retry.',
    );
  return avatarUrls(
    db,
    data as {
      first_name: string;
      last_name: string;
      avatar_path: string | null;
      avatar_url?: string | null;
    },
  );
}

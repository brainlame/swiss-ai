import { constitutions } from '#lib/server/data.js';
export const load = async ({ locals }: { locals: App.Locals }) => ({
  constitutions: await constitutions(locals.supabase),
});

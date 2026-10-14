import { defineEnvVars } from '@sveltejs/kit/env';
export const variables = defineEnvVars({
  PUBLIC_SUPABASE_URL: {
    public: true,
    schema: (v) => {
      if (!v) throw new Error('Set PUBLIC_SUPABASE_URL');
      return new URL(v).origin;
    },
  },
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
    public: true,
    schema: (v) => {
      if (!v) throw new Error('Set PUBLIC_SUPABASE_PUBLISHABLE_KEY');
      return v;
    },
  },
  SUPABASE_SERVICE_ROLE_KEY: { schema: (v) => v ?? '' },
  CLEANUP_SECRET: { schema: (v) => v ?? '' },
});

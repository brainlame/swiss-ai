import { createClient } from '@supabase/supabase-js';
import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_PUBLISHABLE_KEY,
} from '$app/env/public';

// Subscribe only to an identity-free revision row, never cases, ballots or owners.
// Polling closes reconnect gaps and keeps the overview fresh without WebSockets.
export function watchIssueOverview(
  refresh: () => void,
  connection: (live: boolean) => void,
) {
  const db = createClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  let pending: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (document.hidden || pending) return;
    pending = setTimeout(() => {
      pending = undefined;
      refresh();
    }, 150);
  };
  const channel = db
    .channel('public-issue-overview')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'issue_feed_state' },
      schedule,
    )
    .subscribe((status) => {
      connection(status === 'SUBSCRIBED');
      if (status === 'SUBSCRIBED') schedule();
    });
  const timer = setInterval(schedule, 10000);
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('online', schedule);
  window.addEventListener('focus', schedule);
  return () => {
    clearInterval(timer);
    clearTimeout(pending);
    document.removeEventListener('visibilitychange', schedule);
    window.removeEventListener('online', schedule);
    window.removeEventListener('focus', schedule);
    void db.removeChannel(channel);
  };
}

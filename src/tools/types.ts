/**
 * Per-request user context. Built once at the top of every fetch handler
 * (after auth resolves the user) and threaded into each tool registration
 * so DB queries naturally scope to one user.
 */
export interface UserContext {
  db: D1Database;
  userId: string;
  timezone: string;
  userDisplayName: string; // for inclusion in tool replies and prompt context
}

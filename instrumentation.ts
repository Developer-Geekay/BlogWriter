/**
 * Startup checks.
 *
 * Next calls `register()` once when the server boots. The point is to say
 * something at boot about configuration that otherwise only fails much later,
 * on someone's third attempt to sign in.
 *
 * Nothing here throws. A misconfigured admin side should not stop the public
 * site from serving — readers do not need a session secret — so these are loud
 * log lines, not a refusal to start.
 */
export async function register() {
  // Runs in both the Node and Edge runtimes; the message only needs saying once.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.error(
      '[startup] SESSION_SECRET is not set. Sign-in will fail and every admin ' +
        'request will redirect to the login page. Generate one with: openssl rand -hex 32',
    );
  } else if (secret.length < 32) {
    console.error(
      `[startup] SESSION_SECRET is ${secret.length} characters; at least 32 are required. ` +
        'Sign-in will fail until it is longer.',
    );
  }

  if (!process.env.MONGODB_URI) {
    console.error(
      '[startup] MONGODB_URI is not set. Pages will render a "database is not ' +
        'reachable" notice and sign-in will report storage as unavailable.',
    );
  }
}

import { MongoClient, type Db } from 'mongodb';

/**
 * Connection string comes from the environment so the same build runs against a
 * local mongod, Atlas, or a test container without a rebuild.
 */
export const MONGODB_URI_ENV = 'MONGODB_URI';
export const MONGODB_DB_ENV = 'MONGODB_DB';

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

let client: MongoClient | null = null;
let db: Db | null = null;
let connecting: Promise<Db> | null = null;

function uri(): string {
  const value = process.env[MONGODB_URI_ENV];
  if (!value || value.trim() === '') {
    throw new DatabaseError(
      `Missing ${MONGODB_URI_ENV}. Set it in .env — for a local server that is ` +
        'usually mongodb://127.0.0.1:27017, or paste an Atlas connection string.',
    );
  }
  return value;
}

/**
 * Which server and database this process will actually use, with credentials
 * stripped so it is safe to print.
 *
 * "The same data" living in two places that disagree is nearly always this:
 * `MONGODB_DB` silently overriding the URI path, or a URI with no path at all,
 * which the driver resolves to `test`. Neither is visible by reading the
 * connection string alone, so `npm run status` reports the resolved answer.
 */
export function describeConnection(): { host: string; database: string } {
  const connectionString = uri();

  let host = 'unknown';
  let fromPath = '';
  try {
    // Works for mongodb:// and mongodb+srv://. A seed list of several hosts is
    // not a valid URL authority, hence the fallback below.
    const parsed = new URL(connectionString);
    host = parsed.host;
    fromPath = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)(?:\/([^?]*))?/.exec(
      connectionString,
    );
    if (match) {
      host = match[1] ?? 'unknown';
      fromPath = match[2] ?? '';
    }
  }

  const named = process.env[MONGODB_DB_ENV];
  const database = named
    ? `${named} (from ${MONGODB_DB_ENV}${fromPath ? `, overriding "${fromPath}" in the URI` : ''})`
    : fromPath || 'test (the URI has no database in its path)';

  return { host, database };
}

/**
 * Shared connection.
 *
 * Next.js reloads modules on every edit in development, so the client is cached
 * on `globalThis` — without that, each hot reload opens another pool and the
 * server runs out of connections after a few dozen saves.
 */
const globalCache = globalThis as typeof globalThis & {
  __blogwriterMongo?: { client: MongoClient; db: Db };
};

export async function getDb(): Promise<Db> {
  if (db) return db;
  if (globalCache.__blogwriterMongo) {
    ({ client, db } = globalCache.__blogwriterMongo);
    return db;
  }
  if (connecting) return connecting;

  connecting = (async () => {
    const connectionString = uri();
    try {
      client = await MongoClient.connect(connectionString, {
        serverSelectionTimeoutMS: 5_000,
      });
    } catch (err) {
      connecting = null;
      throw new DatabaseError(
        `Could not reach MongoDB: ${(err as Error).message}\n` +
          `Check ${MONGODB_URI_ENV} and that the server is running.`,
      );
    }
    // MONGODB_DB wins when set; otherwise the driver uses the URI path, and a
    // URI with no path lands in `test`. See describeConnection().
    const named = process.env[MONGODB_DB_ENV];
    db = named ? client.db(named) : client.db();
    await ensureIndexes(db);
    if (process.env.NODE_ENV !== 'production') {
      globalCache.__blogwriterMongo = { client, db };
    }
    return db;
  })();

  return connecting;
}

/**
 * Indexes are created on first connect rather than in a migration step, so a
 * fresh database is correct the moment the app boots.
 */
async function ensureIndexes(database: Db): Promise<void> {
  await Promise.all([
    database.collection('posts').createIndex({ slug: 1 }, { unique: true }),
    database.collection('posts').createIndex({ status: 1, publishedAt: -1 }),
    database.collection('posts').createIndex({ tags: 1 }),
    // Powers the search box in the admin list and the public search.
    database
      .collection('posts')
      .createIndex({ title: 'text', excerpt: 'text', body: 'text' }, { name: 'post_text' }),
    database.collection('users').createIndex({ email: 1 }, { unique: true }),
  ]);
}

/** Close the pool. Used by tests and by the CLI on shutdown. */
export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
  connecting = null;
  delete globalCache.__blogwriterMongo;
}

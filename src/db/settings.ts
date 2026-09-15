import { randomBytes } from 'node:crypto';
import type { Collection, Db } from 'mongodb';
import { getDb } from './client.js';
import { SettingsSchema, type PublicSettings, type Settings } from './types.js';

/** One document holds all portal settings; this is its fixed key. */
const SINGLETON = 'portal';

interface SettingsDocument extends Partial<Settings> {
  _id: string;
}

export class SettingsStore {
  private constructor(private readonly settings: Collection<SettingsDocument>) {}

  static async open(db?: Db): Promise<SettingsStore> {
    const database = db ?? (await getDb());
    return new SettingsStore(database.collection<SettingsDocument>('settings'));
  }

  /** Reads the singleton, filling in defaults for a database that has none yet. */
  async get(): Promise<Settings> {
    const doc = await this.settings.findOne({ _id: SINGLETON });
    const { _id, ...rest } = doc ?? { _id: SINGLETON };
    return SettingsSchema.parse(rest);
  }

  /** Same, minus the bearer token — safe to hand to a page or a client. */
  async getPublic(): Promise<PublicSettings> {
    const { mcpToken, ...rest } = await this.get();
    return { ...rest, hasMcpToken: Boolean(mcpToken) };
  }

  /**
   * Apply a partial change.
   *
   * The document is still read first, because the schema validates a whole
   * settings object and fills defaults for a database that has none yet — but
   * only the keys the caller actually passed are written back.
   *
   * Writing the merged document wholesale, as this used to, turns every save
   * into a read-modify-write over *all* settings: two requests overlapping —
   * one changing the site title, one toggling the MCP endpoint — would each
   * write the whole object from its own stale read, and whichever landed second
   * would silently revert the other. Saving the accent could switch MCP back
   * off. Scoping `$set` to the patched keys means concurrent edits to different
   * fields no longer collide, and edits to the same field resolve as
   * last-write-wins, which is the right answer for a single operator.
   */
  async update(patch: Partial<Settings>): Promise<Settings> {
    const updatedAt = new Date().toISOString();
    const parsed = SettingsSchema.parse({ ...(await this.get()), ...patch, updatedAt });

    const changed = Object.fromEntries(
      // Take the validated value rather than the raw input, so defaults and
      // coercions applied by the schema are what reach the database.
      Object.keys(patch).map((key) => [key, parsed[key as keyof Settings]]),
    );

    await this.settings.updateOne(
      { _id: SINGLETON },
      { $set: { ...changed, updatedAt } },
      { upsert: true },
    );
    return parsed;
  }

  /**
   * Turning MCP on without a token would leave the endpoint open, so mint one
   * in the same operation the first time it is enabled.
   */
  async setMcpEnabled(enabled: boolean): Promise<Settings> {
    const current = await this.get();
    if (enabled && !current.mcpToken) {
      return this.update({ mcpEnabled: true, mcpToken: generateToken() });
    }
    return this.update({ mcpEnabled: enabled });
  }

  /** Replace the token; any external portal using the old one stops working. */
  async rotateMcpToken(): Promise<string> {
    const token = generateToken();
    await this.update({ mcpToken: token });
    return token;
  }
}

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

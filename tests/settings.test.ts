import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../src/db/settings.js';
import { SettingsSchema, type Settings } from '../src/db/types.js';

/**
 * A stand-in for the settings collection.
 *
 * Only `findOne` and `updateOne` are used, and the point of the fake is to
 * record exactly which keys each write touched — which is the behaviour under
 * test, and the thing a real MongoDB would hide behind a correct-looking result.
 */
function fakeCollection(initial: Partial<Settings> = {}) {
  let doc: Record<string, unknown> = { _id: 'portal', ...initial };
  const writes: Record<string, unknown>[] = [];

  return {
    writes,
    current: () => doc,
    collection: {
      async findOne() {
        return doc;
      },
      async updateOne(_filter: unknown, update: { $set: Record<string, unknown> }) {
        writes.push(update.$set);
        doc = { ...doc, ...update.$set };
        return { acknowledged: true };
      },
    },
  };
}

const open = (fake: ReturnType<typeof fakeCollection>) =>
  // The constructor is private; `open` takes a Db, so hand it one that returns
  // the fake for any collection name.
  SettingsStore.open({ collection: () => fake.collection } as never);

describe('SettingsStore.update', () => {
  it('writes only the keys it was given', async () => {
    const fake = fakeCollection({ siteTitle: 'Before', mcpEnabled: true });
    const store = await open(fake);

    await store.update({ siteTitle: 'After' });

    // `updatedAt` always moves; nothing else should.
    expect(Object.keys(fake.writes[0]!).sort()).toEqual(['siteTitle', 'updatedAt']);
  });

  it('does not revert a field another request changed', async () => {
    // The regression that motivated this. Saving one setting used to write the
    // whole document back from a stale read, so a concurrent change to an
    // unrelated field was silently undone — saving the site title could switch
    // the MCP endpoint off.
    const fake = fakeCollection({ siteTitle: 'Before', mcpEnabled: false });
    const store = await open(fake);

    // Someone enables MCP in the window between this store's read and its
    // write. `findOne` hands back the pre-change snapshot, exactly as a real
    // read that raced would.
    fake.collection.findOne = async () => {
      const snapshot = { ...fake.current() };
      fake.current().mcpEnabled = true;
      return snapshot;
    };

    await store.update({ siteTitle: 'After' });

    expect(fake.current().siteTitle).toBe('After');
    expect(fake.current().mcpEnabled, 'the concurrent change was reverted').toBe(true);
  });

  it('still fills schema defaults for a database with no settings yet', async () => {
    const fake = fakeCollection();
    const store = await open(fake);

    const result = await store.update({ siteTitle: 'Fresh' });

    expect(result.siteTitle).toBe('Fresh');
    expect(result).toEqual(SettingsSchema.parse({ ...result }));
    // Defaults are returned to the caller but not forced into the write, which
    // is what keeps the update narrow.
    expect(Object.keys(fake.writes[0]!).sort()).toEqual(['siteTitle', 'updatedAt']);
  });

  it('writes the validated value, not the raw input', async () => {
    const fake = fakeCollection();
    const store = await open(fake);

    await store.update({ siteAccent: 'teal' });

    expect(fake.writes[0]!['siteAccent']).toBe('teal');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { describeConnection } from '../src/db/client.js';

const originalUri = process.env['MONGODB_URI'];
const originalDb = process.env['MONGODB_DB'];

function connect(uri: string, dbName?: string) {
  process.env['MONGODB_URI'] = uri;
  if (dbName === undefined) delete process.env['MONGODB_DB'];
  else process.env['MONGODB_DB'] = dbName;
  return describeConnection();
}

afterEach(() => {
  if (originalUri === undefined) delete process.env['MONGODB_URI'];
  else process.env['MONGODB_URI'] = originalUri;
  if (originalDb === undefined) delete process.env['MONGODB_DB'];
  else process.env['MONGODB_DB'] = originalDb;
});

describe('describeConnection', () => {
  it('reads the database out of the URI path', () => {
    const { host, database } = connect('mongodb://127.0.0.1:27017/blog');
    expect(host).toBe('127.0.0.1:27017');
    expect(database).toBe('blog');
  });

  it('names the silent default when the URI has no path', () => {
    // The driver quietly uses `test` here, which is the usual reason a restored
    // dump is "missing".
    expect(connect('mongodb://127.0.0.1:27017').database).toMatch(/^test\b/);
  });

  it('reports MONGODB_DB overriding the URI path', () => {
    const { database } = connect('mongodb://127.0.0.1:27017/blog', 'other');
    expect(database).toContain('other');
    expect(database).toContain('overriding');
    expect(database).toContain('blog');
  });

  it('never exposes credentials', () => {
    const { host, database } = connect('mongodb+srv://admin:hunter2@cluster.mongodb.net/blog');
    expect(host).toBe('cluster.mongodb.net');
    expect(database).toBe('blog');
    expect(`${host} ${database}`).not.toContain('hunter2');
  });

  it('handles a multi-host seed list, which is not a parsable URL', () => {
    const { host, database } = connect('mongodb://a.example:27017,b.example:27017/blog');
    expect(host).toBe('a.example:27017,b.example:27017');
    expect(database).toBe('blog');
  });

  it('ignores query options after the database name', () => {
    expect(connect('mongodb://h:27017/blog?replicaSet=rs0').database).toBe('blog');
  });
});

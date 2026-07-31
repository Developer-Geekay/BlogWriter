import { ObjectId, type Collection, type Db, type WithId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { getDb } from './client.js';
import type { User } from './types.js';

interface UserDocument {
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
}

const BCRYPT_ROUNDS = 12;

function toUser(doc: WithId<UserDocument>): User {
  return {
    id: doc._id.toHexString(),
    email: doc.email,
    name: doc.name,
    passwordHash: doc.passwordHash,
    createdAt: doc.createdAt.toISOString(),
  };
}

export class UserStore {
  private constructor(private readonly users: Collection<UserDocument>) {}

  static async open(db?: Db): Promise<UserStore> {
    const database = db ?? (await getDb());
    return new UserStore(database.collection<UserDocument>('users'));
  }

  async count(): Promise<number> {
    return this.users.countDocuments();
  }

  async findByEmail(email: string): Promise<User | null> {
    const doc = await this.users.findOne({ email: email.trim().toLowerCase() });
    return doc ? toUser(doc) : null;
  }

  async findById(id: string): Promise<User | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await this.users.findOne({ _id: new ObjectId(id) });
    return doc ? toUser(doc) : null;
  }

  async create(input: { email: string; name: string; password: string }): Promise<User> {
    const doc: UserDocument = {
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      createdAt: new Date(),
    };
    const result = await this.users.insertOne(doc);
    return toUser({ ...doc, _id: result.insertedId });
  }

  /**
   * Verify a login.
   *
   * When the email is unknown we still run a bcrypt comparison against a dummy
   * hash, so a missing account and a wrong password take the same time and the
   * response cannot be used to enumerate valid emails.
   */
  async verify(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmail(email);
    if (!user) {
      await bcrypt.compare(password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
      return null;
    }
    return (await bcrypt.compare(password, user.passwordHash)) ? user : null;
  }

  async setPassword(id: string, password: string): Promise<void> {
    await this.users.updateOne(
      { _id: new ObjectId(id) },
      { $set: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) } },
    );
  }
}

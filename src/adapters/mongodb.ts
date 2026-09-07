/*
 * Helvetium Alps - Helvetium Framework, A Newfoundcodes project.
 *
 * Copyright (C) 2026 Jonathan Eldy Baldivicio
 *
 * Author: Jonathan Eldy Baldivicio
 * Contact: jonathaneldy.baldivicio@newfoundcodes.com
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import type {
  DatabaseHealth,
  DocumentAdapter,
  DocumentCollectionAdapter,
  DocumentFilter,
  DocumentFindOptions,
  DocumentUpdate,
  SortDirection,
  TransactionOptions,
} from '../types.js';
import type {
  MongoCollectionLike,
  MongoDbLike,
  MongoSessionLike,
  MongoClientLike,
} from '../interfaces/adapters/mongodb.js';

export type {
  MongoCursorLike,
  MongoCollectionLike,
  MongoDbLike,
  MongoSessionLike,
  MongoClientLike,
} from '../interfaces/adapters/mongodb.js';

class MongoCollectionAdapter<
  T extends Record<string, unknown>,
> implements DocumentCollectionAdapter<T> {
  constructor(
    private readonly collection: MongoCollectionLike<T>,
    private readonly session?: MongoSessionLike,
  ) {}

  private options(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return this.session ? { ...extra, session: this.session } : { ...extra };
  }

  async find(filter: DocumentFilter<T> = {}, options: DocumentFindOptions<T> = {}): Promise<T[]> {
    let cursor = this.collection.find(filter as Record<string, unknown>, this.options());
    if (options.sort && cursor.sort) {
      cursor = cursor.sort(
        Object.fromEntries(
          Object.entries(options.sort).map(([k, v]) => [k, v === -1 || v === 'desc' ? -1 : 1]),
        ),
      );
    }

    if (options.skip && cursor.skip) {
      cursor = cursor.skip(options.skip);
    }

    if (options.limit !== undefined && cursor.limit) {
      cursor = cursor.limit(options.limit);
    }

    if (options.projection && cursor.project) {
      cursor = cursor.project(options.projection as Record<string, 0 | 1>);
    }

    return cursor.toArray();
  }

  findOne(filter: DocumentFilter<T>) {
    return this.collection.findOne(filter as Record<string, unknown>, this.options());
  }

  async insertOne(document: T) {
    const result = await this.collection.insertOne(document, this.options());
    return { id: (result as { insertedId?: unknown })?.insertedId, document };
  }

  async insertMany(documents: T[]) {
    const r = await this.collection.insertMany(documents, this.options());
    return {
      insertedCount: Number((r as { insertedCount?: number })?.insertedCount ?? documents.length),
    };
  }

  async updateOne(
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T> | Partial<T>,
    options: { upsert?: boolean } = {},
  ) {
    const r = (await this.collection.updateOne(
      filter as Record<string, unknown>,
      update as Record<string, unknown>,
      this.options(options),
    )) as { matchedCount?: number; modifiedCount?: number; upsertedId?: unknown };
    return {
      matchedCount: Number(r?.matchedCount ?? 0),
      modifiedCount: Number(r?.modifiedCount ?? 0),
      ...(r?.upsertedId === undefined ? {} : { upsertedId: r.upsertedId }),
    };
  }

  async updateMany(filter: DocumentFilter<T>, update: DocumentUpdate<T> | Partial<T>) {
    const r = (await this.collection.updateMany(
      filter as Record<string, unknown>,
      update as Record<string, unknown>,
      this.options(),
    )) as { matchedCount?: number; modifiedCount?: number };
    return {
      matchedCount: Number(r?.matchedCount ?? 0),
      modifiedCount: Number(r?.modifiedCount ?? 0),
    };
  }

  async deleteOne(filter: DocumentFilter<T>) {
    const r = (await this.collection.deleteOne(
      filter as Record<string, unknown>,
      this.options(),
    )) as { deletedCount?: number };
    return { deletedCount: Number(r?.deletedCount ?? 0) };
  }

  async deleteMany(filter: DocumentFilter<T>) {
    const r = (await this.collection.deleteMany(
      filter as Record<string, unknown>,
      this.options(),
    )) as { deletedCount?: number };
    return { deletedCount: Number(r?.deletedCount ?? 0) };
  }

  count(filter: DocumentFilter<T> = {}) {
    return this.collection.countDocuments(filter as Record<string, unknown>, this.options());
  }

  createIndex(definition: Record<string, SortDirection>, options?: Record<string, unknown>) {
    if (!this.collection.createIndex) {
      return Promise.reject(new Error('Mongo client does not expose createIndex'));
    }

    return this.collection.createIndex(
      Object.fromEntries(
        Object.entries(definition).map(([k, v]) => [k, v === -1 || v === 'desc' ? -1 : 1]),
      ),
      this.options(options ?? {}),
    );
  }
}

export class MongoDocumentAdapter implements DocumentAdapter {
  readonly kind = 'document' as const;
  readonly capabilities;

  constructor(
    private readonly db: MongoDbLike,
    private readonly client?: MongoClientLike,
    private readonly session?: MongoSessionLike,
  ) {
    this.capabilities = {
      transactions: Boolean(client?.startSession),
      secondaryIndexes: true,
      bulkWrite: true,
      watch: true,
    };
  }

  collection<T extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
  ): DocumentCollectionAdapter<T> {
    return new MongoCollectionAdapter(this.db.collection<T>(name), this.session);
  }

  async transaction<T>(
    fn: (tx: DocumentAdapter) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    if (!this.client?.startSession) {
      throw new Error('Mongo client does not support sessions');
    }

    const session = this.client.startSession();
    const tx = new MongoDocumentAdapter(this.db, this.client, session);
    try {
      if (session.withTransaction) {
        return await session.withTransaction(() => fn(tx), {
          ...(options.isolation ? { readConcern: { level: options.isolation } } : {}),
        });
      }

      session.startTransaction?.();
      try {
        const out = await fn(tx);
        await session.commitTransaction?.();
        return out;
      } catch (e) {
        await session.abortTransaction?.();
        throw e;
      }
    } finally {
      await session.endSession?.();
    }
  }

  async health(): Promise<DatabaseHealth> {
    const start = performance.now();
    try {
      await this.db.command?.({ ping: 1 });
      return { ok: true, latencyMs: performance.now() - start };
    } catch (e) {
      return { ok: false, latencyMs: performance.now() - start, details: { error: String(e) } };
    }
  }

  async close(): Promise<void> {
    if (!this.session) {
      await this.client?.close?.();
    }
  }
}

export function mongodb(db: MongoDbLike, client?: MongoClientLike) {
  return new MongoDocumentAdapter(db, client);
}

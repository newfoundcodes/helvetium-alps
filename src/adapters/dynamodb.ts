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
} from '../types.js';
import type { DynamoClientLike, DynamoOptions } from '../interfaces/adapters/dynamodb.js';

export type {
  DynamoPage,
  DynamoClientLike,
  DynamoOptions,
} from '../interfaces/adapters/dynamodb.js';

class DynamoCollection<T extends Record<string, unknown>> implements DocumentCollectionAdapter<T> {
  private readonly partitionKey: string;
  private readonly sortKey: string | undefined;

  constructor(
    private readonly table: string,
    private readonly client: DynamoClientLike,
    options: DynamoOptions = {},
  ) {
    this.partitionKey = options.partitionKey ?? 'id';
    this.sortKey = options.sortKey;
  }

  private key(doc: Record<string, unknown>): Record<string, unknown> {
    if (doc[this.partitionKey] === undefined) {
      throw new Error(`DynamoDB operation requires ${this.partitionKey}`);
    }

    const out: Record<string, unknown> = { [this.partitionKey]: doc[this.partitionKey] };
    if (this.sortKey && doc[this.sortKey] !== undefined) {
      out[this.sortKey] = doc[this.sortKey];
    }

    return out;
  }

  async find(filter: DocumentFilter<T> = {}, options: DocumentFindOptions<T> = {}): Promise<T[]> {
    let rows: T[] = [];
    let startKey: Record<string, unknown> | undefined;

    do {
      const page = await this.client.scan<T>(this.table, {
        filter,
        ...(options.limit === undefined ? {} : { limit: Math.max(options.limit - rows.length, 1) }),
        ...(startKey ? { startKey } : {}),
      });

      rows.push(...page.items);
      startKey = page.lastKey;

      if (options.limit !== undefined && rows.length >= options.limit) {
        break;
      }
    } while (startKey);

    if (options.skip) {
      rows = rows.slice(options.skip);
    }

    if (options.limit !== undefined) {
      rows = rows.slice(0, options.limit);
    }

    return rows;
  }

  async findOne(filter: DocumentFilter<T>): Promise<T | null> {
    const f = filter as Record<string, unknown>;
    if (
      f[this.partitionKey] !== undefined &&
      (this.sortKey ? f[this.sortKey] !== undefined : true)
    ) {
      return (await this.client.get(this.table, this.key(f))) as T | null;
    }

    return (await this.find(filter, { limit: 1 }))[0] ?? null;
  }

  async insertOne(document: T) {
    await this.client.put(this.table, document);
    return { id: (document as Record<string, unknown>)[this.partitionKey], document };
  }

  async insertMany(documents: T[]) {
    if (this.client.transactWrite && documents.length <= 100) {
      await this.client.transactWrite(
        documents.map((item) => ({ put: { table: this.table, item } })),
      );
      return { insertedCount: documents.length };
    }

    for (const d of documents) {
      await this.client.put(this.table, d);
    }

    return { insertedCount: documents.length };
  }

  async updateOne(
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T> | Partial<T>,
    options: { upsert?: boolean } = {},
  ) {
    const found = await this.findOne(filter);
    if (!found) {
      if (!options.upsert) {
        return { matchedCount: 0, modifiedCount: 0 };
      }

      const base = {
        ...(filter as Record<string, unknown>),
        ...((update as { $set?: Record<string, unknown> }).$set ?? update),
      } as unknown as T;
      await this.insertOne(base);
      return {
        matchedCount: 0,
        modifiedCount: 0,
        upsertedId: (base as Record<string, unknown>)[this.partitionKey],
      };
    }

    const result = await this.client.update(
      this.table,
      this.key(found),
      update as Record<string, unknown>,
    );
    return { matchedCount: 1, modifiedCount: result ? 1 : 0 };
  }

  async updateMany(filter: DocumentFilter<T>, update: DocumentUpdate<T> | Partial<T>) {
    const rows = await this.find(filter);
    let n = 0;

    for (const row of rows) {
      await this.client.update(this.table, this.key(row), update as Record<string, unknown>);
      n++;
    }

    return { matchedCount: n, modifiedCount: n };
  }

  async deleteOne(filter: DocumentFilter<T>) {
    const row = await this.findOne(filter);
    if (!row) {
      return { deletedCount: 0 };
    }

    return { deletedCount: (await this.client.delete(this.table, this.key(row))) ? 1 : 0 };
  }

  async deleteMany(filter: DocumentFilter<T>) {
    const rows = await this.find(filter);
    let n = 0;

    for (const row of rows) {
      if (await this.client.delete(this.table, this.key(row))) {
        n++;
      }
    }

    return { deletedCount: n };
  }

  async count(filter: DocumentFilter<T> = {}) {
    return (await this.find(filter)).length;
  }
}

export class DynamoDocumentAdapter implements DocumentAdapter {
  readonly kind = 'document' as const;
  readonly capabilities = {
    transactions: false,
    secondaryIndexes: true,
    ttl: true,
    bulkWrite: true,
  };

  constructor(
    private readonly client: DynamoClientLike,
    private readonly options: DynamoOptions = {},
  ) {}

  collection<T extends Record<string, unknown> = Record<string, unknown>>(name: string) {
    return new DynamoCollection<T>(name, this.client, this.options);
  }

  async transactWrite(actions: Record<string, unknown>[]): Promise<void> {
    if (!this.client.transactWrite) {
      throw new Error('DynamoDB client does not expose transactWrite');
    }

    await this.client.transactWrite(actions);
  }

  async health(): Promise<DatabaseHealth> {
    const start = performance.now();
    try {
      await this.client.ping?.();
      return { ok: true, latencyMs: performance.now() - start };
    } catch (e) {
      return { ok: false, latencyMs: performance.now() - start, details: { error: String(e) } };
    }
  }

  async close() {
    await this.client.close?.();
  }
}

export function dynamodb(client: DynamoClientLike, options: DynamoOptions = {}) {
  return new DynamoDocumentAdapter(client, options);
}

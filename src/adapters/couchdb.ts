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

import type { CouchDbOptions } from '../interfaces/adapters/couchdb.js';
import type {
  DatabaseHealth,
  DocumentAdapter,
  DocumentCollectionAdapter,
  DocumentFilter,
  DocumentFindOptions,
  DocumentUpdate,
  SortDirection,
} from '../types.js';

export type { CouchDbOptions } from '../interfaces/adapters/couchdb.js';

class CouchCollection<T extends Record<string, unknown>> implements DocumentCollectionAdapter<T> {
  constructor(
    private readonly dbName: string,
    private readonly options: CouchDbOptions,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const f = this.options.fetch ?? globalThis.fetch;
    const res = await f(
      `${this.options.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(this.dbName)}${path}`,
      {
        ...init,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(this.options.headers ?? {}),
          ...(init.headers ?? {}),
        },
      },
    );

    if (!res.ok) {
      throw new Error(`CouchDB ${res.status}: ${await res.text()}`);
    }

    return res.status === 204 ? null : res.json();
  }

  async find(filter: DocumentFilter<T> = {}, options: DocumentFindOptions<T> = {}): Promise<T[]> {
    const body: Record<string, unknown> = { selector: filter };
    if (options.limit !== undefined) {
      body.limit = options.limit;
    }

    if (options.skip !== undefined) {
      body.skip = options.skip;
    }

    if (options.projection) {
      body.fields = Object.entries(options.projection)
        .filter(([, v]) => v === 1)
        .map(([k]) => k);
    }

    if (options.sort) {
      body.sort = Object.entries(options.sort).map(([k, v]) => ({
        [k]: v === -1 || v === 'desc' ? 'desc' : 'asc',
      }));
    }

    const r = await this.request('/_find', { method: 'POST', body: JSON.stringify(body) });
    return ((r as { docs?: T[] }).docs ?? []) as T[];
  }

  async findOne(filter: DocumentFilter<T>) {
    return (await this.find(filter, { limit: 1 }))[0] ?? null;
  }

  async insertOne(document: T) {
    const id = (document as { _id?: string })._id;
    const path = id ? `/${encodeURIComponent(String(id))}` : '';
    const r = await this.request(path, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(document),
    });

    const res = r as { id?: string; rev?: string };
    return { id: res.id, document: { ...document, _id: res.id, _rev: res.rev } as T };
  }

  async insertMany(documents: T[]) {
    const r = await this.request('/_bulk_docs', {
      method: 'POST',
      body: JSON.stringify({ docs: documents }),
    });
    return {
      insertedCount: Array.isArray(r)
        ? (r as { ok?: boolean; rev?: string }[]).filter((x) => x.ok || x.rev).length
        : 0,
    };
  }

  async updateOne(filter: DocumentFilter<T>, update: DocumentUpdate<T> | Partial<T>) {
    const current = await this.findOne(filter);
    if (!current) {
      return { matchedCount: 0, modifiedCount: 0 };
    }

    const next: Record<string, unknown> = { ...current };
    if (Object.keys(update).some((x) => x.startsWith('$'))) {
      Object.assign(next, (update as { $set?: Record<string, unknown> }).$set ?? {});
      for (const k of Object.keys((update as { $unset?: Record<string, unknown> }).$unset ?? {})) {
        delete next[k];
      }

      for (const [k, v] of Object.entries(
        (update as { $inc?: Record<string, unknown> }).$inc ?? {},
      )) {
        next[k] = Number(next[k] ?? 0) + Number(v);
      }
    } else {
      Object.assign(next, update);
    }

    await this.request(`/${encodeURIComponent(String((current as { _id?: string })._id))}`, {
      method: 'PUT',
      body: JSON.stringify(next),
    });
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(filter: DocumentFilter<T>, update: DocumentUpdate<T> | Partial<T>) {
    const docs = await this.find(filter);
    let n = 0;

    for (const doc of docs) {
      n += (
        await this.updateOne({ _id: (doc as { _id?: string })._id } as DocumentFilter<T>, update)
      ).modifiedCount;
    }

    return { matchedCount: n, modifiedCount: n };
  }

  async deleteOne(filter: DocumentFilter<T>) {
    const d = await this.findOne(filter);
    if (!d) {
      return { deletedCount: 0 };
    }

    await this.request(
      `/${encodeURIComponent(String((d as { _id?: string })._id))}?rev=${encodeURIComponent(String((d as { _rev?: string })._rev))}`,
      { method: 'DELETE' },
    );
    return { deletedCount: 1 };
  }

  async deleteMany(filter: DocumentFilter<T>) {
    const docs = await this.find(filter);
    if (!docs.length) {
      return { deletedCount: 0 };
    }

    const tomb = docs.map((d: unknown) => ({ ...(d as Record<string, unknown>), _deleted: true }));
    const r = await this.request('/_bulk_docs', {
      method: 'POST',
      body: JSON.stringify({ docs: tomb }),
    });
    return {
      deletedCount: Array.isArray(r)
        ? r.filter((x: { ok?: boolean; rev?: string }) => x.ok || x.rev).length
        : 0,
    };
  }

  async count(filter: DocumentFilter<T> = {}) {
    return (await this.find(filter)).length;
  }

  async createIndex(
    definition: Record<string, SortDirection>,
    options: Record<string, unknown> = {},
  ) {
    const fields = Object.entries(definition).map(([k, v]) => ({
      [k]: v === -1 || v === 'desc' ? 'desc' : 'asc',
    }));

    const r = await this.request('/_index', {
      method: 'POST',
      body: JSON.stringify({ index: { fields }, ...options }),
    });
    return (r as { name?: string }).name;
  }
}

export class CouchDbDocumentAdapter implements DocumentAdapter {
  readonly kind = 'document' as const;
  readonly capabilities = { secondaryIndexes: true, bulkWrite: true };

  constructor(private readonly options: CouchDbOptions) {}

  collection<T extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
  ): DocumentCollectionAdapter<T> {
    return new CouchCollection<T>(name, this.options);
  }

  async health(): Promise<DatabaseHealth> {
    const start = performance.now();
    try {
      const f = this.options.fetch ?? globalThis.fetch;
      const r = await f(
        this.options.baseUrl,
        this.options.headers ? { headers: this.options.headers } : {},
      );
      return { ok: r.ok, latencyMs: performance.now() - start };
    } catch (e) {
      return { ok: false, latencyMs: performance.now() - start, details: { error: String(e) } };
    }
  }

  close(): void {}
}

export function couchdb(options: CouchDbOptions) {
  return new CouchDbDocumentAdapter(options);
}

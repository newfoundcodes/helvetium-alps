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
  KeyValueAdapter,
  SortDirection,
  TransactionOptions,
} from '../types.js';
import type { KVRecord } from '../interfaces/nosql/memory.js';

function getPath(value: unknown, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], value);
}

function compare(value: unknown, condition: unknown): boolean {
  if (
    condition === null ||
    typeof condition !== 'object' ||
    Array.isArray(condition) ||
    condition instanceof Date
  ) {
    return Object.is(value, condition);
  }

  for (const [op, expected] of Object.entries(condition)) {
    if (op === '$eq' && !Object.is(value, expected)) {
      return false;
    }

    if (op === '$ne' && Object.is(value, expected)) {
      return false;
    }

    if (op === '$gt' && !((value as number) > (expected as number))) {
      return false;
    }

    if (op === '$gte' && !((value as number) >= (expected as number))) {
      return false;
    }

    if (op === '$lt' && !((value as number) < (expected as number))) {
      return false;
    }

    if (op === '$lte' && !((value as number) <= (expected as number))) {
      return false;
    }

    if (op === '$in' && !(expected as unknown[]).some((x) => Object.is(value, x))) {
      return false;
    }

    if (op === '$nin' && (expected as unknown[]).some((x) => Object.is(value, x))) {
      return false;
    }

    if (op === '$exists' && (value !== undefined) !== Boolean(expected)) {
      return false;
    }
  }

  return true;
}

function matches(
  doc: Record<string, unknown>,
  filter: DocumentFilter<Record<string, unknown>> = {},
): boolean {
  const f = filter as Record<string, unknown>;
  if (
    f.$and &&
    !(f.$and as DocumentFilter<Record<string, unknown>>[]).every((x) => matches(doc, x))
  ) {
    return false;
  }

  if (f.$or && !(f.$or as DocumentFilter<Record<string, unknown>>[]).some((x) => matches(doc, x))) {
    return false;
  }

  if (f.$not && matches(doc, f.$not as DocumentFilter<Record<string, unknown>>)) {
    return false;
  }

  for (const [key, value] of Object.entries(f)) {
    if (key.startsWith('$')) {
      continue;
    }

    if (!compare(getPath(doc, key), value)) {
      return false;
    }
  }

  return true;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function applyUpdate(doc: Record<string, unknown>, update: Record<string, unknown>): void {
  const operators = Object.keys(update).some((x) => x.startsWith('$'));
  if (!operators) {
    for (const k of Object.keys(doc)) {
      delete doc[k];
    }

    Object.assign(doc, clone(update));
    return;
  }

  for (const [k, v] of Object.entries(update.$set ?? {})) {
    doc[k] = clone(v);
  }

  for (const k of Object.keys(update.$unset ?? {})) {
    delete doc[k];
  }

  for (const [k, v] of Object.entries(update.$inc ?? {})) {
    doc[k] = Number(doc[k] ?? 0) + Number(v);
  }

  for (const [k, v] of Object.entries(update.$push ?? {})) {
    if (!Array.isArray(doc[k])) {
      doc[k] = [];
    }

    (doc[k] as unknown[]).push(clone(v));
  }
}

class MemoryCollection<T extends Record<string, unknown>> implements DocumentCollectionAdapter<T> {
  constructor(private readonly docs: T[]) {}

  async find(filter: DocumentFilter<T> = {}, options: DocumentFindOptions<T> = {}): Promise<T[]> {
    let rows = this.docs.filter((x) => matches(x, filter)).map(clone);
    if (options.sort) {
      const entries = Object.entries(options.sort) as [string, SortDirection][];
      rows.sort((a, b) => {
        for (const [k, dir] of entries) {
          const av = getPath(a, k),
            bv = getPath(b, k);

          if (Object.is(av, bv)) {
            continue;
          }

          const sign = dir === -1 || dir === 'desc' ? -1 : 1;
          return (av as number) < (bv as number) ? -sign : sign;
        }

        return 0;
      });
    }

    if (options.skip) {
      rows = rows.slice(options.skip);
    }

    if (options.limit !== undefined) {
      rows = rows.slice(0, options.limit);
    }

    if (options.projection) {
      rows = rows.map((row) => {
        const include = Object.entries(options.projection!)
          .filter(([, v]) => v === 1)
          .map(([k]) => k);

        if (include.length) {
          return Object.fromEntries(
            include.map((k) => [k, (row as Record<string, unknown>)[k]]),
          ) as T;
        }

        const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
        for (const [k, v] of Object.entries(options.projection!)) {
          if (v === 0) {
            delete out[k];
          }
        }

        return out as T;
      });
    }

    return rows;
  }

  async findOne(filter: DocumentFilter<T>): Promise<T | null> {
    const row = this.docs.find((x) => matches(x, filter));
    return row ? clone(row) : null;
  }

  async insertOne(document: T) {
    const row = clone(document);
    this.docs.push(row);
    return {
      id: (row as Record<string, unknown>)._id ?? (row as Record<string, unknown>).id,
      document: clone(row),
    };
  }

  async insertMany(documents: T[]) {
    this.docs.push(...documents.map(clone));
    return { insertedCount: documents.length };
  }

  async updateOne(
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T> | Partial<T>,
    options: { upsert?: boolean } = {},
  ) {
    const row = this.docs.find((x) => matches(x, filter));
    if (row) {
      applyUpdate(row as Record<string, unknown>, update as Record<string, unknown>);
      return { matchedCount: 1, modifiedCount: 1 };
    }

    if (options.upsert) {
      const base: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(filter as Record<string, unknown>)) {
        if (!k.startsWith('$') && (v === null || typeof v !== 'object' || Array.isArray(v))) {
          base[k] = v;
        }
      }

      applyUpdate(base, update as Record<string, unknown>);
      this.docs.push(base as T);
      return { matchedCount: 0, modifiedCount: 0, upsertedId: base._id ?? base.id };
    }

    return { matchedCount: 0, modifiedCount: 0 };
  }

  async updateMany(filter: DocumentFilter<T>, update: DocumentUpdate<T> | Partial<T>) {
    let n = 0;
    for (const row of this.docs) {
      if (matches(row, filter)) {
        applyUpdate(row as Record<string, unknown>, update as Record<string, unknown>);
        n++;
      }
    }

    return { matchedCount: n, modifiedCount: n };
  }

  async deleteOne(filter: DocumentFilter<T>) {
    const i = this.docs.findIndex((x) => matches(x, filter));
    if (i < 0) {
      return { deletedCount: 0 };
    }

    this.docs.splice(i, 1);
    return { deletedCount: 1 };
  }

  async deleteMany(filter: DocumentFilter<T>) {
    let n = 0;
    for (let i = this.docs.length - 1; i >= 0; i--) {
      if (matches(this.docs[i]!, filter)) {
        this.docs.splice(i, 1);
        n++;
      }
    }

    return { deletedCount: n };
  }

  async count(filter: DocumentFilter<T> = {}) {
    return this.docs.filter((x) => matches(x, filter)).length;
  }

  async createIndex() {
    return 'memory-index';
  }
}

export class MemoryDocumentAdapter implements DocumentAdapter {
  readonly kind = 'document' as const;
  readonly capabilities = { transactions: true, secondaryIndexes: true, bulkWrite: true };
  private data = new Map<string, Record<string, unknown>[]>();

  collection<T extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
  ): DocumentCollectionAdapter<T> {
    let docs = this.data.get(name);
    if (!docs) {
      docs = [];
      this.data.set(name, docs);
    }

    return new MemoryCollection<T>(docs as T[]);
  }

  async transaction<T>(
    fn: (tx: DocumentAdapter) => Promise<T>,
    _options?: TransactionOptions,
  ): Promise<T> {
    const snapshot = new Map<string, Record<string, unknown>[]>(
      [...this.data.entries()].map(([k, v]) => [k, structuredClone(v)]),
    );

    try {
      return await fn(this);
    } catch (e) {
      for (const [name, current] of this.data) {
        const previous = snapshot.get(name);
        current.splice(0, current.length, ...(previous ? structuredClone(previous) : []));
        if (!previous) {
          this.data.delete(name);
        }
      }

      for (const [name, previous] of snapshot) {
        if (!this.data.has(name)) {
          this.data.set(name, structuredClone(previous));
        }
      }

      throw e;
    }
  }

  async health(): Promise<DatabaseHealth> {
    return { ok: true, latencyMs: 0, details: { collections: this.data.size } };
  }

  close(): void {}
}

export class MemoryKeyValueAdapter implements KeyValueAdapter {
  readonly kind = 'keyvalue' as const;
  readonly capabilities = { transactions: true, ttl: true, watch: true };
private data = new Map<string, KVRecord>();
  private lock = Promise.resolve();

  private record(key: string): KVRecord | undefined {
    const r = this.data.get(key);
    if (r?.expiresAt !== undefined && r.expiresAt <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }

    return r;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const r = this.record(key);
    return r ? structuredClone(r.value as T) : null;
  }

  async set<T = unknown>(
    key: string,
    value: T,
    options: { ttlMs?: number; ifAbsent?: boolean; ifPresent?: boolean } = {},
  ): Promise<boolean> {
    const exists = Boolean(this.record(key));
    if (options.ifAbsent && exists) {
      return false;
    }

    if (options.ifPresent && !exists) {
      return false;
    }

    const r: KVRecord = { value: structuredClone(value) };
    if (options.ttlMs !== undefined) {
      r.expiresAt = Date.now() + options.ttlMs;
    }

    this.data.set(key, r);
    return true;
  }

  async delete(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      if (this.data.delete(k)) {
        n++;
      }
    }

    return n;
  }

  async has(key: string): Promise<boolean> {
    return Boolean(this.record(key));
  }

  async increment(key: string, by = 1): Promise<number> {
    const value = Number((await this.get<number>(key)) ?? 0) + by;
    await this.set(key, value);
    return value;
  }

  async expire(key: string, ttlMs: number): Promise<boolean> {
    const r = this.record(key);
    if (!r) {
      return false;
    }

    r.expiresAt = Date.now() + ttlMs;
    return true;
  }

  async ttl(key: string): Promise<number | null> {
    const r = this.record(key);
    if (!r) {
      return null;
    }

    if (r.expiresAt === undefined) {
      return Infinity;
    }

    return Math.max(0, r.expiresAt - Date.now());
  }

  async *scan(prefix = ''): AsyncIterable<string> {
    for (const k of [...this.data.keys()]) {
      if (k.startsWith(prefix) && this.record(k)) {
        yield k;
      }
    }
  }

  async transaction<T>(fn: (tx: KeyValueAdapter) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.lock;

    this.lock = new Promise<void>((r) => {
      release = r;
    });
    await previous;

    const snapshot = structuredClone([...this.data.entries()]);
    try {
      return await fn(this);
    } catch (e) {
      this.data = new Map(snapshot);
      throw e;
    } finally {
      release();
    }
  }

  async health() {
    return { ok: true, latencyMs: 0, details: { keys: this.data.size } };
  }

  close(): void {}
}

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
  AlpsOptions,
  CompiledQuery,
  DatabaseAdapter,
  DatabaseHealth,
  DatabaseRegistration,
  DocumentAdapter,
  KeyValueAdapter,
  QueryEvent,
  QueryHook,
  QueryResult,
  SqlAdapter,
  SqlConnection,
  TransactionOptions,
} from './types.js';
import { compileFragment, type SqlFragment } from './sql/expression.js';
import { dialect } from './sql/dialect.js';

async function sleep(ms: number): Promise<void> {
  if (ms > 0) {
    await new Promise((r) => setTimeout(r, ms));
  }
}

export class Alps {
  private readonly databases = new Map<string, DatabaseRegistration>();
  private readonly hooks: QueryHook[];
  private defaultName: string | undefined;

  constructor(private readonly options: AlpsOptions = {}) {
    this.defaultName = options.defaultDatabase;
    this.hooks = [...(options.hooks ?? [])];
  }

  register(
    name: string,
    adapter: DatabaseAdapter,
    options: Omit<DatabaseRegistration, 'name' | 'adapter'> = {},
  ): this {
    if (this.databases.has(name)) {
      throw new Error(`Database ${name} is already registered`);
    }

    this.databases.set(name, { name, adapter, ...options });
    if (!this.defaultName) {
      this.defaultName = name;
    }

    return this;
  }

  unregister(name: string): DatabaseAdapter | undefined {
    const entry = this.databases.get(name);
    this.databases.delete(name);
    if (this.defaultName === name) {
      this.defaultName = this.databases.keys().next().value as string | undefined;
    }

    return entry?.adapter;
  }

  names(): string[] {
    return [...this.databases.keys()];
  }

  registration(name?: string): DatabaseRegistration {
    const key = name ?? this.defaultName;
    if (!key) {
      throw new Error('No default database configured');
    }

    const db = this.databases.get(key);
    if (!db) {
      throw new Error(`Unknown database: ${key}`);
    }

    return db;
  }

  adapter(name?: string): DatabaseAdapter {
    return this.registration(name).adapter;
  }

  sql(name?: string): SqlDatabase {
    const a = this.adapter(name);
    if (a.kind !== 'sql') {
      throw new TypeError(`${name ?? this.defaultName} is not a SQL database`);
    }

    return new SqlDatabase(name ?? this.defaultName!, a, this.hooks, this.options);
  }

  documents(name?: string): DocumentAdapter {
    const a = this.adapter(name);
    if (a.kind !== 'document') {
      throw new TypeError(`${name ?? this.defaultName} is not a document database`);
    }

    return a;
  }

  kv(name?: string): KeyValueAdapter {
    const a = this.adapter(name);
    if (a.kind !== 'keyvalue') {
      throw new TypeError(`${name ?? this.defaultName} is not a key-value database`);
    }

    return a;
  }

  replicas(primary: string): DatabaseRegistration[] {
    return [...this.databases.values()].filter(
      (x) => x.role === 'replica' && x.tags?.includes(primary),
    );
  }

  read(primary?: string): DatabaseAdapter {
    const base = primary ?? this.defaultName;
    if (!base) {
      return this.adapter();
    }

    const replicas = this.replicas(base);
    if (!replicas.length) {
      return this.adapter(base);
    }

    return replicas[Math.floor(Math.random() * replicas.length)]!.adapter;
  }

  write(primary?: string): DatabaseAdapter {
    return this.adapter(primary);
  }

  addHook(hook: QueryHook): () => void {
    this.hooks.push(hook);
    return () => {
      const i = this.hooks.indexOf(hook);
      if (i >= 0) {
        this.hooks.splice(i, 1);
      }
    };
  }

  async health(): Promise<Record<string, DatabaseHealth>> {
    const out: Record<string, DatabaseHealth> = {};
    for (const [name, entry] of this.databases) {
      const start = performance.now();
      try {
        out[name] = entry.adapter.health
          ? await entry.adapter.health()
          : { ok: true, latencyMs: performance.now() - start };
      } catch (error) {
        out[name] = {
          ok: false,
          latencyMs: performance.now() - start,
          details: { error: error instanceof Error ? error.message : String(error) },
        };
      }
    }

    return out;
  }

  async close(): Promise<void> {
    await Promise.all([...this.databases.values()].map((x) => Promise.resolve(x.adapter.close())));
  }
}

export class SqlDatabase {
  constructor(
    readonly name: string,
    readonly adapter: SqlAdapter,
    private readonly hooks: QueryHook[] = [],
    private readonly options: AlpsOptions = {},
  ) {}

  async query<Row = Record<string, unknown>>(
    input: string | CompiledQuery | SqlFragment,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    let compiled: CompiledQuery;
    if (typeof input === 'string') {
      compiled = { text: input, values: [...values], dialect: this.adapter.dialect };
    } else if ('dialect' in input) {
      compiled = input;
    } else {
      const c = compileFragment(input, dialect(this.adapter.dialect));
      compiled = { ...c, dialect: this.adapter.dialect };
    }

    return this.execute<Row>(compiled);
  }

  private async execute<Row>(compiled: CompiledQuery): Promise<QueryResult<Row>> {
    const event: QueryEvent = {
      database: this.name,
      kind: 'sql',
      operation: compiled.purpose ?? 'query',
      startedAt: Date.now(),
      query: compiled,
    };

    for (const hook of this.hooks) {
      await hook(event);
    }

    const retry = this.options.retry;
    const attempts = Math.max(1, retry?.attempts ?? 1);
    let last: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const start = performance.now();
        const result = await this.adapter.query<Row>(compiled.text, compiled.values);
        event.durationMs = performance.now() - start;

        for (const hook of this.hooks) {
          await hook(event);
        }

        return result;
      } catch (error) {
        last = error;
        event.error = error;

        const should = attempt < attempts && (retry?.shouldRetry?.(error, attempt) ?? true);
        if (!should) {
          break;
        }

        const delay = Math.min(
          retry?.maxDelayMs ?? Infinity,
          (retry?.delayMs ?? 0) * Math.pow(retry?.factor ?? 1, attempt - 1),
        );
        await sleep(delay);
      }
    }

    for (const hook of this.hooks) {
      await hook(event);
    }

    throw last;
  }

  async transaction<T>(
    fn: (tx: SqlTransaction) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    const attempts = Math.max(1, (options.retries ?? 0) + 1);
    let last: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        if (this.adapter.transaction) {
          return await this.adapter.transaction(
            async (conn) => fn(new SqlTransaction(this.name, this.adapter, conn, this.hooks)),
            options,
          );
        }

        if (!this.adapter.connect) {
          throw new Error('Adapter does not support transactions');
        }

        const conn = await this.adapter.connect();
        try {
          await conn.begin?.(options);

          const value = await fn(new SqlTransaction(this.name, this.adapter, conn, this.hooks));
          await conn.commit?.();
          return value;
        } catch (e) {
          await conn.rollback?.();
          throw e;
        } finally {
          await conn.close();
        }
      } catch (error) {
        last = error;
        if (attempt >= attempts) {
          break;
        }

        await sleep(options.retryDelayMs ?? 0);
      }
    }

    throw last;
  }
}

export class SqlTransaction {
  private savepointCounter = 0;

  constructor(
    readonly name: string,
    readonly adapter: SqlAdapter,
    readonly connection: SqlConnection,
    private readonly hooks: QueryHook[] = [],
  ) {}

  async query<Row = Record<string, unknown>>(
    input: string | CompiledQuery,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    const q: CompiledQuery =
      typeof input === 'string'
        ? { text: input, values: [...values], dialect: this.adapter.dialect }
        : input;
    const event: QueryEvent = {
      database: this.name,
      kind: 'sql',
      operation: 'transaction',
      startedAt: Date.now(),
      query: q,
    };

    for (const h of this.hooks) {
      await h(event);
    }

    try {
      const start = performance.now();
      const r = await this.connection.query<Row>(q.text, q.values);
      event.durationMs = performance.now() - start;

      for (const h of this.hooks) {
        await h(event);
      }

      return r;
    } catch (error) {
      event.error = error;
      for (const h of this.hooks) {
        await h(event);
      }

      throw error;
    }
  }

  async savepoint<T>(
    fn: (tx: SqlTransaction) => Promise<T>,
    name = `alps_sp_${++this.savepointCounter}`,
  ): Promise<T> {
    if (!this.adapter.capabilities.savepoints) {
      throw new Error('Adapter does not support savepoints');
    }

    const d = dialect(this.adapter.dialect);
    const safe = d.quote(name);
    await this.query(`SAVEPOINT ${safe}`);

    try {
      const out = await fn(this);
      await this.query(`RELEASE SAVEPOINT ${safe}`);
      return out;
    } catch (error) {
      await this.query(`ROLLBACK TO SAVEPOINT ${safe}`);
      try {
        await this.query(`RELEASE SAVEPOINT ${safe}`);
      } catch {}

      throw error;
    }
  }
}

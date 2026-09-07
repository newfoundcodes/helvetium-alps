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

import { ConnectionPool } from '../pool.js';
import type {
  DatabaseCapabilities,
  DatabaseHealth,
  QueryResult,
  SqlAdapter,
  SqlConnection,
  SqlDialectName,
  TransactionOptions,
} from '../types.js';
import type {
  GenericSqlClient,
  SqlClientAdapterOptions,
  PooledSqlAdapterOptions,
} from '../interfaces/adapters/sql.js';

export type {
  GenericSqlClient,
  SqlClientAdapterOptions,
  PooledSqlAdapterOptions,
} from '../interfaces/adapters/sql.js';

function normalizeResult<Row>(value: unknown): QueryResult<Row> {
  const v = value as {
    rows?: Row[];
    rowCount?: number;
    fields?: { name?: string }[];
    insertId?: unknown;
    metadata?: unknown;
  };

  if (v && Array.isArray(v.rows)) {
    return {
      rows: v.rows,
      rowCount: Number(v.rowCount ?? v.rows.length),
      ...(v.fields ? { fields: v.fields.map((x) => x.name ?? String(x)) } : {}),
      ...(v.insertId === undefined ? {} : { insertId: v.insertId as string | number }),
      ...(v.metadata ? { metadata: v.metadata as Record<string, unknown> } : {}),
    };
  }

  if (Array.isArray(value) && Array.isArray(value[0])) {
    const rows = value[0];
    const meta = value[1];
    return {
      rows,
      rowCount: Number(meta?.affectedRows ?? rows.length),
      ...(meta?.insertId === undefined ? {} : { insertId: meta.insertId }),
    };
  }

  if (Array.isArray(value)) {
    return { rows: value as Row[], rowCount: value.length };
  }

  const val = value as Record<string, unknown>;
  return {
    rows: [],
    rowCount: Number(val?.affectedRows ?? val?.changes ?? val?.rowCount ?? 0),
    ...(val?.insertId === undefined && val?.lastInsertRowid === undefined
      ? {}
      : { insertId: (val?.insertId ?? val?.lastInsertRowid) as string | number }),
  };
}

class GenericConnection implements SqlConnection {
  constructor(private readonly client: GenericSqlClient) {}

  async query<Row>(text: string, values: readonly unknown[] = []): Promise<QueryResult<Row>> {
    return normalizeResult<Row>(await this.client.query(text, values));
  }

  async begin(options: TransactionOptions = {}): Promise<void> {
    if (this.client.begin) {
      return void (await this.client.begin(options));
    }

    let sql = 'BEGIN';
    if (options.isolation) {
      sql += ` ISOLATION LEVEL ${options.isolation.replaceAll('-', ' ').toUpperCase()}`;
    }

    await this.client.query(sql);
  }

  async commit(): Promise<void> {
    if (this.client.commit) {
      return void (await this.client.commit());
    }

    await this.client.query('COMMIT');
  }

  async rollback(): Promise<void> {
    if (this.client.rollback) {
      return void (await this.client.rollback());
    }

    await this.client.query('ROLLBACK');
  }

  async close(): Promise<void> {
    await this.client.close?.();
  }
}

export class SqlClientAdapter implements SqlAdapter {
  readonly kind = 'sql' as const;
  readonly dialect: SqlDialectName;
  readonly capabilities: DatabaseCapabilities;

  constructor(private readonly options: SqlClientAdapterOptions) {
    this.dialect = options.dialect;
    this.capabilities = {
      transactions: true,
      preparedStatements: true,
      joins: true,
      ...options.capabilities,
    };
  }

  async query<Row>(text: string, values: readonly unknown[] = []): Promise<QueryResult<Row>> {
    return normalizeResult<Row>(await this.options.client.query(text, values));
  }

  async connect(): Promise<SqlConnection> {
    return new GenericConnection(this.options.client);
  }

  async transaction<T>(
    fn: (connection: SqlConnection) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    const c = new GenericConnection(this.options.client);
    await c.begin(options);

    try {
      const result = await fn(c);
      await c.commit();
      return result;
    } catch (e) {
      await c.rollback();
      throw e;
    }
  }

  async health(): Promise<DatabaseHealth> {
    const start = performance.now();
    try {
      await this.query(this.dialect === 'mssql' ? 'SELECT 1 AS ok' : 'SELECT 1 AS ok');
      return { ok: true, latencyMs: performance.now() - start };
    } catch (error) {
      return {
        ok: false,
        latencyMs: performance.now() - start,
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  async close(): Promise<void> {
    if (this.options.closeClient !== false) {
      await this.options.client.close?.();
    }
  }
}

export class PooledSqlAdapter implements SqlAdapter {
  readonly kind = 'sql' as const;
  readonly dialect: SqlDialectName;
  readonly capabilities: DatabaseCapabilities;
  readonly pool: ConnectionPool<SqlConnection>;

  constructor(options: PooledSqlAdapterOptions) {
    this.dialect = options.dialect;
    this.capabilities = {
      transactions: true,
      savepoints: true,
      joins: true,
      preparedStatements: true,
      ...options.capabilities,
    };
    this.pool = new ConnectionPool({
      create: options.create,
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.idleTimeoutMs === undefined ? {} : { idleTimeoutMs: options.idleTimeoutMs }),
      ...(options.acquireTimeoutMs === undefined
        ? {}
        : { acquireTimeoutMs: options.acquireTimeoutMs }),
      ...(options.validate === undefined ? {} : { validate: options.validate }),
    });
  }

  async query<Row>(text: string, values: readonly unknown[] = []): Promise<QueryResult<Row>> {
    const lease = await this.pool.acquire();
    try {
      return await lease.value.query<Row>(text, values);
    } finally {
      await lease.release();
    }
  }

  async connect(): Promise<SqlConnection> {
    const lease = await this.pool.acquire();
    return {
      query: (t, v) => lease.value.query(t, v),
      begin: (o) => lease.value.begin?.(o) ?? Promise.resolve(),
      commit: () => lease.value.commit?.() ?? Promise.resolve(),
      rollback: () => lease.value.rollback?.() ?? Promise.resolve(),
      close: () => lease.release(),
    };
  }

  async transaction<T>(
    fn: (connection: SqlConnection) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    const c = await this.connect();
    try {
      await c.begin?.(options);

      const out = await fn(c);
      await c.commit?.();
      return out;
    } catch (e) {
      await c.rollback?.();
      throw e;
    } finally {
      await c.close();
    }
  }

  async health() {
    const start = performance.now();
    try {
      await this.query('SELECT 1 AS ok');
      return {
        ok: true,
        latencyMs: performance.now() - start,
        details: this.pool.stats() as unknown as Record<string, unknown>,
      };
    } catch (e) {
      return { ok: false, latencyMs: performance.now() - start, details: { error: String(e) } };
    }
  }

  close() {
    return this.pool.close();
  }
}

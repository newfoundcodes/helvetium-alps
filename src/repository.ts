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

import type { TableDefinition } from './sql/schema.js';
import { dialect } from './sql/dialect.js';
import { and, eq, gt, isNull, lt, type SqlExpression } from './sql/expression.js';
import { DeleteBuilder, InsertBuilder, SelectBuilder, UpdateBuilder } from './sql/query-builder.js';
import { SqlDatabase, SqlTransaction } from './database.js';
import type { RepositoryOptions, Page, CursorPage } from './interfaces/repository.js';

export type { RepositoryOptions, Page, CursorPage } from './interfaces/repository.js';

type QueryExecutor = Pick<SqlDatabase | SqlTransaction, 'query'> & { adapter: { dialect: string } };

export class Repository<T extends Record<string, unknown>> {
  readonly primaryKey: keyof T & string;
  readonly options: RepositoryOptions<T>;

  constructor(
    readonly db: QueryExecutor,
    readonly table: TableDefinition<T>,
    options: RepositoryOptions<T> = {},
  ) {
    this.primaryKey = options.primaryKey ?? ('id' as keyof T & string);
    this.options = options;
  }

  private d() {
    return dialect(this.db.adapter.dialect as 'postgres' | 'mysql' | 'sqlite' | 'mssql');
  }

  private live(expr?: SqlExpression): SqlExpression | undefined {
    const soft =
      this.options.softDeleteColumn ??
      (this.table.softDeletes ? ('deletedAt' as keyof T & string) : undefined);
    if (!soft) {
      return expr;
    }

    const live = isNull(String(soft));
    return expr ? and(live, expr) : live;
  }

  async findById(id: unknown, options: { withDeleted?: boolean } = {}): Promise<T | null> {
    const where = eq(String(this.primaryKey), id);
    return this.findOne(where, options);
  }

  async findOne(where?: SqlExpression, options: { withDeleted?: boolean } = {}): Promise<T | null> {
    const q = new SelectBuilder<T>(this.d()).from(this.table.name).limit(1);
    const expr = options.withDeleted ? where : this.live(where);

    if (expr) {
      q.where(expr);
    }

    const r = await this.db.query<T>(q.compile());
    return r.rows[0] ?? null;
  }

  async findMany(
    options: {
      where?: SqlExpression;
      orderBy?: keyof T & string;
      direction?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
      withDeleted?: boolean;
    } = {},
  ): Promise<T[]> {
    const q = new SelectBuilder<T>(this.d()).from(this.table.name);
    const expr = options.withDeleted ? options.where : this.live(options.where);

    if (expr) {
      q.where(expr);
    }

    if (options.orderBy) {
      q.orderBy(options.orderBy, options.direction);
    }

    if (options.limit !== undefined) {
      q.limit(options.limit);
    }

    if (options.offset !== undefined) {
      q.offset(options.offset);
    }

    return (await this.db.query<T>(q.compile())).rows;
  }

  async count(where?: SqlExpression): Promise<number> {
    const q = new SelectBuilder<{ count: number | string | bigint }>(this.d())
      .select('COUNT(*) AS count')
      .from(this.table.name);
    const expr = this.live(where);

    if (expr) {
      q.where(expr);
    }

    const row = (await this.db.query<{ count: number | string | bigint }>(q.compile())).rows[0];
    return Number(row?.count ?? 0);
  }

  async create(values: Partial<T>): Promise<T> {
    const now = new Date();
    const row: Record<string, unknown> = { ...values };

    if (this.options.createdAtColumn) {
      row[this.options.createdAtColumn] ??= now;
    }

    if (this.options.updatedAtColumn) {
      row[this.options.updatedAtColumn] ??= now;
    }

    const q = new InsertBuilder<T>(this.d()).into(this.table.name).values(row);
    if (this.db.adapter.dialect === 'postgres' || this.db.adapter.dialect === 'sqlite') {
      q.returning('*');
    }

    const r = await this.db.query<T>(q.compile());
    return r.rows[0] ?? (row as T);
  }

  async createMany(values: Partial<T>[]): Promise<number> {
    if (!values.length) {
      return 0;
    }

    const q = new InsertBuilder<T>(this.d())
      .into(this.table.name)
      .values(values as Record<string, unknown>[]);
    return (await this.db.query(q.compile())).rowCount;
  }

  async updateById(
    id: unknown,
    values: Partial<T>,
    options: { expectedVersion?: number } = {},
  ): Promise<T | null> {
    const row: Record<string, unknown> = { ...values };
    if (this.options.updatedAtColumn) {
      row[this.options.updatedAtColumn] = new Date();
    }

    let where: SqlExpression = eq(String(this.primaryKey), id);
    if (this.options.versionColumn && options.expectedVersion !== undefined) {
      where = and(where, eq(this.options.versionColumn, options.expectedVersion));
      row[this.options.versionColumn] = options.expectedVersion + 1;
    }

    const q = new UpdateBuilder<T>(this.d()).tableName(this.table.name).set(row).where(where);
    if (['postgres', 'sqlite'].includes(this.db.adapter.dialect)) {
      q.returning('*');
    }

    const result = await this.db.query<T>(q.compile());
    if (
      this.options.versionColumn &&
      options.expectedVersion !== undefined &&
      result.rowCount === 0
    ) {
      throw new OptimisticLockError(this.table.name, id);
    }

    return result.rows[0] ?? (result.rowCount ? await this.findById(id) : null);
  }

  async deleteById(id: unknown, options: { force?: boolean } = {}): Promise<boolean> {
    const soft =
      this.options.softDeleteColumn ??
      (this.table.softDeletes ? ('deletedAt' as keyof T & string) : undefined);
    if (soft && !options.force) {
      const q = new UpdateBuilder(this.d())
        .tableName(this.table.name)
        .set({ [soft]: new Date() })
        .where(eq(String(this.primaryKey), id));
      return (await this.db.query(q.compile())).rowCount > 0;
    }

    const q = new DeleteBuilder(this.d())
      .from(this.table.name)
      .where(eq(String(this.primaryKey), id));
    return (await this.db.query(q.compile())).rowCount > 0;
  }

  async restore(id: unknown): Promise<boolean> {
    const soft =
      this.options.softDeleteColumn ??
      (this.table.softDeletes ? ('deletedAt' as keyof T & string) : undefined);
    if (!soft) {
      throw new Error('Repository does not use soft deletes');
    }

    const q = new UpdateBuilder(this.d())
      .tableName(this.table.name)
      .set({ [soft]: null })
      .where(eq(String(this.primaryKey), id));
    return (await this.db.query(q.compile())).rowCount > 0;
  }

  async paginate(page = 1, perPage = 25, where?: SqlExpression): Promise<Page<T>> {
    page = Math.max(1, page);
    perPage = Math.max(1, perPage);

    const findOptions = {
      limit: perPage,
      offset: (page - 1) * perPage,
      ...(where ? { where } : {}),
    };
    const [total, items] = await Promise.all([this.count(where), this.findMany(findOptions)]);
    return { items, total, page, perPage, pages: Math.ceil(total / perPage) };
  }

  async cursor(
    options: {
      column?: keyof T & string;
      after?: unknown;
      limit?: number;
      direction?: 'asc' | 'desc';
    } = {},
  ): Promise<CursorPage<T>> {
    const column = options.column ?? this.primaryKey,
      limit = options.limit ?? 25;
    const q = new SelectBuilder<T>(this.d())
      .from(this.table.name)
      .orderBy(column, options.direction ?? 'asc')
      .limit(limit + 1);

    if (options.after !== undefined) {
      q.where(
        (options.direction ?? 'asc') === 'asc'
          ? gt(column, options.after)
          : lt(column, options.after),
      );
    }

    const rows = (await this.db.query<T>(q.compile())).rows;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return { items, ...(hasMore && last ? { nextCursor: encodeCursor(last[column]) } : {}) };
  }
}

export class OptimisticLockError extends Error {
  constructor(table: string, id: unknown) {
    super(`Optimistic lock failed for ${table}(${String(id)})`);
    this.name = 'OptimisticLockError';
  }
}

export function encodeCursor(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';

  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decodeCursor(value: string): unknown {
  const base = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base + '='.repeat((4 - (base.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function createRepository<T extends Record<string, unknown>>(
  db: QueryExecutor,
  table: TableDefinition<T>,
  options?: RepositoryOptions<T>,
): Repository<T> {
  return new Repository(db, table, options);
}

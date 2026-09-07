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

import type { CompiledQuery } from '../types.js';
import { dialect as createDialect, type SqlDialect } from './dialect.js';
import type { SqlExpression } from './expression.js';

import type { OrderDirection, JoinType } from '../types/query-builder.js';
import type { JoinClause } from '../interfaces/query-builder.js';

abstract class BaseBuilder<T extends BaseBuilder<T>> {
  protected _dialect: SqlDialect;

  constructor(dialect: SqlDialect | Parameters<typeof createDialect>[0] = 'generic') {
    this._dialect = typeof dialect === 'string' ? createDialect(dialect) : dialect;
  }

  using(dialect: SqlDialect): T {
    this._dialect = dialect;
    return this as unknown as T;
  }
}

export class SelectBuilder<Row = Record<string, unknown>> extends BaseBuilder<SelectBuilder<Row>> {
  private columns: string[] = ['*'];
  private table: string | undefined;
  private alias: string | undefined;
  private joins: JoinClause[] = [];
  private whereExpr?: SqlExpression;
  private groups: string[] = [];
  private havingExpr?: SqlExpression;
  private orders: Array<[string, OrderDirection]> = [];
  private max?: number;
  private skip?: number;
  private distinctFlag = false;
  private lockClause?: 'update' | 'share';

  select(...columns: string[]): this {
    if (columns.length) {
      this.columns = columns;
    }

    return this;
  }

  distinct(value = true): this {
    this.distinctFlag = value;
    return this;
  }

  from(table: string, alias?: string): this {
    this.table = table;
    this.alias = alias;
    return this;
  }

  join(table: string, on: SqlExpression, type: JoinType = 'inner'): this {
    this.joins.push({ table, on, type });
    return this;
  }

  crossJoin(table: string): this {
    this.joins.push({ table, type: 'cross' });
    return this;
  }

  where(expr: SqlExpression): this {
    this.whereExpr = expr;
    return this;
  }

  groupBy(...columns: string[]): this {
    this.groups.push(...columns);
    return this;
  }

  having(expr: SqlExpression): this {
    this.havingExpr = expr;
    return this;
  }

  orderBy(column: string, direction: OrderDirection = 'asc'): this {
    this.orders.push([column, direction]);
    return this;
  }

  limit(value: number): this {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError('limit must be a non-negative integer');
    }

    this.max = value;
    return this;
  }

  offset(value: number): this {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError('offset must be a non-negative integer');
    }

    this.skip = value;
    return this;
  }

  forUpdate(): this {
    this.lockClause = 'update';
    return this;
  }

  forShare(): this {
    this.lockClause = 'share';
    return this;
  }

  compile(): CompiledQuery {
    if (!this.table) {
      throw new Error('SELECT requires from()');
    }

    const s = { values: [] as unknown[] },
      d = this._dialect;
    const renderCol = (x: string) => (x === '*' || /\(|\)|\s+AS\s+/i.test(x) ? x : d.quote(x));
    let text = `SELECT ${this.distinctFlag ? 'DISTINCT ' : ''}${this.columns.map(renderCol).join(', ')} FROM ${d.quote(this.table)}`;
    if (this.alias) {
      text += ` AS ${d.quote(this.alias)}`;
    }

    for (const j of this.joins) {
      const label = j.type === 'cross' ? 'CROSS JOIN' : `${j.type.toUpperCase()} JOIN`;
      text += ` ${label} ${d.quote(j.table)}`;
      if (j.on) {
        text += ` ON ${j.on.compile(d, s)}`;
      }
    }

    if (this.whereExpr) {
      text += ` WHERE ${this.whereExpr.compile(d, s)}`;
    }

    if (this.groups.length) {
      text += ` GROUP BY ${this.groups.map((x) => d.quote(x)).join(', ')}`;
    }

    if (this.havingExpr) {
      text += ` HAVING ${this.havingExpr.compile(d, s)}`;
    }

    if (this.orders.length) {
      text += ` ORDER BY ${this.orders.map(([c, dir]) => `${d.quote(c)} ${dir.toUpperCase()}`).join(', ')}`;
    }

    if (
      d.name === 'mssql' &&
      (this.max !== undefined || this.skip !== undefined) &&
      !this.orders.length
    ) {
      text += ' ORDER BY (SELECT 1)';
    }

    text += d.limitOffset(this.max, this.skip);
    if (this.lockClause && d.name !== 'sqlite' && d.name !== 'mssql') {
      text += this.lockClause === 'update' ? ' FOR UPDATE' : ' FOR SHARE';
    }

    return { text, values: s.values, dialect: d.name, purpose: 'read' };
  }
}

export class InsertBuilder<Row = Record<string, unknown>> extends BaseBuilder<InsertBuilder<Row>> {
  private table?: string;
  private rows: Record<string, unknown>[] = [];
  private returns: string[] = [];
  private conflict?: { columns: string[]; updates?: Record<string, unknown>; ignore?: boolean };

  into(table: string): this {
    this.table = table;
    return this;
  }

  values(row: Record<string, unknown> | Record<string, unknown>[]): this {
    this.rows.push(...(Array.isArray(row) ? row : [row]));
    return this;
  }

  returning(...columns: string[]): this {
    this.returns = columns;
    return this;
  }

  onConflict(columns: string[]): this {
    this.conflict = { columns };
    return this;
  }

  doNothing(): this {
    if (!this.conflict) {
      this.conflict = { columns: [] };
    }

    this.conflict.ignore = true;
    return this;
  }

  doUpdate(values: Record<string, unknown>): this {
    if (!this.conflict) {
      this.conflict = { columns: [] };
    }

    this.conflict.updates = values;
    return this;
  }

  compile(): CompiledQuery {
    if (!this.table || !this.rows.length) {
      throw new Error('INSERT requires into() and values()');
    }

    const d = this._dialect,
      s = { values: [] as unknown[] };
    const columns = [...new Set(this.rows.flatMap((r) => Object.keys(r)))];
    const groups = this.rows.map(
      (r) =>
        `(${columns
          .map((c) => {
            s.values.push(r[c] ?? null);
            return d.placeholder(s.values.length);
          })
          .join(', ')})`,
    );
    let text = `INSERT INTO ${d.quote(this.table)} (${columns.map((x) => d.quote(x)).join(', ')}) VALUES ${groups.join(', ')}`;

    if (this.conflict && ['postgres', 'sqlite'].includes(d.name)) {
      text += ` ON CONFLICT${this.conflict.columns.length ? ` (${this.conflict.columns.map((x) => d.quote(x)).join(', ')})` : ''}`;
      if (this.conflict.ignore) {
        text += ' DO NOTHING';
      } else if (this.conflict.updates) {
        const parts = Object.entries(this.conflict.updates).map(([k, v]) => {
          s.values.push(v);
          return `${d.quote(k)} = ${d.placeholder(s.values.length)}`;
        });
        text += ` DO UPDATE SET ${parts.join(', ')}`;
      }
    } else if (this.conflict && d.name === 'mysql' && this.conflict.updates) {
      const parts = Object.entries(this.conflict.updates).map(([k, v]) => {
        s.values.push(v);
        return `${d.quote(k)} = ${d.placeholder(s.values.length)}`;
      });
      text += ` ON DUPLICATE KEY UPDATE ${parts.join(', ')}`;
    }

    text += d.returning(this.returns);
    return { text, values: s.values, dialect: d.name, purpose: 'write' };
  }
}

export class UpdateBuilder<Row = Record<string, unknown>> extends BaseBuilder<UpdateBuilder<Row>> {
  private table?: string;
  private valuesMap: Record<string, unknown> = {};
  private whereExpr?: SqlExpression;
  private returns: string[] = [];

  tableName(table: string): this {
    this.table = table;
    return this;
  }

  set(values: Record<string, unknown>): this {
    Object.assign(this.valuesMap, values);
    return this;
  }

  where(expr: SqlExpression): this {
    this.whereExpr = expr;
    return this;
  }

  returning(...columns: string[]): this {
    this.returns = columns;
    return this;
  }

  compile(): CompiledQuery {
    if (!this.table || !Object.keys(this.valuesMap).length) {
      throw new Error('UPDATE requires tableName() and set()');
    }

    const d = this._dialect,
      s = { values: [] as unknown[] };
    const sets = Object.entries(this.valuesMap).map(([k, v]) => {
      s.values.push(v);
      return `${d.quote(k)} = ${d.placeholder(s.values.length)}`;
    });
    let text = `UPDATE ${d.quote(this.table)} SET ${sets.join(', ')}`;

    if (this.whereExpr) {
      text += ` WHERE ${this.whereExpr.compile(d, s)}`;
    }

    text += d.returning(this.returns);
    return { text, values: s.values, dialect: d.name, purpose: 'write' };
  }
}

export class DeleteBuilder extends BaseBuilder<DeleteBuilder> {
  private table?: string;
  private whereExpr?: SqlExpression;
  private returns: string[] = [];

  from(table: string): this {
    this.table = table;
    return this;
  }

  where(expr: SqlExpression): this {
    this.whereExpr = expr;
    return this;
  }

  returning(...columns: string[]): this {
    this.returns = columns;
    return this;
  }

  compile(): CompiledQuery {
    if (!this.table) {
      throw new Error('DELETE requires from()');
    }

    const d = this._dialect,
      s = { values: [] as unknown[] };
    let text = `DELETE FROM ${d.quote(this.table)}`;
    if (this.whereExpr) {
      text += ` WHERE ${this.whereExpr.compile(d, s)}`;
    }

    text += d.returning(this.returns);
    return { text, values: s.values, dialect: d.name, purpose: 'write' };
  }
}

export const select = <Row = Record<string, unknown>>(...columns: string[]) =>
  new SelectBuilder<Row>().select(...columns);

export const insert = <Row = Record<string, unknown>>() => new InsertBuilder<Row>();

export const update = <Row = Record<string, unknown>>() => new UpdateBuilder<Row>();

export const remove = () => new DeleteBuilder();

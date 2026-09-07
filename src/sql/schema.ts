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

import type { SqlDialect } from './dialect.js';
import type {
  ColumnOptions,
  ColumnDefinition,
  IndexDefinition,
  TableDefinition,
} from '../interfaces/sql/schema.js';

export type {
  ColumnOptions,
  ColumnDefinition,
  IndexDefinition,
  TableDefinition,
} from '../interfaces/sql/schema.js';

function column<T>(
  dataType: string,
  options: ColumnOptions = {},
): Omit<ColumnDefinition<T>, 'name'> {
  return { dataType, ...options };
}

export const types = {
  string: (length = 255, options: ColumnOptions = {}) =>
    column<string>(`VARCHAR(${length})`, options),
  text: (options: ColumnOptions = {}) => column<string>('TEXT', options),
  integer: (options: ColumnOptions = {}) => column<number>('INTEGER', options),
  bigint: (options: ColumnOptions = {}) => column<bigint>('BIGINT', options),
  boolean: (options: ColumnOptions = {}) => column<boolean>('BOOLEAN', options),
  decimal: (precision = 10, scale = 2, options: ColumnOptions = {}) =>
    column<number>(`DECIMAL(${precision},${scale})`, options),
  date: (options: ColumnOptions = {}) => column<Date>('DATE', options),
  datetime: (options: ColumnOptions = {}) => column<Date>('TIMESTAMP', options),
  json: (options: ColumnOptions = {}) => column<unknown>('JSON', options),
  uuid: (options: ColumnOptions = {}) => column<string>('UUID', options),
  binary: (options: ColumnOptions = {}) => column<Uint8Array>('BLOB', options),
};

export function defineTable<T extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  columns: Record<string, Omit<ColumnDefinition, 'name'>>,
  options: { indexes?: IndexDefinition[]; timestamps?: boolean; softDeletes?: boolean } = {},
): TableDefinition<T> {
  const full: Record<string, ColumnDefinition> = {};
  for (const [key, def] of Object.entries(columns)) {
    full[key] = { name: key, ...def };
  }

  if (options.timestamps) {
    full.createdAt ??= { name: 'createdAt', dataType: 'TIMESTAMP', nullable: false };
    full.updatedAt ??= { name: 'updatedAt', dataType: 'TIMESTAMP', nullable: false };
  }

  if (options.softDeletes) {
    full.deletedAt ??= { name: 'deletedAt', dataType: 'TIMESTAMP', nullable: true };
  }

  return {
    name,
    columns: full,
    indexes: options.indexes ?? [],
    ...(options.timestamps === undefined ? {} : { timestamps: options.timestamps }),
    ...(options.softDeletes === undefined ? {} : { softDeletes: options.softDeletes }),
  };
}

function defaultLiteral(value: unknown, dialect: SqlDialect): string {
  if (value === null) {
    return 'NULL';
  }

  if (typeof value === 'boolean') {
    return dialect.boolean(value);
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  if (typeof value === 'string' && /^(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME)$/i.test(value)) {
    return value;
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

export function createTableSql(
  table: TableDefinition,
  dialect: SqlDialect,
  options: { ifNotExists?: boolean } = {},
): string[] {
  const defs = Object.values(table.columns).map((c) => {
    let out = `${dialect.quote(c.name)} ${mapType(c.dataType, dialect.name)}`;
    if (!c.nullable) {
      out += ' NOT NULL';
    }

    if (c.primaryKey) {
      out += ' PRIMARY KEY';
    }

    if (c.unique) {
      out += ' UNIQUE';
    }

    if (c.default !== undefined) {
      out += ` DEFAULT ${defaultLiteral(c.default, dialect)}`;
    }

    if (c.generated) {
      out += ` GENERATED ALWAYS AS (${c.generated})`;
    }

    if (c.references) {
      out += ` REFERENCES ${dialect.quote(c.references.table)} (${dialect.quote(c.references.column)})`;
      if (c.references.onDelete) {
        out += ` ON DELETE ${c.references.onDelete}`;
      }

      if (c.references.onUpdate) {
        out += ` ON UPDATE ${c.references.onUpdate}`;
      }
    }

    return out;
  });

  const statements = [
    `CREATE TABLE ${options.ifNotExists ? 'IF NOT EXISTS ' : ''}${dialect.quote(table.name)} (${defs.join(', ')})`,
  ];

  for (const idx of table.indexes) {
    const name =
      idx.name ?? `${table.name}_${idx.columns.join('_')}_${idx.unique ? 'uniq' : 'idx'}`;

    statements.push(
      `CREATE ${idx.unique ? 'UNIQUE ' : ''}INDEX ${dialect.quote(name)} ON ${dialect.quote(table.name)} (${idx.columns.map((x) => dialect.quote(x)).join(', ')})${idx.where ? ` WHERE ${idx.where}` : ''}`,
    );
  }

  return statements;
}

export function dropTableSql(table: string, dialect: SqlDialect, ifExists = true): string {
  return `DROP TABLE ${ifExists ? 'IF EXISTS ' : ''}${dialect.quote(table)}`;
}

function mapType(type: string, dialect: string): string {
  if (dialect === 'mysql' && type === 'UUID') {
    return 'CHAR(36)';
  }

  if (dialect === 'sqlite') {
    if (/^(VARCHAR|TEXT|UUID)/.test(type)) {
      return 'TEXT';
    }

    if (/^(INTEGER|BIGINT|BOOLEAN)/.test(type)) {
      return 'INTEGER';
    }

    if (/^(DECIMAL)/.test(type)) {
      return 'NUMERIC';
    }

    if (/^(JSON)/.test(type)) {
      return 'TEXT';
    }

    if (/^(TIMESTAMP|DATE)/.test(type)) {
      return 'TEXT';
    }
  }

  if (dialect === 'mssql' && type === 'UUID') {
    return 'UNIQUEIDENTIFIER';
  }

  if (dialect === 'mssql' && type === 'BOOLEAN') {
    return 'BIT';
  }

  return type;
}

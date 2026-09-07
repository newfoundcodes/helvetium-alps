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

import type { SqlDialectName } from '../types.js';

export type { SqlDialect } from '../interfaces/dialect.js';
import type { SqlDialect } from '../interfaces/dialect.js';

function splitIdentifier(value: string): string[] {
  return value
    .split('.')
    .map((x) => x.trim())
    .filter(Boolean);
}

export class PostgresDialect implements SqlDialect {
  readonly name = 'postgres' as const;

  quote(identifier: string): string {
    return splitIdentifier(identifier)
      .map((p) => `"${p.replaceAll('"', '""')}"`)
      .join('.');
  }

  placeholder(index: number): string {
    return `$${index}`;
  }

  boolean(value: boolean): string {
    return value ? 'TRUE' : 'FALSE';
  }

  limitOffset(limit?: number, offset?: number): string {
    return `${limit === undefined ? '' : ` LIMIT ${limit}`}${offset === undefined ? '' : ` OFFSET ${offset}`}`;
  }

  returning(columns: string[]): string {
    return columns.length
      ? ` RETURNING ${columns.map((x) => (x === '*' ? '*' : this.quote(x))).join(', ')}`
      : '';
  }
}

export class MySqlDialect implements SqlDialect {
  readonly name = 'mysql' as const;

  quote(identifier: string): string {
    return splitIdentifier(identifier)
      .map((p) => `\`${p.replaceAll('`', '``')}\``)
      .join('.');
  }

  placeholder(): string {
    return '?';
  }

  boolean(value: boolean): string {
    return value ? 'TRUE' : 'FALSE';
  }

  limitOffset(limit?: number, offset?: number): string {
    if (limit === undefined && offset === undefined) {
      return '';
    }

    return ` LIMIT ${offset ?? 0}, ${limit ?? 18446744073709551615}`;
  }

  returning(): string {
    return '';
  }
}

export class SqliteDialect implements SqlDialect {
  readonly name = 'sqlite' as const;

  quote(identifier: string): string {
    return splitIdentifier(identifier)
      .map((p) => `"${p.replaceAll('"', '""')}"`)
      .join('.');
  }

  placeholder(): string {
    return '?';
  }

  boolean(value: boolean): string {
    return value ? '1' : '0';
  }

  limitOffset(limit?: number, offset?: number): string {
    return `${limit === undefined ? '' : ` LIMIT ${limit}`}${offset === undefined ? '' : ` OFFSET ${offset}`}`;
  }

  returning(columns: string[]): string {
    return columns.length
      ? ` RETURNING ${columns.map((x) => (x === '*' ? '*' : this.quote(x))).join(', ')}`
      : '';
  }
}

export class MsSqlDialect implements SqlDialect {
  readonly name = 'mssql' as const;

  quote(identifier: string): string {
    return splitIdentifier(identifier)
      .map((p) => `[${p.replaceAll(']', ']]')}]`)
      .join('.');
  }

  placeholder(index: number): string {
    return `@p${index}`;
  }

  boolean(value: boolean): string {
    return value ? '1' : '0';
  }

  limitOffset(limit?: number, offset?: number): string {
    if (limit === undefined && offset === undefined) {
      return '';
    }

    return ` OFFSET ${offset ?? 0} ROWS${limit === undefined ? '' : ` FETCH NEXT ${limit} ROWS ONLY`}`;
  }

  returning(): string {
    return '';
  }
}

export class GenericDialect implements SqlDialect {
  readonly name = 'generic' as const;

  quote(identifier: string): string {
    return splitIdentifier(identifier)
      .map((p) => `"${p.replaceAll('"', '""')}"`)
      .join('.');
  }

  placeholder(): string {
    return '?';
  }

  boolean(value: boolean): string {
    return value ? 'TRUE' : 'FALSE';
  }

  limitOffset(limit?: number, offset?: number): string {
    return `${limit === undefined ? '' : ` LIMIT ${limit}`}${offset === undefined ? '' : ` OFFSET ${offset}`}`;
  }

  returning(columns: string[]): string {
    return columns.length
      ? ` RETURNING ${columns.map((x) => (x === '*' ? '*' : this.quote(x))).join(', ')}`
      : '';
  }
}

export function dialect(name: SqlDialectName): SqlDialect {
  switch (name) {
    case 'postgres':
      return new PostgresDialect();
    case 'mysql':
      return new MySqlDialect();
    case 'sqlite':
      return new SqliteDialect();
    case 'mssql':
      return new MsSqlDialect();
    default:
      return new GenericDialect();
  }
}

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

import type { SqlConnection } from '../types.js';
import { PooledSqlAdapter, SqlClientAdapter } from './sql.js';
import type { MsSqlClientLike, MsSqlPoolLike } from '../interfaces/adapters/mssql.js';

export type { MsSqlClientLike, MsSqlPoolLike } from '../interfaces/adapters/mssql.js';

export function mssql(client: MsSqlClientLike) {
  return new SqlClientAdapter({
    dialect: 'mssql',
    client,
    capabilities: {
      transactions: true,
      savepoints: true,
      joins: true,
      preparedStatements: true,
      explain: true,
    },
  });
}

export function mssqlPool(
  create: () => Promise<SqlConnection>,
  options: { max?: number; min?: number; idleTimeoutMs?: number; acquireTimeoutMs?: number } = {},
) {
  return new PooledSqlAdapter({ dialect: 'mssql', create, ...options });
}

export function mssqlNative(pool: MsSqlPoolLike) {
  return mssql({
    query: async (text, values = []) => {
      const request = pool.request();
      values.forEach((value, index) => request.input(`p${index + 1}`, value));

      const result = await request.query(text);
      return {
        rows: (result as { recordset?: unknown[] }).recordset ?? [],
        rowCount: Number(
          (result as { rowsAffected?: number[] }).rowsAffected?.reduce?.(
            (a: number, b: number) => a + b,
            0,
          ) ??
            (result as { recordset?: unknown[] }).recordset?.length ??
            0,
        ),
        metadata: { recordsets: (result as { recordsets?: unknown[] }).recordsets },
      };
    },
    close: () => pool.close?.(),
  });
}

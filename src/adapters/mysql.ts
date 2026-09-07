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
import type { MySqlClientLike, MySql2ClientLike } from '../interfaces/adapters/mysql.js';

export type { MySqlClientLike, MySql2ClientLike } from '../interfaces/adapters/mysql.js';

export function mysql(client: MySqlClientLike) {
  return new SqlClientAdapter({
    dialect: 'mysql',
    client,
    capabilities: {
      transactions: true,
      savepoints: true,
      joins: true,
      upsert: true,
      preparedStatements: true,
      explain: true,
    },
  });
}

export function mysqlPool(
  create: () => Promise<SqlConnection>,
  options: { max?: number; min?: number; idleTimeoutMs?: number; acquireTimeoutMs?: number } = {},
) {
  return new PooledSqlAdapter({
    dialect: 'mysql',
    create,
    ...options,
    capabilities: { upsert: true, explain: true },
  });
}

export function mysql2(client: MySql2ClientLike) {
  return mysql({
    query: (text, values) => client.execute(text, values),
    close: () => client.end?.(),
  });
}

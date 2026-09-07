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

import { SqlClientAdapter } from './sql.js';
import type {
  SqliteClientLike,
  PreparedSqliteLike,
  CallbackSqliteLike,
} from '../interfaces/adapters/sqlite.js';

export type {
  SqliteClientLike,
  PreparedStatementLike,
  PreparedSqliteLike,
  CallbackSqliteLike,
} from '../interfaces/adapters/sqlite.js';

export function sqlite(client: SqliteClientLike) {
  return new SqlClientAdapter({
    dialect: 'sqlite',
    client,
    capabilities: {
      transactions: true,
      savepoints: true,
      joins: true,
      returning: true,
      upsert: true,
      preparedStatements: true,
      explain: true,
    },
  });
}

export function sqlitePrepared(client: PreparedSqliteLike) {
  return sqlite({
    query: async (text, values = []) => {
      const statement = client.prepare(text);
      if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(text)) {
        return statement.all(...values);
      }

      return statement.run(...values);
    },
    close: () => client.close?.(),
  });
}

export function sqliteCallback(client: CallbackSqliteLike) {
  return sqlite({
    query: (text, values = []) =>
      new Promise((resolve, reject) => {
        if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(text)) {
          client.all(text, values, (e, rows) => (e ? reject(e) : resolve(rows ?? [])));
        } else {
          client.run(text, values, function (e) {
            e ? reject(e) : resolve({ changes: this.changes, lastInsertRowid: this.lastID });
          });
        }
      }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (!client.close) {
          return resolve();
        }

        client.close((e) => (e ? reject(e) : resolve()));
      }),
  });
}

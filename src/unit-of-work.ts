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

import type { SqlDatabase, SqlTransaction } from './database.js';

export type UnitWork<T> = (tx: SqlTransaction) => Promise<T>;

export class UnitOfWork {
  private operations: UnitWork<unknown>[] = [];

  constructor(private readonly db: SqlDatabase) {}

  add<T>(operation: UnitWork<T>): this {
    this.operations.push(operation as UnitWork<unknown>);
    return this;
  }

  async commit(options: { retries?: number } = {}): Promise<unknown[]> {
    const operations = this.operations.splice(0);
    return this.db.transaction(
      async (tx) => {
        const results: unknown[] = [];
        for (const op of operations) {
          results.push(await op(tx));
        }

        return results;
      },
      { retries: options.retries ?? 0 },
    );
  }

  clear(): void {
    this.operations = [];
  }

  get size(): number {
    return this.operations.length;
  }
}

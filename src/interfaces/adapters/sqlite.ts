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

import type { GenericSqlClient } from './sql.js';

export type SqliteClientLike = GenericSqlClient;

export interface PreparedStatementLike {
  all(...values: unknown[]): unknown[];
  run(...values: unknown[]): { changes?: number; lastInsertRowid?: number | bigint };
}

export interface PreparedSqliteLike {
  prepare(text: string): PreparedStatementLike;
  close?(): void;
}

export interface CallbackSqliteLike {
  all(
    text: string,
    values: readonly unknown[],
    callback: (error: Error | null, rows?: unknown[]) => void,
  ): void;
  run(
    text: string,
    values: readonly unknown[],
    callback: (this: { changes?: number; lastID?: number }, error: Error | null) => void,
  ): void;
  close?(callback?: (error?: Error | null) => void): void;
}

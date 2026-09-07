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

import type { DocumentFilter } from '../../types.js';
import type { DocumentUpdate } from '../../interfaces/types.js';

export interface DynamoPage<T> {
  items: T[];
  lastKey?: Record<string, unknown>;
}

export interface DynamoClientLike {
  get(table: string, key: Record<string, unknown>): Promise<Record<string, unknown> | null>;

  put(
    table: string,
    item: Record<string, unknown>,
    options?: { condition?: unknown },
  ): Promise<void>;

  delete(table: string, key: Record<string, unknown>): Promise<boolean>;

  scan<T extends Record<string, unknown>>(
    table: string,
    options?: { filter?: DocumentFilter<T>; limit?: number; startKey?: Record<string, unknown> },
  ): Promise<DynamoPage<T>>;

  query?<T extends Record<string, unknown>>(
    table: string,
    options: Record<string, unknown>,
  ): Promise<DynamoPage<T>>;

  update(
    table: string,
    key: Record<string, unknown>,
    update: DocumentUpdate<Record<string, unknown>> | Record<string, unknown>,
  ): Promise<Record<string, unknown> | null>;

  transactWrite?(actions: Record<string, unknown>[]): Promise<void>;

  ping?(): Promise<void>;

  close?(): Promise<void> | void;
}

export interface DynamoOptions {
  partitionKey?: string;
  sortKey?: string;
}

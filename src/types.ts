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

export type DatabaseKind = 'sql' | 'document' | 'keyvalue';

export type SqlDialectName = 'postgres' | 'mysql' | 'sqlite' | 'mssql' | 'generic';

export type IsolationLevel =
  'read-uncommitted' | 'read-committed' | 'repeatable-read' | 'serializable' | 'snapshot';

export type QueryPurpose = 'read' | 'write' | 'schema' | 'transaction' | 'maintenance';

export type SortDirection = 1 | -1 | 'asc' | 'desc';

export type Primitive = string | number | boolean | bigint | Date | null;

export type DocumentFilter<T extends Record<string, unknown> = Record<string, unknown>> = {
  [K in keyof T]?:
    | T[K]
    | {
        $eq?: T[K];
        $ne?: T[K];
        $gt?: T[K];
        $gte?: T[K];
        $lt?: T[K];
        $lte?: T[K];
        $in?: T[K][];
        $nin?: T[K][];
        $exists?: boolean;
      };
} & {
  $and?: DocumentFilter<T>[];
  $or?: DocumentFilter<T>[];
  $not?: DocumentFilter<T>;
};

export type {
  DatabaseCapabilities,
  QueryResult,
  CompiledQuery,
  QueryEvent,
  TransactionOptions,
  DatabaseHealth,
  ConnectionStats,
  Disposable,
  SqlConnection,
  SqlAdapter,
  DocumentFindOptions,
  DocumentUpdate,
  DocumentCollectionAdapter,
  DocumentAdapter,
  KeyValueAdapter,
  DatabaseRegistration,
  RetryPolicy,
  AlpsOptions,
} from './interfaces/types.js';

import type {
  SqlAdapter,
  DocumentAdapter,
  KeyValueAdapter,
  QueryEvent,
} from './interfaces/types.js';

export type DatabaseAdapter = SqlAdapter | DocumentAdapter | KeyValueAdapter;

export type QueryHook = (event: QueryEvent) => void | Promise<void>;

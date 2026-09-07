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

import type {
  DatabaseKind,
  DocumentFilter,
  IsolationLevel,
  QueryPurpose,
  SqlDialectName,
  SortDirection,
} from '../types.js';

export interface DatabaseCapabilities {
  readonly transactions?: boolean;
  readonly savepoints?: boolean;
  readonly joins?: boolean;
  readonly returning?: boolean;
  readonly upsert?: boolean;
  readonly streaming?: boolean;
  readonly preparedStatements?: boolean;
  readonly advisoryLocks?: boolean;
  readonly ttl?: boolean;
  readonly secondaryIndexes?: boolean;
  readonly watch?: boolean;
  readonly bulkWrite?: boolean;
  readonly explain?: boolean;
}

export interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
  fields?: string[];
  insertId?: string | number | bigint;
  metadata?: Record<string, unknown>;
}

export interface CompiledQuery {
  text: string;
  values: unknown[];
  dialect: SqlDialectName;
  purpose?: QueryPurpose;
}

export interface QueryEvent {
  database: string;
  kind: DatabaseKind;
  operation: string;
  startedAt: number;
  durationMs?: number;
  query?: CompiledQuery;
  metadata?: Record<string, unknown>;
  error?: unknown;
}

export interface TransactionOptions {
  isolation?: IsolationLevel;
  readOnly?: boolean;
  deferrable?: boolean;
  retries?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
}

export interface DatabaseHealth {
  ok: boolean;
  latencyMs: number;
  details?: Record<string, unknown>;
}

export interface ConnectionStats {
  active: number;
  idle: number;
  waiting: number;
  total: number;
  max: number;
}

export interface Disposable {
  close(): void | Promise<void>;
}

export interface SqlConnection extends Disposable {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
  begin?(options?: TransactionOptions): Promise<void>;
  commit?(): Promise<void>;
  rollback?(): Promise<void>;
}

export interface SqlAdapter extends Disposable {
  readonly kind: 'sql';
  readonly dialect: SqlDialectName;
  readonly capabilities: DatabaseCapabilities;
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
  connect?(): Promise<SqlConnection>;
  transaction?<T>(
    fn: (connection: SqlConnection) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;
  health?(): Promise<DatabaseHealth>;
}

export interface DocumentFindOptions<T extends Record<string, unknown> = Record<string, unknown>> {
  sort?: Partial<Record<keyof T, SortDirection>>;
  limit?: number;
  skip?: number;
  projection?: Partial<Record<keyof T, 0 | 1>>;
}

export interface DocumentUpdate<T extends Record<string, unknown> = Record<string, unknown>> {
  $set?: Partial<T>;
  $unset?: Partial<Record<keyof T, true | 1>>;
  $inc?: Partial<Record<keyof T, number>>;
  $push?: Partial<Record<keyof T, unknown>>;
}

export interface DocumentCollectionAdapter<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  find(filter?: DocumentFilter<T>, options?: DocumentFindOptions<T>): Promise<T[]>;
  findOne(filter: DocumentFilter<T>): Promise<T | null>;
  insertOne(document: T): Promise<{ id?: unknown; document: T }>;
  insertMany(documents: T[]): Promise<{ insertedCount: number }>;
  updateOne(
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T> | Partial<T>,
    options?: { upsert?: boolean },
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedId?: unknown }>;
  updateMany(
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T> | Partial<T>,
  ): Promise<{ matchedCount: number; modifiedCount: number }>;
  deleteOne(filter: DocumentFilter<T>): Promise<{ deletedCount: number }>;
  deleteMany(filter: DocumentFilter<T>): Promise<{ deletedCount: number }>;
  count(filter?: DocumentFilter<T>): Promise<number>;
  createIndex?(
    definition: Record<string, SortDirection>,
    options?: Record<string, unknown>,
  ): Promise<string | void>;
}

export interface DocumentAdapter extends Disposable {
  readonly kind: 'document';
  readonly capabilities: DatabaseCapabilities;
  collection<T extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
  ): DocumentCollectionAdapter<T>;
  transaction?<T>(
    fn: (tx: DocumentAdapter) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;
  health?(): Promise<DatabaseHealth>;
}

export interface KeyValueAdapter extends Disposable {
  readonly kind: 'keyvalue';
  readonly capabilities: DatabaseCapabilities;
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(
    key: string,
    value: T,
    options?: { ttlMs?: number; ifAbsent?: boolean; ifPresent?: boolean },
  ): Promise<boolean>;
  delete(...keys: string[]): Promise<number>;
  has(key: string): Promise<boolean>;
  increment(key: string, by?: number): Promise<number>;
  expire(key: string, ttlMs: number): Promise<boolean>;
  ttl(key: string): Promise<number | null>;
  scan(prefix?: string): AsyncIterable<string>;
  transaction?<T>(fn: (tx: KeyValueAdapter) => Promise<T>): Promise<T>;
  health?(): Promise<DatabaseHealth>;
}

export interface DatabaseRegistration {
  name: string;
  adapter: SqlAdapter | DocumentAdapter | KeyValueAdapter;
  role?: 'primary' | 'replica';
  tags?: string[];
}

export interface RetryPolicy {
  attempts?: number;
  delayMs?: number;
  factor?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export interface AlpsOptions {
  defaultDatabase?: string;
  hooks?: ((event: QueryEvent) => void | Promise<void>)[];
  retry?: RetryPolicy;
}

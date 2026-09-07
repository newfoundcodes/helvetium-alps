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

export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: Record<string, unknown>): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  exists?(key: string): Promise<number>;
  incrBy?(key: string, by: number): Promise<number>;
  pExpire?(key: string, ttlMs: number): Promise<number | boolean>;
  pTTL?(key: string): Promise<number>;
  scanIterator?(options?: Record<string, unknown>): AsyncIterable<string>;
  keys?(pattern: string): Promise<string[]>;
  multi?(): RedisMultiLike;
  transaction?<T>(fn: (client: RedisClientLike) => Promise<T>): Promise<T>;
  quit?(): Promise<void> | void;
  ping?(): Promise<unknown>;
}

export interface RedisMultiLike {
  exec(): Promise<unknown>;
  [key: string]: unknown;
}

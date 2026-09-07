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

import type { DatabaseHealth, KeyValueAdapter } from '../types.js';
import type { RedisClientLike } from '../interfaces/adapters/redis.js';

export type { RedisClientLike, RedisMultiLike } from '../interfaces/adapters/redis.js';

export class RedisKeyValueAdapter implements KeyValueAdapter {
  readonly kind = 'keyvalue' as const;
  readonly capabilities;

  constructor(
    private readonly client: RedisClientLike,
    private readonly prefix = '',
  ) {
    this.capabilities = { transactions: Boolean(client.transaction), ttl: true, watch: true };
  }

  private k(key: string) {
    return this.prefix + key;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const v = await this.client.get(this.k(key));
    if (v === null) {
      return null;
    }

    try {
      return JSON.parse(v) as T;
    } catch {
      return v as unknown as T;
    }
  }

  async set<T = unknown>(
    key: string,
    value: T,
    options: { ttlMs?: number; ifAbsent?: boolean; ifPresent?: boolean } = {},
  ): Promise<boolean> {
    const opts: Record<string, unknown> = {};
    if (options.ttlMs !== undefined) {
      opts.PX = options.ttlMs;
    }

    if (options.ifAbsent) {
      opts.NX = true;
    }

    if (options.ifPresent) {
      opts.XX = true;
    }

    const result = await this.client.set(this.k(key), JSON.stringify(value), opts);
    return result !== null && result !== false;
  }

  delete(...keys: string[]) {
    return this.client.del(...keys.map((x) => this.k(x)));
  }

  async has(key: string) {
    if (this.client.exists) {
      return (await this.client.exists(this.k(key))) > 0;
    }

    return (await this.client.get(this.k(key))) !== null;
  }

  async increment(key: string, by = 1) {
    if (this.client.incrBy) {
      return this.client.incrBy(this.k(key), by);
    }

    const current = Number((await this.get(key)) ?? 0) + by;
    await this.set(key, current);
    return current;
  }

  async expire(key: string, ttlMs: number) {
    if (!this.client.pExpire) {
      throw new Error('Redis client does not expose pExpire');
    }

    return Boolean(await this.client.pExpire(this.k(key), ttlMs));
  }

  async ttl(key: string) {
    if (!this.client.pTTL) {
      throw new Error('Redis client does not expose pTTL');
    }

    const v = await this.client.pTTL(this.k(key));
    return v < 0 ? null : v;
  }

  async *scan(prefix = '') {
    const match = `${this.prefix}${prefix}*`;
    if (this.client.scanIterator) {
      for await (const key of this.client.scanIterator({ MATCH: match })) {
        yield key.slice(this.prefix.length);
      }

      return;
    }

    if (this.client.keys) {
      for (const key of await this.client.keys(match)) {
        yield key.slice(this.prefix.length);
      }

      return;
    }

    throw new Error('Redis client does not expose scanIterator or keys');
  }

  async transaction<T>(fn: (tx: KeyValueAdapter) => Promise<T>): Promise<T> {
    if (!this.client.transaction) {
      throw new Error('Redis client does not expose a transaction callback adapter');
    }

    return this.client.transaction(async () => fn(this));
  }

  async health(): Promise<DatabaseHealth> {
    const start = performance.now();
    try {
      await this.client.ping?.();
      return { ok: true, latencyMs: performance.now() - start };
    } catch (e) {
      return { ok: false, latencyMs: performance.now() - start, details: { error: String(e) } };
    }
  }

  async close() {
    await this.client.quit?.();
  }
}

export function redis(client: RedisClientLike, options: { prefix?: string } = {}) {
  return new RedisKeyValueAdapter(client, options.prefix ?? '');
}

export const valkey = redis;

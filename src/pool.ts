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

import type { ConnectionStats, Disposable } from './types.js';
import type { PoolOptions } from './interfaces/pool.js';

export type { PoolOptions } from './interfaces/pool.js';

interface Idle<T> {
  value: T;
  since: number;
}

interface Waiter<T extends Disposable> {
  resolve(value: Lease<T>): void;
  reject(error: unknown): void;
  timer?: ReturnType<typeof setTimeout>;
}

export class Lease<T extends Disposable> {
  private released = false;

  constructor(
    readonly value: T,
    private readonly releaseFn: (value: T) => Promise<void>,
  ) {}

  async release(): Promise<void> {
    if (this.released) {
      return;
    }

    this.released = true;
    await this.releaseFn(this.value);
  }
}

export class ConnectionPool<T extends Disposable> implements Disposable {
  private readonly max: number;
  private readonly min: number;
  private readonly idleTimeoutMs: number;
  private readonly acquireTimeoutMs: number;
private idle: Idle<T>[] = [];
  private active = new Set<T>();
  private waiters: Waiter<T>[] = [];
  private total = 0;
  private closed = false;
  private reapTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly options: PoolOptions<T>) {
    this.max = options.max ?? 10;
    this.min = Math.min(options.min ?? 0, this.max);
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30_000;
    this.acquireTimeoutMs = options.acquireTimeoutMs ?? 10_000;

    if (this.max < 1) {
      throw new RangeError('Pool max must be at least 1');
    }

    this.reapTimer = setInterval(
      () => {
        void this.reap();
      },
      Math.max(1_000, Math.min(this.idleTimeoutMs, 10_000)),
    );
  }

  async warm(): Promise<void> {
    while (!this.closed && this.total < this.min) {
      const r = await this.options.create();
      this.total++;
      this.idle.push({ value: r, since: Date.now() });
    }
  }

  async acquire(): Promise<Lease<T>> {
    if (this.closed) {
      throw new Error('Pool is closed');
    }

    while (this.idle.length) {
      const candidate = this.idle.pop()!.value;
      if (!this.options.validate || (await this.options.validate(candidate))) {
        this.active.add(candidate);
        return new Lease(candidate, (v) => this.release(v));
      }

      await candidate.close();
      this.total--;
    }

    if (this.total < this.max) {
      const resource = await this.options.create();
      this.total++;
      this.active.add(resource);
      return new Lease(resource, (v) => this.release(v));
    }

    return await new Promise<Lease<T>>((resolve, reject) => {
      const waiter: Waiter<T> = { resolve, reject };
      waiter.timer = setTimeout(() => {
        const idx = this.waiters.indexOf(waiter);
        if (idx >= 0) {
          this.waiters.splice(idx, 1);
        }

        reject(new Error('Pool acquisition timed out'));
      }, this.acquireTimeoutMs);
      this.waiters.push(waiter);
    });
  }

  private async release(value: T): Promise<void> {
    if (!this.active.delete(value)) {
      return;
    }

    if (this.closed) {
      await value.close();
      this.total--;
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      if (waiter.timer) {
        clearTimeout(waiter.timer);
      }

      this.active.add(value);
      waiter.resolve(new Lease(value, (v) => this.release(v)));
      return;
    }

    this.idle.push({ value, since: Date.now() });
  }

  private async reap(): Promise<void> {
    if (this.closed) {
      return;
    }

    const now = Date.now(),
      keep: Idle<T>[] = [];
    for (const item of this.idle) {
      if (this.total > this.min && now - item.since >= this.idleTimeoutMs) {
        await item.value.close();
        this.total--;
      } else {
        keep.push(item);
      }
    }

    this.idle = keep;
  }

  stats(): ConnectionStats {
    return {
      active: this.active.size,
      idle: this.idle.length,
      waiting: this.waiters.length,
      total: this.total,
      max: this.max,
    };
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    if (this.reapTimer) {
      clearInterval(this.reapTimer);
    }

    for (const waiter of this.waiters.splice(0)) {
      if (waiter.timer) {
        clearTimeout(waiter.timer);
      }

      waiter.reject(new Error('Pool closed'));
    }

    const all = [...this.idle.map((x) => x.value), ...this.active];
    this.idle = [];
    this.active.clear();
    this.total = 0;

    await Promise.all(all.map((x) => Promise.resolve(x.close())));
  }
}

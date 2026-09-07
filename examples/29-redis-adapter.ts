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

import { redis } from '@newfoundcodes/helvetium-alps';

const map = new Map<string, string>();
const client = {
  get: async (k: string) => map.get(k) ?? null,
  set: async (k: string, v: string) => {
    map.set(k, v);
    return 'OK';
  },
  del: async (...keys: string[]) => keys.reduce((n, k) => n + (map.delete(k) ? 1 : 0), 0),
  keys: async () => [...map.keys()],
};

const store = redis(client, { prefix: 'app:' });
await store.set('feature', { enabled: true });

console.log(await store.get('feature'));

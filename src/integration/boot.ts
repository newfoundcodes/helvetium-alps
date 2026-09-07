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

import type { Alps } from '../database.js';
import type { BootContextLike, BootAppLike } from '../interfaces/integration/boot.js';

export type { BootContextLike, BootAppLike } from '../interfaces/integration/boot.js';

export type BootMiddlewareLike = (
  context: BootContextLike,
  next: () => Promise<Response | void>,
) => Promise<Response | void>;

const kAlps = Symbol.for('@newfoundcodes/helvetium-alps/context');

export function alpsMiddleware(
  alps: Alps,
  options: { contextKey?: string } = {},
): BootMiddlewareLike {
  return async (context, next) => {
    (context as Record<symbol, unknown>)[kAlps] = alps;
    context.set?.(options.contextKey ?? 'alps', alps);
    return next();
  };
}

export function getAlps(context: BootContextLike): Alps {
  const value = (context as Record<symbol, unknown>)[kAlps] as Alps | undefined;
  if (!value) {
    throw new Error('Helvetium Alps is not installed in this Boot request context');
  }

  return value;
}

export function mountAlpsHealth(
  app: BootAppLike,
  alps: Alps,
  path = '/internal/alps/health',
): void {
  if (!app.get) {
    throw new Error('Boot application does not expose get()');
  }

  app.get(path, async (c: BootContextLike) => {
    const health = await alps.health();
    const ok = Object.values(health).every((x) => x.ok);
    return c.json
      ? c.json({ ok, databases: health }, ok ? 200 : 503)
      : new Response(JSON.stringify({ ok, databases: health }), {
          status: ok ? 200 : 503,
          headers: { 'content-type': 'application/json' },
        });
  });
}

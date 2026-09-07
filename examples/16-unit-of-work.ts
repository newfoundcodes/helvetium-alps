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

import { Alps, postgres, UnitOfWork } from '@newfoundcodes/helvetium-alps';

const db = new Alps()
  .register('main', postgres({ query: async () => ({ rows: [], rowCount: 1 }) }))
  .sql();

const work = new UnitOfWork(db);
work
  .add((tx) => tx.query('INSERT INTO users(name) VALUES($1)', ['Alice']))
  .add((tx) => tx.query('INSERT INTO audit(message) VALUES($1)', ['created user']));

await work.commit();

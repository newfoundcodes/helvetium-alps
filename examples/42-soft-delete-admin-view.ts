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

import { Alps, postgres, defineTable, types, Repository } from '@newfoundcodes/helvetium-alps';

type Row = { id: number; deletedAt: Date | null };

const repo = new Repository(
  new Alps().register('main', postgres({ query: async () => ({ rows: [], rowCount: 0 }) })).sql(),
  defineTable<Row>(
    'records',
    { id: types.integer(), deletedAt: types.datetime({ nullable: true }) },
    { softDeletes: true },
  ),
);

console.log(await repo.findMany({ withDeleted: true }));

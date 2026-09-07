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

import {
  Alps,
  postgres,
  defineModel,
  defineTable,
  types,
  repositoryFor,
} from '@newfoundcodes/helvetium-alps';

type Customer = { id: number; email: string };

const Customer = defineModel<Customer>({
  name: 'Customer',
  table: defineTable<Customer>('customers', { id: types.integer(), email: types.string(320) }),
});

const db = new Alps()
  .register('main', postgres({ query: async () => ({ rows: [], rowCount: 0 }) }))
  .sql();

const customers = repositoryFor(db, Customer);
console.log(await customers.findMany({ limit: 10 }));

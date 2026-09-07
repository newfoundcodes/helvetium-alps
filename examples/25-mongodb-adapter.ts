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

import { mongodb } from '@newfoundcodes/helvetium-alps';

const nativeDb = {
  collection() {
    return {
      find() {
        return { toArray: async () => [] };
      },
      findOne: async () => null,
      insertOne: async () => ({ insertedId: 'id' }),
      insertMany: async (d: unknown[]) => ({ insertedCount: d.length }),
      updateOne: async () => ({ matchedCount: 0, modifiedCount: 0 }),
      updateMany: async () => ({ matchedCount: 0, modifiedCount: 0 }),
      deleteOne: async () => ({ deletedCount: 0 }),
      deleteMany: async () => ({ deletedCount: 0 }),
      countDocuments: async () => 0,
    };
  },
};

console.log(await mongodb(nativeDb).collection('users').find({}));

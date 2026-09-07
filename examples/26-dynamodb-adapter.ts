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

import { dynamodb } from '@newfoundcodes/helvetium-alps';

const client = {
  get: async () => null,
  put: async () => {},
  delete: async () => true,
  scan: async () => ({ items: [] }),
  update: async () => null,
};

const users = dynamodb(client, { partitionKey: 'id' }).collection<{ id: string; email: string }>(
  'Users',
);

await users.insertOne({ id: 'u1', email: 'a@example.com' });

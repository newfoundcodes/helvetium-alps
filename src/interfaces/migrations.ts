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

import type { SqlDatabase, SqlTransaction } from '../database.js';
import type { SqlDialect } from '../sql/dialect.js';
import type { SchemaEditor } from '../migrations.js';

export interface MigrationContext {
  db: SqlDatabase | SqlTransaction;
  dialect: SqlDialect;
  schema: SchemaEditor;
}

export interface Migration {
  id: string;
  up(context: MigrationContext): void | Promise<void>;
  down?(context: MigrationContext): void | Promise<void>;
}

export interface MigrationRecord {
  id: string;
  appliedAt: string;
  batch: number;
  checksum?: string;
}

export interface MigrationStateStore {
  list(): Promise<MigrationRecord[]>;
  add(record: MigrationRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

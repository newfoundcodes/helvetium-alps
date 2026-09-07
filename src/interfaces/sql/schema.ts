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

export interface ColumnOptions {
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  default?: unknown;
  references?: { table: string; column: string; onDelete?: string; onUpdate?: string };
  generated?: string;
}

export interface ColumnDefinition<T = unknown> extends ColumnOptions {
  name: string;
  dataType: string;
  _type?: T;
}

export interface IndexDefinition {
  name?: string;
  columns: string[];
  unique?: boolean;
  where?: string;
}

export interface TableDefinition<_T extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  columns: Record<string, ColumnDefinition>;
  indexes: IndexDefinition[];
  timestamps?: boolean;
  softDeletes?: boolean;
}

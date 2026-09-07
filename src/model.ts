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

import { Repository } from './repository.js';
import type { SqlDatabase, SqlTransaction } from './database.js';
import type { ModelDefinition, Relation } from './interfaces/model.js';

export type { ModelDefinition, Relation } from './interfaces/model.js';

export function defineModel<T extends Record<string, unknown>>(
  definition: ModelDefinition<T>,
): ModelDefinition<T> {
  return definition;
}

export function repositoryFor<T extends Record<string, unknown>>(
  db: SqlDatabase | SqlTransaction,
  model: ModelDefinition<T>,
): Repository<T> {
  return new Repository(
    db as unknown as Pick<SqlDatabase, 'query'> & { adapter: { dialect: string } },
    model.table,
    model.repository,
  );
}

export function belongsTo<A extends Record<string, unknown>, B extends Record<string, unknown>>(
  target: ModelDefinition<B>,
  foreignKey: keyof A & string,
  targetKey: keyof B & string = 'id' as keyof B & string,
): Relation<A, B> {
  return { kind: 'belongsTo', localKey: foreignKey, foreignKey: targetKey, target };
}

export function hasMany<A extends Record<string, unknown>, B extends Record<string, unknown>>(
  target: ModelDefinition<B>,
  foreignKey: keyof B & string,
  localKey: keyof A & string = 'id' as keyof A & string,
): Relation<A, B> {
  return { kind: 'hasMany', localKey, foreignKey, target };
}

export function hasOne<A extends Record<string, unknown>, B extends Record<string, unknown>>(
  target: ModelDefinition<B>,
  foreignKey: keyof B & string,
  localKey: keyof A & string = 'id' as keyof A & string,
): Relation<A, B> {
  return { kind: 'hasOne', localKey, foreignKey, target };
}

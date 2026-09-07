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

export interface MongoCursorLike<T> {
  sort?(sort: Record<string, 1 | -1>): MongoCursorLike<T>;
  skip?(value: number): MongoCursorLike<T>;
  limit?(value: number): MongoCursorLike<T>;
  project?(projection: Record<string, 0 | 1>): MongoCursorLike<T>;
  toArray(): Promise<T[]>;
}

export interface MongoCollectionLike<T extends Record<string, unknown>> {
  find(filter?: Record<string, unknown>, options?: Record<string, unknown>): MongoCursorLike<T>;

  findOne(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<T | null>;

  insertOne(doc: T, options?: Record<string, unknown>): Promise<unknown>;

  insertMany(docs: T[], options?: Record<string, unknown>): Promise<unknown>;

  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown>;

  updateMany(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown>;

  deleteOne(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;

  deleteMany(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;

  countDocuments(
    filter?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<number>;

  createIndex?(
    definition: Record<string, 1 | -1>,
    options?: Record<string, unknown>,
  ): Promise<string>;
}

export interface MongoDbLike {
  collection<T extends Record<string, unknown>>(name: string): MongoCollectionLike<T>;

  command?(command: Record<string, unknown>): Promise<unknown>;
}

export interface MongoSessionLike {
  withTransaction?<T>(fn: () => Promise<T>, options?: Record<string, unknown>): Promise<T>;

  startTransaction?(options?: Record<string, unknown>): void;

  commitTransaction?(): Promise<void>;

  abortTransaction?(): Promise<void>;

  endSession?(): Promise<void> | void;
}

export interface MongoClientLike {
  startSession?(): MongoSessionLike;

  close?(): Promise<void> | void;
}

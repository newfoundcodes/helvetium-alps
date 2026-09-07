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

import type { SqlDatabase } from './database.js';
import type { SqlDialect } from './sql/dialect.js';
import { dialect } from './sql/dialect.js';
import { createTableSql, dropTableSql, type TableDefinition } from './sql/schema.js';
import type { Migration, MigrationRecord, MigrationStateStore } from './interfaces/migrations.js';

export type {
  MigrationContext,
  Migration,
  MigrationRecord,
  MigrationStateStore,
} from './interfaces/migrations.js';

export class MemoryMigrationStateStore implements MigrationStateStore {
  private records: MigrationRecord[] = [];

  async list() {
    return [...this.records];
  }

  async add(record: MigrationRecord) {
    if (this.records.some((x) => x.id === record.id)) {
      throw new Error(`Migration already applied: ${record.id}`);
    }

    this.records.push(record);
  }

  async remove(id: string) {
    this.records = this.records.filter((x) => x.id !== id);
  }
}

export class SchemaEditor {
  readonly statements: string[] = [];

  constructor(readonly dialect: SqlDialect) {}

  createTable(table: TableDefinition, options?: { ifNotExists?: boolean }): this {
    this.statements.push(...createTableSql(table, this.dialect, options));
    return this;
  }

  dropTable(name: string, ifExists = true): this {
    this.statements.push(dropTableSql(name, this.dialect, ifExists));
    return this;
  }

  renameTable(from: string, to: string): this {
    this.statements.push(
      `ALTER TABLE ${this.dialect.quote(from)} RENAME TO ${this.dialect.quote(to)}`,
    );
    return this;
  }

  addColumn(
    table: string,
    name: string,
    dataType: string,
    options: { nullable?: boolean; defaultSql?: string } = {},
  ): this {
    this.statements.push(
      `ALTER TABLE ${this.dialect.quote(table)} ADD COLUMN ${this.dialect.quote(name)} ${dataType}${options.nullable ? '' : ' NOT NULL'}${options.defaultSql ? ` DEFAULT ${options.defaultSql}` : ''}`,
    );
    return this;
  }

  dropColumn(table: string, name: string): this {
    this.statements.push(
      `ALTER TABLE ${this.dialect.quote(table)} DROP COLUMN ${this.dialect.quote(name)}`,
    );
    return this;
  }

  renameColumn(table: string, from: string, to: string): this {
    this.statements.push(
      `ALTER TABLE ${this.dialect.quote(table)} RENAME COLUMN ${this.dialect.quote(from)} TO ${this.dialect.quote(to)}`,
    );
    return this;
  }

  createIndex(
    table: string,
    columns: string[],
    options: { name?: string; unique?: boolean } = {},
  ): this {
    const name = options.name ?? `${table}_${columns.join('_')}_idx`;
    this.statements.push(
      `CREATE ${options.unique ? 'UNIQUE ' : ''}INDEX ${this.dialect.quote(name)} ON ${this.dialect.quote(table)} (${columns.map((x) => this.dialect.quote(x)).join(', ')})`,
    );
    return this;
  }

  dropIndex(name: string): this {
    this.statements.push(`DROP INDEX ${this.dialect.quote(name)}`);
    return this;
  }

  raw(sql: string): this {
    this.statements.push(sql);
    return this;
  }
}

export class Migrator {
  private migrations: Migration[] = [];

  constructor(
    readonly db: SqlDatabase,
    readonly state: MigrationStateStore = new MemoryMigrationStateStore(),
  ) {}

  register(...migrations: Migration[]): this {
    for (const m of migrations) {
      if (this.migrations.some((x) => x.id === m.id)) {
        throw new Error(`Duplicate migration: ${m.id}`);
      }

      this.migrations.push(m);
    }

    this.migrations.sort((a, b) => a.id.localeCompare(b.id));
    return this;
  }

  async status(): Promise<Array<{ id: string; applied: boolean; batch?: number }>> {
    const applied = new Map((await this.state.list()).map((x) => [x.id, x]));
    return this.migrations.map((m) => ({
      id: m.id,
      applied: applied.has(m.id),
      ...(applied.get(m.id)?.batch === undefined ? {} : { batch: applied.get(m.id)!.batch }),
    }));
  }

  async up(options: { steps?: number } = {}): Promise<string[]> {
    const applied = new Set((await this.state.list()).map((x) => x.id));
    const pending = this.migrations
      .filter((x) => !applied.has(x.id))
      .slice(0, options.steps ?? Infinity);

    if (!pending.length) {
      return [];
    }

    const records = await this.state.list();
    const batch = Math.max(0, ...records.map((x) => x.batch)) + 1;
    const done: string[] = [];

    for (const m of pending) {
      await this.db.transaction(async (tx) => {
        const schema = new SchemaEditor(dialect(this.db.adapter.dialect));
        await m.up({ db: tx, dialect: schema.dialect, schema });

        for (const statement of schema.statements) {
          await tx.query(statement);
        }

        await this.state.add({ id: m.id, appliedAt: new Date().toISOString(), batch });
        done.push(m.id);
      });
    }

    return done;
  }

  async down(options: { steps?: number; batch?: boolean } = {}): Promise<string[]> {
    const records = (await this.state.list()).sort((a, b) =>
      b.appliedAt.localeCompare(a.appliedAt),
    );
    let targets = records;

    if (options.batch !== false && records.length) {
      targets = records.filter((x) => x.batch === records[0]!.batch);
    }

    targets = targets.slice(0, options.steps ?? Infinity);

    const done: string[] = [];
    for (const record of targets) {
      const migration = this.migrations.find((x) => x.id === record.id);
      if (!migration?.down) {
        throw new Error(`Migration ${record.id} has no down()`);
      }

      await this.db.transaction(async (tx) => {
        const schema = new SchemaEditor(dialect(this.db.adapter.dialect));
        await migration.down!({ db: tx, dialect: schema.dialect, schema });

        for (const statement of schema.statements) {
          await tx.query(statement);
        }

        await this.state.remove(record.id);
        done.push(record.id);
      });
    }

    return done;
  }
}

export function defineMigration(id: string, migration: Omit<Migration, 'id'>): Migration {
  return { id, ...migration };
}

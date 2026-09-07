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

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mysql2,
  sqlitePrepared,
  sqliteCallback,
  mssqlNative,
  mongodb,
  dynamodb,
  redis,
} from '../dist/index.js';

test('mysql2 bridge uses execute()', async () => {
  let called = false;
  const ad = mysql2({
    execute: async () => {
      called = true;
      return [[{ id: 1 }], { affectedRows: 1 }];
    },
  });
  const r = await ad.query('SELECT 1');

  assert.equal(called, true);
  assert.equal(r.rows[0].id, 1);
});

test('sqlitePrepared reads through all()', async () => {
  const ad = sqlitePrepared({
    prepare() {
      return {
        all() {
          return [{ id: 1 }];
        },
        run() {
          return { changes: 1 };
        },
      };
    },
  });

  assert.equal((await ad.query('SELECT * FROM x')).rows[0].id, 1);
});

test('sqlitePrepared writes through run()', async () => {
  const ad = sqlitePrepared({
    prepare() {
      return {
        all() {
          return [];
        },
        run() {
          return { changes: 2, lastInsertRowid: 9 };
        },
      };
    },
  });

  const r = await ad.query('UPDATE x SET a=1');
  assert.equal(r.rowCount, 2);
  assert.equal(r.insertId, 9);
});

test('sqliteCallback reads callback driver', async () => {
  const ad = sqliteCallback({
    all(_t, _v, cb) {
      cb(null, [{ id: 1 }]);
    },
    run() {},
    close() {},
  });

  assert.equal((await ad.query('SELECT * FROM x')).rows[0].id, 1);
});

test('mssqlNative binds @p values', async () => {
  const inputs = [];
  const ad = mssqlNative({
    request() {
      return {
        input(name, value) {
          inputs.push([name, value]);
          return this;
        },
        query: async () => ({ recordset: [{ id: 1 }], rowsAffected: [1] }),
      };
    },
  });

  const r = await ad.query('SELECT * FROM x WHERE id=@p1', [1]);
  assert.deepEqual(inputs, [['p1', 1]]);
  assert.equal(r.rowCount, 1);
});

test('Dynamo adapter does not advertise generic callback transactions', () => {
  const ad = dynamodb({
    get: async () => null,
    put: async () => {},
    delete: async () => false,
    scan: async () => ({ items: [] }),
    update: async () => null,
    transactWrite: async () => {},
  });

  assert.equal(ad.capabilities.transactions, false);
  assert.equal(typeof ad.transactWrite, 'function');
});

test('Redis adapter advertises transactions only with callback bridge', () => {
  const base = {
    get: async () => null,
    set: async () => 'OK',
    del: async () => 0,
    keys: async () => [],
  };

  assert.equal(redis(base).capabilities.transactions, false);
  assert.equal(
    redis({ ...base, transaction: async (fn) => fn(base) }).capabilities.transactions,
    true,
  );
});

test('Mongo transaction passes session-bound collection options', async () => {
  let seenSession = false;
  const session = { withTransaction: async (fn) => fn(), endSession() {} };
  const db = {
    collection() {
      return {
        find(_f, o) {
          seenSession = Boolean(o?.session);
          return { toArray: async () => [] };
        },
        findOne: async () => null,
        insertOne: async () => ({}),
        insertMany: async () => ({}),
        updateOne: async () => ({}),
        updateMany: async () => ({}),
        deleteOne: async () => ({}),
        deleteMany: async () => ({}),
        countDocuments: async () => 0,
      };
    },
  };

  const ad = mongodb(db, { startSession: () => session });
  await ad.transaction(async (tx) => {
    await tx.collection('x').find({});
  });

  assert.equal(seenSession, true);
});

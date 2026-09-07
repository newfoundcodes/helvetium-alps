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
import * as A from '../dist/index.js';
import * as Boot from '../dist/integration/boot.js';

class FakeSql {
  kind = 'sql';
  dialect = 'postgres';
  capabilities = { transactions: true, savepoints: true, returning: true, joins: true };
  calls = [];
  responses = [];

  async query(text, values = []) {
    this.calls.push([text, [...values]]);
    return this.responses.shift() ?? { rows: [], rowCount: 1 };
  }

  async connect() {
    const self = this;
    return {
      query: (t, v) => self.query(t, v),
      begin: async () => {
        self.calls.push(['BEGIN', []]);
      },
      commit: async () => {
        self.calls.push(['COMMIT', []]);
      },
      rollback: async () => {
        self.calls.push(['ROLLBACK', []]);
      },
      close: async () => {},
    };
  }

  async health() {
    return { ok: true, latencyMs: 1 };
  }

  close() {}
}

const d = (name = 'postgres') => A.dialect(name);
const cases = [];
const add = (name, fn) => cases.push([name, fn]);

add('postgres dialect quotes identifiers', () =>
  assert.equal(d('postgres').quote('users.id'), '"users"."id"'),
);

add('mysql dialect quotes identifiers', () =>
  assert.equal(d('mysql').quote('users.id'), '`users`.`id`'),
);

add('sqlite dialect placeholders', () => assert.equal(d('sqlite').placeholder(3), '?'));

add('mssql dialect placeholders', () => assert.equal(d('mssql').placeholder(3), '@p3'));

add('postgres placeholders', () => assert.equal(d('postgres').placeholder(3), '$3'));

add('select compiles where and values', () => {
  const q = new A.SelectBuilder('postgres')
    .select('id', 'name')
    .from('users')
    .where(A.eq('id', 42))
    .compile();

  assert.equal(q.text, 'SELECT "id", "name" FROM "users" WHERE "id" = $1');
  assert.deepEqual(q.values, [42]);
});

add('select compiles joins', () => {
  const q = new A.SelectBuilder('postgres')
    .from('users')
    .join('profiles', A.raw('"users"."id" = "profiles"."user_id"'))
    .compile();
  assert.match(q.text, /INNER JOIN/);
});

add('select compiles order limit offset', () => {
  const q = new A.SelectBuilder('postgres')
    .from('users')
    .orderBy('id', 'desc')
    .limit(10)
    .offset(20)
    .compile();
  assert.match(q.text, /ORDER BY "id" DESC LIMIT 10 OFFSET 20/);
});

add('select distinct', () =>
  assert.match(
    new A.SelectBuilder('postgres').distinct().from('users').compile().text,
    /SELECT DISTINCT/,
  ),
);

add('select group having', () => {
  const q = new A.SelectBuilder('postgres')
    .select('role')
    .from('users')
    .groupBy('role')
    .having(A.gt(A.raw('COUNT(*)'), 1))
    .compile();

  assert.match(q.text, /GROUP BY "role" HAVING/);
});

add('select empty in array compiles false', () =>
  assert.match(
    new A.SelectBuilder('postgres').from('users').where(A.inArray('id', [])).compile().text,
    /1=0/,
  ),
);

add('null equality uses IS NULL', () =>
  assert.match(
    new A.SelectBuilder('postgres').from('users').where(A.eq('deleted_at', null)).compile().text,
    /IS NULL/,
  ),
);

add('insert compiles multiple rows', () => {
  const q = new A.InsertBuilder('postgres')
    .into('users')
    .values([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ])
    .compile();

  assert.match(q.text, /VALUES \(\$1, \$2\), \(\$3, \$4\)/);
  assert.equal(q.values.length, 4);
});

add('postgres returning', () =>
  assert.match(
    new A.InsertBuilder('postgres').into('users').values({ id: 1 }).returning('id').compile().text,
    /RETURNING "id"/,
  ),
);

add('postgres upsert', () =>
  assert.match(
    new A.InsertBuilder('postgres')
      .into('users')
      .values({ id: 1 })
      .onConflict(['id'])
      .doUpdate({ name: 'x' })
      .compile().text,
    /ON CONFLICT/,
  ),
);

add('mysql upsert', () =>
  assert.match(
    new A.InsertBuilder('mysql')
      .into('users')
      .values({ id: 1 })
      .onConflict(['id'])
      .doUpdate({ name: 'x' })
      .compile().text,
    /ON DUPLICATE KEY UPDATE/,
  ),
);

add('update compiles', () => {
  const q = new A.UpdateBuilder('postgres')
    .tableName('users')
    .set({ name: 'n' })
    .where(A.eq('id', 1))
    .compile();

  assert.match(q.text, /UPDATE "users" SET "name" = \$1 WHERE "id" = \$2/);
});

add('delete compiles', () =>
  assert.match(
    new A.DeleteBuilder('postgres').from('users').where(A.eq('id', 1)).compile().text,
    /DELETE FROM/,
  ),
);

add('sql tagged template binds values', () => {
  const f = A.sql`SELECT * FROM ${A.identifier('users')} WHERE id=${3}`;
  const c = A.compileFragment(f, d('postgres'));

  assert.equal(c.text, 'SELECT * FROM "users" WHERE id=$1');
  assert.deepEqual(c.values, [3]);
});

add('schema define table', () => {
  const t = A.defineTable('users', {
    id: A.types.integer({ primaryKey: true }),
    name: A.types.string(100),
  });

  assert.equal(t.columns.id.primaryKey, true);
});

add('schema timestamps', () => {
  const t = A.defineTable('users', { id: A.types.integer() }, { timestamps: true });
  assert.ok(t.columns.createdAt && t.columns.updatedAt);
});

add('schema soft delete', () => {
  const t = A.defineTable('users', { id: A.types.integer() }, { softDeletes: true });
  assert.ok(t.columns.deletedAt);
});

add('create table sql', () => {
  const t = A.defineTable('users', {
    id: A.types.integer({ primaryKey: true }),
    email: A.types.string(255, { unique: true }),
  });

  assert.match(A.createTableSql(t, d('postgres'))[0], /CREATE TABLE/);
});

add('sqlite type mapping', () => {
  const t = A.defineTable('users', { id: A.types.uuid() });
  assert.match(A.createTableSql(t, d('sqlite'))[0], /TEXT/);
});

add('schema index generation', () => {
  const t = A.defineTable(
    'users',
    { id: A.types.integer(), email: A.types.string() },
    { indexes: [{ columns: ['email'], unique: true }] },
  );

  assert.equal(A.createTableSql(t, d('postgres')).length, 2);
});

add('schema editor queues statements', () => {
  const s = new A.SchemaEditor(d('postgres')).renameTable('a', 'b').addColumn('b', 'x', 'TEXT');
  assert.equal(s.statements.length, 2);
});

add('memory migration state', async () => {
  const s = new A.MemoryMigrationStateStore();

  await s.add({ id: '1', appliedAt: 'x', batch: 1 });
  assert.equal((await s.list()).length, 1);

  await s.remove('1');
  assert.equal((await s.list()).length, 0);
});

add('define migration', () => assert.equal(A.defineMigration('001', { up() {} }).id, '001'));

add('alps register default', () => {
  const a = new A.Alps();
  const f = new FakeSql();

  a.register('main', f);
  assert.equal(a.sql().name, 'main');
});

add('alps duplicate register rejects', () => {
  const a = new A.Alps();
  const f = new FakeSql();

  a.register('x', f);
  assert.throws(() => a.register('x', f));
});

add('alps wrong kind rejects', () => {
  const a = new A.Alps().register('kv', new A.MemoryKeyValueAdapter());
  assert.throws(() => a.sql('kv'));
});

add('alps health', async () => {
  const a = new A.Alps().register('main', new FakeSql());
  assert.equal((await a.health()).main.ok, true);
});

add('alps unregister', () => {
  const a = new A.Alps().register('main', new FakeSql());
  assert.ok(a.unregister('main'));
  assert.equal(a.names().length, 0);
});

add('alps read replica selection', () => {
  const a = new A.Alps()
    .register('primary', new FakeSql())
    .register('replica', new FakeSql(), { role: 'replica', tags: ['primary'] });

  assert.equal(a.read('primary').kind, 'sql');
});

add('sql database executes query', async () => {
  const f = new FakeSql();
  f.responses.push({ rows: [{ id: 1 }], rowCount: 1 });

  const db = new A.Alps().register('main', f).sql();
  assert.equal((await db.query('SELECT 1')).rows[0].id, 1);
});

add('query hooks execute', async () => {
  let n = 0;

  const f = new FakeSql();
  const db = new A.Alps({
    hooks: [
      () => {
        n++;
      },
    ],
  })
    .register('main', f)
    .sql();

  await db.query('SELECT 1');
  assert.equal(n, 2);
});

add('transaction commits', async () => {
  const f = new FakeSql();
  const db = new A.Alps().register('main', f).sql();

  await db.transaction(async (tx) => {
    await tx.query('SELECT 1');
  });
  assert.ok(f.calls.some((x) => x[0] === 'COMMIT'));
});

add('transaction rolls back', async () => {
  const f = new FakeSql();
  const db = new A.Alps().register('main', f).sql();

  await assert.rejects(
    db.transaction(async () => {
      throw new Error('x');
    }),
  );

  assert.ok(f.calls.some((x) => x[0] === 'ROLLBACK'));
});

add('transaction savepoint', async () => {
  const f = new FakeSql();
  const db = new A.Alps().register('main', f).sql();

  await db.transaction((tx) => tx.savepoint(async () => {}));
  assert.ok(f.calls.some((x) => String(x[0]).startsWith('SAVEPOINT')));
});

add('memory document insert find', async () => {
  const a = new A.MemoryDocumentAdapter();
  const c = a.collection('users');

  await c.insertOne({ id: 1, name: 'a' });
  assert.equal((await c.findOne({ id: 1 })).name, 'a');
});

add('memory document operators', async () => {
  const c = new A.MemoryDocumentAdapter().collection('u');
  await c.insertMany([
    { id: 1, n: 1 },
    { id: 2, n: 3 },
  ]);

  assert.equal((await c.find({ n: { $gt: 1 } })).length, 1);
});

add('memory document and/or', async () => {
  const c = new A.MemoryDocumentAdapter().collection('u');
  await c.insertMany([
    { id: 1, a: 1 },
    { id: 2, a: 2 },
  ]);

  assert.equal((await c.find({ $or: [{ id: 1 }, { id: 2 }] })).length, 2);
});

add('memory document update one', async () => {
  const c = new A.MemoryDocumentAdapter().collection('u');
  await c.insertOne({ id: 1, n: 1 });
  await c.updateOne({ id: 1 }, { $inc: { n: 2 } });

  assert.equal((await c.findOne({ id: 1 })).n, 3);
});

add('memory document upsert', async () => {
  const c = new A.MemoryDocumentAdapter().collection('u');
  const r = await c.updateOne({ id: 1 }, { $set: { name: 'a' } }, { upsert: true });

  assert.equal(r.matchedCount, 0);
  assert.equal(await c.count(), 1);
});

add('memory document delete', async () => {
  const c = new A.MemoryDocumentAdapter().collection('u');
  await c.insertOne({ id: 1 });
  assert.equal((await c.deleteOne({ id: 1 })).deletedCount, 1);
});

add('memory document sort limit skip', async () => {
  const c = new A.MemoryDocumentAdapter().collection('u');
  await c.insertMany([{ id: 1 }, { id: 3 }, { id: 2 }]);

  const r = await c.find({}, { sort: { id: 'desc' }, skip: 1, limit: 1 });
  assert.equal(r[0].id, 2);
});

add('memory document transaction rollback', async () => {
  const a = new A.MemoryDocumentAdapter();
  const c = a.collection('u');

  await assert.rejects(
    a.transaction(async () => {
      await c.insertOne({ id: 1 });
      throw new Error('x');
    }),
  );
  assert.equal(await c.count(), 0);
});

add('memory kv set get', async () => {
  const k = new A.MemoryKeyValueAdapter();
  await k.set('a', { x: 1 });
  assert.deepEqual(await k.get('a'), { x: 1 });
});

add('memory kv nx', async () => {
  const k = new A.MemoryKeyValueAdapter();

  assert.equal(await k.set('a', 1, { ifAbsent: true }), true);
  assert.equal(await k.set('a', 2, { ifAbsent: true }), false);
});

add('memory kv xx', async () => {
  const k = new A.MemoryKeyValueAdapter();
  assert.equal(await k.set('a', 1, { ifPresent: true }), false);

  await k.set('a', 1);
  assert.equal(await k.set('a', 2, { ifPresent: true }), true);
});

add('memory kv increment', async () => {
  const k = new A.MemoryKeyValueAdapter();

  assert.equal(await k.increment('n', 2), 2);
  assert.equal(await k.increment('n', 3), 5);
});

add('memory kv ttl', async () => {
  const k = new A.MemoryKeyValueAdapter();
  await k.set('a', 1, { ttlMs: 1000 });
  assert.ok((await k.ttl('a')) > 0);
});

add('memory kv scan', async () => {
  const k = new A.MemoryKeyValueAdapter();
  await k.set('x:1', 1);
  await k.set('y:1', 1);

  const out = [];
  for await (const key of k.scan('x:')) {
    out.push(key);
  }

  assert.deepEqual(out, ['x:1']);
});

add('memory kv transaction rollback', async () => {
  const k = new A.MemoryKeyValueAdapter();
  await assert.rejects(
    k.transaction(async (tx) => {
      await tx.set('a', 1);
      throw new Error('x');
    }),
  );

  assert.equal(await k.get('a'), null);
});

add('connection pool max and release', async () => {
  let n = 0;
  const p = new A.ConnectionPool({ max: 1, create: async () => ({ id: ++n, close() {} }) });
  const a = await p.acquire();

  const wait = p.acquire();
  await a.release();

  const b = await wait;
  assert.equal(b.value.id, 1);

  await b.release();
  await p.close();
});

add('connection pool stats', async () => {
  const p = new A.ConnectionPool({ max: 2, create: async () => ({ close() {} }) });
  const a = await p.acquire();

  assert.equal(p.stats().active, 1);
  await a.release();

  assert.equal(p.stats().idle, 1);
  await p.close();
});

add('connection pool close rejects acquire', async () => {
  const p = new A.ConnectionPool({ create: async () => ({ close() {} }) });
  await p.close();
  await assert.rejects(p.acquire());
});

add('sql client adapter normalizes rows', async () => {
  const ad = A.postgres({ query: async () => ({ rows: [{ x: 1 }], rowCount: 1 }) });
  assert.equal((await ad.query('x')).rows[0].x, 1);
});

add('mysql adapter normalizes tuple', async () => {
  const ad = A.mysql({ query: async () => [[{ x: 1 }], { affectedRows: 1 }] });
  assert.equal((await ad.query('x')).rows[0].x, 1);
});

add('sqlite adapter dialect', () =>
  assert.equal(A.sqlite({ query: async () => [] }).dialect, 'sqlite'),
);

add('mssql adapter dialect', () =>
  assert.equal(A.mssql({ query: async () => [] }).dialect, 'mssql'),
);

add('redis adapter json', async () => {
  const map = new Map();
  const r = A.redis({
    get: async (k) => map.get(k) ?? null,
    set: async (k, v) => {
      map.set(k, v);
      return 'OK';
    },
    del: async (...ks) => ks.reduce((n, k) => n + (map.delete(k) ? 1 : 0), 0),
    keys: async () => [...map.keys()],
  });

  await r.set('a', { x: 1 });
  assert.deepEqual(await r.get('a'), { x: 1 });
});

add('redis prefix', async () => {
  const map = new Map();
  const r = A.redis(
    {
      get: async (k) => map.get(k) ?? null,
      set: async (k, v) => {
        map.set(k, v);
        return 'OK';
      },
      del: async () => 0,
      keys: async () => [],
    },
    { prefix: 'p:' },
  );

  await r.set('a', 1);
  assert.ok(map.has('p:a'));
});

add('mongo adapter collection delegation', async () => {
  const fake = {
    collection() {
      return {
        find() {
          return { toArray: async () => [{ id: 1 }] };
        },
        findOne: async () => ({ id: 1 }),
        insertOne: async () => ({ insertedId: 1 }),
        insertMany: async (d) => ({ insertedCount: d.length }),
        updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
        updateMany: async () => ({ matchedCount: 1, modifiedCount: 1 }),
        deleteOne: async () => ({ deletedCount: 1 }),
        deleteMany: async () => ({ deletedCount: 1 }),
        countDocuments: async () => 1,
      };
    },
  };

  const c = A.mongodb(fake).collection('u');
  assert.equal((await c.find())[0].id, 1);
});

add('dynamo adapter basic get', async () => {
  const client = {
    get: async () => ({ id: 'a' }),
    put: async () => {},
    delete: async () => true,
    scan: async () => ({ items: [] }),
    update: async () => ({}),
    ping: async () => {},
  };

  const c = A.dynamodb(client).collection('t');
  assert.equal((await c.findOne({ id: 'a' })).id, 'a');
});

add('couchdb mango request', async () => {
  let called = '';
  const ad = A.couchdb({
    baseUrl: 'http://x',
    fetch: async (url) => {
      called = String(url);
      return new Response(JSON.stringify({ docs: [{ id: 1 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const rows = await ad.collection('users').find({ id: 1 });
  assert.match(called, /_find/);
  assert.equal(rows.length, 1);
});

add('unit of work commits operations', async () => {
  const f = new FakeSql();
  const db = new A.Alps().register('m', f).sql();

  const u = new A.UnitOfWork(db);
  u.add(async (tx) => (await tx.query('A')).rowCount).add(
    async (tx) => (await tx.query('B')).rowCount,
  );

  assert.deepEqual(await u.commit(), [1, 1]);
});

add('unit of work clear', () => {
  const f = new FakeSql();
  const u = new A.UnitOfWork(new A.Alps().register('m', f).sql());

  u.add(async () => 1);
  u.clear();

  assert.equal(u.size, 0);
});

add('model relations', () => {
  const a = A.defineModel({ name: 'A', table: A.defineTable('a', { id: A.types.integer() }) });
  const b = A.defineModel({
    name: 'B',
    table: A.defineTable('b', { id: A.types.integer(), aId: A.types.integer() }),
  });

  assert.equal(A.hasMany(b, 'aId').kind, 'hasMany');
  assert.equal(A.belongsTo(a, 'aId').kind, 'belongsTo');
});

add('seeding runs in order', async () => {
  const names = [];
  const alps = new A.Alps();
  const done = await A.seed(alps, [
    A.defineSeeder('a', () => names.push('a')),
    A.defineSeeder('b', () => names.push('b')),
  ]);

  assert.deepEqual(done, ['a', 'b']);
  assert.deepEqual(names, ['a', 'b']);
});

add('boot middleware stores Alps', async () => {
  const alps = new A.Alps();
  const ctx = {
    set(k, v) {
      this[k] = v;
    },
  };

  await Boot.alpsMiddleware(alps)(ctx, async () => new Response('ok'));
  assert.equal(Boot.getAlps(ctx), alps);
});

add('boot getAlps throws without middleware', () => assert.throws(() => Boot.getAlps({})));

add('boot health mount registers route', () => {
  let path;
  const app = {
    get(p) {
      path = p;
    },
  };

  Boot.mountAlpsHealth(app, new A.Alps(), '/x');
  assert.equal(path, '/x');
});

add('cursor encoding roundtrip', () => {
  const c = A.encodeCursor({ id: 42 });
  assert.deepEqual(A.decodeCursor(c), { id: 42 });
});

add('expressions and/or compile', () => {
  const s = { values: [] };
  const text = A.and(A.eq('a', 1), A.or(A.gt('b', 2), A.lt('b', 5))).compile(d('postgres'), s);

  assert.match(text, /AND/);
  assert.equal(s.values.length, 3);
});

add('not in array compile', () => {
  const s = { values: [] };
  assert.match(A.notInArray('id', [1, 2]).compile(d('postgres'), s), /NOT IN/);
});

add('like compile', () => {
  const s = { values: [] };
  assert.match(A.like('name', 'a%').compile(d('postgres'), s), /LIKE/);
});

add('mssql pagination supplies order', () => {
  const q = new A.SelectBuilder('mssql').from('u').limit(2).compile();
  assert.match(q.text, /ORDER BY \(SELECT 1\).*OFFSET 0 ROWS FETCH NEXT 2 ROWS ONLY/);
});

add('repository create uses returning', async () => {
  const f = new FakeSql();
  f.responses.push({ rows: [{ id: 1, name: 'a' }], rowCount: 1 });

  const db = new A.Alps().register('m', f).sql();
  const repo = new A.Repository(
    db,
    A.defineTable('u', { id: A.types.integer(), name: A.types.string() }),
  );

  assert.equal((await repo.create({ name: 'a' })).id, 1);
});

add('repository find by id', async () => {
  const f = new FakeSql();
  f.responses.push({ rows: [{ id: 1 }], rowCount: 1 });

  const repo = new A.Repository(
    new A.Alps().register('m', f).sql(),
    A.defineTable('u', { id: A.types.integer() }),
  );

  assert.equal((await repo.findById(1)).id, 1);
});

add('repository count', async () => {
  const f = new FakeSql();
  f.responses.push({ rows: [{ count: '3' }], rowCount: 1 });

  const repo = new A.Repository(
    new A.Alps().register('m', f).sql(),
    A.defineTable('u', { id: A.types.integer() }),
  );
  assert.equal(await repo.count(), 3);
});

add('repository soft delete', async () => {
  const f = new FakeSql();
  const repo = new A.Repository(
    new A.Alps().register('m', f).sql(),
    A.defineTable('u', { id: A.types.integer() }, { softDeletes: true }),
  );

  assert.equal(await repo.deleteById(1), true);
  assert.match(f.calls.at(-1)[0], /UPDATE/);
});

add('repository force delete', async () => {
  const f = new FakeSql();
  const repo = new A.Repository(
    new A.Alps().register('m', f).sql(),
    A.defineTable('u', { id: A.types.integer() }, { softDeletes: true }),
  );

  assert.equal(await repo.deleteById(1, { force: true }), true);
  assert.match(f.calls.at(-1)[0], /DELETE/);
});

add('repository optimistic lock failure', async () => {
  const f = new FakeSql();
  f.responses.push({ rows: [], rowCount: 0 });

  const repo = new A.Repository(
    new A.Alps().register('m', f).sql(),
    A.defineTable('u', { id: A.types.integer(), version: A.types.integer() }),
    { versionColumn: 'version' },
  );
  await assert.rejects(repo.updateById(1, {}, { expectedVersion: 2 }), A.OptimisticLockError);
});

for (const [name, fn] of cases) {
  test(name, fn);
}

<div align="center">
  <img src="https://raw.githubusercontent.com/newfoundcodes/newfoundcodes-logo/refs/heads/main/newfoundcodes-helvetium.png?token=GHSAT0AAAAAAEFYS666XTWRA7CFPKWMB3N22U65F3Q" width="128" />
  <h1>Helvetium Alps</h1>
  <p>
    <a href="https://github.com/newfoundcodes/helvetium-alps/actions"><img src="https://github.com/newfoundcodes/helvetium-alps/actions/workflows/ci.yml/badge.svg" alt="Build Status"></a>
  </p>
</div>

**Helvetium Alps** is the database and persistent-storage framework for the Helvetium ecosystem. The npm package is **`@newfoundcodes/helvetium-alps`**.

Alps provides a dependency-free core for SQL databases, document databases, and key/value stores. It separates portable APIs from database-specific capabilities instead of forcing PostgreSQL, SQLite, MongoDB, DynamoDB, CouchDB, and Redis into one false abstraction.

## Core capabilities

- SQL query builder for PostgreSQL, MySQL, SQLite, and Microsoft SQL Server.
- Parameterized raw SQL and identifier-safe tagged templates.
- Schema/table DSL, indexes, foreign keys, timestamps, soft-delete columns, and dialect type mapping.
- ORM-style repositories, models, relations, pagination, soft deletes, optimistic locking, and unit-of-work orchestration.
- Migrations with ordered IDs, batches, status, rollback, and schema editing.
- Transactions, savepoints, isolation-level options, retries, and query hooks.
- Generic connection pooling with limits, waiting, acquisition timeouts, idle reaping, health statistics, and graceful close.
- Multiple named databases and primary/read-replica routing.
- Document collections with filters, projection, sorting, updates, bulk operations, indexes, and session-bound MongoDB transactions.
- Key/value operations with TTL, conditional writes, increments, scans, and adapter-defined atomic transaction semantics.
- First-party adapters around injected PostgreSQL/MySQL/SQLite/MSSQL/MongoDB/DynamoDB/CouchDB/Redis/Valkey clients.
- Memory document and key/value adapters for tests and local tooling.
- Query instrumentation hooks, health checks, retry policies, seeders, and shutdown.
- Helvetium Boot middleware and health-route integration.

## Installation

```bash
npm install @newfoundcodes/helvetium-alps
```

Install the native database driver you want separately. Alps intentionally does not choose a PostgreSQL, MySQL, SQLite, MSSQL, MongoDB, DynamoDB, or Redis SDK for you. Adapter functions accept structural clients, so applications can use their preferred driver version.

## PostgreSQL

```ts
import { Alps, postgres, SelectBuilder, eq } from '@newfoundcodes/helvetium-alps';

// `client` can wrap pg, postgres.js, or another client with query().
const alps = new Alps().register('main', postgres(client));

const query = new SelectBuilder('postgres')
  .select('id', 'email')
  .from('users')
  .where(eq('active', true))
  .limit(25)
  .compile();

const result = await alps.sql('main').query(query);
```

## ORM repository

```ts
import { Repository, defineTable, types } from '@newfoundcodes/helvetium-alps';

type User = {
  id: number;
  email: string;
  version: number;
  deletedAt: Date | null;
};

const users = defineTable<User>(
  'users',
  {
    id: types.integer({ primaryKey: true }),
    email: types.string(320, { unique: true }),
    version: types.integer({ default: 0 }),
    deletedAt: types.datetime({ nullable: true }),
  },
  {
    timestamps: true,
    softDeletes: true,
  },
);

const userRepository = new Repository(alps.sql(), users, { versionColumn: 'version' });
```

## Documents

```ts
import { MemoryDocumentAdapter } from '@newfoundcodes/helvetium-alps';

const documents = new MemoryDocumentAdapter();
alps.register('documents', documents);

const users = alps.documents('documents').collection<User>('users');

await users.insertOne({ id: 1, email: 'user@example.com' });
const active = await users.find({ age: { $gte: 18 } });
```

## Helvetium Boot

```ts
import { createApp } from '@newfoundcodes/helvetium-boot';
import { serve } from '@newfoundcodes/helvetium-boot/node';
import { alpsMiddleware, getAlps } from '@newfoundcodes/helvetium-alps/boot';

const app = createApp();
app.use(alpsMiddleware(alps));

app.get('/api/users/:id', async (c) => {
  const db = getAlps(c);
  const user = await db.sql().query('SELECT * FROM users WHERE id = $1', [c.req.param('id')]);
  return c.json(user.rows[0] ?? null);
});

serve({ app, port: 3000 });
```

## License

This project is licensed under the [AGPL-3.0-only](https://spdx.org/licenses/AGPL-3.0-only.html) License.

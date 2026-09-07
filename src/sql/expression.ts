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

import type { SqlDialect } from './dialect.js';

export type { CompileState, SqlExpression } from '../interfaces/expression.js';
import type { CompileState, SqlExpression } from '../interfaces/expression.js';

export type { SqlFragment } from '../interfaces/expression.js';
import type { SqlFragment } from '../interfaces/expression.js';

class RawExpression implements SqlExpression {
  constructor(
    private readonly text: string,
    private readonly values: unknown[] = [],
  ) {}

  compile(d: SqlDialect, state: CompileState): string {
    let i = 0;
    return this.text.replace(/\?/g, () => {
      state.values.push(this.values[i++]);
      return d.placeholder(state.values.length);
    });
  }
}

class IdentifierExpression implements SqlExpression {
  constructor(private readonly name: string) {}

  compile(d: SqlDialect): string {
    return d.quote(this.name);
  }
}

class ValueExpression implements SqlExpression {
  constructor(private readonly value: unknown) {}

  compile(d: SqlDialect, state: CompileState): string {
    state.values.push(this.value);
    return d.placeholder(state.values.length);
  }
}

class BinaryExpression implements SqlExpression {
  constructor(
    private readonly left: SqlExpression,
    private readonly op: string,
    private readonly right: SqlExpression,
  ) {}

  compile(d: SqlDialect, s: CompileState): string {
    return `${this.left.compile(d, s)} ${this.op} ${this.right.compile(d, s)}`;
  }
}

class JunctionExpression implements SqlExpression {
  constructor(
    private readonly op: 'AND' | 'OR',
    private readonly items: SqlExpression[],
  ) {}

  compile(d: SqlDialect, s: CompileState): string {
    return this.items.length
      ? `(${this.items.map((x) => x.compile(d, s)).join(` ${this.op} `)})`
      : this.op === 'AND'
        ? '1=1'
        : '1=0';
  }
}

class UnaryExpression implements SqlExpression {
  constructor(
    private readonly op: string,
    private readonly item: SqlExpression,
  ) {}

  compile(d: SqlDialect, s: CompileState): string {
    return `${this.op} (${this.item.compile(d, s)})`;
  }
}

class InExpression implements SqlExpression {
  constructor(
    private readonly left: SqlExpression,
    private readonly values: unknown[],
    private readonly negate = false,
  ) {}

  compile(d: SqlDialect, s: CompileState): string {
    if (!this.values.length) {
      return this.negate ? '1=1' : '1=0';
    }

    const p = this.values.map((v) => new ValueExpression(v).compile(d, s));
    return `${this.left.compile(d, s)} ${this.negate ? 'NOT IN' : 'IN'} (${p.join(', ')})`;
  }
}

class NullExpression implements SqlExpression {
  constructor(
    private readonly left: SqlExpression,
    private readonly negate = false,
  ) {}

  compile(d: SqlDialect, s: CompileState): string {
    return `${this.left.compile(d, s)} IS ${this.negate ? 'NOT ' : ''}NULL`;
  }
}

export const col = (name: string): SqlExpression => new IdentifierExpression(name);

export const val = (value: unknown): SqlExpression => new ValueExpression(value);

export const raw = (text: string, values: unknown[] = []): SqlExpression =>
  new RawExpression(text, values);
const asExpr = (v: SqlExpression | string): SqlExpression => (typeof v === 'string' ? col(v) : v);

export const eq = (a: SqlExpression | string, b: unknown): SqlExpression =>
  b === null ? isNull(a) : new BinaryExpression(asExpr(a), '=', val(b));

export const ne = (a: SqlExpression | string, b: unknown): SqlExpression =>
  b === null ? isNotNull(a) : new BinaryExpression(asExpr(a), '<>', val(b));

export const gt = (a: SqlExpression | string, b: unknown): SqlExpression =>
  new BinaryExpression(asExpr(a), '>', val(b));

export const gte = (a: SqlExpression | string, b: unknown): SqlExpression =>
  new BinaryExpression(asExpr(a), '>=', val(b));

export const lt = (a: SqlExpression | string, b: unknown): SqlExpression =>
  new BinaryExpression(asExpr(a), '<', val(b));

export const lte = (a: SqlExpression | string, b: unknown): SqlExpression =>
  new BinaryExpression(asExpr(a), '<=', val(b));

export const like = (a: SqlExpression | string, b: unknown): SqlExpression =>
  new BinaryExpression(asExpr(a), 'LIKE', val(b));

export const and = (...xs: SqlExpression[]): SqlExpression => new JunctionExpression('AND', xs);

export const or = (...xs: SqlExpression[]): SqlExpression => new JunctionExpression('OR', xs);

export const not = (x: SqlExpression): SqlExpression => new UnaryExpression('NOT', x);

export const inArray = (a: SqlExpression | string, xs: unknown[]): SqlExpression =>
  new InExpression(asExpr(a), xs);

export const notInArray = (a: SqlExpression | string, xs: unknown[]): SqlExpression =>
  new InExpression(asExpr(a), xs, true);

export const isNull = (a: SqlExpression | string): SqlExpression => new NullExpression(asExpr(a));

export const isNotNull = (a: SqlExpression | string): SqlExpression =>
  new NullExpression(asExpr(a), true);

export function identifier(name: string): {
  readonly __alpsIdentifier: true;
  readonly name: string;
} {
  return { __alpsIdentifier: true, name };
}

export function sql(strings: TemplateStringsArray, ...values: unknown[]): SqlFragment {
  let text = '';
  const params: unknown[] = [];
  strings.forEach((part, i) => {
    text += part;
    if (i >= values.length) {
      return;
    }

    const value = values[i] as Record<string, unknown>;
    if (value?.__alpsIdentifier) {
      text += `__ALPS_IDENT_${encodeURIComponent(value.name as string)}__`;
    } else {
      text += '?';
      params.push(value);
    }
  });
  return { text, values: params };
}

export function compileFragment(
  fragment: SqlFragment,
  d: SqlDialect,
): { text: string; values: unknown[] } {
  let valueIndex = 0;
  const out: unknown[] = [];
  let text = fragment.text.replace(/__ALPS_IDENT_([^_]+)__/g, (_, encoded) =>
    d.quote(decodeURIComponent(encoded)),
  );

  text = text.replace(/\?/g, () => {
    out.push(fragment.values[valueIndex++]);
    return d.placeholder(out.length);
  });
  return { text, values: out };
}

// Test double for @/lib/supabase/admin: a tiny in-memory table store (globalThis.__db)
// supporting the query-builder calls the AI brain and usage logging make.
function db() {
  globalThis.__db ??= {};
  return globalThis.__db;
}

class Query {
  constructor(table) {
    this.table = table;
    this.op = "select";
    this.filters = [];
    this.singleRow = false;
    this.countOnly = false;
  }
  select(_cols, opts) {
    if (this.op === "select" && opts?.head) this.countOnly = true;
    if (this.op !== "select") this.returning = true;
    return this;
  }
  eq(col, val) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col, val) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  gte(col, val) {
    this.filters.push((r) => r[col] >= val);
    return this;
  }
  in(col, vals) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  not(col, op, list) {
    const vals = list.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
    this.filters.push((r) => !vals.includes(r[col]));
    return this;
  }
  order() {
    return this;
  }
  or() {
    return this; // compound OR filters are not modelled (all rows match)
  }
  limit() {
    return this;
  }
  maybeSingle() {
    this.singleRow = true;
    return this;
  }
  single() {
    this.singleRow = true;
    return this;
  }
  insert(row) {
    this.op = "insert";
    this.payload = row;
    return this;
  }
  upsert(rows, opts) {
    this.op = "upsert";
    this.payload = rows;
    this.keys = (opts?.onConflict ?? "id").split(",");
    return this;
  }
  update(values) {
    this.op = "update";
    this.payload = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  run() {
    const rows = (db()[this.table] ??= []);
    const match = (r) => this.filters.every((f) => f(r));
    if (this.op === "insert") {
      const added = [].concat(this.payload).map((r) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r }));
      rows.push(...added);
      if (!this.returning) return { data: null, error: null };
      return { data: this.singleRow ? added[0] : added, error: null };
    }
    if (this.op === "upsert") {
      for (const row of [].concat(this.payload)) {
        const i = rows.findIndex((r) => this.keys.every((k) => r[k] === row[k]));
        if (i >= 0) rows[i] = { ...rows[i], ...row };
        else rows.push({ ...row });
      }
      return { data: null, error: null };
    }
    if (this.op === "update") {
      const updated = [];
      rows.forEach((r, i) => {
        if (match(r)) updated.push((rows[i] = { ...r, ...this.payload }));
      });
      return { data: this.returning ? updated : null, error: null };
    }
    if (this.op === "delete") {
      const removed = rows.filter(match);
      db()[this.table] = rows.filter((r) => !match(r));
      return { data: this.returning ? removed : null, error: null };
    }
    const found = rows.filter(match);
    if (this.countOnly) return { data: null, count: found.length, error: null };
    return { data: this.singleRow ? (found[0] ?? null) : found, error: null };
  }
  then(resolve, reject) {
    try {
      resolve(this.run());
    } catch (e) {
      reject(e);
    }
  }
}

export function createAdminClient() {
  return { from: (table) => new Query(table) };
}

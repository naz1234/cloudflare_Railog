import { DatabaseSync } from 'node:sqlite';

export function memoryD1() {
  const sqlite = new DatabaseSync(':memory:');
  return {
    close: () => sqlite.close(),
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return statement.get(...values) || null; },
        async run() { const result = statement.run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
      };
    },
  };
}

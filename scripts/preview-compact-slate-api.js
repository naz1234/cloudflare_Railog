// In-memory fixtures only. This module replaces the API client in the local preview.
const records = new Map();
const copy = (value) => structuredClone(value);
function entity(name) {
  const rows = () => records.get(name) || [];
  const client = {
    list: async () => copy(rows()),
    filter: async (filters = {}) => copy(rows().filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value))),
    create: async (payload) => {
      const row = { ...copy(payload), id: crypto.randomUUID(), updated_date: new Date().toISOString() };
      records.set(name, [...rows(), row]);
      return copy(row);
    },
    update: async (id, payload) => {
      const row = { ...rows().find((item) => item.id === id), ...copy(payload), id, updated_date: new Date().toISOString() };
      records.set(name, rows().map((item) => item.id === id ? row : item));
      return copy(row);
    },
    delete: async (id) => { records.set(name, rows().filter((row) => row.id !== id)); },
    bulkCreate: async (items) => Promise.all(items.map((item) => client.create(item))),
  };
  return client;
}
export function seedPreviewRecords(rows) { records.set("TrainRem", copy(rows)); }
export const base44 = {
  entities: new Proxy({}, { get: (_, name) => entity(name) }),
  auth: { me: async () => ({ id: "local-preview", name: "Local preview" }), logout() {}, redirectToLogin() {} },
};
export async function initCloudflareSchema() { return { ok: true, localPreview: true }; }

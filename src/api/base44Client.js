// Cloudflare Pages replacement for the original Base44 SDK client.
// The rest of the app can keep using base44.entities.EntityName.list/create/update/delete.

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const ENTITY_NAMES = [
  'DepotStabling',
  'MaintenanceRequest',
  'TrainLogEntry',
  'TrainRem',
  'rawTrainRem',
  'InsertionLive',
  'PSTTrainPrep',
  'RemovalListRow',
  'MainlineTrainRow',
  'BookmarkLink',
];

async function apiRequest(path, options = {}) {
  const { method = 'GET', body } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message = data?.error || data?.message || response.statusText || 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function buildEntityClient(entityName) {
  return {
    list: async (sort, limit) => {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (limit) params.set('limit', String(limit));
      const query = params.toString();
      return apiRequest(`/api/entities/${encodeURIComponent(entityName)}${query ? `?${query}` : ''}`);
    },

    filter: async (filters = {}) => {
      return apiRequest(`/api/entities/${encodeURIComponent(entityName)}/filter`, {
        method: 'POST',
        body: filters,
      });
    },

    create: async (payload = {}) => {
      return apiRequest(`/api/entities/${encodeURIComponent(entityName)}`, {
        method: 'POST',
        body: payload,
      });
    },

    update: async (id, payload = {}) => {
      if (!id) throw new Error(`${entityName}.update requires an id`);
      return apiRequest(`/api/entities/${encodeURIComponent(entityName)}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: payload,
      });
    },

    delete: async (id) => {
      if (!id) throw new Error(`${entityName}.delete requires an id`);
      return apiRequest(`/api/entities/${encodeURIComponent(entityName)}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },

    bulkCreate: async (records = []) => {
      return apiRequest(`/api/entities/${encodeURIComponent(entityName)}/bulkCreate`, {
        method: 'POST',
        body: { records },
      });
    },
  };
}

export async function initCloudflareSchema() {
  try {
    return await apiRequest('/api/health');
  } catch (error) {
    console.warn('Cloudflare D1 schema init failed:', error);
    return { ok: false, error: error?.message || 'D1 schema init failed' };
  }
}

const entities = ENTITY_NAMES.reduce((acc, entityName) => {
  acc[entityName] = buildEntityClient(entityName);
  return acc;
}, {});

export const base44 = {
  entities,
  auth: {
    me: async () => ({
      id: 'cloudflare-user',
      role: 'admin',
      name: 'Cloudflare User',
      email: '',
    }),
    logout: () => {},
    redirectToLogin: () => {},
  },
};

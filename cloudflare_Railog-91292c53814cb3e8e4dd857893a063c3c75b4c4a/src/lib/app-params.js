// Legacy compatibility file kept so old imports do not break.
// The Cloudflare Pages version does not need Base44 app params.
export const appParams = {
  appId: null,
  token: null,
  fromUrl: typeof window !== 'undefined' ? window.location.href : '',
  functionsVersion: null,
  appBaseUrl: '',
};

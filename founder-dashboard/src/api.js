const base  = import.meta.env.VITE_ARJUN_API_URL ?? '';
const token = import.meta.env.VITE_FOUNDER_TOKEN ?? '';

export const founderFetch = (path, init = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

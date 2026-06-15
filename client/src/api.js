const base = import.meta.env.VITE_API_URL ?? '';
export const apiFetch = (path, init) => fetch(`${base}${path}`, init);

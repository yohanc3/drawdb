import { backendUrl } from "../config";

export const clientId = crypto.randomUUID();

async function request(path, options = {}) {
  const response = await fetch(`${backendUrl}/api${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      "X-Client-Id": clientId,
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export const authMe = () => request("/auth/me");
export const authSignup = (email, password) =>
  request("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) });
export const authLogin = (email, password) =>
  request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
export const authLogout = () => request("/auth/logout", { method: "POST" });

export const cloudList = () => request("/diagrams");
export const cloudLoad = (id, options = {}) => {
  const share = options.share || new URLSearchParams(window.location.search).get("share");
  return request(`/diagrams/${encodeURIComponent(id)}${share ? `?share=${encodeURIComponent(share)}` : ""}`);
};
const saveChains = new Map();
export const cloudSave = (diagram, { isNew = false, collaborator = false } = {}) => {
  const id = diagram.diagramId;
  const previous = saveChains.get(id) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const body = JSON.stringify(diagram);
    try {
      const share = collaborator && new URLSearchParams(window.location.search).get("share");
      return await request(isNew ? "/diagrams" : `/diagrams/${encodeURIComponent(id)}${share ? `?share=${encodeURIComponent(share)}` : ""}`, {
      method: isNew ? "POST" : collaborator ? "PATCH" : "PUT",
      body,
      });
    } catch (error) {
      if (isNew && error.status === 409) {
        const current = await request(`/diagrams/${encodeURIComponent(id)}`);
        return request(`/diagrams/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({ ...diagram, expectedRevision: current.revision }),
        });
      }
      throw error;
    }
  });
  saveChains.set(id, next);
  next.then(() => { if (saveChains.get(id) === next) saveChains.delete(id); },
    () => { if (saveChains.get(id) === next) saveChains.delete(id); });
  return next;
};
export const cloudDelete = (id) =>
  request(`/diagrams/${encodeURIComponent(id)}`, { method: "DELETE" });
export const cloudShare = (id) =>
  request(`/diagrams/${encodeURIComponent(id)}/share`, { method: "POST" });

export function liveUrl(id, share) {
  const base = new URL(backendUrl, window.location.href);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = `/api/diagrams/${encodeURIComponent(id)}/live`;
  base.search = new URLSearchParams({ client: clientId, ...(share ? { share } : {}) }).toString();
  return base.toString();
}

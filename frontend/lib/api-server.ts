import { getSession } from "./session";

/**
 * Fetch from the Go API in server components.
 * Injects the user's id_token as Bearer token.
 */
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const session = await getSession();
  const token = session?.idToken;

  const url = `${process.env.GO_API_BASE_URL}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });
}

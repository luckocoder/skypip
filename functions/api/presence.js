import { api } from '../_shared.mjs';

export async function onRequest({ request, env }) {
  return api(request, env);
}

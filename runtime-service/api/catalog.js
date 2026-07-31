import { buildCatalog } from "../lib/catalog.js";
import { readConfiguredAgent } from "../lib/config.js";
import { chainError, json, methodNotAllowed } from "../lib/http.js";

export default async function handler(request, response) {
  if (request.method && request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  try {
    const agent = await readConfiguredAgent(request.query || {});
    return json(response, 200, buildCatalog(agent, process.env.RUNTIME_ORIGIN));
  } catch (error) {
    return chainError(response, error);
  }
}

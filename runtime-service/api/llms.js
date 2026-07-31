import { buildLlmsText } from "../lib/catalog.js";
import { methodNotAllowed, text } from "../lib/http.js";

export default async function handler(request, response) {
  if (request.method && request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  try {
    return text(response, 200, buildLlmsText(process.env.RUNTIME_ORIGIN));
  } catch (error) {
    console.error("runtime configuration unavailable", error.message);
    return text(response, 502, "runtime configuration unavailable\n");
  }
}

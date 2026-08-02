import { json, methodNotAllowed } from "../lib/http.js";
import { buildToolManifestBySlug } from "../lib/tool-manifest.js";

export default function handler(request, response) {
  if (request.method && request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  try {
    return json(response, 200, buildToolManifestBySlug(request.query?.slug));
  } catch (error) {
    if (error instanceof TypeError) return json(response, 404, { error: "tool not found" });
    console.error("tool manifest unavailable", error.message);
    return json(response, 502, { error: "tool manifest unavailable" });
  }
}

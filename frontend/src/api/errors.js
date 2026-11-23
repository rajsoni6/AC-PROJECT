/**
 * parseError — safely extracts a string message from any API error.
 * Handles FastAPI 422 validation errors (array of {msg, loc, ...})
 * and plain string detail errors.
 */
export function parseError(err, fallback = "Something went wrong") {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = d.loc?.slice(1).join(".") || "";
        const msg = d.msg || "";
        return field ? `${field}: ${msg}` : msg;
      })
      .join(" | ");
  }
  return fallback;
}

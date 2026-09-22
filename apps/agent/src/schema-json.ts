import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";

// OpenAI-style strict structured output rejects range and length keywords, but
// zod is where the real contract lives. Generate from zod, then strip what
// strict mode will not accept. The zod schema still validates the response, so
// the constraints removed here are enforced a moment later at the boundary.
const UNSUPPORTED = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "default",
  "$schema",
];

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node === null || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (UNSUPPORTED.includes(key)) continue;
    out[key] = strip(value);
  }

  if (out["type"] === "object" && out["properties"] && typeof out["properties"] === "object") {
    out["additionalProperties"] = false;
    out["required"] = Object.keys(out["properties"] as Record<string, unknown>);
  }

  return out;
}

export function toStrictJsonSchema(schema: ZodTypeAny, name: string): Record<string, unknown> {
  const generated = zodToJsonSchema(schema, { name, target: "jsonSchema7" }) as Record<
    string,
    unknown
  >;

  // zodToJsonSchema nests the result under definitions when given a name.
  const definitions = generated["definitions"] as Record<string, unknown> | undefined;
  const root = definitions?.[name] ?? generated;

  return strip(root) as Record<string, unknown>;
}

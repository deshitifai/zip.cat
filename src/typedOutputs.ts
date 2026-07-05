import type { JsonSchema, TypedOutputDescriptor, TypedOutputRef } from "./models";

const restaurantSchema = {
  type: "object",
  required: ["name"],
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    category: { type: "string" },
    cuisine: { type: "string" },
    address: { type: "string" },
    city: { type: "string" },
    region: { type: "string" },
    postalCode: { type: "string" },
    country: { type: "string" },
    website: { type: "string" },
    phone: { type: "string" },
    priceRange: { type: "string" },
    rating: { type: "number" },
    ratingSource: { type: "string" },
    mapQuery: { type: "string" }
  }
} satisfies JsonSchema;

const typedOutputs: TypedOutputDescriptor[] = [
  {
    id: "bool",
    marker: "#bool",
    name: "bool",
    label: "Boolean",
    description: "A true or false answer.",
    renderer: "boolean",
    schema: {
      type: "boolean"
    }
  },
  {
    id: "url",
    marker: "#url",
    name: "url",
    label: "URL",
    description: "A single best destination URL.",
    renderer: "url",
    schema: {
      type: "string",
      format: "uri"
    }
  },
  {
    id: "Restaurant",
    marker: "#Restaurant",
    name: "Restaurant",
    label: "Restaurant",
    description: "A concrete restaurant/place entity card.",
    renderer: "restaurant-card",
    schema: restaurantSchema
  },
  {
    id: "Restaurant[]",
    marker: "#Restaurant[]",
    name: "Restaurant[]",
    label: "Restaurant list",
    description: "A list of restaurant cards.",
    renderer: "restaurant-list",
    schema: {
      type: "array",
      items: restaurantSchema
    }
  }
];

export function typedOutputDescriptors() {
  return typedOutputs;
}

export function typedOutputForId(id: string | undefined) {
  return typedOutputs.find((descriptor) => descriptor.id === id || descriptor.name === id || descriptor.marker === id);
}

function normalizeTypedOutputMarker(marker: string) {
  return marker.replace(/\s+\[\]$/, "[]");
}

export function typedOutputForMarker(marker: string) {
  const normalized = normalizeTypedOutputMarker(marker);
  return typedOutputs.find((descriptor) => descriptor.marker.toLowerCase() === normalized.toLowerCase());
}

export function typedOutputRefs(prompt: string): TypedOutputRef[] {
  const refs: TypedOutputRef[] = [];
  const pattern = /#([A-Za-z][A-Za-z0-9_]*)(\s*\[\])?/g;

  for (const match of prompt.matchAll(pattern)) {
    const marker = `#${match[1]}${match[2] ? "[]" : ""}`;
    const descriptor = typedOutputForMarker(marker);
    if (!descriptor) {
      continue;
    }
    refs.push({
      id: descriptor.id,
      marker: descriptor.marker,
      name: descriptor.name,
      start: match.index,
      end: match.index + match[0].length
    });
  }

  return refs;
}

export function stripTypedOutputRefs(prompt: string) {
  return prompt.replace(/#([A-Za-z][A-Za-z0-9_]*)(\s*\[\])?/g, (value) => (
    typedOutputForMarker(value) ? "" : value
  )).replace(/\s{2,}/g, " ").trim();
}

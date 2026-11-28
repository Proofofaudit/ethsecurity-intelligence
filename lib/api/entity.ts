import { EntityType, type Dataset } from "@/lib/domain/schemas";
import { entityProfile } from "@/lib/intelligence/service";
import { badRequest, notFound } from "./http";

export function parseEntityType(value: string): EntityType {
  const parsed = EntityType.safeParse(value);
  if (!parsed.success) throw badRequest(`type: must be one of ${EntityType.options.join(", ")}`);
  return parsed.data;
}

/** True when the entity exists in the published dataset (standards must be referenced somewhere). */
export function entityExists(d: Dataset, type: EntityType, id: string): boolean {
  if (type === "standard") return d.initiatives.some((i) => i.standards.includes(id)) || d.relationships.some((r) => (r.to.type === "standard" && r.to.id === id) || (r.from.type === "standard" && r.from.id === id));
  return entityProfile(d, type, id) !== null;
}

export function requireEntityProfile(d: Dataset, type: EntityType, id: string) {
  const profile = entityExists(d, type, id) ? entityProfile(d, type, id) : null;
  if (!profile) throw notFound(`No ${type} with id "${id}" in the published dataset`);
  return profile;
}

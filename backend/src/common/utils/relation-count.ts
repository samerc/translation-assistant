import { ObjectLiteral, Repository } from 'typeorm';

/**
 * Sets `parent[property]` to the number of child rows pointing at each parent,
 * using a single grouped COUNT over the given parents' IDs.
 *
 * Replaces TypeORM 0.3's `loadRelationCountAndMap` (removed in v1). Done as a
 * batch query on list endpoints rather than `@VirtualColumn`, which would add a
 * count subquery to every load of the entity.
 */
export async function attachRelationCount<T extends { id: string }>(
  parents: T[],
  childRepository: Repository<ObjectLiteral>,
  foreignKey: string,
  property: string,
): Promise<T[]> {
  if (parents.length === 0) return parents;

  const rows = await childRepository
    .createQueryBuilder('child')
    .select(`child.${foreignKey}`, 'parentId')
    .addSelect('COUNT(*)', 'count')
    .where(`child.${foreignKey} IN (:...parentIds)`, {
      parentIds: parents.map((p) => p.id),
    })
    .groupBy(`child.${foreignKey}`)
    .getRawMany<{ parentId: string; count: string | number }>();

  const counts = new Map(rows.map((r) => [r.parentId, Number(r.count)]));
  for (const parent of parents) {
    (parent as Record<string, unknown>)[property] = counts.get(parent.id) ?? 0;
  }
  return parents;
}

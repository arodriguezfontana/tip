/** Junta los elementos seguidos que van juntos según `belongTogether(anterior, siguiente)`, conservando el orden. */
export function groupAdjacent<T>(items: T[], belongTogether: (previous: T, next: T) => boolean): T[][] {
  return items.reduce<T[][]>((groups, item) => {
    const last = groups[groups.length - 1];
    const joinsLast = last !== undefined && belongTogether(last[last.length - 1], item);
    return joinsLast ? [...groups.slice(0, -1), [...last, item]] : [...groups, [item]];
  }, []);
}

/** Los elementos agrupados por la clave que da `keyOf`, en el orden en que aparece cada clave por primera vez. */
export function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  items.forEach((item) => {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  return groups;
}

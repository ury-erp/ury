import type { Table } from './table-api';

export function parseMergedWith(mergedWith: string | null | undefined): string[] {
  if (!mergedWith) return [];
  return mergedWith
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

export function isMergedTable(table: Table): boolean {
  return parseMergedWith(table.merged_with).length > 0;
}

function buildAdjacency(tables: Table[]): Map<string, Set<string>> {
  const tableNames = new Set(tables.map((t) => t.name));
  const adjacency = new Map<string, Set<string>>();

  for (const table of tables) {
    if (!adjacency.has(table.name)) {
      adjacency.set(table.name, new Set());
    }
    for (const partner of parseMergedWith(table.merged_with)) {
      if (!tableNames.has(partner)) continue;
      adjacency.get(table.name)!.add(partner);
      if (!adjacency.has(partner)) {
        adjacency.set(partner, new Set());
      }
      adjacency.get(partner)!.add(table.name);
    }
  }

  return adjacency;
}

export function getMergeGroupMembers(table: Table, allTables: Table[]): string[] {
  const adjacency = buildAdjacency(allTables);
  const visited = new Set<string>();
  const members: string[] = [];
  const queue = [table.name];

  while (queue.length > 0) {
    const name = queue.shift()!;
    if (visited.has(name)) continue;
    visited.add(name);
    members.push(name);
    for (const neighbor of adjacency.get(name) ?? []) {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return members.sort((a, b) => a.localeCompare(b));
}

export function getMergedPartners(table: Table, allTables: Table[]): string[] {
  return getMergeGroupMembers(table, allTables).filter((name) => name !== table.name);
}

function buildMergeClusters(tables: Table[]): string[][] {
  if (tables.length === 0) return [];

  const adjacency = buildAdjacency(tables);
  const visited = new Set<string>();
  const clusters: string[][] = [];

  for (const table of tables) {
    if (visited.has(table.name)) continue;

    const neighbors = adjacency.get(table.name);
    const hasMergeLinks = neighbors && neighbors.size > 0;

    if (!hasMergeLinks) {
      clusters.push([table.name]);
      visited.add(table.name);
      continue;
    }

    const cluster: string[] = [];
    const queue = [table.name];
    while (queue.length > 0) {
      const name = queue.shift()!;
      if (visited.has(name)) continue;
      visited.add(name);
      cluster.push(name);
      for (const neighbor of adjacency.get(name) ?? []) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
    clusters.push(cluster.sort((a, b) => a.localeCompare(b)));
  }

  clusters.sort((a, b) => a[0].localeCompare(b[0]));
  return clusters;
}

export function getTableRenderGroups(tables: Table[]): Table[][] {
  const tableByName = new Map(tables.map((t) => [t.name, t]));
  return buildMergeClusters(tables).map((cluster) =>
    cluster
      .map((name) => tableByName.get(name))
      .filter((t): t is Table => Boolean(t))
  );
}

export function sortTablesByMergeGroups(tables: Table[]): Table[] {
  return getTableRenderGroups(tables).flat();
}

import sourceRegistryJson from '@/data/sources.json'
import type { SourceKind, SourceRef, SourceRegistryEntry } from './types'

export const sourceRegistry = sourceRegistryJson as SourceRegistryEntry[]

export const sourceByKind = Object.fromEntries(
  sourceRegistry.map((source) => [source.id, source]),
) as Record<SourceKind, SourceRegistryEntry>

export function sourceLabel(source: SourceRef) {
  return source.title || sourceByKind[source.kind]?.name || source.kind
}

export function sourceHref(source: SourceRef) {
  return source.url || sourceByKind[source.kind]?.url || '#'
}

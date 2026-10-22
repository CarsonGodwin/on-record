import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force'
import type { GraphLink, GraphNode } from '../data/insights'
import { mulberry32 } from '../lib/random'

/*
 * Lays out the artist graph as a constellation. A seeded random source keeps
 * it identical every time, so the on-screen chart and the poster match.
 */

interface SimNode extends SimulationNodeDatum {
  id: string
  ms: number
}

export type Layout = Map<string, { x: number; y: number }>

/** Star radius in layout units; the chart and the poster scale it to suit */
export function starSize(ms: number, maxMs: number): number {
  return 3.5 + Math.sqrt(ms / maxMs) * 15
}

export function layoutConstellation(nodes: GraphNode[], links: GraphLink[]): Layout {
  const maxMs = Math.max(...nodes.map((n) => n.ms), 1)
  const maxCount = Math.max(...links.map((l) => l.count), 1)
  const simNodes: SimNode[] = nodes.map((n) => ({ ...n }))
  const simLinks = links.map((l) => ({ ...l }))
  const sim = forceSimulation(simNodes)
    .randomSource(mulberry32(7))
    .force(
      'link',
      forceLink<SimNode, (typeof simLinks)[number]>(simLinks)
        .id((d) => d.id)
        .distance((l) => 50 + 70 * (1 - Math.sqrt(l.count / maxCount)))
        .strength(0.5),
    )
    .force('charge', forceManyBody().strength(-160))
    .force('collide', forceCollide<SimNode>((d) => starSize(d.ms, maxMs) + 16))
    .force('x', forceX(0).strength(0.05))
    .force('y', forceY(0).strength(0.08))
    .stop()
  for (let i = 0; i < 400; i++) sim.tick()
  return new Map(simNodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))
}

/** The graph subset that fits a small screen: the top `n` artists and the links between them */
export function trimGraph(nodes: GraphNode[], links: GraphLink[], n: number): { nodes: GraphNode[]; links: GraphLink[] } {
  if (nodes.length <= n) return { nodes, links }
  const kept = nodes.slice(0, n)
  const ids = new Set(kept.map((k) => k.id))
  return { nodes: kept, links: links.filter((l) => ids.has(l.source) && ids.has(l.target)) }
}

export interface Star {
  id: string
  x: number
  y: number
  r: number
}

/**
 * The star a tap at (x, y) means: the one whose edge is nearest, as long as the tap
 * is within `reach` of that edge. Small stars make small targets, so a phone
 * lets a finger land a little off one and still get it.
 */
export function nearestStar(stars: Star[], x: number, y: number, reach: number): string | null {
  let best: string | null = null
  let gap = reach
  for (const s of stars) {
    const d = Math.hypot(s.x - x, s.y - y) - s.r
    if (d <= gap) {
      gap = d
      best = s.id
    }
  }
  return best
}

import { map } from 'nanostores'

export interface Point {
  x?: number
  y?: number
}

export const svgHoverPoint = map<Point>({})

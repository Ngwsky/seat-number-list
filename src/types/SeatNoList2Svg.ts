export type SeatNo = {
  venue: string
  template: string
  area: string
  block: string
  row: number
  seatIndex: number
  colOffset: number
  rowName: string
  seatName: string
  isLeftmost?: boolean
  isRightmost?: boolean
  isFirstRow?: boolean
  isLastRow?: boolean
}

export type ConsecutiveSeats = {
  row: number
  leftmostSeat: SeatNo
  rightmostSeat: SeatNo
  seatNoList: Array<SeatNo>
  frontConsecutiveSeatsList?: Array<ConsecutiveSeats>
  backConsecutiveSeatsList?: Array<ConsecutiveSeats>
  section?: Section
}

export type Section = {
  consecutiveSeatsLists: Array<Array<ConsecutiveSeats>>
  firstRow: number
  lastRow: number
  minSeatX: number
  maxSeatX: number
  blockOptions: Array<Block>
  blockElement?: Block
}

export type BlockSettings = {
  gap?: number
  mf?: number
  mr?: number
  mb?: number
  ml?: number
  align?: "left" | "center" | "right"
  axis?: string
}

export type Block = {
  id: string
  element: SVGGeometryElement
  points: Array<{ x: number; y: number }> | Array<DOMPoint>
  sections: Array<Section>
  // Maximum Area Quadrilateral
  maqPoints: Array<{ x: number; y: number }>
  maqLengthFLtoFR: number
  maqLenghtFLtoBL: number
  maqLengthBLtoBR: number
  maqUnitVectorFLtoFR: { x: number; y: number }
  maqUnitVectorFLtoBL: { x: number; y: number }
  // Oriented Bounding Box
  obbPoints: Array<{ x: number; y: number }>
  obbWidth: number
  obbHeight: number
  obbUnitVectorLtoR: { x: number; y: number }
  obbUnitVectorFtoB: { x: number; y: number }
  distToCenter: number
  unitVectorToCenter: { x: number; y: number }
  settings?: BlockSettings
}

export type PitchArea = {
  widthMinPct: number
  widthMaxPct: number
  heightMinPct: number
  heightMaxPct: number
}

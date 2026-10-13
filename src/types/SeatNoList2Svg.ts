  export type SeatNo = {
    venue: string
    template: string
    area: string
    block: string
    row: number
    seatIndex: number
    colOffset: number
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

  export type Block = {
    element: SVGGeometryElement
    points: Array<DOMPoint>
    bounding: Array<DOMPoint>
    sections: Array<Section>
    width: number
    height: number
    distToCenter: number
    unitVectorToCenter: {x:number, y:number}
    unitVectorP0toP1: {x:number, y:number}
    unitVectorP0toP3: {x:number, y:number}
    seatGap?: number
    seatCircleRadius?: number
    marginLeft?: number
    marginRight?: number
    marginFront?: number
    marginBack?: number
  }
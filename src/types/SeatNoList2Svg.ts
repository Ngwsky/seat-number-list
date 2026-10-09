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
    leftmostSeat: SeatNo
    rightmostSeat: SeatNo
    frontConsecutiveSeatsList?: Array<ConsecutiveSeats>
    backConsecutiveSeatsList?: Array<ConsecutiveSeats>
    subdivision?: Subdivision
  }

  export type Subdivision = {
    consecutiveSeatsLists: Array<Array<ConsecutiveSeats>>
    firstRow: number
    lastRow: number
    minSeatX: number
    maxSeatX: number
  }
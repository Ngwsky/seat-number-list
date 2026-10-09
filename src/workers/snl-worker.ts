import { read, utils } from 'xlsx'
import type { SeatNo, ConsecutiveSeats, Subdivision } from '../types/SeatNoList2Svg'

self.onmessage = (event: MessageEvent) => {
  const workbook = read(event.data, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[firstSheetName]
  const jsonData = utils.sheet_to_json(worksheet, { header: 1 })
  const seatNoListInBlockMap = new Map<string, Array<SeatNo>>()
  const consecutiveSeatsListInBlockMap = new Map<string, Array<ConsecutiveSeats>>()
  const seatNoList = jsonData.slice(1).map((r:unknown):SeatNo => {
    if (!r || !Array.isArray(r) || r.length < 32) throw new Error('Not Expected File.')
      return {
        venue: r[0],
        template: r[1],
        area: r[2],
        block: r[5],
        row: Number(r[27]),
        seatIndex: Number(r[30]),
        colOffset: Number(r[31]),
      }
    }
  ).sort((a, b) => {
    const area = a.area.localeCompare(b.area)
    if (area !== 0) return area
    const block = a.block.localeCompare(b.block)
    if (block !== 0) return block
    const row = a.row - b.row
    if (row !== 0) return row
    const seat = a.seatIndex - b.seatIndex
    if (seat === 0) throw new Error('Duplicate Key Exception: ' + a)
    return seat
  })

  seatNoList.forEach((s, i, a) => {
    const k = s.area + ':' + s.block

    if (!seatNoListInBlockMap.has(k)) seatNoListInBlockMap.set(k, [])
    seatNoListInBlockMap.get(k)?.push(s)

    if (i === 0) {
      s.isLeftmost = true
    } else {
      const p = a[i - 1]
      s.isLeftmost = s.area !== p.area || s.block !== p.block || s.row !== p.row || ((s.seatIndex + s.colOffset) - (p.seatIndex + p.colOffset) !== 1)
    }
    if (i === a.length -1) {
      s.isRightmost = true
    } else {
      const n = a[i + 1]
      s.isRightmost = s.area !== n.area || s.block !== n.block || s.row !== n.row || ((s.seatIndex + s.colOffset) - (n.seatIndex + n.colOffset) !== -1)
    }
  })

  const consecutiveSeatsList:Array<ConsecutiveSeats> = seatNoList.flatMap((s, i, a) => {
    if (s.isLeftmost) {
      const r = a.slice(i).find(v => v.isRightmost)
      if (r) return [{
        leftmostSeat: s,
        rightmostSeat: r
      }]
      else {
        console.log('Not find rightmost seat. leftmost: ', s)
        throw Error('Not find rightmost seat.')
      }
    }
    return []
  })

  consecutiveSeatsList.forEach((c) => {
    const k = c.leftmostSeat.area + ':' + c.leftmostSeat.block
    
    if (!consecutiveSeatsListInBlockMap.has(k)) consecutiveSeatsListInBlockMap.set(k, [])
    consecutiveSeatsListInBlockMap.get(k)?.push(c)
  })

  consecutiveSeatsListInBlockMap.forEach((cslib) => {
    cslib.forEach((c, i, a) => {
      c.frontConsecutiveSeatsList = a.slice(0, i).filter(v => {
        if ((c.leftmostSeat.row - v.leftmostSeat.row) !== 1) {
          return false
        }
        const cMinX = c.leftmostSeat.seatIndex + c.leftmostSeat.colOffset
        const cMaxX = c.rightmostSeat.seatIndex + c.rightmostSeat.colOffset
        const vMinX = v.leftmostSeat.seatIndex + v.leftmostSeat.colOffset
        const vMaxX = v.rightmostSeat.seatIndex + v.rightmostSeat.colOffset
        return cMinX <= vMaxX && vMinX <= cMaxX
      })

      c.backConsecutiveSeatsList = a.slice(i + 1).filter(v => {
        if ((v.leftmostSeat.row - c.leftmostSeat.row) !== 1) {
          return false
        }
        const cMinX = c.leftmostSeat.seatIndex + c.leftmostSeat.colOffset
        const cMaxX = c.rightmostSeat.seatIndex + c.rightmostSeat.colOffset
        const vMinX = v.leftmostSeat.seatIndex + v.leftmostSeat.colOffset
        const vMaxX = v.rightmostSeat.seatIndex + v.rightmostSeat.colOffset
        return cMinX <= vMaxX && vMinX <= cMaxX
      })
    })
  })

  const subdivisionList: Array<Subdivision> = []

  consecutiveSeatsListInBlockMap.forEach((cslib) => {
    cslib.forEach((c, i, a) => {
      if (!c.subdivision) {
        const subdivision: Subdivision = {
          consecutiveSeatsLists: [],
          firstRow: c.leftmostSeat.row,
          lastRow: c.rightmostSeat.row,
          minSeatX: c.leftmostSeat.seatIndex + c.leftmostSeat.colOffset,
          maxSeatX: c.rightmostSeat.seatIndex + c.rightmostSeat.colOffset,
        }
        const cslInSubdivision = [...flattenFrontAndBackConsecutiveSeatsListGenerator(c)]
        
        cslInSubdivision.sort((a, b) => {
          const r = a.leftmostSeat.row - b.leftmostSeat.row
          if (r !== 0) return r
          return a.leftmostSeat.seatIndex - b.leftmostSeat.seatIndex
        }).forEach(v => {
          const lx = v.leftmostSeat.seatIndex + v.leftmostSeat.colOffset
          const rx = v.rightmostSeat.seatIndex + v.rightmostSeat.colOffset
          const y = v.leftmostSeat.row

          if (lx < subdivision.minSeatX) subdivision.minSeatX = lx
          if (subdivision.maxSeatX < rx) subdivision.maxSeatX = rx
          if (subdivision.lastRow < y) subdivision.lastRow = y
          
          const cslInRow = subdivision.consecutiveSeatsLists.find(cssl => {
            return cssl.some(csl => {
              return csl.leftmostSeat.row === v.leftmostSeat.row
            })
          })

          if (cslInRow) {
            cslInRow.push(v)
          } else {
            subdivision.consecutiveSeatsLists.push([v])
          }

          v.subdivision = subdivision
        })

        subdivisionList.push(subdivision)
      }
    })
  })

  self.postMessage({
    seatNoList: seatNoList,
    consecutiveSeatsList: consecutiveSeatsList,
    subdivisionList: subdivisionList,
  })
}

function* flattenBackConsecutiveSeatsListGenerator(cs: ConsecutiveSeats): Generator<ConsecutiveSeats> {
  if (cs.backConsecutiveSeatsList) {
    for (const item of cs.backConsecutiveSeatsList) {
      yield item
      if (item.backConsecutiveSeatsList && 0 < item.backConsecutiveSeatsList.length) {
        yield* flattenBackConsecutiveSeatsListGenerator(item)
      }
    }
  }
}

function* flattenFrontConsecutiveSeatsListGenerator(cs: ConsecutiveSeats): Generator<ConsecutiveSeats> {
  if (cs.frontConsecutiveSeatsList) {
    for (const item of cs.frontConsecutiveSeatsList) {
      yield item
      if (item.frontConsecutiveSeatsList && 0 < item.frontConsecutiveSeatsList.length) {
        yield* flattenFrontConsecutiveSeatsListGenerator(item)
      }
    }
  }
}

function* flattenFrontAndBackConsecutiveSeatsListGenerator(cs: ConsecutiveSeats, csSet: Set<ConsecutiveSeats> = new Set()): Generator<ConsecutiveSeats> {
  if (!csSet.has(cs)) {
    csSet.add(cs)
    yield cs

    if (cs.frontConsecutiveSeatsList) {
      for (const item of cs.frontConsecutiveSeatsList) {
        yield* flattenFrontAndBackConsecutiveSeatsListGenerator(item, csSet)
      }
    }

    if (cs.backConsecutiveSeatsList) {
      for (const item of cs.backConsecutiveSeatsList) {
        yield* flattenFrontAndBackConsecutiveSeatsListGenerator(item, csSet)
      }
    }
  }
}

function getBackRowConsecutiveSeatsList(csl: Array<ConsecutiveSeats>): Array<ConsecutiveSeats> {
  const ret: Array<ConsecutiveSeats> = []

  csl.forEach(cs => {
    cs.backConsecutiveSeatsList?.forEach(bcs => {
      if (!ret.some(e => e === bcs)) ret.push(bcs)
    })
  })

  ret.sort((a, b) => {
    return a.leftmostSeat.seatIndex - b.leftmostSeat.seatIndex
  })

  return ret
}

export {}
import { read, utils } from 'xlsx'
import type { SeatNo, ConsecutiveSeats } from '../types/SeatNoList2Svg'

self.onmessage = (event: MessageEvent) => {
  const workbook = read(event.data, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[firstSheetName]
  const jsonData = utils.sheet_to_json(worksheet, { header: 1 })
  const seatNoList = jsonData.slice(1).map((r:unknown):SeatNo => {
    if (!r || !Array.isArray(r) || r.length < 32) throw new Error('Not Expected File.'); 
      return {
        venue: r[0],
        template: r[1],
        area: r[2],
        block: r[5],
        row: Number(r[27]),
        seatIndex: Number(r[30]),
        colOffset: Number(r[31]),
      }
    }).sort((a, b) => {
      const area = a.area.localeCompare(b.area)
      if (area !== 0) return area
      const block = a.block.localeCompare(b.block)
      if (block !== 0) return block
      const row = a.row - b.row
      if (row !== 0) return row
      return a.seatIndex - b.seatIndex
    })
  seatNoList.forEach((s, i, a) => {
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
  const consecutiveSeatsList:ConsecutiveSeats[] = seatNoList.flatMap((s, i, a) => {
    if (s.isLeftmost) {
      const r = a.slice(i).find(v => v.isRightmost)
      if (r) return [{
        leftmostSeat: s,
        rightmostSeat: r
      }]
    }
    return []
  })
  self.postMessage({seatNoList: seatNoList, consecutiveSeatsList: consecutiveSeatsList})
}

export {}
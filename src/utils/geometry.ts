/**
 * 3点から外積を求める
 * @param o - from point
 * @param a - to point 1
 * @param b - to point 2
 * @returns 外積
 */
export function getCrossProductFrom3Points(
  o: { x: number; y: number } | DOMPoint,
  a: { x: number; y: number } | DOMPoint,
  b: { x: number; y: number } | DOMPoint,
) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/**
 * 2ベクトルの外積を求める
 * @param a - vector 1
 * @param b - vector 2
 * @returns 外積
 */
export function getCrossProductFrom2Vector(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return a.x * b.y - a.y * b.x
}

/**
 * 三角形の面積(2つのベクトル（ABとAC）の外積の絶対値の半分)
 * @param a - point 1
 * @param b - point 2
 * @param c - point 3
 * @returns number
 */
export function getTriangleArea(
  a: DOMPoint | { x: number; y: number },
  b: DOMPoint | { x: number; y: number },
  c: DOMPoint | { x: number; y: number },
) {
  return Math.abs(getCrossProductFrom3Points(a, b, c)) / 2
}

/**
 * 四角形の面積を2つの三角形に分けて計算 (A, B, C, D が反時計回り/時計回りに並んでいる前提)
 * @param a - point 1
 * @param b - point 2
 * @param c - point 3
 * @param d - point 4
 * @returns number
 */
export function getQuadrilateralArea(
  a: DOMPoint | { x: number; y: number },
  b: DOMPoint | { x: number; y: number },
  c: DOMPoint | { x: number; y: number },
  d: DOMPoint | { x: number; y: number },
) {
  return getTriangleArea(a, b, c) + getTriangleArea(a, c, d)
}

/**
 * 2直線の交点
 * @param l1p1 直線1の起点
 * @param l1p2 直線1の終点
 * @param l2p1 直線2の起点
 * @param l2p2 直線2の終点
 * @returns {
 *   point: 交点
 *   u1: 直線1上の地点(0 <= u1 <= 1 の場合は直線上)
 *   u2: 直線2上の地点(0 <= u1 <= 1 の場合は直線上)
 * } | null - 平行または一致している場合は
 */
export function getLineIntersection(
  l1p1: DOMPoint | { x: number; y: number },
  l1p2: DOMPoint | { x: number; y: number },
  l2p1: DOMPoint | { x: number; y: number },
  l2p2: DOMPoint | { x: number; y: number },
) {
  const denom =
    (l2p2.y - l2p1.y) * (l1p2.x - l1p1.x) -
    (l2p2.x - l2p1.x) * (l1p2.y - l1p1.y)

  // 平行または一致している場合
  if (denom === 0) return null

  const u1 =
    ((l2p2.x - l2p1.x) * (l1p1.y - l2p1.y) -
      (l2p2.y - l2p1.y) * (l1p1.x - l2p1.x)) /
    denom
  const u2 =
    ((l1p2.x - l1p1.x) * (l1p1.y - l2p1.y) -
      (l1p2.y - l1p1.y) * (l1p1.x - l2p1.x)) /
    denom

  // 交点の座標を算出
  const x = l1p1.x + u1 * (l1p2.x - l1p1.x)
  const y = l1p1.y + u1 * (l1p2.y - l1p1.y)

  return {
    point: new DOMPoint(x, y),
    u1: u1,
    u2: u2,
  }
}

/**
 * 図形の頂点から凸包（Convex Hull）の頂点を時計回りの順で取得する
 * @param points 図形の頂点
 * @returns Points of Convex Hull
 */
export function getConvexHullClockwise(
  points: { x: number; y: number }[] | DOMPoint[],
) {
  if (points.length <= 2) return [...points]

  // X座標の昇順、Y座標の昇順でソート
  const sorted = [...points].sort((a, b) =>
    a.x !== b.x ? a.x - b.x : a.y - b.y,
  )

  // 下側凸包
  const lower = []
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      getCrossProductFrom3Points(
        lower[lower.length - 2],
        lower[lower.length - 1],
        p,
      ) <= 0
    ) {
      lower.pop()
    }
    lower.push(p)
  }

  // 上側凸包
  const upper = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (
      upper.length >= 2 &&
      getCrossProductFrom3Points(
        upper[upper.length - 2],
        upper[upper.length - 1],
        p,
      ) <= 0
    ) {
      upper.pop()
    }
    upper.push(p)
  }

  // 各凸包の最後の点は、もう一方の開始点と重複するため除く
  lower.pop()
  upper.pop()

  return lower.concat(upper)
}

/**
 * 凸包から最小外接短形を取得する
 * @param hull - 凸包
 * @returns 4頂点の座標
 */
export function getMinAreaBoundingBox(
  hull: { x: number; y: number }[] | DOMPoint[],
) {
  if (hull.length < 3) return hull

  let minArea = Infinity
  let minArealocalCorners = hull
  let minAreaAngle = 0

  // 凸包の各辺に対してループを回す
  for (let i = 0; i < hull.length; i++) {
    let p1 = hull[i]
    let p2 = hull[(i + 1) % hull.length]

    // 辺のベクトルと角度
    let dx = p2.x - p1.x
    let dy = p2.y - p1.y
    let angle = Math.atan2(dy, dx)

    // キャリパー（境界）の初期化
    let minX = Infinity,
      maxX = -Infinity
    let minY = Infinity,
      maxY = -Infinity

    // すべての頂点を現在の辺の方向に回転させて、ローカルなBBox(AABB)を求める
    let rotatedPoints = hull.map((p) => {
      // 反時計回りに回転させて辺を水平（X軸平行）にする
      let rx = p.x * Math.cos(-angle) - p.y * Math.sin(-angle)
      let ry = p.x * Math.sin(-angle) + p.y * Math.cos(-angle)
      if (rx < minX) minX = rx
      if (rx > maxX) maxX = rx
      if (ry < minY) minY = ry
      if (ry > maxY) maxY = ry
      return { rx, ry }
    })

    // 面積を計算
    let width = maxX - minX
    let height = maxY - minY
    let area = width * height

    // 最小面積を更新したら、その時の4頂点を逆回転させてグローバル座標に戻す
    if (area < minArea) {
      minArea = area
      minAreaAngle = angle
      minArealocalCorners = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ]
    }
  }

  return minArealocalCorners.map((c) => {
    if (hull instanceof DOMPoint) {
      return new DOMPoint(
        c.x * Math.cos(minAreaAngle) - c.y * Math.sin(minAreaAngle),
        c.x * Math.sin(minAreaAngle) + c.y * Math.cos(minAreaAngle),
      )
    } else {
      return {
        x: c.x * Math.cos(minAreaAngle) - c.y * Math.sin(minAreaAngle),
        y: c.x * Math.sin(minAreaAngle) + c.y * Math.cos(minAreaAngle),
      }
    }
  })
}

/**
 * 凸包の頂点から面積が最大となる四点を返す
 * @param hull - 凸包の頂点リスト
 * @returns 4頂点の座標
 */
export function findMaxAreaQuadrilateral(
  hull: { x: number; y: number }[] | DOMPoint[],
) {
  const n = hull.length

  if (n < 4) {
    throw new Error("凸包の頂点数が4点未満です。4角形を作れません。")
  } else if (n === 4) {
    return hull.slice()
  }

  let maxArea = 0
  let bestPoints: { x: number; y: number }[] | DOMPoint[] = []

  // 4点の組み合わせを全探索 (O(N^4) だが、凸包でNが小さくなっていれば高速)
  // 順番が保たれているため、i < j < k < l の順で選べば自己交差のない凸四角形になる
  for (let i = 0; i < n - 3; i++) {
    for (let j = i + 1; j < n - 2; j++) {
      for (let k = j + 1; k < n - 1; k++) {
        for (let l = k + 1; l < n; l++) {
          const area = getQuadrilateralArea(hull[i], hull[j], hull[k], hull[l])
          if (area > maxArea) {
            maxArea = area
            bestPoints = [hull[i], hull[j], hull[k], hull[l]]
          }
        }
      }
    }
  }

  return bestPoints
}

/**
 * 図形の頂点から軸平行境界ボックス（OBB）を求める
 * @param points 図形の頂点リスト
 * @returns OBBの頂点リスト
 */
export function getOrientedBoundingBoxPoints(
  points: Array<DOMPoint>,
): Array<DOMPoint> {
  if (points.length < 3) return [...points]

  let minArea = Infinity
  let minRect = null

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % points.length]

    const angleRad = Math.atan2(p2.y - p1.y, p2.x - p1.x)
    const cosRot = Math.cos(-angleRad)
    const sinRot = Math.sin(-angleRad)

    let minX = Infinity,
      maxX = -Infinity
    let minY = Infinity,
      maxY = -Infinity

    points.forEach((p) => {
      const rotatedPoint = {
        x: p.x * cosRot - p.y * sinRot,
        y: p.x * sinRot + p.y * cosRot,
      }
      if (rotatedPoint.x < minX) minX = rotatedPoint.x
      if (rotatedPoint.x > maxX) maxX = rotatedPoint.x
      if (rotatedPoint.y < minY) minY = rotatedPoint.y
      if (rotatedPoint.y > maxY) maxY = rotatedPoint.y
    })

    const width = maxX - minX
    const height = maxY - minY
    const area = width * height

    if (area < minArea) {
      minArea = area
      minRect = {
        x: minX,
        y: minY,
        width: width,
        height: height,
        angleRad: angleRad,
      }
    }
  }

  if (!minRect) return []

  const rectPoints = [
    { x: minRect.x, y: minRect.y },
    { x: minRect.x + minRect.width, y: minRect.y },
    { x: minRect.x + minRect.width, y: minRect.y + minRect.height },
    { x: minRect.x, y: minRect.y + minRect.height },
  ]
  const cosRev = Math.cos(minRect.angleRad)
  const sinRev = Math.sin(minRect.angleRad)

  return rectPoints.map((p) => {
    return new DOMPoint(
      p.x * cosRev - p.y * sinRev,
      p.x * sinRev + p.y * cosRev,
    )
  })
}

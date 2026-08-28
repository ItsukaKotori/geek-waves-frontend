/**
 * 文本 diff 纯函数层(FE10 T2 批次一):行级 LCS 对齐。
 *
 * 算法:Hirschberg 分治(LCS 线性空间重构)——
 * 时间 O(n·m)、空间 O(m)(每层递归仅保留两条长度 m+1 的 DP 行),
 * 阈值内(5000×5000 ≈ 25M 次整数比较)不会产生全量 n×m 矩阵的内存峰值。
 * 行内容先 intern 成整数 id 再比较,避免字符串逐字节比较的开销。
 *
 * 阈值:任一侧超过 MAX_DIFF_LINES 行即拒绝,组件据此提示;纯层不静默截断。
 */

/** 单侧最大参与 diff 的行数(超过即提示停止,常量供组件文案插值) */
export const MAX_DIFF_LINES = 5000

export type DiffRowType = 'equal' | 'add' | 'del'

export interface DiffRow {
  type: DiffRowType
  /** 行文本(来自旧文本:equal/del;来自新文本:add) */
  text: string
  /** 旧文本 1 起行号(equal/del) */
  aNo?: number
  /** 新文本 1 起行号(equal/add) */
  bNo?: number
}

/** 按行切分:末尾单个换行视为行终止符(不产生空尾行),中间空行保留 */
export function splitDiffLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** 大文本保护:任一侧超过阈值返回 false(组件据此停止计算并提示) */
export function withinDiffLimit(a: string[], b: string[]): boolean {
  return a.length <= MAX_DIFF_LINES && b.length <= MAX_DIFF_LINES
}

/* ------------------------------- 对齐核心 -------------------------------- */

/** 空间优化:先做行的整数 intern,后续 LCS 全部按整数比较 */
function internIds(a: string[], b: string[]): [Int32Array, Int32Array] {
  const ids = new Map<string, number>()
  const toIds = (lines: string[]): Int32Array => {
    const out = new Int32Array(lines.length)
    for (let i = 0; i < lines.length; i++) {
      let id = ids.get(lines[i]!)
      if (id === undefined) {
        id = ids.size
        ids.set(lines[i]!, id)
      }
      out[i] = id
    }
    return out
  }
  return [toIds(a), toIds(b)]
}

type DiffOp =
  | { t: 'equal'; a: number; b: number }
  | { t: 'del'; a: number }
  | { t: 'add'; b: number }

/**
 * 前向 LCS 长度行:row[j] = LCS(A[aLo..aHi), B[bLo..bLo+j)),j ∈ [0, m]。
 * 两行滚动 DP,空间 O(m)。
 */
function lcsForwardRow(A: Int32Array, aLo: number, aHi: number, B: Int32Array, bLo: number, bHi: number): Int32Array {
  const m = bHi - bLo
  let prev = new Int32Array(m + 1)
  let cur = new Int32Array(m + 1)
  for (let i = aLo; i < aHi; i++) {
    const av = A[i]!
    for (let j = 0; j < m; j++) {
      cur[j + 1] = av === B[bLo + j] ? prev[j] + 1 : Math.max(prev[j + 1], cur[j])
    }
    const swap = prev
    prev = cur
    cur = swap
  }
  return prev
}

/**
 * 反向 LCS 长度行:suf[j] = LCS(A[aLo..aHi), B[bLo+j..bHi)),j ∈ [0, m]。
 * 复用前向函数:两侧切片取反后,前向行镜像即后缀行。
 */
function lcsBackwardRow(A: Int32Array, aLo: number, aHi: number, B: Int32Array, bLo: number, bHi: number): Int32Array {
  const n = aHi - aLo
  const m = bHi - bLo
  const aRev = new Int32Array(n)
  const bRev = new Int32Array(m)
  for (let i = 0; i < n; i++) aRev[i] = A[aHi - 1 - i]!
  for (let j = 0; j < m; j++) bRev[j] = B[bHi - 1 - j]!
  const row = lcsForwardRow(aRev, 0, n, bRev, 0, m)
  // row[k] = LCS(A 反切片前 k 个, B 反切片前 k 个)→ 对称映射到后缀定义
  const suf = new Int32Array(m + 1)
  for (let j = 0; j <= m; j++) suf[j] = row[m - j]!
  return suf
}

function hirschberg(A: Int32Array, aLo: number, aHi: number, B: Int32Array, bLo: number, bHi: number, ops: DiffOp[]): void {
  const n = aHi - aLo
  const m = bHi - bLo
  if (n === 0) {
    for (let j = 0; j < m; j++) ops.push({ t: 'add', b: bLo + j })
    return
  }
  if (m === 0) {
    for (let i = 0; i < n; i++) ops.push({ t: 'del', a: aLo + i })
    return
  }
  if (n === 1 || m === 1) {
    // 叶子:一侧只剩单行,直接在另一侧线性查找首个相等行
    const singleIsA = n === 1
    const v = singleIsA ? A[aLo]! : B[bLo]!
    const seq: Int32Array = singleIsA ? B : A
    const lo = singleIsA ? bLo : aLo
    const hi = singleIsA ? bHi : aHi
    let hit = -1
    for (let k = lo; k < hi; k++) {
      if (seq[k] === v) {
        hit = k
        break
      }
    }
    if (hit === -1) {
      // 无公共行:删除块在前、新增块在后(全异场景的稳定形态)
      for (let i = aLo; i < aHi; i++) ops.push({ t: 'del', a: i })
      for (let j = bLo; j < bHi; j++) ops.push({ t: 'add', b: j })
      return
    }
    for (let k = lo; k < hi; k++) {
      if (singleIsA) {
        if (k === hit) ops.push({ t: 'equal', a: aLo, b: k })
        else ops.push({ t: 'add', b: k })
      } else {
        if (k === hit) ops.push({ t: 'equal', a: k, b: bLo })
        else ops.push({ t: 'del', a: k })
      }
    }
    return
  }

  const aMid = aLo + (n >> 1)
  const f = lcsForwardRow(A, aLo, aMid, B, bLo, bHi)
  const bks = lcsBackwardRow(A, aMid, aHi, B, bLo, bHi)
  let best = -1
  let split = bLo
  for (let j = 0; j <= m; j++) {
    const total = f[j]! + bks[j]!
    if (total > best) {
      best = total
      split = bLo + j
    }
  }
  hirschberg(A, aLo, aMid, B, bLo, split, ops)
  hirschberg(A, aMid, aHi, B, split, bHi, ops)
}

/**
 * 行数组 LCS 对齐(已按行切分)。输出行序保证:
 * - 公共行按两侧出现顺序成对
 * - 全异场景删除块在前、新增块在后
 */
export function alignDiff(a: string[], b: string[]): DiffRow[] {
  const [A, B] = internIds(a, b)
  const ops: DiffOp[] = []
  hirschberg(A, 0, A.length, B, 0, B.length, ops)

  const rows: DiffRow[] = []
  for (const op of ops) {
    if (op.t === 'equal') {
      rows.push({ type: 'equal', text: a[op.a]!, aNo: op.a + 1, bNo: op.b + 1 })
    } else if (op.t === 'del') {
      rows.push({ type: 'del', text: a[op.a]!, aNo: op.a + 1 })
    } else {
      rows.push({ type: 'add', text: b[op.b]!, bNo: op.b + 1 })
    }
  }
  return rows
}

/** 文本级入口:切分 + 对齐(组件在调用前自行用 withinDiffLimit 把关) */
export function diffLines(aText: string, bText: string): DiffRow[] {
  return alignDiff(splitDiffLines(aText), splitDiffLines(bText))
}

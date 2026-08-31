/**
 * chmod 权限计算:数字八进制 ↔ 结构化权限位 ↔ 符号形式(rwxr-xr-x)互算,
 * 支持特殊位(setuid/setgid/sticky)与常用预设,纯函数无副作用。
 */

export interface ChmodTriplet {
  read: boolean
  write: boolean
  exec: boolean
}

export interface ChmodBits {
  special: { setuid: boolean; setgid: boolean; sticky: boolean }
  owner: ChmodTriplet
  group: ChmodTriplet
  other: ChmodTriplet
}

/** 解析 3~4 位八进制数字串(容忍首尾空白);非法输入抛错 */
export function parseOctal(input: string): { octal4: string; bits: ChmodBits } {
  const raw = input.trim()
  if (!/^[0-7]{3,4}$/.test(raw)) throw new Error('请输入 3~4 位八进制数字(每位 0-7)')
  const s = raw.padStart(4, '0')
  const digit = (i: number) => Number(s[i])
  const triplet = (i: number): ChmodTriplet => {
    const v = digit(i)
    return { read: (v & 4) !== 0, write: (v & 2) !== 0, exec: (v & 1) !== 0 }
  }
  const sv = digit(0)
  return {
    octal4: s,
    bits: {
      special: { setuid: (sv & 4) !== 0, setgid: (sv & 2) !== 0, sticky: (sv & 1) !== 0 },
      owner: triplet(1),
      group: triplet(2),
      other: triplet(3),
    },
  }
}

/** 权限位 → 四位八进制(含特殊位,如 0755 / 4755) */
export function bitsToOctal(bits: ChmodBits): string {
  const special =
    (bits.special.setuid ? 4 : 0) + (bits.special.setgid ? 2 : 0) + (bits.special.sticky ? 1 : 0)
  const digit = (t: ChmodTriplet) =>
    (t.read ? 4 : 0) + (t.write ? 2 : 0) + (t.exec ? 1 : 0)
  return `${special}${digit(bits.owner)}${digit(bits.group)}${digit(bits.other)}`
}

/**
 * 符号形式(9 位):特殊位落在对应执行位 ——
 * setuid+exec='s' / setuid 无 exec='S';setgid 同理;sticky+exec='t' / 无 exec='T'。
 */
export function toSymbolic(bits: ChmodBits): string {
  const rw = (t: ChmodTriplet) => `${t.read ? 'r' : '-'}${t.write ? 'w' : '-'}`
  const execChar = (t: ChmodTriplet, special: boolean, withT: boolean) => {
    if (special) return t.exec ? (withT ? 't' : 's') : withT ? 'T' : 'S'
    return t.exec ? 'x' : '-'
  }
  return (
    rw(bits.owner) + execChar(bits.owner, bits.special.setuid, false) +
    rw(bits.group) + execChar(bits.group, bits.special.setgid, false) +
    rw(bits.other) + execChar(bits.other, bits.special.sticky, true)
  )
}

/** 常用预设:说明面向「这类文件该给什么权限」的直觉 */
export const CHMOD_PRESETS: Array<{ octal: string; label: string }> = [
  { octal: '644', label: '文件·常规' },
  { octal: '600', label: '私钥/私密文件' },
  { octal: '755', label: '目录·可执行' },
  { octal: '700', label: '目录·私有' },
  { octal: '777', label: '全员读写(慎用)' },
  { octal: '664', label: '共享组文件' },
]

/** 生成 chmod 命令:无特殊位用三位、有则四位;空路径省略操作数 */
export function chmodCommand(bits: ChmodBits, path: string): string {
  const octal = bitsToOctal(bits)
  const display = octal.startsWith('0') ? octal.slice(1) : octal
  const target = path.trim()
  return target ? `chmod ${display} ${target}` : `chmod ${display}`
}

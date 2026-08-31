// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  CHMOD_PRESETS,
  bitsToOctal,
  chmodCommand,
  parseOctal,
  toSymbolic,
} from '../chmod'

describe('parseOctal 数字串解析', () => {
  it('三位 755:展开为各身份位,特殊位全 false,补齐四位表示', () => {
    const { octal4, bits } = parseOctal('755')
    expect(octal4).toBe('0755')
    expect(bits.owner).toEqual({ read: true, write: true, exec: true })
    expect(bits.group).toEqual({ read: true, write: false, exec: true })
    expect(bits.other).toEqual({ read: true, write: false, exec: true })
    expect(bits.special).toEqual({ setuid: false, setgid: false, sticky: false })
  })

  it('四位 4755:setuid 置位', () => {
    const { octal4, bits } = parseOctal('4755')
    expect(octal4).toBe('4755')
    expect(bits.special.setuid).toBe(true)
    expect(bits.special.setgid).toBe(false)
    expect(bits.special.sticky).toBe(false)
  })

  it('容忍首尾空白', () => {
    expect(parseOctal(' 644 ').octal4).toBe('0644')
  })

  it.each(['', '8', '9', '75', '07555', 'abc', '75 5', '-75'])('%r 抛错', (raw) => {
    expect(() => parseOctal(raw)).toThrow()
  })
})

describe('bitsToOctal 与 parseOctal 往返一致', () => {
  it.each(['644', '755', '600', '777', '000', '4755', '2755', '1755', '6644', '0700'])(
    '%s → bits → 四位八进制往返不变',
    (octal) => {
      expect(bitsToOctal(parseOctal(octal).bits)).toBe(octal.padStart(4, '0'))
    },
  )
})

describe('toSymbolic 符号形式', () => {
  it.each([
    ['755', 'rwxr-xr-x'],
    ['644', 'rw-r--r--'],
    ['600', 'rw-------'],
    ['777', 'rwxrwxrwx'],
    ['4755', 'rwsr-xr-x'],
    ['2755', 'rwxr-sr-x'],
    ['1755', 'rwxr-xr-t'],
    ['4644', 'rwSr--r--'],
    ['2644', 'rw-r-Sr--'],
    ['1644', 'rw-r--r-T'],
  ])('%s → %s', (octal, sym) => {
    expect(toSymbolic(parseOctal(octal).bits)).toBe(sym)
  })
})

describe('chmodCommand 命令生成', () => {
  it('普通权限输出三位形式', () => {
    expect(chmodCommand(parseOctal('755').bits, 'app.py')).toBe('chmod 755 app.py')
  })

  it('含特殊位输出四位形式', () => {
    expect(chmodCommand(parseOctal('4755').bits, 'passwd')).toBe('chmod 4755 passwd')
  })

  it('路径两端空白被裁剪,空路径省略操作数', () => {
    expect(chmodCommand(parseOctal('600').bits, ' id_rsa ')).toBe('chmod 600 id_rsa')
    expect(chmodCommand(parseOctal('600').bits, '')).toBe('chmod 600')
  })
})

describe('CHMOD_PRESETS 常用预设', () => {
  it('包含带说明的常用档位且全部可被解析', () => {
    const octals = CHMOD_PRESETS.map((p) => p.octal)
    expect(octals).toContain('644')
    expect(octals).toContain('755')
    expect(octals).toContain('600')
    for (const p of CHMOD_PRESETS) {
      expect(() => parseOctal(p.octal)).not.toThrow()
      expect(p.label.length).toBeGreaterThan(0)
    }
  })
})

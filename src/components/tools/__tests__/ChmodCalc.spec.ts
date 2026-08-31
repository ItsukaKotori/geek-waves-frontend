// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ChmodCalc from '../ChmodCalc.vue'

beforeEach(() => {
  localStorage.clear()
})

describe('ChmodCalc 权限互算', () => {
  const octalInput = (w: ReturnType<typeof mount>) => w.find('input[aria-label="八进制"]')
  const pathInput = (w: ReturnType<typeof mount>) => w.find('input[aria-label="文件路径"]')
  const cb = (w: ReturnType<typeof mount>, label: string) => w.find(`input[aria-label="${label}"]`)

  it('默认 755:符号形式与命令即时可见', () => {
    const w = mount(ChmodCalc)
    expect(w.text()).toContain('rwxr-xr-x')
    expect(w.text()).toContain('chmod 755')
  })

  it('八进制输入 644 实时联动符号形式', async () => {
    const w = mount(ChmodCalc)
    await octalInput(w).setValue('644')
    await nextTick()
    expect(w.text()).toContain('rw-r--r--')
    expect(w.text()).toContain('chmod 644')
  })

  it('非法输入给行内错误,上一个有效结果保留', async () => {
    const w = mount(ChmodCalc)
    await octalInput(w).setValue('8')
    await nextTick()
    expect(w.text()).toContain('3~4 位八进制')
    expect(w.text()).toContain('rwxr-xr-x')
  })

  it('勾选与数字双向联动:取消 owner write → 555', async () => {
    const w = mount(ChmodCalc)
    await cb(w, 'owner-write').setValue(false)
    await nextTick()
    expect(w.text()).toContain('r-xr-xr-x')
    expect(w.text()).toContain('chmod 555')
    expect((octalInput(w).element as HTMLInputElement).value).toBe('0555')
  })

  it('特殊位:4755 显示 rwsr-xr-x 且命令用四位形式', async () => {
    const w = mount(ChmodCalc)
    await octalInput(w).setValue('4755')
    await nextTick()
    expect(w.text()).toContain('rwsr-xr-x')
    expect(w.text()).toContain('chmod 4755')
  })

  it('勾选 setuid(基于 755)→ 八进制变 4755', async () => {
    const w = mount(ChmodCalc)
    await cb(w, 'setuid').setValue(true)
    await nextTick()
    expect((octalInput(w).element as HTMLInputElement).value).toBe('4755')
    expect(w.text()).toContain('rwsr-xr-x')
  })

  it('预设按钮一键切换', async () => {
    const w = mount(ChmodCalc)
    await w.findAll('button').find((b) => b.text().includes('私钥'))!.trigger('click')
    await nextTick()
    expect(w.text()).toContain('rw-------')
  })

  it('文件路径参与命令生成,空白被裁剪', async () => {
    const w = mount(ChmodCalc)
    await pathInput(w).setValue(' id_rsa ')
    await nextTick()
    expect(w.text()).toContain('chmod 755 id_rsa')
    expect(w.text()).not.toContain(' id_rsa ')
  })

  it('勾选状态与八进制输入同步渲染', async () => {
    const w = mount(ChmodCalc)
    await octalInput(w).setValue('640')
    await nextTick()
    expect((cb(w, 'owner-read').element as HTMLInputElement).checked).toBe(true)
    expect((cb(w, 'owner-write').element as HTMLInputElement).checked).toBe(true)
    expect((cb(w, 'group-write').element as HTMLInputElement).checked).toBe(false)
    expect((cb(w, 'other-read').element as HTMLInputElement).checked).toBe(false)
  })
})

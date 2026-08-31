<script setup lang="ts">
import { ref } from 'vue'
import {
  generateAesKey,
  generateRsaKeyPair,
  rsaJwkToPem,
  type RsaJwk,
} from '../../tools/cryptoKeys'
import {
  aesDecrypt,
  aesEncrypt,
  rsaDecrypt,
  rsaEncrypt,
  rsaSign,
  rsaVerify,
  type AesMode,
} from '../../tools/cryptoCipher'
import { useCopy } from '../../composables/useCopy'
import { useToolState } from '../../composables/useToolState'
import { watchDebounced } from '../../composables/useDebounce'
import PaneShell from '../tools-ui/PaneShell.vue'

interface CryptoState {
  /** 生成器类型:aes-128/192/256 | rsa-2048/3072/4096 */
  genType: string
  /** AES 模式:GCM(认证) / CBC(兼容) */
  aesMode: AesMode
  /** RSA 当前操作页签 */
  rsaTab: 'encrypt' | 'decrypt' | 'sign' | 'verify'
  /** 生成结果查看形式:PEM / JWK */
  rsaView: 'pem' | 'jwk'
}

/** 选项持久化;密钥与明密文均为临时 ref,不落 localStorage */
const { state } = useToolState<CryptoState>('crypto', {
  genType: 'aes-256',
  aesMode: 'GCM',
  rsaTab: 'encrypt',
  rsaView: 'pem',
})

const GEN_OPTIONS = [
  { id: 'aes-128', label: 'AES-128 密钥' },
  { id: 'aes-192', label: 'AES-192 密钥' },
  { id: 'aes-256', label: 'AES-256 密钥' },
  { id: 'rsa-2048', label: 'RSA-2048 密钥对' },
  { id: 'rsa-3072', label: 'RSA-3072 密钥对' },
  { id: 'rsa-4096', label: 'RSA-4096 密钥对' },
]

const RSA_TABS = [
  { id: 'encrypt', label: '加密' },
  { id: 'decrypt', label: '解密' },
  { id: 'sign', label: '签名' },
  { id: 'verify', label: '验签' },
] as const

const { copied, copy } = useCopy()

/* ------------------------------ 密钥生成 ------------------------------ */

const genBusy = ref(false)
const genErr = ref('')
const genAes = ref('')
const genRsa = ref<{ publicJwk: RsaJwk; privateJwk: RsaJwk; publicPem: string; privatePem: string } | null>(null)

async function generate(): Promise<void> {
  genErr.value = ''
  genAes.value = ''
  genRsa.value = null
  genBusy.value = true
  try {
    if (state.genType.startsWith('aes-')) {
      genAes.value = await generateAesKey(Number(state.genType.slice(4)) as 128 | 192 | 256)
    } else {
      const bits = Number(state.genType.slice(4)) as 2048 | 3072 | 4096
      const { publicJwk, privateJwk } = await generateRsaKeyPair(bits)
      genRsa.value = {
        publicJwk,
        privateJwk,
        publicPem: rsaJwkToPem(publicJwk, 'public'),
        privatePem: rsaJwkToPem(privateJwk, 'private'),
      }
    }
  } catch (e) {
    genErr.value = (e as Error).message || '生成失败'
  } finally {
    genBusy.value = false
  }
}

function fillAesKey(): void {
  if (genAes.value) aesKey.value = genAes.value
}

function fillRsaPub(): void {
  if (genRsa.value) rsaPub.value = state.rsaView === 'pem' ? genRsa.value.publicPem : JSON.stringify(genRsa.value.publicJwk)
}

function fillRsaPriv(): void {
  if (genRsa.value) rsaPriv.value = state.rsaView === 'pem' ? genRsa.value.privatePem : JSON.stringify(genRsa.value.privateJwk)
}

/* ------------------------------ AES ------------------------------ */

const aesKey = ref('')
const aesPlain = ref('')
const aesCipherIn = ref('')
const aesIvIn = ref('')

const aesOut = ref('')
const aesIvOut = ref('')
const aesPlainOut = ref('')
const aesEncErr = ref('')
const aesDecErr = ref('')

let aesSeq = 0

/** 实时式:加密卡(明文→密文+IV)与解密卡(密文+IV→明文)并列重算,序号守卫只落地最新 */
async function runAes(): Promise<void> {
  const token = ++aesSeq
  aesEncErr.value = ''
  aesDecErr.value = ''
  const key = aesKey.value.trim()
  if (!key) {
    aesOut.value = ''
    aesIvOut.value = ''
    aesPlainOut.value = ''
    return
  }
  if (aesPlain.value) {
    try {
      const r = await aesEncrypt(state.aesMode, key, aesPlain.value)
      if (token !== aesSeq) return
      aesOut.value = r.cipherB64
      aesIvOut.value = r.ivB64
    } catch (e) {
      if (token === aesSeq) {
        aesOut.value = ''
        aesIvOut.value = ''
        aesEncErr.value = (e as Error).message
      }
    }
  } else {
    aesOut.value = ''
    aesIvOut.value = ''
  }
  if (aesCipherIn.value && aesIvIn.value) {
    try {
      const plain = await aesDecrypt(state.aesMode, key, aesCipherIn.value, aesIvIn.value)
      if (token === aesSeq) aesPlainOut.value = plain
    } catch (e) {
      if (token === aesSeq) {
        aesPlainOut.value = ''
        aesDecErr.value = (e as Error).message
      }
    }
  } else {
    aesPlainOut.value = ''
  }
}

function recomputeNow(): void {
  runner.flush()
}

const runner = watchDebounced(
  [aesKey, aesPlain, aesCipherIn, aesIvIn, () => state.aesMode],
  () => void runAes(),
)

/* ------------------------------ RSA ------------------------------ */

const rsaPub = ref('')
const rsaPriv = ref('')
const rsaIn = ref('')
const rsaSigIn = ref('')

const rsaOut = ref('')
const rsaVerified = ref<boolean | null>(null)
const rsaErr = ref('')

let rsaSeq = 0

async function runRsa(): Promise<void> {
  const token = ++rsaSeq
  rsaErr.value = ''
  rsaOut.value = ''
  rsaVerified.value = null
  const text = rsaIn.value
  if (!text) return
  try {
    let out = ''
    if (state.rsaTab === 'encrypt') {
      if (!rsaPub.value.trim()) return
      out = await rsaEncrypt(rsaPub.value, text)
    } else if (state.rsaTab === 'decrypt') {
      if (!rsaPriv.value.trim()) return
      out = await rsaDecrypt(rsaPriv.value, text)
    } else if (state.rsaTab === 'sign') {
      if (!rsaPriv.value.trim()) return
      out = await rsaSign(rsaPriv.value, text)
    } else {
      if (!rsaPub.value.trim() || !rsaSigIn.value.trim()) return
      if (token !== rsaSeq) return
      rsaVerified.value = await rsaVerify(rsaPub.value, text, rsaSigIn.value)
      return
    }
    if (token === rsaSeq) rsaOut.value = out
  } catch (e) {
    if (token === rsaSeq) rsaErr.value = (e as Error).message
  }
}

watchDebounced(
  [rsaPub, rsaPriv, rsaIn, rsaSigIn, () => state.rsaTab],
  () => void runRsa(),
)
</script>

<template>
  <div class="flex flex-col gap-4" @keydown.ctrl.enter.prevent="recomputeNow">
    <!-- 区一:密钥生成 -->
    <PaneShell label="密钥生成" badge="Web Crypto">
      <div class="flex flex-col gap-3 p-3">
        <div class="flex flex-wrap items-center gap-2">
          <select v-model="state.genType" aria-label="生成类型" class="select select-sm w-44">
            <option v-for="o in GEN_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
          <button type="button" class="btn btn-sm btn-primary" :disabled="genBusy" @click="generate">
            {{ genBusy ? '生成中…' : '生成' }}
          </button>
          <span class="text-xs opacity-50">全部本地生成,不经过网络</span>
        </div>
        <p v-if="genErr" class="text-error text-sm">{{ genErr }}</p>

        <div v-if="genAes" class="flex flex-wrap items-center gap-2">
          <code data-gen="aes-key" class="min-w-0 flex-1 break-all rounded border border-base-300 bg-base-200/60 px-2 py-1 font-mono text-xs">{{ genAes }}</code>
          <button type="button" class="btn btn-xs btn-ghost" @click="copy(genAes)">{{ copied ? '已复制' : '复制' }}</button>
          <button type="button" class="btn btn-xs btn-outline" @click="fillAesKey">用于 AES</button>
        </div>

        <div v-if="genRsa" class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <div class="join">
              <button
                v-for="v in (['pem', 'jwk'] as const)"
                :key="v"
                type="button"
                class="btn btn-xs join-item"
                :class="state.rsaView === v ? 'btn-primary' : 'btn-ghost'"
                @click="state.rsaView = v"
              >
                {{ v.toUpperCase() }}
              </button>
            </div>
            <button type="button" class="btn btn-xs btn-outline" @click="fillRsaPub">填入公钥</button>
            <button type="button" class="btn btn-xs btn-outline" @click="fillRsaPriv">填入私钥</button>
          </div>
          <div class="grid gap-2 lg:grid-cols-2">
            <div class="flex flex-col gap-1">
              <span class="text-xs opacity-50">公钥</span>
              <pre class="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-base-300 bg-base-200/60 p-2 font-mono text-xs">{{ state.rsaView === 'pem' ? genRsa.publicPem : JSON.stringify(genRsa.publicJwk, null, 2) }}</pre>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-xs opacity-50">私钥(请妥善保管)</span>
              <pre class="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-base-300 bg-base-200/60 p-2 font-mono text-xs">{{ state.rsaView === 'pem' ? genRsa.privatePem : JSON.stringify(genRsa.privateJwk, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </PaneShell>

    <!-- 区二:AES 对称加解密 -->
    <PaneShell label="AES 加解密" :badge="state.aesMode === 'GCM' ? 'GCM·认证加密' : 'CBC·无完整性保护'">
      <div class="flex flex-col gap-3 p-3">
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model="aesKey"
            aria-label="AES 密钥"
            placeholder="AES 密钥(Base64,16/24/32 字节)"
            autocomplete="off"
            class="input input-sm min-w-0 flex-1 font-mono"
          />
          <div class="join">
            <button
              v-for="m in (['GCM', 'CBC'] as const)"
              :key="m"
              type="button"
              class="btn btn-xs join-item"
              :class="state.aesMode === m ? 'btn-primary' : 'btn-ghost'"
              :title="m === 'GCM' ? '带认证标签,篡改必败(推荐)' : '传统模式,无完整性保护'"
              @click="state.aesMode = m"
            >
              {{ m }}
            </button>
          </div>
        </div>

        <div class="grid gap-3 lg:grid-cols-2">
          <div class="flex flex-col gap-1.5 rounded-box border border-base-300 p-2.5">
            <span class="text-xs font-medium tracking-wider text-base-content/50">加密:明文 → 密文</span>
            <textarea
              v-model="aesPlain"
              aria-label="加密明文"
              placeholder="输入明文,实时加密"
              rows="3"
              class="textarea textarea-sm font-mono"
            ></textarea>
            <div class="flex items-start gap-2 text-xs">
              <span class="w-10 shrink-0 pt-0.5 opacity-50">密文</span>
              <code data-aes="cipher" class="min-w-0 flex-1 break-all rounded border border-base-300 bg-base-200/60 px-2 py-1 font-mono">{{ aesOut }}</code>
              <button v-if="aesOut" type="button" class="btn btn-xs btn-ghost shrink-0" @click="copy(aesOut)">{{ copied ? '已复制' : '复制' }}</button>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="w-10 shrink-0 opacity-50">IV</span>
              <code data-aes="iv" class="min-w-0 flex-1 break-all rounded border border-base-300 bg-base-200/60 px-2 py-1 font-mono">{{ aesIvOut }}</code>
            </div>
            <p v-if="aesEncErr" class="text-error">{{ aesEncErr }}</p>
          </div>

          <div class="flex flex-col gap-1.5 rounded-box border border-base-300 p-2.5">
            <span class="text-xs font-medium tracking-wider text-base-content/50">解密:密文 + IV → 明文</span>
            <textarea
              v-model="aesCipherIn"
              aria-label="解密密文"
              placeholder="粘贴 Base64 密文"
              rows="3"
              class="textarea textarea-sm font-mono"
            ></textarea>
            <input
              v-model="aesIvIn"
              aria-label="解密 IV"
              placeholder="IV(Base64)"
              autocomplete="off"
              class="input input-sm font-mono"
            />
            <div class="flex items-start gap-2 text-xs">
              <span class="w-10 shrink-0 pt-0.5 opacity-50">明文</span>
              <code data-aes="plain" class="min-w-0 flex-1 break-all rounded border border-base-300 bg-base-200/60 px-2 py-1 font-mono">{{ aesPlainOut }}</code>
            </div>
            <p v-if="aesDecErr" class="text-error">{{ aesDecErr }}</p>
          </div>
        </div>
      </div>
      <template #footer>
        <span class="text-xs opacity-40">GCM 输出含 16 字节认证标签;CBC 模式请自行校验完整性</span>
      </template>
    </PaneShell>

    <!-- 区三:RSA 非对称操作 -->
    <PaneShell label="RSA 加解密与签名" badge="OAEP·SHA256 / PSS">
      <div class="flex flex-col gap-3 p-3">
        <div class="grid gap-2 lg:grid-cols-2">
          <textarea
            v-model="rsaPub"
            aria-label="RSA 公钥"
            placeholder="RSA 公钥(PEM 或 JWK,用于加密/验签)"
            rows="4"
            class="textarea textarea-sm font-mono"
          ></textarea>
          <textarea
            v-model="rsaPriv"
            aria-label="RSA 私钥"
            placeholder="RSA 私钥(PEM 或 JWK,用于解密/签名;不落盘)"
            rows="4"
            autocomplete="off"
            class="textarea textarea-sm font-mono"
          ></textarea>
        </div>

        <div class="join self-start">
          <button
            v-for="t in RSA_TABS"
            :key="t.id"
            type="button"
            class="btn btn-xs join-item"
            :class="state.rsaTab === t.id ? 'btn-primary' : 'btn-ghost'"
            @click="state.rsaTab = t.id"
          >
            {{ t.label }}
          </button>
        </div>

        <textarea
          v-model="rsaIn"
          aria-label="RSA 输入"
          :placeholder="state.rsaTab === 'encrypt' ? '明文(RSA-OAEP 单段约 190 字节上限)' : state.rsaTab === 'decrypt' ? 'Base64 密文' : '待签名/待验签文本'"
          rows="3"
          class="textarea textarea-sm font-mono"
        ></textarea>
        <textarea
          v-if="state.rsaTab === 'verify'"
          v-model="rsaSigIn"
          aria-label="待验签名"
          placeholder="Base64 签名"
          rows="2"
          class="textarea textarea-sm font-mono"
        ></textarea>

        <div v-if="state.rsaTab !== 'verify'" class="flex items-start gap-2 text-xs">
          <span class="w-10 shrink-0 pt-0.5 opacity-50">输出</span>
          <code data-rsa="out" class="min-w-0 flex-1 break-all rounded border border-base-300 bg-base-200/60 px-2 py-1 font-mono">{{ rsaOut }}</code>
          <button v-if="rsaOut" type="button" class="btn btn-xs btn-ghost shrink-0" @click="copy(rsaOut)">{{ copied ? '已复制' : '复制' }}</button>
        </div>
        <div v-else class="flex items-center gap-2 text-sm">
          <span class="text-xs opacity-50">验签结果</span>
          <code data-rsa="verify" class="rounded px-2 py-1 font-mono" :class="rsaVerified === true ? 'text-success' : rsaVerified === false ? 'text-error' : ''">
            {{ rsaVerified === null ? '' : rsaVerified ? 'true ✓ 验签通过' : 'false ✗ 验签不通过' }}
          </code>
        </div>
        <p v-if="rsaErr" class="text-error text-sm">{{ rsaErr }}</p>
      </div>
      <template #footer>
        <span class="text-xs opacity-40">密钥仅存于当前页面会话,刷新即清空</span>
      </template>
    </PaneShell>
  </div>
</template>

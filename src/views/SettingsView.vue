<script setup lang="ts">
import { ref } from 'vue'
import FrameworkManager from '../components/settings/FrameworkManager.vue'
import ProviderManager from '../components/settings/ProviderManager.vue'
import ProxyManager from '../components/settings/ProxyManager.vue'
import SourceManager from '../components/settings/SourceManager.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import UnderlineTabs from '../components/ui/UnderlineTabs.vue'

type Tab = 'source' | 'framework' | 'provider' | 'proxy'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'source', label: '信息源' },
  { key: 'framework', label: '框架关注' },
  { key: 'provider', label: 'AI 配置' },
  { key: 'proxy', label: '代理' },
]

const tab = ref<Tab>('source')
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="设置" description="管理资讯源、框架版本关注、AI Provider 与代理" />

    <UnderlineTabs v-model="tab" :tabs="TABS" />

    <SourceManager v-show="tab === 'source'" />
    <FrameworkManager v-show="tab === 'framework'" />
    <ProviderManager v-show="tab === 'provider'" />
    <ProxyManager v-show="tab === 'proxy'" />
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <section
    class="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-box border border-base-300 bg-base-100 px-6 py-14 text-center"
  >
    <p class="font-mono text-5xl font-semibold tracking-tight text-primary">404</p>
    <h1 class="text-lg font-semibold tracking-tight">页面不存在</h1>
    <p class="max-w-md text-sm leading-relaxed text-base-content/60">
      链接可能已失效或页面已被移动,请检查地址后重试。
    </p>
    <RouterLink to="/" class="btn btn-primary btn-sm mt-2">返回首页</RouterLink>
  </section>
</template>

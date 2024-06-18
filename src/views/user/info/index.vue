<template>
  <main class="px-6 pb-4">
    <s-navs :navs="['menu.user', 'menu.user.info']" />

    <div class="s-section">
      <profile-banner />
    </div>

    <div class="s-section mt-4">
      <a-tabs type="rounded">
        <a-tab-pane key="info" title="基本信息">
          <info-form />
        </a-tab-pane>
        <a-tab-pane key="security" title="安全设置">123</a-tab-pane>
        <a-tab-pane key="attachments" title="个人附件">1452</a-tab-pane>
      </a-tabs>
    </div>
  </main>
</template>

<script lang="ts" setup>
import profileBanner from './widgets/profile-banner.vue'
import infoForm from './widgets/info-form.vue'
</script>

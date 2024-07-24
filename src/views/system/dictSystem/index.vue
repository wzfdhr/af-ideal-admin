<template>
  <main class="px-6">
    <s-navs :navs="['menu.system', 'menu.system.dict']" />

    <div class="s-section">
      <a-form>
        <div class="flex">
          <a-form-item label="字典名称">
            <a-input placeholder="请输入字典名称" :style="{ width: '240px' }" />
          </a-form-item>
          <a-form-item label="字典类型">
            <a-input placeholder="请输入字典类型" :style="{ width: '240px' }" />
          </a-form-item>
          <a-form-item label="字典状态">
            <a-select :style="{ width: '320px' }" placeholder="请选择字典状态">
              <a-option>所有</a-option>
              <a-option>显示</a-option>
              <a-option>隐藏</a-option>
            </a-select>
          </a-form-item>
          <a-form-item>
            <a-button icon="Search" type="primary">搜索</a-button>
            <a-button icon="Refresh" class="ml-2">重置</a-button>
          </a-form-item>
        </div>
      </a-form>
    </div>
  </main>
</template>

<script setup lang="ts"></script>

<style scoped></style>

<template>
  <h2 class="font-light text-base">仓库管理</h2>
  <a-divider style="margin: 16px 0" />
  <a-form ref="form" :model="formData" layout="vertical">
    <a-row :gutter="24">
      <a-col :span="8">
        <a-form-item
          label="仓库名"
          field="repoName"
          :rules="[{ required: true, message: '请输入仓库名称' }]"
        >
          <a-input v-model="formData.repoName" placeholder="repo-sidj93" />
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item
          label="仓库域名"
          field="domainName"
          :rules="[{ required: true, message: '请输入' }]"
        >
          <a-input v-model="formData.domainName" placeholder="请输入">
            <template #prepend>http://</template>
            <template #append>.com</template>
          </a-input>
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item
          label="仓库管理员"
          field="manager"
          :rules="[{ required: true, message: '请选择管理员' }]"
        >
          <a-select v-model="formData.manager" placeholder="请选择管理员">
            <a-option>蔡仲晨</a-option>
            <a-option>张三</a-option>
            <a-option>李四</a-option>
          </a-select>
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="生效日期" field="date">
          <a-range-picker class="w-full" />
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item
          label="仓库类型"
          field="type"
          :rules="[{ required: true, message: '请选择仓库类型' }]"
        >
          <a-select v-model="formData.type" placeholder="请选择仓库类型">
            <a-option :value="0">私密</a-option>
            <a-option :value="1">公开</a-option>
          </a-select>
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="关键词" field="keyword">
          <a-input-tag
            v-model="formData.keyword"
            allow-clear
            placeholder="按下回车确认"
          />
        </a-form-item>
      </a-col>
    </a-row>
  </a-form>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import type { RepoFormData } from '../types'

const form = ref<any>()

const formData = ref<RepoFormData>({
  date: '',
  domainName: '',
  keyword: [],
  manager: '',
  repoName: '',
  type: 0,
})

const handleValidate = () => {
  form.value.validate()
}

defineExpose({
  handleValidate,
})
</script>

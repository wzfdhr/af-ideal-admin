<template>
  <a-form :model="formData" layout="vertical" class="px-4">
    <a-row :gutter="24">
      <a-col :span="8">
        <a-form-item label="公司名称" field="name">
          <a-input v-model="formData.name" readonly />
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="统一社会信用代码" field="creditNo">
          <a-input v-model="formData.creditNo" readonly />
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="所属行业领域" field="field">
          <a-select v-model="formData.field" placeholder="请选择">
            <a-option :value="0">信息技术服务</a-option>
            <a-option :value="1">通信工程</a-option>
            <a-option :value="2">人力资源服务</a-option>
            <a-option :value="3">大数据与人工智能</a-option>
          </a-select>
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="所属园区" field="park">
          <a-select v-model="formData.park" placeholder="请选择">
            <a-option :value="0">齐鲁软件园创新中心</a-option>
            <a-option :value="1">国家海外人才离岸创新创业基地</a-option>
            <a-option :value="2">留学生创业园</a-option>
            <a-option :value="3">生命科学城发展中心</a-option>
          </a-select>
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="联系人" field="contact">
          <a-input v-model="formData.contact" readonly />
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="联系方式" field="phone">
          <a-input
            v-model="formData.phone"
            placeholder="请输入手机或固话号码"
          />
        </a-form-item>
      </a-col>
      <a-col :span="12">
        <a-form-item label="办公地址" field="address">
          <a-input v-model="formData.address" placeholder="请输入办公地址" />
        </a-form-item>
      </a-col>
      <a-col :span="12">
        <a-form-item label="注册地址" field="registerAddress">
          <a-input
            v-model="formData.registerAddress"
            placeholder="请输入企业注册地址"
          />
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="申报年度" field="applyYear">
          <a-year-picker v-model="formData.applyYear" class="w-full" />
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="申报年度纳税额" field="tax">
          <a-input-number v-model="formData.tax" hide-button>
            <template #append>万元</template>
          </a-input-number>
        </a-form-item>
      </a-col>
      <a-col :span="8">
        <a-form-item label="扶持资金" field="fund">
          <a-input-number
            v-model="formData.fund"
            hide-button
            placeholder="自动计算，无需填写"
          >
            <template #append>万元</template>
          </a-input-number>
        </a-form-item>
      </a-col>
      <a-col :span="24" class="mt-4">
        <div class="font-bold">承诺书</div>
        <p class="mt-2 leading-5">
          我、我所代表的法律实体以及该法律实体的法定代表人承诺，在本次业务办理过程中所填写的全部信息和提交的全部材料准确、真实、及时，不存在错、漏、瞒报现象。如果发现任何形式的违规申报，将按照相关规定取消政策兑现资格，直至追究法律责任。
        </p>
      </a-col>
    </a-row>

    <div class="text-center my-4">
      <a-button type="primary">下一步</a-button>
    </div>
  </a-form>
</template>

<script lang="ts" setup>
import { reactive } from 'vue'
import { useUserStore } from '@/store'

const userStore = useUserStore()

const formData = reactive({
  name: 'xxx集团',
  creditNo: 'M02M12C1127',
  field: undefined,
  contact: userStore.name,
  phone: undefined,
  park: undefined,
  address: '',
  registerAddress: '',
  applyYear: '',
  tax: undefined,
  fund: undefined,
})
</script>

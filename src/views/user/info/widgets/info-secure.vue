<!-- eslint-disable prettier/prettier -->
<template>
  <div>
    <div class="flex justify-between items-center px-4">
      <div class="flex flex-1 gap-4 items-center">
        <div>登录密码</div>
        <div>已设置。密码至少6位字符，支持数字、字母和除空格外的特殊字符，且必须同时包含数字和大小写字母。</div>
      </div>
      <div>
        <a-button type="text" @click="visible = true">修改</a-button>
      </div>
    </div>
    <div class="flex justify-between items-center px-4 mt-6">
      <div class="flex flex-1 gap-4 items-center">
        <div>密保问题</div>
        <div class="text-gray-600">您暂未设置密保问题，密保问题可以有效的保护账号的安全。</div>
      </div>
      <div>
        <a-button type="text" @click="visible1 = true">设置</a-button>
      </div>
    </div>
    <div class="flex justify-between items-center px-4 mt-6">
      <div class="flex flex-1 gap-4 items-center">
        <div>安全手机</div>
        <div class="text-gray-600">176****6666</div>
      </div>
      <div>
        <a-button type="text" @click="visible2 = true">修改</a-button>
      </div>
    </div>
    <div class="flex justify-between items-center px-4 mt-6">
      <div class="flex flex-1 gap-4 items-center">
        <div>安全邮箱</div>
        <div class="text-gray-600">您暂未设置邮箱，绑定邮箱可以用来找回密码、接收通知等</div>
      </div>
      <div>
        <a-button type="text" @click="visible3 = true">修改</a-button>
      </div>
    </div>
    <a-modal v-model:visible="visible" @ok="handleOk" @cancel="visible = false">
      <template #title>
        修改登录密码
      </template>
      <div>
        <a-form :model="password">
          <a-form-item field="oldPwd" label="旧密码">
            <a-input v-model="password.oldPwd" placeholder="请输入旧密码" />
          </a-form-item>
          <a-form-item field="newPwd" label="新密码">
            <a-input v-model="password.newPwd" placeholder="请输入旧密码" />
          </a-form-item>
          <a-form-item field="newPwd1" label="确认新密码">
            <a-input v-model="password.newPwd" placeholder="请再次输入旧密码" />
          </a-form-item>
        </a-form>
      </div>
    </a-modal>
    <a-modal v-model:visible="visible1" @ok="handleOk" @cancel="visible1 = false">
      <template #title>
        修改密保
      </template>
      <div>
        <a-form :model="configProtection">
          <a-form-item field="oldPwd" label="密保问题">
            <a-input v-model="configProtection.oldPwd" placeholder="请输入旧密码" />
          </a-form-item>
          <a-form-item field="newPwd" label="新密码">
            <a-input v-model="configProtection.newPwd" placeholder="请输入旧密码" />
          </a-form-item>
          <a-form-item field="newPwd1" label="确认新密码">
            <a-input v-model="configProtection.newPwd" placeholder="请再次输入旧密码" />
          </a-form-item>
        </a-form>
      </div>
    </a-modal>
    <a-modal v-model:visible="visible2" @ok="handleOk" @cancel="visible2 = false">
      <template #title>
        修改安全手机
      </template>
      <div>
        <a-form :model="phone">
          <a-form-item field="oldPhone" label="旧手机号">
            <a-input v-model="configProtection.oldPwd" placeholder="请输入旧手机号" />
          </a-form-item>
          <a-form-item field="newPhone" label="新手机号">
            <a-input v-model="configProtection.newPwd" placeholder="请输入新手机号" />
          </a-form-item>
          <a-form-item field="newPhone1" label="确认新手机号">
            <a-input v-model="configProtection.newPwd" placeholder="请再次输入新手机号" />
          </a-form-item>
        </a-form>
      </div>
    </a-modal>
    <a-modal v-model:visible="visible3" @ok="handleOk" @cancel="visible3 = false">
      <template #title>
        修改安全邮箱
      </template>
      <div>
        <a-form :model="Elm">
          <a-form-item field="oldElm" label="旧邮箱">
            <a-input v-model="configProtection.oldPwd" placeholder="请输入旧邮箱" />
          </a-form-item>
          <a-form-item field="newElm" label="新邮箱">
            <a-input v-model="configProtection.newElm" placeholder="请输入新邮箱" />
          </a-form-item>
          <a-form-item field="newElm1" label="确认新邮箱">
            <a-input v-model="configProtection.newElm1" placeholder="请再次输入新邮箱" />
          </a-form-item>
        </a-form>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// 密码
const visible = ref(false)
const password = ref({
  oldPwd: null,
  newPwd: null,
  newPwd1: null,
})
const handleOk = () => {
  visible.value = false
}
// 密保
const visible1 = ref(false)
const configProtection = ref({
  oldPwd: null,
  newPwd: null,
  newPwd1: null,
})
// 手机
const visible2 = ref(false)
const phone = ref({
  oldPhone: null,
  newPhone: null,
  newPhone1: null,
})
// 邮箱
const visible3 = ref(false)
const Elm = ref({
  oldElm: null,
  newElm: null,
  newElm1: null,
})
</script>

<style scoped></style>

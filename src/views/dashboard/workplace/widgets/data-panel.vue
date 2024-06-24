<template>
  <main>
    <div>
      <span class="text-lg font-black">项目</span>
      <a-divider />
      <div class="flex flex-wrap">
        <a-card class="card" title="Arco Card" hoverable>
          <div class="card-gap">
            <s-icon :name="GithubFill" class="text-4xl" />
            <span>Github</span>
          </div>
          <div class="card-gap text-sm">不要等待机会，而要创造机会。</div>
          <div class="card-gap text-base justify-between">
            <div>开源组</div>
            <div>2021-04-01</div>
          </div>
        </a-card>
        <a-card class="card" title="Arco Card" hoverable>
          <div class="card-gap">
            <s-icon :name="GithubFill" class="text-4xl" />
            <span>Github</span>
          </div>
          <div class="card-gap text-sm">不要等待机会，而要创造机会。</div>
          <div class="card-gap text-base justify-between">
            <div>开源组</div>
            <div>2021-04-01</div>
          </div>
        </a-card>
        <a-card class="card" title="Arco Card" hoverable>
          <div class="card-gap">
            <s-icon :name="GithubFill" class="text-4xl" />
            <span>Github</span>
          </div>
          <div class="card-gap text-sm">不要等待机会，而要创造机会。</div>
          <div class="card-gap text-base justify-between">
            <div>开源组</div>
            <div>2021-04-01</div>
          </div>
        </a-card>
      </div>
    </div>
  </main>
</template>

<script setup>
import { GithubFill, LogoutBox, User } from '@salmon-ui/icons'
</script>

<style lang="scss" scoped>
.card {
  @apply w-1/3;
  .card-gap {
    @apply flex mt-2 items-center gap-4;
  }
}
</style>

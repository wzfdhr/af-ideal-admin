// import { defineStore } from 'pinia'
// import { useDynamicTitle } from '@/utils/dynamicTitle'

// export interface SettingsS {
//   title: string
// }
// const useSettingsStore = defineStore('settings', {
//   state: (): SettingsS => ({
//     title: '',
//   }),

//   getters: {},

//   actions: {
//     changeSetting(data) {
//       const { key, value } = data
//       if (this.hasOwnProperty(key)) {
//         this[key] = value
//       }
//     },
//     // 设置网页标题
//     setTitle(title) {
//       this.title = title
//       useDynamicTitle()
//     },
//   },
// })

// export default useSettingsStore

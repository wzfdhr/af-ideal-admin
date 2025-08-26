// import { defineStore } from 'pinia'
// import { useDynamicTitle } from '@/utils/dynamicTitle'

// export interface SettingsS {
//   title: string
//   dynamicTitle: string
// }
// const useSettingsStore = defineStore('settings', {
//   state: (): SettingsS => ({
//     title: '',
//     dynamicTitle: '',
//   }),

//   getters: {},

//   actions: {
//     changeSetting(data: { key: any; value: any }) {
//       const { key, value } = data
//       if (this.hasOwnProperty(key)) {
//         this[key] = value
//       }
//     },
//     // 设置网页标题
//     setTitle(title: string) {
//       this.title = title
//       useDynamicTitle()
//     },
//   },
// })

// export default useSettingsStore
export {}

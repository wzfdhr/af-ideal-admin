import { ref, toRefs } from 'vue'
import useDictStore from '@/store/modules/dict'
// import { getDicts } from '@/api/system/dict/data'

/**
 * 获取字典数据
 */
const useDict = (...args: any[]) => {
  const res = ref()
  return () => {
    args.forEach((dictType) => {
      res.value[dictType] = []
      const dicts = useDictStore().getDict(dictType)
      if (dicts) {
        res.value[dictType] = dicts
      } else {
        useDictStore().setDict(dictType, res.value[dictType])
      }
    })
    return toRefs(res.value)
  }
}

export default { useDict }

import {
  getDegreeOptions,
  getDiplomaOptions,
  getFieldOptions,
  getGenderOptions,
} from '@/api/common'

const useOptions = async () => {
  const degrees = (await getDegreeOptions()).data
  const diplomas = (await getDiplomaOptions()).data
  const fields = (await getFieldOptions()).data
  const genders = (await getGenderOptions()).data

  return {
    degrees,
    diplomas,
    fields,
    genders,
  }
}

export default useOptions

import request from './request'
import type {
  FormDataSource,
  FormDataSourceInput,
  DictionaryItem,
} from '@af-admin/contracts'

export const fetchFormDataSources = async (params: {
  current: number
  pageSize: number
  keyword?: string
}) =>
  (
    await request.get<{ list: FormDataSource[]; total: number }>(
      '/form-data-sources',
      { params }
    )
  ).data
export const getFormDataSource = async (id: string) =>
  (await request.get<FormDataSource>(`/form-data-sources/${id}`)).data
export const saveFormDataSource = async (
  input: FormDataSourceInput,
  key: string,
  id?: string
) => {
  const config = { headers: { 'Idempotency-Key': key } }
  return (
    id
      ? await request.put<FormDataSource>(
          `/form-data-sources/${id}`,
          input,
          config
        )
      : await request.post<FormDataSource>('/form-data-sources', input, config)
  ).data
}
export const queryFormDataSource = async (id: string) =>
  (
    await request.get<{
      sourceId: string
      sourceRevision: number
      dictionaryRevision: number
      options: Pick<DictionaryItem, 'label' | 'value'>[]
    }>(`/form-data-sources/${id}/options`)
  ).data

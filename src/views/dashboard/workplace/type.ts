export type TodoTableItem = {
  title: string
  progress: number
  todo: number
}
export type DataPanelItem = {
  talent: number
  fund: number
  consultation: number
  storage: number
}

export type TalentChartData = {
  x: string
  y: number
}[]

export type ColData = {
  title: string
  dataIndex?: string
  slotName?: string
}[]

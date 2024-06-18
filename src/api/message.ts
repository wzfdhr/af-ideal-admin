export interface MessageRecord {
  id: number
  title: string
  time: string
  content: string
  avatar: string
}

export interface NoticeRecord {
  id: number
  title: string
  time: string
  type: string
}

export interface TodoRecord {
  id: number
  title: string
  status: string
  statusText: string
}

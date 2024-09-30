export type SubFormCompCtx = {
  handleValidate: () => void
}

export type RepoFormData = {
  repoName: string
  domainName: string
  manager: string
  type: number
  date: string
  keyword: string[]
}

export type MembersData = {
  name: string
  id: string
  dept: string
}

export interface User {
  id: number
  username: string
  is_active: boolean
  created_at: string
}

export interface Token {
  access_token: string
  token_type: string
}

export interface FreightTarget {
  [key: string]: string | number | null
}

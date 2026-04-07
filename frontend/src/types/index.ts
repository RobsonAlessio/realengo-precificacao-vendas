export interface User {
  id: number
  username: string
  is_active: boolean
  role: string | null
  auth_provider: string
  created_at: string
}

export interface Token {
  access_token: string
  token_type: string
}

export interface FreightTarget {
  [key: string]: string | number | null
}

export type Role = 'super_admin' | 'sys_admin' | 'operator' | 'user'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          email: string | null
          role: Role
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          email?: string | null
          role?: Role
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          email?: string | null
          role?: Role
          avatar_url?: string | null
          updated_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          name: string
          description: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          updated_at?: string
        }
      }
      project_members: {
        Row: {
          id: string
          project_id: string
          user_id: string
          role: Role
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          role?: Role
          created_at?: string
        }
        Update: {
          role?: Role
        }
      }
      locales: {
        Row: {
          id: string
          project_id: string
          code: string
          name: string
          is_default: boolean
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          code: string
          name: string
          is_default?: boolean
          created_at?: string
        }
        Update: {
          code?: string
          name?: string
          is_default?: boolean
        }
      }
      translation_keys: {
        Row: {
          id: string
          project_id: string
          key: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          key: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          key?: string
          description?: string | null
          updated_at?: string
        }
      }
      translations: {
        Row: {
          id: string
          key_id: string
          locale_id: string
          value: string
          updated_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          key_id: string
          locale_id: string
          value?: string
          updated_by?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          value?: string
          updated_by?: string
          updated_at?: string
        }
      }
    }
    Views: {
      project_member_roles: {
        Row: {
          project_id: string
          user_id: string
          role: Role
        }
      }
    }
    Functions: {
      is_first_user(): Promise<{ is_first: boolean }>
    }
  }
}

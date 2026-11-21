import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from '../lib/auth/auth-context'

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

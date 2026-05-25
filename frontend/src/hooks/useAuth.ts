import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import { logout as apiLogout } from '../api/session'

export function useAuth() {
  const { currentUser, setUser } = useAuthStore()
  const navigate = useNavigate()

  const logout = async () => {
    try { await apiLogout() } catch { /* ignore */ }
    setUser(null)
    navigate('/login')
  }

  return { currentUser, setUser, logout }
}

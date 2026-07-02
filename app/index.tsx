import { Redirect } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'

/**
 * Entry point — auth 상태에 따라 login or 홈 tab 으로 redirect.
 */
export default function Index() {
  const token = useAuthStore((s) => s.token)
  return <Redirect href={token ? '/(tabs)' : '/login'} />
}

import { Redirect } from 'expo-router'
import { View } from 'react-native'
import { useAuthStore } from '@/stores/authStore'

/**
 * Entry point — bootstrap 완료 후 auth 상태에 따라 login or 홈 tab redirect.
 *
 * bootstrapping=true 동안은 아무것도 렌더 X (native 스플래시가 화면 커버).
 * 이렇게 해야 초기 token=null 로 login 으로 즉시 튀지 않음.
 */
export default function Index() {
  const token = useAuthStore((s) => s.token)
  const bootstrapping = useAuthStore((s) => s.bootstrapping)

  if (bootstrapping) return <View />

  return <Redirect href={token ? '/(tabs)' : '/login'} />
}

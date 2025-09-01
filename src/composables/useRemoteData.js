import { ref } from 'vue'
import { useApplicationStore } from '@/stores/application.js'

export function useRemoteData(
  urlRef,
  authRef,
  methodRef = ref('GET'),
  bodyRef = ref(null)
) {
  const data = ref(null)
  const error = ref(null)
  const loading = ref(false)

  // Πάρε το store ΜΟΝΟ όταν χρειαστεί (μετά το app.use(pinia))
  let _store
  const getStore = () => {
    if (_store) return _store
    try { _store = useApplicationStore() } catch { _store = null }
    return _store
  }

  const performRequest = async () => {
    loading.value = true
    error.value = null

    const headers = { 'Content-Type': 'application/json' }
    if (authRef?.value === true) {
      const s = getStore()
      if (s?.userData?.accessToken) {
        headers.Authorization = `Bearer ${s.userData.accessToken}`
      }
    }

    const config = { method: methodRef?.value || 'GET', headers }
    if (bodyRef?.value != null) config.body = JSON.stringify(bodyRef.value)

    try {
      const res = await fetch(urlRef.value, config)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data.value = await res.json()
      return data.value
    } catch (e) {
      error.value = e
      throw e
    } finally {
      loading.value = false
    }
  }

  return { data, error, loading, performRequest }
}

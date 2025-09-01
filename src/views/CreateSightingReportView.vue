<script setup>
/* global google */
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApplicationStore } from '@/stores/application.js'

const route = useRoute()
const router = useRouter()
const app = useApplicationStore()

const backend  = import.meta.env.VITE_BACKEND
const gmapsKey = import.meta.env.VITE_GMAPS_KEY || import.meta.env.VITE_GMAPS_API_KEY

const lostReportId = route.params.id

const loading = ref(false)
const errorMsg = ref('')
const okMsg = ref('')

const form = ref({
  confidenceIndex: 'MEDIUM',     // VERY_LOW | LOW | MEDIUM | HIGH
  dateTimeSeen: '',              // ISO-local (datetime-local input)
  address: '',
  latitude: null,
  longitude: null,
  notes: ''
})

// map refs
const mapEl = ref(null)
const addressInputEl = ref(null)
let map, marker, autocomplete, geocoder

function loadGoogleMaps(key) {
  return new Promise((resolve) => {
    if (window.google?.maps) return resolve(true)
    if (!key) return resolve(false)
    const cb = 'initGmaps_' + Math.random().toString(36).slice(2)
    window[cb] = () => resolve(true)
    const s = document.createElement('script')
    s.async = true
    s.defer = true
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=${cb}`
    s.onerror = () => resolve(false)
    document.head.appendChild(s)
  })
}

function updateCoords(latLng) {
  const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat
  const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng
  form.value.latitude = Number(Number(lat).toFixed(6))
  form.value.longitude = Number(Number(lng).toFixed(6))
}

function initMap(center = { lat: 37.9838, lng: 23.7275 }) {
  if (!mapEl.value || !window.google?.maps) return

  map = new google.maps.Map(mapEl.value, {
    center, zoom: 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: false
  })

  geocoder = new google.maps.Geocoder()

  marker = new google.maps.Marker({ map, position: center, draggable: true })
  updateCoords(marker.getPosition())

  // Autocomplete
  const sessionToken = new google.maps.places.AutocompleteSessionToken()
  autocomplete = new google.maps.places.Autocomplete(addressInputEl.value, {
    fields: ['place_id', 'geometry', 'formatted_address'],
    types: ['geocode'],
    // componentRestrictions: { country: 'gr' },
    sessionToken
  })
  autocomplete.bindTo('bounds', map)

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace()
    if (!place.geometry || !place.geometry.location) return
    map.panTo(place.geometry.location)
    map.setZoom(17)
    marker.setPosition(place.geometry.location)
    updateCoords(place.geometry.location)
    if (place.formatted_address) form.value.address = place.formatted_address
  })

  marker.addListener('dragend', () => {
    const pos = marker.getPosition()
    updateCoords(pos)
    // Optional reverse geocode για auto-fill διεύθυνσης:
    // geocoder.geocode({ location: pos }, (results, status) => {
    //   if (status === 'OK' && results?.[0]) form.value.address = results[0].formatted_address
    // })
  })
}

// προσπάθεια να πας πίσω στο view του lost report με προτεραιότητα στο history,
// αλλιώς δοκίμασε named routes ή μερικά πιθανά paths.
function navigateAfterSuccess() {
  const idStr = String(lostReportId ?? '')

  // 1) αν υπάρχει history, απλά γύρνα πίσω
  if (window.history.length > 1) {
    router.back()
    return
  }

  // 2) named route αν υπάρχει
  try {
    if (router.hasRoute && router.hasRoute('lost-report-view')) {
      router.replace({ name: 'lost-report-view', params: { id: idStr } })
      return
    }
    if (router.hasRoute && router.hasRoute('lost-report')) {
      router.replace({ name: 'lost-report', params: { id: idStr } })
      return
    }
  } catch {}

  // 3) δοκίμασε μερικά συνηθισμένα paths
  const candidates = [
    `/lost-report/${idStr}`,
    `/lost-reports/${idStr}`,
    `/lost/${idStr}`
  ]
  for (const p of candidates) {
    const r = router.resolve(p)
    if (r?.matched?.length) {
      router.replace(p)
      return
    }
  }

  // 4) τελική εναλλακτική: πήγαινε στην αρχική
  router.replace({ path: '/' })
}

// καθάρισμα της φόρμας (κρατάει το marker και τις συντεταγμένες σύμφωνες με τη θέση του)
function resetForm() {
  form.value.confidenceIndex = 'MEDIUM'
  form.value.dateTimeSeen = ''
  form.value.address = ''
  form.value.notes = ''
  // καθάρισε και το raw input του autocomplete
  if (addressInputEl.value) addressInputEl.value.value = ''
  // ανανέωσε συντεταγμένες με βάση το marker για να είναι συνεπείς
  if (marker?.getPosition) updateCoords(marker.getPosition())
}

onMounted(async () => {
  // κέντρο κοντά στο lost report, αν υπάρχει
  let center = { lat: 37.9838, lng: 23.7275 }
  try {
    const r = await fetch(`${backend}/api/lost-pet-reports/${lostReportId}`, { headers: { Accept: 'application/json' } })
    if (r.ok) {
      const json = await r.json()
      if (json?.latitude != null && json?.longitude != null) {
        center = { lat: Number(json.latitude), lng: Number(json.longitude) }
        form.value.address = json?.address || ''
      }
    }
  } catch {}
  const ok = await loadGoogleMaps(gmapsKey)
  if (ok) initMap(center)
})

async function onSubmit() {
  errorMsg.value = ''
  okMsg.value = ''

  if (!form.value.address || form.value.latitude == null || form.value.longitude == null || !form.value.confidenceIndex) {
    errorMsg.value = 'Please fill the required fields (address, confidence, location).'
    return
  }

  const payload = {
    confidenceIndex: form.value.confidenceIndex,
    address: form.value.address,
    latitude: form.value.latitude,
    longitude: form.value.longitude,
    notes: form.value.notes || undefined,
    dateTimeSeen: form.value.dateTimeSeen || undefined
  }

  const headers = { 'Content-Type': 'application/json' }
  if (app?.userData?.accessToken) headers.Authorization = `Bearer ${app.userData.accessToken}`

  loading.value = true
  try {
    const res = await fetch(`${backend}/api/lost-pet-reports/${String(lostReportId)}/sighting-reports`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const txt = await res.text().catch(()=> '')
      throw new Error(txt || `HTTP ${res.status}`)
    }

    okMsg.value = 'Sighting report created successfully.'

    // καθάρισε τη φόρμα
    resetForm()

    // ασφαλής πλοήγηση πίσω ή στο view του report
    navigateAfterSuccess()
  } catch (e) {
    errorMsg.value = e?.message || 'Failed to create sighting report.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="page">
    <section class="wrap">
      <header class="head">
        <h1 class="title">Create sighting report</h1>
        <span class="sub">Lost report #{{ lostReportId }}</span>
      </header>

      <p v-if="errorMsg" class="alert err">{{ errorMsg }}</p>
      <p v-if="okMsg" class="alert ok">{{ okMsg }}</p>

      <form class="grid" @submit.prevent="onSubmit">
        <!-- Fields -->
        <div class="col fields">
          <label class="field">
            <span>Confidence</span>
            <select v-model="form.confidenceIndex" required>
              <option value="VERY_LOW">Very low</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </label>

          <label class="field">
            <span>Date & time seen (optional)</span>
            <input v-model="form.dateTimeSeen" type="datetime-local" />
          </label>

          <label class="field">
            <span>Address</span>
            <input
              ref="addressInputEl"
              v-model="form.address"
              placeholder="Start typing address…"
              autocomplete="off"
              required
            />
          </label>

          <div class="coords">
            <span>lat: <b>{{ form.latitude ?? '–' }}</b></span>
            <span>lng: <b>{{ form.longitude ?? '–' }}</b></span>
          </div>

          <label class="field">
            <span>Notes (optional)</span>
            <textarea v-model="form.notes" rows="4" />
          </label>

          <button class="btn" type="submit" :disabled="loading">
            <span v-if="!loading">Create</span>
            <span v-else>Saving…</span>
          </button>
        </div>

        <!-- Map -->
        <div class="col map-wrap">
          <div v-if="gmapsKey" ref="mapEl" class="map"></div>
          <div v-else class="map-fallback">
            Map unavailable (missing <code>VITE_GMAPS_KEY</code>)
          </div>
        </div>
      </form>
    </section>
  </main>
</template>

<style scoped>
.page { background:#fff; min-height:100dvh; }
.wrap { max-width: 1100px; margin:0 auto; padding:20px; }
.head { display:flex; align-items:baseline; gap:10px; margin-bottom:12px; }
.title { margin:0; font-size:26px; font-weight:900; color:#103c70; }
.sub { color:#64748b; font-weight:700; }

.grid { display:grid; grid-template-columns: 3fr 2fr; gap:16px; align-items:start; }
.col { min-width:0; }
.fields { display:grid; gap:12px; }
.field { display:grid; gap:6px; }
.field > span { color:#0b2e55; font-weight:800; font-size:14px; }
input, select, textarea {
  border:1px solid rgba(0,0,0,.14); border-radius:12px; padding:10px 12px; font-size:16px; outline:none;
}
input:focus, select:focus, textarea:focus { border-color:#164a8a; box-shadow:0 0 0 3px rgba(22,74,138,.12); }
.coords { display:flex; gap:12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px; color:#334155; }

.map { height: 320px; width: 100%; border-radius:14px; border:1px solid rgba(0,0,0,.08); box-shadow:0 8px 20px rgba(16,60,112,.08); }
.map-fallback { height:320px; display:grid; place-items:center; border-radius:14px; border:1px dashed rgba(0,0,0,.15); color:#6b7280;}

.btn {
  height:46px; border-radius:12px; background:#164a8a; color:#fff; font-weight:800; border:none; cursor:pointer;
}
.btn[disabled] { opacity:.7; cursor:default; }

.alert { padding:10px 12px; border-radius:10px; margin:0 0 10px; }
.alert.err { background:#fde8ea; color:#7a1020; border:1px solid #f3c2c9; }
.alert.ok  { background:#e8f6ee; color:#0f5132; border:1px solid #badbcc; }

@media (max-width: 900px) {
  .grid { grid-template-columns: 1fr; }
  .map, .map-fallback { height: 260px; }
}
</style>

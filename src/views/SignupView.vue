<!-- SignupView.vue -->
<script setup>
/* global google */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const backendEnvVar = import.meta.env.VITE_BACKEND
const GMAPS_KEY = import.meta.env.VITE_GMAPS_KEY
const MAP_ID = import.meta.env.VITE_GMAPS_MAP_ID // optional, αλλά χρειάζεται για Advanced Marker

const router = useRouter()

const loading = ref(false)
const errorMsg = ref('')

const form = ref({
  username: '',
  email: '',
  password: '',
  phoneNumber: '',
  address: '',
  latitude: null,
  longitude: null,
})

const mapEl = ref(null)
const addressInputEl = ref(null)
let map, marker, geocoder

// --- Loader για Maps JS (async) ---
function loadGoogleMaps(key) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.importLibrary) return resolve(true)
    if (!key) return reject(new Error('No Google Maps key'))

    const id = 'gmaps-sdk'
    if (document.getElementById(id)) {
      const check = () =>
        window.google?.maps?.importLibrary ? resolve(true) : setTimeout(check, 50)
      return check()
    }
    const s = document.createElement('script')
    s.id = id
    s.async = true
    s.defer = true
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      key
    )}&v=weekly&loading=async&libraries=places`
    s.onerror = () => reject(new Error('Failed to load Google Maps'))
    s.onload = () => {
      const check = () =>
        window.google?.maps?.importLibrary ? resolve(true) : setTimeout(check, 50)
      check()
    }
    document.head.appendChild(s)
  })
}

function updateCoords(latLng) {
  if (!latLng) return
  const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat
  const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng
  form.value.latitude  = Number(Number(lat).toFixed(6))
  form.value.longitude = Number(Number(lng).toFixed(6))
}

async function initMap() {
  if (!mapEl.value) return

  const { Map } = await google.maps.importLibrary('maps')
  const { Autocomplete, AutocompleteSessionToken } = await google.maps.importLibrary('places')

  // Προσπάθησε να χρησιμοποιήσεις Advanced Marker ΜΟΝΟ αν υπάρχει MAP_ID
  let AdvancedMarkerElement = null
  if (MAP_ID) {
    try {
      const m = await google.maps.importLibrary('marker')
      AdvancedMarkerElement = m.AdvancedMarkerElement
    } catch {
      AdvancedMarkerElement = null
    }
  }

  const center = { lat: 37.9838, lng: 23.7275 } // Αθήνα
  map = new Map(mapEl.value, {
    center,
    zoom: 13,
    // Αν έχεις MAP_ID, πέρασέ το για vector map + advanced markers
    ...(MAP_ID ? { mapId: MAP_ID } : {}),
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  })

  geocoder = new google.maps.Geocoder()

  // ----- Marker με fallback -----
  if (AdvancedMarkerElement) {
    // Vector map + AdvancedMarkerElement (χωρίς warnings)
    marker = new AdvancedMarkerElement({
      map,
      position: center,
      gmpDraggable: true,
    })
    marker.addListener('dragend', (e) => {
      if (!e?.latLng) return
      const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() }
      marker.position = pos
      updateCoords(e.latLng)
    })
  } else {
    // Fallback: classic Marker (δουλεύει χωρίς Map ID)
    marker = new google.maps.Marker({
      map,
      position: center,
      draggable: true,
    })
    marker.addListener('dragend', (e) => updateCoords(e.latLng))
  }
  updateCoords(center)

  // click στον χάρτη -> μετακίνηση marker
  map.addListener('click', (e) => {
    if (!e?.latLng) return
    const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() }
    if (AdvancedMarkerElement) {
      marker.position = pos
    } else {
      marker.setPosition(pos)
    }
    updateCoords(e.latLng)
  })

  // ----- Autocomplete -----
  if (addressInputEl.value) {
    const sessionToken = new AutocompleteSessionToken()
    const ac = new Autocomplete(addressInputEl.value, {
      fields: ['geometry', 'formatted_address', 'name'],
      types: ['geocode'],
      // componentRestrictions: { country: 'gr' },
      sessionToken,
    })
    ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      const loc = place?.geometry?.location
      if (!loc) return
      const pos = { lat: loc.lat(), lng: loc.lng() }
      if (AdvancedMarkerElement) {
        marker.position = pos
      } else {
        marker.setPosition(pos)
      }
      map.setCenter(pos)
      map.setZoom(17)
      updateCoords(loc)
      if (place.formatted_address) {
        form.value.address = place.formatted_address
      }
    })
  }
}

onMounted(async () => {
  try {
    await loadGoogleMaps(GMAPS_KEY)
    await initMap()
  } catch (e) {
    // Αν δεν υπάρχει key ή απέτυχε το load — συνεχίζεις χωρίς χάρτη
    console.warn('Maps init skipped:', e?.message || e)
  }
})

function onSubmit() {
  errorMsg.value = ''

  if (!form.value.username || !form.value.email || !form.value.password || !form.value.phoneNumber) {
    errorMsg.value = 'Please fill in all required fields.'
    return
  }
  if (form.value.latitude == null || form.value.longitude == null || !form.value.address) {
    errorMsg.value = 'Please pick your address on the map (or via search).'
    return
  }

  loading.value = true
  fetch(`${backendEnvVar}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form.value),
  })
    .then(async (res) => {
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(txt || `Signup failed (${res.status})`)
      }
      router.push({ name: 'signin' })
    })
    .catch((e) => {
      errorMsg.value = e.message || 'Signup failed'
    })
    .finally(() => {
      loading.value = false
    })
}
</script>

<template>
  <main class="signup-page">
    <section class="card">
      <h1 class="title">Sign up</h1>

      <p v-if="errorMsg" class="alert">{{ errorMsg }}</p>

      <form class="grid" @submit.prevent="onSubmit">
        <!-- Αριστερά: πεδία -->
        <div class="col fields">
          <label class="field">
            <span>Username</span>
            <input v-model.trim="form.username" required />
          </label>
          <label class="field">
            <span>Email</span>
            <input v-model.trim="form.email" type="email" required />
          </label>
          <label class="field">
            <span>Password</span>
            <input v-model="form.password" type="password" required />
          </label>
          <label class="field">
            <span>Phone number</span>
            <input v-model.trim="form.phoneNumber" placeholder="+30…" required />
          </label>

          <label class="field">
            <span>Address</span>
            <input
              ref="addressInputEl"
              v-model="form.address"
              placeholder="Start typing your address…"
              autocomplete="off"
              required
            />
          </label>

          <div class="coords">
            <span>lat: <b>{{ form.latitude ?? '–' }}</b></span>
            <span>lng: <b>{{ form.longitude ?? '–' }}</b></span>
          </div>

          <button class="btn" type="button" :disabled="loading" @click="onSubmit">
            <span v-if="!loading">Create account</span>
            <span v-else class="spinner"></span>
          </button>
        </div>

        <!-- Δεξιά: χάρτης -->
        <div class="col map-wrap">
          <div v-if="GMAPS_KEY" ref="mapEl" id="map" />
          <div v-else class="map-fallback">
            Map unavailable (missing <code>VITE_GMAPS_KEY</code>)
          </div>
        </div>
      </form>
    </section>
  </main>
</template>

<style scoped>
.signup-page {
  --brand-800:#0b2e55;
  --brand-700:#103c70;
  --brand-600:#164a8a;
  --brand-100:#e9f0fb;

  min-height: 100dvh;
  background: #fff;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 72px;
  padding-left: 16px;
  padding-right: 16px;
}
.card {
  width: min(980px, 98vw);
  background: #fff;
  border: 1px solid rgba(0,0,0,.08);
  border-radius: 18px;
  box-shadow: 0 12px 36px rgba(16,60,112,.10);
  padding: 22px 22px 20px;
}
.title {
  margin: 0 0 12px;
  font-size: 30px;
  font-weight: 900;
  color: var(--brand-700);
  text-align: left;
}
.grid {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 16px;
  align-items: start;
}
.col { min-width: 0; }

.fields { display: grid; gap: 12px; }
.field { display: grid; gap: 6px; }
.field > span {
  color: var(--brand-800);
  font-weight: 700;
  font-size: 14px;
}
input {
  height: 46px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,.14);
  font-size: 16px;
  outline: none;
}
input:focus {
  border-color: var(--brand-600);
  box-shadow: 0 0 0 3px rgba(22,74,138,.12);
}

.coords {
  display: flex; gap: 12px; align-items: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px; color: #334155; opacity: .9;
}

.map-wrap { display: grid; }
#map {
  height: 320px;
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(0,0,0,.08);
  box-shadow: 0 8px 20px rgba(16,60,112,.08);
}
.map-fallback {
  height: 320px; display: grid; place-items: center;
  border-radius: 14px; border: 1px dashed rgba(0,0,0,.15); color:#6b7280;
}

/* Autocomplete dropdown πάνω απ’ όλα */
:global(.pac-container){ z-index: 10000 !important; }

/* Alert */
.alert {
  background: #fde8ea;
  color: #7a1020;
  border: 1px solid #f3c2c9;
  border-radius: 10px;
  padding: 10px 12px;
  margin: 0 0 12px;
  font-size: 14px;
}

/* Submit */
.btn {
  margin-top: 6px;
  height: 48px;
  border-radius: 12px;
  background: var(--brand-600);
  color: #fff;
  font-weight: 800;
  font-size: 16px;
  border: none;
  cursor: pointer;
  transition: transform .12s ease, filter .15s ease;
}
.btn:hover { filter: brightness(1.03); transform: translateY(-1px); }
.btn:disabled { opacity: .75; cursor: not-allowed; transform: none; }
.spinner {
  width: 18px; height: 18px;
  border: 3px solid rgba(255,255,255,.45);
  border-top-color: #fff;
  border-radius: 50%;
  display: inline-block;
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 900px) {
  .grid { grid-template-columns: 1fr; }
  #map, .map-fallback { height: 260px; }
}
</style>

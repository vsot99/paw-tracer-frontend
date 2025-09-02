<!-- src/views/CreateLostPetReportView.vue -->
<script setup>
/* global google */
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore } from '@/stores/application.js'

const router = useRouter()
const app = useApplicationStore()

const backend  = import.meta.env.VITE_BACKEND
const gmapsKey = import.meta.env.VITE_GMAPS_KEY || import.meta.env.VITE_GMAPS_API_KEY

// --- UI state ---
const loading   = ref(false)
const petsLoading = ref(false)
const errorMsg  = ref('')
const okMsg     = ref('')

// --- Pets (για select) ---
const pets = ref([])
const petsError = ref('')

async function loadPets(){
  petsLoading.value = true
  petsError.value = ''
  try{
    const res = await fetch(`${backend}/api/pets`, {
      headers: {
        Accept: 'application/json',
        ...(app?.userData?.accessToken ? { Authorization:`Bearer ${app.userData.accessToken}` } : {})
      }
    })
    if(!res.ok) throw new Error(`HTTP ${res.status}`)
    const arr = await res.json()
    pets.value = Array.isArray(arr) ? arr : []
    if (!form.value.petId && pets.value.length) form.value.petId = pets.value[0].id
  }catch(e){
    petsError.value = e?.message || 'Failed to load your pets.'
  }finally{
    petsLoading.value = false
  }
}

// --- Form model (LostPetReportCreateDTO) ---
const form = ref({
  petId: null,                 // @NotNull
  whenMode: 'NOW',             // 'NOW' | 'CUSTOM'
  dateTimeLost: '',            // optional (used only when whenMode === 'CUSTOM')
  address: '',                 // @NotBlank
  latitude: null,              // @NotNull (-90..90)
  longitude: null,             // @NotNull (-180..180)
  notifyOnMatch: false,        // @NotNull
  searchRadiusKm: 3,           // @Min(1) @Max(5) — only if notifyOnMatch
  hasCollar: false,            // @NotNull
  collarColor: '',             // required only if hasCollar === true
  notes: ''                    // optional
})

// --- Google Maps / Autocomplete ---
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
  form.value.latitude  = Number(Number(lat).toFixed(6))
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

  const sessionToken = new google.maps.places.AutocompleteSessionToken()
  autocomplete = new google.maps.places.Autocomplete(addressInputEl.value, {
    fields: ['place_id', 'geometry', 'formatted_address'],
    types: ['geocode'],
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
  })
}

// helpers
function toLocalDateTime(value){
  return value && String(value).length ? value : undefined
}

// keep things in sync
watch(() => form.value.whenMode, (m) => {
  if (m === 'NOW') form.value.dateTimeLost = '' // καθάρισε όταν πάει σε NOW
})
watch(() => form.value.hasCollar, (v) => {
  if (!v) form.value.collarColor = ''
})
watch(() => form.value.notifyOnMatch, (v) => {
  if (!v) form.value.searchRadiusKm = 3
})

// --- Submit ---
async function onSubmit(){
  errorMsg.value = ''
  okMsg.value = ''

  // basic validation (frontend)
  if (!form.value.petId){
    errorMsg.value = 'Please select a pet.'
    return
  }
  if (form.value.whenMode === 'CUSTOM' && !form.value.dateTimeLost){
    errorMsg.value = 'Please choose the disappearance date & time.'
    return
  }
  if (!form.value.address || form.value.latitude == null || form.value.longitude == null){
    errorMsg.value = 'Please fill address and select a location on the map.'
    return
  }
  if (typeof form.value.notifyOnMatch !== 'boolean'){
    errorMsg.value = 'Please choose if you want to receive notifications.'
    return
  }
  if (form.value.notifyOnMatch){
    const r = Number(form.value.searchRadiusKm || 0)
    if (!(r >= 1 && r <= 5)){
      errorMsg.value = 'Notification radius must be between 1 and 5 km.'
      return
    }
  }
  if (typeof form.value.hasCollar !== 'boolean'){
    errorMsg.value = 'Please specify if your pet wore a collar.'
    return
  }
  if (form.value.hasCollar === true && !String(form.value.collarColor || '').trim()){
    errorMsg.value = 'Please provide the collar color.'
    return
  }

  // build payload that matches LostPetReportCreateDTO
  const payload = {
    petId: Number(form.value.petId),
    dateTimeLost: form.value.whenMode === 'CUSTOM' ? toLocalDateTime(form.value.dateTimeLost) : undefined,
    address: form.value.address,
    latitude: form.value.latitude,
    longitude: form.value.longitude,
    notifyOnMatch: Boolean(form.value.notifyOnMatch),
    searchRadiusKm: form.value.notifyOnMatch ? Number(form.value.searchRadiusKm) : undefined,
    hasCollar: Boolean(form.value.hasCollar),
    collarColor: form.value.hasCollar ? String(form.value.collarColor).trim() : undefined,
    notes: form.value.notes || undefined
  }

  const headers = { 'Content-Type':'application/json' }
  if (app?.userData?.accessToken) headers.Authorization = `Bearer ${app.userData.accessToken}`

  loading.value = true
  try{
    const res = await fetch(`${backend}/api/lost-pet-reports/create`, {
      method:'POST',
      headers,
      body: JSON.stringify(payload)
    })
    if (!res.ok){
      const t = await res.text().catch(()=> '')
      throw new Error(t || `HTTP ${res.status}`)
    }
    okMsg.value = 'Lost pet report created successfully.'
    if (window.history.length > 1) router.back()
    else router.replace({ path: '/' })
  }catch(e){
    errorMsg.value = e?.message || 'Failed to create lost report.'
  }finally{
    loading.value = false
  }
}

onMounted(async () => {
  await loadPets()
  const ok = await loadGoogleMaps(gmapsKey)
  if (ok) initMap()
})

const coords = computed(() => ({
  lat: form.value.latitude ?? '–',
  lng: form.value.longitude ?? '–'
}))
</script>

<template>
  <main class="page">
    <section class="wrap">
      <header class="head">
        <h1 class="title">Create lost pet report</h1>
      </header>

      <p v-if="errorMsg" class="alert err">{{ errorMsg }}</p>
      <p v-if="okMsg" class="alert ok">{{ okMsg }}</p>

      <form class="grid" @submit.prevent="onSubmit">
        <!-- Fields -->
        <div class="col fields">
          <!-- Pet (required) -->
          <label class="field">
            <span class="req">Pet</span>
            <select v-model="form.petId" required :disabled="petsLoading || !!petsError">
              <option v-if="!petsLoading && !pets.length" disabled value="">No pets found</option>
              <option v-for="p in pets" :key="p.id" :value="p.id">
                {{ p.name }} ( #{{ p.id }} )
              </option>
            </select>
            <small v-if="petsLoading" class="muted">Loading your pets…</small>
            <small v-else-if="petsError" class="err">{{ petsError }}</small>
          </label>

          <!-- When did your pet go missing? -->
          <fieldset class="field">
            <span class="req">When did your pet go missing?</span>
            <div class="choices">
              <label><input type="radio" name="when" v-model="form.whenMode" value="NOW"> Now</label>
              <label><input type="radio" name="when" v-model="form.whenMode" value="CUSTOM"> Choose date and time</label>
            </div>
          </fieldset>

          <!-- Date & time (required only if CUSTOM) -->
          <label class="field" v-if="form.whenMode === 'CUSTOM'">
            <span :class="{req:true}">Date & time</span>
            <input v-model="form.dateTimeLost" type="datetime-local" required />
          </label>

          <!-- Address (required) -->
          <label class="field">
            <span class="req">Address</span>
            <input
              ref="addressInputEl"
              v-model="form.address"
              placeholder="Start typing address…"
              autocomplete="off"
              required
            />
          </label>

          <div class="coords">
            <span>lat: <b>{{ coords.lat }}</b></span>
            <span>lng: <b>{{ coords.lng }}</b></span>
          </div>

          <!-- Notify on match -->
          <fieldset class="field">
            <span>Do you want to receive notifications for possible findings?</span>
            <div class="choices">
              <label><input type="radio" name="notify" v-model="form.notifyOnMatch" :value="true"> Yes</label>
              <label><input type="radio" name="notify" v-model="form.notifyOnMatch" :value="false"> No</label>
            </div>
          </fieldset>

          <!-- Radius (required only if notify === true) -->
          <label class="field" v-if="form.notifyOnMatch === true">
            <span :class="{req:true}">Notification radius (km)</span>
            <select v-model.number="form.searchRadiusKm" required>
              <option :value="1">1</option>
              <option :value="2">2</option>
              <option :value="3">3</option>
              <option :value="4">4</option>
              <option :value="5">5</option>
            </select>
          </label>

          <!-- Collar -->
          <fieldset class="field">
            <span>Did your pet wear a collar when it went missing?</span>
            <div class="choices">
              <label><input type="radio" name="collar" v-model="form.hasCollar" :value="true"> Yes</label>
              <label><input type="radio" name="collar" v-model="form.hasCollar" :value="false"> No</label>
            </div>
          </fieldset>

          <!-- Collar color (required when hasCollar === true) -->
          <label class="field" v-if="form.hasCollar === true">
            <span :class="{req:true}">Collar color</span>
            <input v-model.trim="form.collarColor" required placeholder="e.g. Red, Blue…" />
          </label>

          <!-- Notes -->
          <label class="field">
            <span>Notes (optional)</span>
            <textarea v-model="form.notes" rows="4" />
          </label>

          <button class="btn" type="submit" :disabled="loading || !pets.length">
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

.grid { display:grid; grid-template-columns: 3fr 2fr; gap:16px; align-items:start; }
.col { min-width:0; }
.fields { display:grid; gap:12px; }
.field { display:grid; gap:6px; }
.field > span { color:#0b2e55; font-weight:800; font-size:14px; }
.choices { display:flex; gap:12px; color:#0b2e55; font-weight:700; }
.choices label { display:flex; align-items:center; gap:6px; }

/* required asterisk */
.req::after {
  content: ' *';
  color: #dc2626; /* κόκκινο */
  font-weight: 900;
  margin-left: 4px;
}

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

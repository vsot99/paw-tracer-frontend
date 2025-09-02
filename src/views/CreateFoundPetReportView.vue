<!-- src/views/CreateFoundPetReportView.vue -->
<script setup>
/* global google */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore } from '@/stores/application.js'

const router = useRouter()
const app = useApplicationStore()

const backend  = import.meta.env.VITE_BACKEND
const gmapsKey = import.meta.env.VITE_GMAPS_KEY || import.meta.env.VITE_GMAPS_API_KEY

// ----- UI state -----
const loading  = ref(false)
const errorMsg = ref('')
const okMsg    = ref('')

// ----- Enums (ταιριάζουν με backend: DOG | CAT | OTHER, κτλ.) -----
const SPECIES_OPTIONS = ['DOG','CAT','OTHER']
const SIZE_OPTIONS    = ['SMALL','MEDIUM','LARGE','EXTRA_LARGE']
const GENDER_OPTIONS  = ['MALE','FEMALE']

// ----- Form model (FoundPetReportCreateDTO) -----
const form = ref({
  // REPORT DATA
  dateTimeFound: '',
  address: '',
  latitude: null,
  longitude: null,
  holdingPet: null,
  notes: '',

  // PET DATA
  species: null,
  breed: '',
  color: '',
  size: null,
  gender: null,
  hasCollar: null,
  collarColor: '',          // <-- ΝΕΟ (required αν hasCollar === true)
  name: '',                 // optional, αλλά required αν nameOnCollar === true
  approximateBehavior: ''
})

// UI-only helper: “Is there a name on it?”
const nameOnCollar = ref(null) // true | false | null

// ----- Google Maps / Places -----
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
    fields: ['place_id','geometry','formatted_address'],
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

onMounted(async () => {
  const ok = await loadGoogleMaps(gmapsKey)
  if (ok) initMap()
})

const coords = computed(() => ({
  lat: form.value.latitude ?? '–',
  lng: form.value.longitude ?? '–'
}))

// ----- Submit -----
function toLocalDateTime(value){
  return value && String(value).length ? value : undefined
}

async function onSubmit(){
  errorMsg.value = ''
  okMsg.value = ''

  // Frontend validation
  if (!form.value.address || form.value.latitude == null || form.value.longitude == null){
    errorMsg.value = 'Please fill address and select a location on the map.'
    return
  }
  if (typeof form.value.holdingPet !== 'boolean'){
    errorMsg.value = 'Please specify if you are temporarily keeping the pet.'
    return
  }
  if (!form.value.species || !form.value.breed || !form.value.color || !form.value.size || !form.value.gender){
    errorMsg.value = 'Please complete the pet description (species, breed, color, size, gender).'
    return
  }
  if (typeof form.value.hasCollar !== 'boolean'){
    errorMsg.value = 'Please specify if the pet wore a collar.'
    return
  }
  // ΝΕΟ: απαιτούμε collarColor όταν έχει κολάρο
  if (form.value.hasCollar === true && !String(form.value.collarColor || '').trim()){
    errorMsg.value = 'Please provide the collar color.'
    return
  }
  // ΝΕΟ: απαιτούμε name όταν υπάρχει όνομα στο κολάρο
  if (form.value.hasCollar === true && nameOnCollar.value === true && !String(form.value.name || '').trim()){
    errorMsg.value = 'Please provide the name on the collar (or choose No).'
    return
  }

  // Build payload (FoundPetReportCreateDTO)
  const payload = {
    dateTimeFound: toLocalDateTime(form.value.dateTimeFound),
    address: form.value.address,
    latitude: form.value.latitude,
    longitude: form.value.longitude,
    holdingPet: Boolean(form.value.holdingPet),
    notes: form.value.notes || undefined,

    species: String(form.value.species),
    breed: String(form.value.breed).trim(),
    color: String(form.value.color).trim(),
    size: String(form.value.size),
    gender: String(form.value.gender),
    hasCollar: Boolean(form.value.hasCollar),

    collarColor: form.value.hasCollar ? (String(form.value.collarColor).trim() || undefined) : undefined,
    name: (form.value.hasCollar && nameOnCollar.value) ? (String(form.value.name).trim() || undefined) : undefined,
    approximateBehavior: form.value.approximateBehavior || undefined
  }

  const headers = { 'Content-Type': 'application/json' }
  if (app?.userData?.accessToken) headers.Authorization = `Bearer ${app.userData.accessToken}`

  loading.value = true
  try{
    const res = await fetch(`${backend}/api/found-pet-reports`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    if (!res.ok){
      const t = await res.text().catch(()=> '')
      throw new Error(t || `HTTP ${res.status}`)
    }
    let newId = null
    const data = await res.json().catch(() => null)
    if (data?.id != null) newId = data.id
    if (!newId) {
      // fallback: αν ο server στείλει Location header
      const loc = res.headers.get('Location')
      const m = loc && loc.match(/\/found-pet-reports\/(\d+)/)
      if (m) newId = Number(m[1])
    }

    if (newId) {
      okMsg.value = 'Found pet report created successfully.'
      router.replace({ path: `/found/${newId}` })
    } else {
      // safety fallback
      okMsg.value = 'Report created, but could not detect new ID.'
      router.replace({ path: '/' })
    }
  } catch(e) {
    errorMsg.value = e?.message || 'Failed to create found pet report.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="page">
    <section class="wrap">
      <header class="head">
        <h1 class="title">Create found pet report</h1>
      </header>

      <p v-if="errorMsg" class="alert err">{{ errorMsg }}</p>
      <p v-if="okMsg" class="alert ok">{{ okMsg }}</p>

      <form class="grid" @submit.prevent="onSubmit">
        <!-- Left column: fields -->
        <div class="col fields">
          <!-- Date & time found (optional) -->
          <label class="field">
            <span>Date & time found (optional)</span>
            <input v-model="form.dateTimeFound" type="datetime-local" />
          </label>

          <!-- Address + autocomplete -->
          <label class="field">
            <span>Address <b class="req">*</b></span>
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

          <!-- Holding pet? -->
          <fieldset class="field">
            <span>Are you temporarily keeping the pet? <b class="req">*</b></span>
            <div class="choices">
              <label><input type="radio" name="hold" v-model="form.holdingPet" :value="true"> Yes</label>
              <label><input type="radio" name="hold" v-model="form.holdingPet" :value="false"> No</label>
            </div>
          </fieldset>

          <!-- Notes -->
          <label class="field">
            <span>Notes (optional)</span>
            <textarea v-model="form.notes" rows="3" />
          </label>

          <!-- Separator -->
          <div class="sep">Pet description</div>

          <!-- Species -->
          <label class="field">
            <span>Species <b class="req">*</b></span>
            <select v-model="form.species" required>
              <option disabled :value="null">Select…</option>
              <option v-for="s in SPECIES_OPTIONS" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>

          <!-- Breed -->
          <label class="field">
            <span>Breed <b class="req">*</b></span>
            <input v-model.trim="form.breed" required placeholder="e.g. Mixed, Labrador…" />
          </label>

          <!-- Color -->
          <label class="field">
            <span>Color <b class="req">*</b></span>
            <input v-model.trim="form.color" required placeholder="e.g. Black, Brown/White…" />
          </label>

          <!-- Size -->
          <label class="field">
            <span>Size <b class="req">*</b></span>
            <select v-model="form.size" required>
              <option disabled :value="null">Select…</option>
              <option v-for="s in SIZE_OPTIONS" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>

          <!-- Gender -->
          <label class="field">
            <span>Gender <b class="req">*</b></span>
            <select v-model="form.gender" required>
              <option disabled :value="null">Select…</option>
              <option v-for="g in GENDER_OPTIONS" :key="g" :value="g">{{ g }}</option>
            </select>
          </label>

          <!-- Collar -->
          <fieldset class="field">
            <span>Did the pet wear a collar? <b class="req">*</b></span>
            <div class="choices">
              <label><input type="radio" name="collar" v-model="form.hasCollar" :value="true"> Yes</label>
              <label><input type="radio" name="collar" v-model="form.hasCollar" :value="false"> No</label>
            </div>
          </fieldset>

          <!-- Collar color (required if hasCollar === true) -->
          <label class="field" v-if="form.hasCollar === true">
            <span>Collar color <b class="req">*</b></span>
            <input
              v-model.trim="form.collarColor"
              :required="form.hasCollar === true"
              placeholder="e.g. Red, Blue, Black…"
            />
          </label>

          <!-- Name on collar? (UI-only) -->
          <fieldset class="field" v-if="form.hasCollar === true">
            <span>Is there a name on it?</span>
            <div class="choices">
              <label><input type="radio" name="nameon" v-model="nameOnCollar" :value="true"> Yes</label>
              <label><input type="radio" name="nameon" v-model="nameOnCollar" :value="false"> No</label>
            </div>
          </fieldset>

          <!-- Name (required if nameOnCollar === true) -->
          <label class="field" v-if="form.hasCollar === true && nameOnCollar === true">
            <span>Name <b class="req">*</b></span>
            <input
              v-model.trim="form.name"
              :required="nameOnCollar === true"
              placeholder="e.g. Bella"
            />
          </label>

          <!-- Behavior -->
          <label class="field">
            <span>Behavior (optional)</span>
            <textarea v-model="form.approximateBehavior" rows="3" placeholder="e.g. Friendly but timid around strangers…" />
          </label>

          <button class="btn" type="submit" :disabled="loading">
            <span v-if="!loading">Create</span>
            <span v-else>Saving…</span>
          </button>
        </div>

        <!-- Right column: Map -->
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
.req { color:#b91c1c; }

.choices { display:flex; gap:12px; color:#0b2e55; font-weight:700; }
.choices label { display:flex; align-items:center; gap:6px; }

.sep {
  margin: 6px 0 2px;
  font-weight: 900;
  color: #103c70;
  border-top: 1px dashed rgba(0,0,0,.12);
  padding-top: 10px;
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

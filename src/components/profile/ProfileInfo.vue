<script setup>
/* global google */
import { ref, reactive, computed, nextTick, onMounted } from 'vue'
import { useApplicationStore } from '@/stores/application.js'

const app = useApplicationStore()

const backend = import.meta.env.VITE_BACKEND
const GMAPS_KEY = import.meta.env.VITE_GMAPS_KEY
const MAP_ID = import.meta.env.VITE_GMAPS_MAP_ID

// ====== State ======
const loading = ref(false)
const saving = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const isEditing = ref(false)
const original = reactive({
  username: '', email: '', phoneNumber: '',
  address: '', latitude: null, longitude: null,
})
const form = reactive({
  username: '', email: '', phoneNumber: '',
  address: '', latitude: null, longitude: null,
  newPassword: '', confirmPassword: '',
})

// ====== Helpers ======
const isAuthenticated = computed(() => app.isAuthenticated)
const authHeaders = computed(() => {
  const token = app.userData?.accessToken || ''
  return token ? { Authorization: `Bearer ${token}` } : {}
})

// diff μόνο τα αλλάγμένα πεδία (εκτός username)
function diffPayload() {
  const out = {}
  const keys = ['email','phoneNumber','address','latitude','longitude']
  for (const k of keys) {
    const a = original[k]; const b = form[k]
    if (String(a ?? '') !== String(b ?? '')) out[k] = b
  }
  if (form.newPassword) out.password = form.newPassword
  return out
}

// ====== API ======
async function apiGetMe() {
  const res = await fetch(`${backend}/api/users`, { headers: { Accept:'application/json', ...authHeaders.value } })
  if (!res.ok) throw new Error(await res.text().catch(()=>`HTTP ${res.status}`))
  return res.json()
}
async function apiPutMe(payload) {
  const res = await fetch(`${backend}/api/users`, {
    method:'PUT', headers:{ 'Content-Type':'application/json', ...authHeaders.value }, body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(await res.text().catch(()=>`HTTP ${res.status}`))
  return res.json().catch(()=> ({}))
}

// ====== Load current user ======
async function loadUser() {
  if (!isAuthenticated.value) {
    errorMsg.value = 'You have to be authenticated to access your profile'
    return
  }
  loading.value = true
  errorMsg.value = ''; successMsg.value = ''
  try {
    const data = await apiGetMe()
    original.username   = form.username   = data.username ?? ''
    original.email      = form.email      = data.email ?? ''
    original.phoneNumber= form.phoneNumber= data.phoneNumber ?? ''
    original.address    = form.address    = data.address ?? ''
    original.latitude   = form.latitude   = data.latitude ?? null
    original.longitude  = form.longitude  = data.longitude ?? null
  } catch (e) { errorMsg.value = e.message || 'Αποτυχία φόρτωσης στοιχείων.' }
  finally { loading.value = false }
}

// ====== Edit / Save ======
async function startEdit() {
  isEditing.value = true
  successMsg.value = ''
  await nextTick()
  initMapSafe()
}
function clearPasswordFields(){ form.newPassword=''; form.confirmPassword='' }
function cancel() {
  isEditing.value = false
  errorMsg.value = ''; successMsg.value = ''
  form.email = original.email
  form.phoneNumber = original.phoneNumber
  form.address = original.address
  form.latitude = original.latitude
  form.longitude = original.longitude
  clearPasswordFields()
}
async function save() {
  errorMsg.value = ''; successMsg.value = ''
  if (form.email && !String(form.email).includes('@')) { errorMsg.value='Please insert a valid email.'; return }
  if (form.phoneNumber && form.phoneNumber.length < 10) { errorMsg.value='Please insert a valid phone number..'; return }
  if (form.newPassword || form.confirmPassword) {
    if (form.newPassword !== form.confirmPassword) { errorMsg.value='Passwords dont match.'; return }
    if (form.newPassword.length < 6) { errorMsg.value='New password should consist of at least 6 characters.'; return }
  }
  const payload = diffPayload()
  if (!Object.keys(payload).length) {
    successMsg.value='Δεν έγιναν αλλαγές.'; isEditing.value=false; clearPasswordFields(); return
  }
  saving.value = true
  try {
    await apiPutMe(payload)
    for (const k of ['email','phoneNumber','address','latitude','longitude']) if (k in payload) original[k]=payload[k]
    successMsg.value = 'Your profile information have been updated.'
    isEditing.value=false; clearPasswordFields()
  } catch(e){ errorMsg.value = e.message || 'Profile update failed' }
  finally { saving.value=false }
}

// ====== Google Maps ======
const mapEl = ref(null)
const addressInputEl = ref(null)
let gmap = null, marker = null

function loadGoogleMaps(key){
  return new Promise((resolve,reject)=>{
    if (window.google?.maps) return resolve(true)
    if (!key) return reject(new Error('No Google Maps key'))
    const id='gmaps-sdk'
    if (document.getElementById(id)){
      const check=()=> window.google?.maps ? resolve(true) : setTimeout(check,50)
      return check()
    }
    const s=document.createElement('script')
    s.id=id; s.async=true; s.defer=true
    s.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`
    s.onerror=()=>reject(new Error('Failed to load Google Maps'))
    s.onload =()=>resolve(true)
    document.head.appendChild(s)
  })
}
function updateCoordsFrom(latLng){
  const lat = typeof latLng.lat==='function' ? latLng.lat() : latLng.lat
  const lng = typeof latLng.lng==='function' ? latLng.lng() : latLng.lng
  form.latitude = Number(Number(lat).toFixed(6))
  form.longitude= Number(Number(lng).toFixed(6))
}
async function initMapSafe(){
  try { await loadGoogleMaps(GMAPS_KEY); initMap() }
  catch(e){ console.warn('Maps init skipped:', e?.message || e) }
}
function initMap(){
  if (!mapEl.value || !window.google?.maps) return
  const center = { lat: Number(form.latitude ?? 37.9838), lng: Number(form.longitude ?? 23.7275) }
  gmap = new google.maps.Map(mapEl.value, {
    center, zoom: 13, ...(MAP_ID ? { mapId: MAP_ID } : {}),
    mapTypeControl:false, streetViewControl:false, fullscreenControl:false,
  })
  marker = new google.maps.Marker({ map:gmap, position:center, draggable:true })
  marker.addListener('dragend', e=> updateCoordsFrom(e.latLng))
  gmap.addListener('click', e=>{
    if (!e?.latLng) return
    const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() }
    marker.setPosition(pos); updateCoordsFrom(e.latLng)
  })
  if (addressInputEl.value){
    const ac = new google.maps.places.Autocomplete(addressInputEl.value, {
      fields:['geometry','formatted_address'], types:['geocode'],
    })
    ac.addListener('place_changed', ()=>{
      const place = ac.getPlace(); const loc = place?.geometry?.location
      if (!loc) return
      const pos = { lat: loc.lat(), lng: loc.lng() }
      gmap.setCenter(pos); gmap.setZoom(17)
      marker.setPosition(pos); updateCoordsFrom(loc)
      if (place.formatted_address) form.address = place.formatted_address
    })
  }
}

onMounted(loadUser)
</script>

<template>
  <section>
    <div class="section-head">
      <h2 class="section-title">Profile Info</h2>
      <div class="actions">
        <button v-if="!isEditing" class="btn btn-primary" @click="startEdit" :disabled="loading || !isAuthenticated">Edit</button>
      </div>
    </div>

    <!-- Προβολή -->
    <div v-if="!isEditing" class="info-grid">
      <div class="info-item"><label>Username</label><p>{{ form.username || '—' }}</p></div>
      <div class="info-item"><label>Email</label><p>{{ form.email || '—' }}</p></div>
      <div class="info-item"><label>Phone</label><p>{{ form.phoneNumber || '—' }}</p></div>
      <div class="info-item col-span-2"><label>Address</label><p>{{ form.address || '—' }}</p></div>
    </div>

    <!-- Επεξεργασία (ΜΟΝΟ ΣΤΗΛΗ) -->
    <form v-else class="edit-grid" @submit.prevent="save">
      <div class="fields">
        <label class="field">
          <span>Username </span>
          <input :value="form.username" disabled class="immutable" />
          <small class="muted">Username cannot be changed.</small>
        </label>

        <fieldset class="password-box">
          <legend>Change password (optional)</legend>
          <label class="field">
            <span>New password</span>
            <input type="password" v-model="form.newPassword" autocomplete="new-password" placeholder="— leave empty to keep current —" />
            <small class="muted">At least 6 characters.</small>
          </label>
          <label class="field">
            <span>Confirm password</span>
            <input type="password" v-model="form.confirmPassword" autocomplete="new-password" />
          </label>
          <p class="tiny-help">If both fields are empty, your password will not change.</p>
        </fieldset>

        <label class="field">
          <span>Email</span>
          <input v-model.trim="form.email" type="email" required />
        </label>

        <label class="field">
          <span>Phone</span>
          <input v-model.trim="form.phoneNumber" placeholder="+30…" required />
        </label>

        <label class="field">
          <span>Address</span>
          <input ref="addressInputEl" v-model="form.address" placeholder="Start typing your address…" autocomplete="off" required />
        </label>
      </div>

      <!-- Χάρτης ΚΑΤΩ από το Address -->
      <div class="map-wrap">
        <div v-if="GMAPS_KEY" ref="mapEl" class="map"></div>
        <div v-else class="map-fallback">Map unavailable (missing <code>VITE_GMAPS_KEY</code>)</div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
          <span v-if="!saving">Save</span><span v-else class="spinner"></span>
        </button>
        <button type="button" class="btn btn-ghost" :disabled="saving" @click="cancel">Cancel</button>
      </div>
    </form>

    <p v-if="errorMsg" class="alert">{{ errorMsg }}</p>
    <p v-if="successMsg" class="success">{{ successMsg }}</p>
  </section>
</template>

<style scoped>
.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
.section-title{font-size:20px;font-weight:800;color:#103c70}

/* View */
.info-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.info-item label{display:block;font-size:12px;font-weight:700;color:#103c70;opacity:.85;margin-bottom:4px}
.info-item p{margin:0;font-size:15px;color:#0f172a}
.col-span-2{grid-column:span 2}

/* EDIT: ΜΟΝΟ ΣΤΗΛΗ */
.edit-grid{display:grid;grid-template-columns:1fr;gap:16px;align-items:start;width:100%}
.fields{display:grid;gap:12px;width:100%}

/* Όλα τα πεδία FULL WIDTH */
.field{display:grid;gap:6px;width:100%}
.field>span{color:#0b2e55;font-weight:700;font-size:14px}
input{height:46px;padding:0 12px;border-radius:12px;border:1px solid rgba(0,0,0,.14);font-size:16px;outline:none;width:100%;box-sizing:border-box}
input:focus{border-color:#164a8a;box-shadow:0 0 0 3px rgba(22,74,138,.12)}
input.immutable{background:#f3f4f6;color:#6b7280;cursor:not-allowed}
.muted{color:#6b7280;font-size:12px}

/* Password box */
.password-box{border:1px dashed rgba(0,0,0,.18);border-radius:12px;padding:12px;display:grid;gap:10px}
.password-box legend{font-weight:800;color:#0b2e55;padding:0 6px}
.tiny-help{margin:0;font-size:12px;color:#6b7280}

/* Χάρτης κάτω από τα πεδία, FULL WIDTH */
.map-wrap{grid-column:1}
.map{height:7cm;width:100%;margin:0 auto;border-radius:14px;border:1px solid rgba(0,0,0,.08);box-shadow:0 8px 20px rgba(16,60,112,.08);background:#e9effa}
.map-fallback{height:5cm;width:100%;margin:0 auto;display:grid;place-items:center;border-radius:14px;border:1px dashed rgba(0,0,0,.15);color:#6b7280}

/* Coords */
.coords{display:flex;gap:12px;align-items:center;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#334155;opacity:.9}

/* Κουμπιά */
.form-actions{grid-column:1;display:flex;justify-content:center;align-items:center;gap:10px;margin-top:1cm}
.actions{display:flex;gap:10px;align-items:center}
.btn{height:40px;border-radius:12px;padding:0 14px;font-weight:800;font-size:14px;border:none;cursor:pointer;transition:transform .12s ease,filter .15s ease}
.btn-primary{background:#164a8a;color:#fff}
.btn-ghost{background:transparent;color:#164a8a}
.btn:hover{filter:brightness(1.03);transform:translateY(-1px)}
.btn:disabled{opacity:.75;cursor:not-allowed;transform:none}
.spinner{width:16px;height:16px;border:3px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;display:inline-block;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* Alerts */
.alert{background:#fde8ea;color:#7a1020;border:1px solid #f3c2c9;border-radius:10px;padding:10px 12px;margin-top:12px;font-size:14px}
.success{background:#e8f7ef;color:#114b2d;border:1px solid #bfe7cf;border-radius:10px;padding:10px 12px;margin-top:12px;font-size:14px}

/* Autocomplete πάνω από όλα */
:global(.pac-container){z-index:10000 !important}

/* Responsive: τίποτα ιδιαίτερο, ήδη 1 στήλη */
@media (max-width:900px){ .map,.map-fallback{width:100%} }
</style>

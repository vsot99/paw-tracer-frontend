<script setup>
/* global google */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApplicationStore } from '@/stores/application.js'

const route = useRoute()
const router = useRouter()
const app = useApplicationStore()

const backend  = import.meta.env.VITE_BACKEND
const gmapsKey = import.meta.env.VITE_GMAPS_KEY || import.meta.env.VITE_GMAPS_API_KEY
const mapId    = import.meta.env.VITE_GMAPS_MAP_ID

const id = route.params.id
const report  = ref(null)
const loading = ref(false)
const error   = ref('')

const FALLBACK = '/no-image.jpg'
function onImgError(e){ e.target.src = FALLBACK }

// LOST REPORT photos (presigned)
const images = computed(() => Array.isArray(report.value?.imagePresignedUrls) ? report.value.imagePresignedUrls : [])

// βασικά fields
const name = computed(() => report.value?.petName || '—')
const whenLost = computed(() =>
  report.value?.dateTimeLost ? String(report.value.dateTimeLost).replace('T',' ').slice(0,16) : '—'
)
const address = computed(() => report.value?.address || '—')

// owner username (για “by …”)
const ownerUsername = computed(() => report.value?.owner || '—' )

/* -------- auth / ownership -------- */
const currentUsername = computed(() =>
  app?.userData?.username || app?.userData?.user?.username || null
)
const isAuthenticated = computed(() => !!app?.isAuthenticated)
const isOwner = computed(() =>
  !!currentUsername.value && !!ownerUsername.value && currentUsername.value === ownerUsername.value
)

/* -------- status helpers -------- */
const statusRaw = computed(() => String(report.value?.status || '').toUpperCase())
const isActive  = computed(() => statusRaw.value === 'ACTIVE')
const statusText = computed(() => {
  switch (statusRaw.value) {
    case 'RETURNED_HOME': return 'Returned home'
    case 'CANCELLED':     return 'Cancelled'
    case 'ACTIVE':        return 'Active'
    default:              return report.value?.status || '—'
  }
})

/* -------- helpers -------- */
async function apiGet(url, accept='application/json') {
  const res = await fetch(url, { headers: { Accept: accept } })
  if (!res.ok) throw new Error(await res.text().catch(()=>`HTTP ${res.status}`))
  return accept === 'application/json' ? res.json() : res.blob()
}

/* Capitalize μόνο όταν είναι ΟΛΟ κεφαλαία */
function cap(v){
  if (v == null) return '—'
  const s = String(v)
  const isAllCaps = s && s === s.toUpperCase() && s !== s.toLowerCase()
  if (!isAllCaps) return s
  const lower = s.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
/* Confidence ως “Medium”, “Very low”, κλπ */
function prettyConfidence(conf){
  if (!conf) return '—'
  const s = String(conf).toLowerCase().replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/* -------- Sightings -------- */
const sightings = ref([])
const sightingsLoading = ref(false)
const sightingsError = ref('')

// λεπτομέρειες (DTO by id/index)
const sightingDetails = ref(Object.create(null))
const sightingDetailsLoading = ref(Object.create(null))
const sightingDetailsError = ref(Object.create(null))

async function ensureSightingDetails(sightingIdx){
  // με index πλέον
  const key = String(sightingIdx)
  if (sightingDetails.value[key] || sightingDetailsLoading.value[key]) return
  try{
    sightingDetailsLoading.value[key] = true
    // Αν έχεις endpoint by id, άστο. Αλλιώς απλά αντιγραφή από την ίδια λίστα:
    // εδώ δεν έχουμε id, οπότε δεν κάνουμε δεύτερο fetch — κρατάμε την απλή λίστα
    sightingDetails.value[key] = sightings.value[sightingIdx] || {}
    sightingDetailsError.value[key] = ''
  }catch(e){
    sightingDetailsError.value[key] = e?.message || 'Failed to load sighting details'
  }finally{
    sightingDetailsLoading.value[key] = false
  }
}

async function loadData(){
  loading.value = true
  error.value = ''
  try{
    report.value = await apiGet(`${backend}/api/lost-pet-reports/${id}`)
    loading.value = false
    await nextTick()
    const ok = await loadGoogleMaps(gmapsKey)
    if (ok) initMap()
    await loadSightings()
  }catch(e){
    error.value = e.message || 'Failed to load.'
    loading.value = false
  }
}

async function loadSightings(){
  sightingsLoading.value = true
  sightingsError.value = ''
  try{
    const arr = await apiGet(`${backend}/api/lost-pet-reports/${id}/sighting-reports`)
    sightings.value = (Array.isArray(arr) ? arr : [])
      .slice()
      .sort((a,b) => new Date(b?.dateTimeSeen || 0) - new Date(a?.dateTimeSeen || 0))
    renderSightingMarkers()
  }catch(e){
    sightingsError.value = e.message || 'Failed to load sighting reports.'
  }finally{
    sightingsLoading.value = false
  }
}

/* -------- change status (owner only) -------- */
const busyStatus = ref(false)
async function changeStatus(newStatus){
  if (!isOwner.value || !isAuthenticated.value) return
  try{
    busyStatus.value = true
    const headers = { 'Content-Type': 'application/json' }
    const token = app?.userData?.accessToken
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(`${backend}/api/lost-pet-reports/${id}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(newStatus)
    })
    if (!res.ok){
      const t = await res.text().catch(()=> '')
      throw new Error(t || `HTTP ${res.status}`)
    }
    await loadData()
  }catch(e){
    error.value = e?.message || 'Failed to update status.'
  }finally{
    busyStatus.value = false
  }
}
function confirmCancel(){
  if (!isOwner.value) return
  if (confirm('Are you sure you want to delete/cancel this report?')){
    changeStatus('CANCELLED')
  }
}

/* -------- Google Maps -------- */
const mapEl = ref(null)
let map, lostMarker
let sightingMarkers = []
const markerById = new Map() // εδώ κλειδί = index

function loadGoogleMaps(key) {
  return new Promise((resolve) => {
    if (window.google?.maps) return resolve(true)
    if (!key) return resolve(false)
    const cb = 'initGmaps_' + Math.random().toString(36).slice(2)
    window[cb] = () => resolve(true)
    const s = document.createElement('script')
    s.async = true; s.defer = true
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${cb}`
    s.onerror = () => resolve(false)
    document.head.appendChild(s)
  })
}

function initMap() {
  const lat = report.value?.latitude
  const lng = report.value?.longitude
  if (!mapEl.value || lat == null || lng == null || !window.google?.maps) return

  const center = { lat: Number(lat), lng: Number(lng) }

  map = new google.maps.Map(mapEl.value, {
    center, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
    ...(mapId ? { mapId } : {})
  })

  lostMarker = new google.maps.Marker({ map, position: center, title: 'Lost location' })

  setTimeout(() => { if (map){ google.maps.event.trigger(map,'resize'); map.setCenter(center) } }, 60)
  renderSightingMarkers()
}

function getConfidenceColor(conf){
  switch(String(conf || '').toUpperCase()){
    case 'VERY_LOW': return '#ef4444'
    case 'LOW':      return '#f59e0b'
    case 'MEDIUM':   return '#f97316'
    case 'HIGH':     return '#22c55e'
    default:         return '#64748b'
  }
}

function pawDataUrl(color = '#22c55e'){
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 64 64">
  <g stroke="#000" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" fill="${color}">
    <ellipse cx="18" cy="18" rx="7" ry="9"/>
    <ellipse cx="32" cy="14" rx="7.5" ry="9.5"/>
    <ellipse cx="46" cy="18" rx="7" ry="9"/>
    <ellipse cx="54" cy="30" rx="6.5" ry="8"/>
    <path d="M17 40c0-10 10-16 15-16s15 6 15 16-7 16-15 16S17 50 17 40z"/>
  </g>
</svg>`
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
}

function renderSightingMarkers(){
  if (!map || !Array.isArray(sightings.value)) return
  for (const m of sightingMarkers) m.setMap(null)
  sightingMarkers = []; markerById.clear()

  sightings.value.forEach((s, i) => {
    if (s?.latitude == null || s?.longitude == null) return
    const pos = { lat: Number(s.latitude), lng: Number(s.longitude) }
    const color = getConfidenceColor(s.confidenceIndex)
    const m = new google.maps.Marker({
      map, position: pos, title: `Sighting: ${s.confidenceIndex || ''}`,
      icon: { url: pawDataUrl(color), scaledSize: new google.maps.Size(38,38), anchor: new google.maps.Point(19,32) },
      zIndex: 10
    })
    m.addListener('click', () => openSightingOverlay(i))
    sightingMarkers.push(m)
    markerById.set(String(i), m)
  })
}

/* --- panTo στο hover του sighting (με index) --- */
function onHoverSighting(i){
  if (!map) return
  const s = sightings.value[i]
  if (!s || s.latitude == null || s.longitude == null) return
  const pos = { lat: Number(s.latitude), lng: Number(s.longitude) }
  map.panTo(pos)
  if (typeof map.getZoom === 'function' && map.getZoom() < 13) map.setZoom(14)
  const m = markerById.get(String(i))
  if (m && google?.maps?.Animation?.BOUNCE){
    m.setAnimation(google.maps.Animation.BOUNCE)
    setTimeout(() => m.setAnimation(null), 700)
  }
}

/* -------- Overlays -------- */
const viewerOpen  = ref(false)
const viewerIndex = ref(0)
function openViewer(i){ viewerIndex.value = i; viewerOpen.value = true }
function closeViewer(){ viewerOpen.value = false }
function prevImg(){ if (images.value.length) viewerIndex.value = (viewerIndex.value - 1 + images.value.length) % images.value.length }
function nextImg(){ if (images.value.length) viewerIndex.value = (viewerIndex.value + 1) % images.value.length }

const sightingOverlayOpen = ref(false)
const sightingIndex = ref(0)
const overlayPhotoIndex = ref(0)

/* Photos από presignedImageUrls -> imageUrls */
function getSightingPhotos(s){
  if (!s) return []
  if (Array.isArray(s.presignedImageUrls) && s.presignedImageUrls.length) return s.presignedImageUrls
  if (Array.isArray(s.imageUrls) && s.imageUrls.length) return s.imageUrls
  return []
}
/* Reporter string από το DTO */
function getSightingReporter(s){ return s?.reporter || '—' }

const activeSighting = computed(() => sightings.value[sightingIndex.value] || null)
const activePhotos = computed(() => getSightingPhotos(activeSighting.value))

function openSightingOverlay(i){
  if (!sightings.value.length) return
  sightingIndex.value = i
  overlayPhotoIndex.value = 0
  sightingOverlayOpen.value = true
  ensureSightingDetails(i)
}
function closeSightingOverlay(){ sightingOverlayOpen.value = false }
function prevSightingPhoto(){
  const p = activePhotos.value; if (!p.length) return
  overlayPhotoIndex.value = (overlayPhotoIndex.value - 1 + p.length) % p.length
}
function nextSightingPhoto(){
  const p = activePhotos.value; if (!p.length) return
  overlayPhotoIndex.value = (overlayPhotoIndex.value + 1) % p.length
}

function onKey(e){
  if (viewerOpen.value){
    if (e.key === 'Escape') return closeViewer()
    if (e.key === 'ArrowLeft') return prevImg()
    if (e.key === 'ArrowRight') return nextImg()
  }
  if (sightingOverlayOpen.value){
    if (e.key === 'Escape') return closeSightingOverlay()
    if (e.key === 'ArrowLeft') return prevSightingPhoto()
    if (e.key === 'ArrowRight') return nextSightingPhoto()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

watch(images, arr => {
  if (!arr?.length) viewerOpen.value = false
  if (viewerIndex.value >= arr.length) viewerIndex.value = 0
})
watch(sightings, () => {
  if (sightingIndex.value >= sightings.value.length) sightingIndex.value = 0
  if (!sightings.value.length) sightingOverlayOpen.value = false
})

function goCreateSighting() { router.push({ name: 'sighting-create', params: { id } }) }

onMounted(loadData)
</script>

<template>
  <main class="page">
    <section class="wrap" v-if="report">
      <!-- TOP HEADER -->
      <header class="head-top">
        <div class="left">
          <h1 class="title">Lost pet report</h1>
          <span class="id">#{{ report.id }}</span>
          <span class="dot">·</span>
          <span class="by">by <b class="username">{{ ownerUsername }}</b></span>

          <span v-if="report?.dateTimeLost" class="sep-dot">•</span>
          <span v-if="report?.dateTimeLost" class="when">
            {{ String(report.dateTimeLost).replace('T',' ').slice(0,16) }}
          </span>

          <span v-if="report?.status" class="sep-dot">•</span>
          <span v-if="report?.status" class="status-chip" :data-status="statusRaw">
            {{ statusText }}
          </span>
        </div>

        <div class="right">
          <button
            v-if="isAuthenticated && !isOwner"
            class="btn"
            @click="goCreateSighting"
          >
            Create sighting report
          </button>

          <div v-else-if="isOwner && isActive" class="owner-actions">
            <button
              class="btn green"
              :disabled="busyStatus"
              @click="changeStatus('RETURNED_HOME')"
              title="Mark as returned home"
            >Returned home</button>

            <button
              class="btn red"
              :disabled="busyStatus"
              @click="confirmCancel"
              title="Cancel / delete this report"
            >Delete</button>
          </div>
        </div>
      </header>

      <!-- ROW: Photos (L) — Details (R) -->
      <div class="grid-50">
        <section class="card">
          <h2 class="h2">Photos</h2>
          <div v-if="images.length" class="grid-squares" :style="gridStyle">
            <div
              v-for="(src, i) in images"
              :key="i"
              class="square"
              @click="openViewer(i)"
              :title="'Open image '+(i+1)"
            >
              <img :src="src || FALLBACK" alt="" @error="onImgError" />
            </div>
          </div>

          <div v-else class="images-empty">
            <div class="empty-box">
              <img src="/no-image.jpg" alt="" class="empty-icon" />
              <p class="empty-text">No images uploaded.</p>
            </div>
          </div>
        </section>

        <!-- DETAILS (δύο ανά γραμμή, τίτλος από πάνω) -->
        <section class="card">
          <h2 class="h2">Pet details</h2>
          <div class="kv">
            <div class="item"><span class="k">Pet</span><span class="v">{{ cap(name) }}</span></div>
            <div class="item"><span class="k">Date lost</span><span class="v">{{ whenLost }}</span></div>

            <div class="item"><span class="k">Address</span><span class="v">{{ address }}</span></div>
            <div class="item"><span class="k">Status</span><span class="v">{{ statusText }}</span></div>

            <div v-if="report?.species" class="item"><span class="k">Species</span><span class="v">{{ cap(report.species) }}</span></div>
            <div v-if="report?.breed"   class="item"><span class="k">Breed</span><span class="v">{{ cap(report.breed) }}</span></div>

            <div v-if="report?.color" class="item"><span class="k">Color</span><span class="v">{{ cap(report.color) }}</span></div>
            <div v-if="report?.size"  class="item"><span class="k">Size</span><span class="v">{{ cap(report.size) }}</span></div>

            <div v-if="report?.gender" class="item"><span class="k">Gender</span><span class="v">{{ cap(report.gender) }}</span></div>
            <div class="item"><span class="k">Collar</span><span class="v">{{ report.hasCollar ? 'Yes' : 'No' }}</span></div>

            <div v-if="report?.collarColor" class="item"><span class="k">Collar color</span><span class="v">{{ cap(report.collarColor) }}</span></div>
            <div v-if="report?.notes" class="item full"><span class="k">Notes</span><p class="v multiline">{{ report.notes }}</p></div>
          </div>
        </section>
      </div>

      <!-- ROW: Map (L) — Sightings (R) -->
      <div class="grid-50">
        <section class="card">
          <h2 class="h2">Location</h2>
          <div v-if="report.latitude != null && report.longitude != null">
            <div v-if="gmapsKey" ref="mapEl" class="map"></div>
            <div v-else class="map-empty">Map unavailable (missing <code>VITE_GMAPS_KEY</code>).</div>
          </div>
          <div v-else class="map-empty">No coordinates provided.</div>
        </section>

        <section class="card">
          <h2 class="h2">Sighting reports</h2>
          <p v-if="sightingsLoading" class="muted">Loading sightings…</p>
          <p v-else-if="sightingsError" class="err">{{ sightingsError }}</p>
          <p v-else-if="!sightings.length" class="muted">No sightings yet.</p>

          <ul v-else class="sightings">
            <li
              v-for="(s,i) in sightings"
              :key="s.id ?? i"
              class="sighting"
              @click="openSightingOverlay(i)"
              @mouseenter="onHoverSighting(i)"
            >
              <div class="row">
                <span class="badge" :class="'c-' + String(s.confidenceIndex || '').toLowerCase()">
                  {{ prettyConfidence(s.confidenceIndex) }}
                </span>
                <span class="time">{{ s.dateTimeSeen ? String(s.dateTimeSeen).replace('T',' ').slice(0,16) : '—' }}</span>
                <span class="sep-dot">•</span>
                <span class="by">by <b class="username">{{ s.reporter || '—' }}</b></span>
              </div>

              <p v-if="s.notes" class="notes-line">{{ s.notes }}</p>
            </li>
          </ul>
        </section>
      </div>

      <p v-if="error" class="err">{{ error }}</p>
    </section>

    <div v-else-if="loading" class="loading">Loading…</div>
    <div v-else class="loading">Not found.</div>

    <!-- LOST PHOTOS OVERLAY -->
    <div v-if="viewerOpen && images.length" class="overlay" @click.self="closeViewer">
      <button class="close" @click="closeViewer" aria-label="Close">✕</button>
      <button class="nav prev" @click.stop="prevImg" aria-label="Prev">‹</button>
      <figure class="viewer">
        <img :src="images[viewerIndex] || FALLBACK" alt="photo" @error="onImgError" />
        <figcaption>{{ viewerIndex+1 }} / {{ images.length }}</figcaption>
      </figure>
      <button class="nav next" @click.stop="nextImg" aria-label="Next">›</button>
    </div>

    <!-- SIGHTING OVERLAY -->
    <div v-if="sightingOverlayOpen && activeSighting" class="overlay sighting-ovl" @click.self="closeSightingOverlay">
      <button class="close" @click="closeSightingOverlay" aria-label="Close">✕</button>

      <figure class="viewer sighting">
        <header class="sight-head">
          <span class="badge" :class="'c-' + String(activeSighting?.confidenceIndex || '').toLowerCase()">
            {{ prettyConfidence(activeSighting?.confidenceIndex) }}
          </span>
          <span class="when">
            {{ activeSighting?.dateTimeSeen ? String(activeSighting?.dateTimeSeen).replace('T',' ').slice(0,16) : '—' }}
          </span>
          <span class="where">{{ activeSighting?.address || '—' }}</span>
        </header>

        <div class="sight-body">
          <div class="sight-photos" v-if="activePhotos.length">
            <img class="photo" :src="activePhotos[overlayPhotoIndex] || FALLBACK" alt="sighting photo" @error="onImgError" />
            <button class="nav in-image left"  @click.stop="prevSightingPhoto"  aria-label="Prev">‹</button>
            <button class="nav in-image right" @click.stop="nextSightingPhoto" aria-label="Next">›</button>
            <div class="counter-ovl">{{ overlayPhotoIndex+1 }} / {{ activePhotos.length }}</div>
          </div>
          <div class="sight-photos empty" v-else>
            <img class="photo" :src="FALLBACK" alt="no photo" />
            <div class="counter-ovl">No photos</div>
          </div>

          <dl class="sight-details">
            <div><dt>Reporter</dt><dd>{{ getSightingReporter(activeSighting) }}</dd></div>
            <div><dt>Confidence</dt><dd>{{ prettyConfidence(activeSighting?.confidenceIndex) }}</dd></div>
            <div><dt>Seen at</dt><dd>{{ activeSighting?.dateTimeSeen ? String(activeSighting?.dateTimeSeen).replace('T',' ').slice(0,16) : '—' }}</dd></div>
            <div><dt>Address</dt><dd>{{ activeSighting?.address || '—' }}</dd></div>
            <div><dt>Coordinates</dt>
              <dd v-if="activeSighting?.latitude != null && activeSighting?.longitude != null">
                {{ Number(activeSighting?.latitude).toFixed(6) }}, {{ Number(activeSighting?.longitude).toFixed(6) }}
              </dd>
              <dd v-else>—</dd>
            </div>
            <div v-if="activeSighting?.notes"><dt>Notes</dt><dd>{{ activeSighting?.notes }}</dd></div>
          </dl>
        </div>
      </figure>
    </div>
  </main>
</template>
<style scoped>
.page { background:#fff; min-height:100dvh; }
.wrap { max-width: 1200px; margin:0 auto; padding:15px; } /* -25% από 20px */

/* ---------- Header πάνω --------- */
.head-top{
  display:flex; align-items:center; justify-content:space-between;
  gap:9px; margin: 2px 0 9px; /* -25% */
}
.head-top .left{
  display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; /* -25% περίπου */
  color:#103c70;
}
.title { margin:0; font-size:28px; font-weight:900; color:#103c70; }
.by { color:#0b2e55; font-weight:900; }
.username { color:#164a8a; font-size: 20px;}
.dot { opacity:.6; }
.sep-dot { margin: 0 6px; opacity:.6; }
.id { color:#64748b; font-size:13px; }

.right { display:flex; align-items:center; gap:8px; }
.owner-actions { display:flex; gap:8px; }

.btn{
  height:40px; padding:0 14px; border-radius:10px; border:2px solid #164a8a; background:#164a8a;
  color:#fff; font-weight:800; cursor:pointer; transition: transform .12s ease, filter .15s ease;
}
.btn:hover{ filter:brightness(1.04); transform:translateY(-1px); }
.btn[disabled]{ opacity:.65; cursor:not-allowed; transform:none; }

/* owner buttons */
.btn.green { background:#16a34a; border-color:#16a34a; }
.btn.red   { background:#b42318; border-color:#b42318; }

/* ---------- Status chip δίπλα από timestamp ---------- */
.status-chip{
  display:inline-block;
  padding:5px 12px;
  border-radius:999px;
  font-size:14px;
  font-weight:900;
  border:1px solid #c9d7ef;
  background:#eef2ff;
  color:#1d2b50;
}
.status-chip[data-status="RETURNED_HOME"]{ background:#e8f7ef; border-color:#bfe7cf; color:#114b2d; }
.status-chip[data-status="CANCELLED"]{ background:#fde8ea; border-color:#f3c2c9; color:#7a1020; }
.status-chip[data-status="ACTIVE"]{ background:#eef2ff; border-color:#c9d7ef; color:#1d2b50; }

/* ---------- 50/50 grids ---------- */
.grid-50{
  display:grid; grid-template-columns: 1fr 1fr; gap:10px; align-items: stretch; /* -25% από 14px */
  margin-bottom:10px; /* μικρό κενό ανάμεσα στις “σειρές” */
}

/* ---------- Photos section ---------- */
.images { margin: 0; }
.grid-squares{
  display:grid;
  grid-template-columns: repeat(3, 1fr);

  gap:10px;

  /* ΣΤΑΘΕΡΟ ΥΨΟΣ: ~ δεν αλλάζει το section */
  height: clamp(260px, 42vh, 520px);
}

.square{
  position:relative;
  background:#e9f0fb;
  border:1px solid rgba(0,0,0,.08);
  border-radius:12px;
  overflow:hidden;
  /* γεμίζει πλήρως το κελί του grid */
  width:100%;
  height:100%;
  cursor:zoom-in;
}

.square img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
  transition: transform .25s ease;
}
.square:hover img{ transform: scale(1.02); }

.images-empty{
  background:#fff; border:1px solid rgba(0,0,0,.08); border-radius:14px; box-shadow:0 8px 20px rgba(16,60,112,.06);
  padding:16px; min-height:216px; display:grid; place-items:center;
}
.empty-box{ display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; }
.empty-icon{ width:96px; height:96px; object-fit:contain; opacity:.9; }
.empty-text{ color:#475569; font-weight:700; }

/* ---------- shared cards ---------- */
.card { background:#fff; border:1px solid rgba(0,0,0,.08); border-radius:14px; padding:12px; box-shadow:0 8px 24px rgba(16,60,112,.06); } /* -~15% */
.h2 { margin:0 0 8px; font-size:18px; font-weight:900; color:#103c70; } /* -20% */

/* ---------- Pet details (δύο πεδία/γραμμή, τίτλος πάνω) ---------- */
.kv { display:grid; grid-template-columns: 1fr 1fr; gap:10px 20px; }
.kv .item{ display:flex; flex-direction:column; gap:1px; }
.kv .full{ grid-column:1 / -1; }
.kv .k{ font-size:12px; color:#0b2e55; font-weight:800; opacity:.85; }
.kv .v{ color:#103c70; font-weight:800; }
.multiline { white-space:pre-wrap; line-height:1.45; }

/* map */
.map { width:100%; height:420px; border-radius:12px; background:#e9effa; }
.map-empty { width:100%; height:420px; border-radius:12px; background:#f2f6fd; display:flex; align-items:center; justify-content:center; color:#6b7280; }

/* sightings list */
.sightings { list-style:none; padding:0; margin:0; display:grid; gap:10px; }
.sighting { border:1px solid rgba(0,0,0,.06); border-radius:12px; padding:10px; cursor:pointer; background:#fafcff; }
.sighting:hover { box-shadow:0 8px 20px rgba(16,60,112,.08); }
.sighting .row { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
.sighting .time { color:#475569; font-size:12px; }
.sighting .by { color:#0b2e55; font-weight:800; font-size: 12px; }
.sighting .username { color:#103c70; font-size: 15px; }
.notes-line{ color:#334155; }

/* badges (ίδια παλέτα) */
.badge{ display:inline-block; padding:2px 8px; border-radius:999px; font-size:13px; font-weight:900; color:#0b2e55; background:#e2e8f0; border:1px solid rgba(0,0,0,.08); }
.badge.c-very_low { background:#fee2e2; color:#991b1b; border-color:#fecaca; }
.badge.c-low      { background:#fef3c7; color:#92400e; border-color:#fde68a; }
.badge.c-medium   { background:#ffedd5; color:#9a3412; border-color:#fdba74; }
.badge.c-high     { background:#dcfce7; color:#14532d; border-color:#bbf7d0; }

/* messages */
.err { color:#b00020; margin-top:6px; }
.loading { color:#164a8a; padding:24px; }

@media (max-width: 1100px) {
  .grid-50 { grid-template-columns: 1fr; }
}

/* ---------- overlays (shared) ---------- */
.overlay { position:fixed; inset:0; z-index:60; background:rgba(0,0,0,.7); display:flex; align-items:center; justify-content:center; padding:16px; }
.viewer { position:relative; width:min(96vw, 1200px); max-height:92vh; margin:0; }
.viewer img { width:100%; height:auto; max-height:80vh; display:block; border-radius:12px; object-fit:contain; background:#111; }
.viewer figcaption { text-align:center; color:#fff; margin-top:8px; font-weight:700; }
.close { position:absolute; top:14px; right:16px; z-index:2; background:transparent; border:none; color:#fff; font-size:28px; cursor:pointer; }
.nav { position:absolute; top:50%; transform:translateY(-50%); width:56px; height:56px; border-radius:50%; border:2px solid #fff; background:rgba(255,255,255,.15); color:#fff; font-size:30px; line-height:1; cursor:pointer; }
.nav:hover { background:rgba(255,255,255,.25); }
.nav.prev { left:18px; }
.nav.next { right:18px; }

/* ---------- Sighting overlay ---------- */
.overlay.sighting-ovl { background: rgba(16, 74, 138, 0.12); backdrop-filter: blur(2px); }
.overlay.sighting-ovl .close { color:#103c70; }

.viewer.sighting{
  --ovl-w: 50vw; --ovl-h: 50vh;
  width: min(960px, var(--ovl-w));
  height: min(680px, var(--ovl-h));
  background:#fff; border-radius:12px;
  box-shadow:0 20px 60px rgba(16,60,112,.18);
  border:1px solid rgba(0,0,0,.06);
  padding:12px;
  display:flex; flex-direction:column; color:#0b2e55;
}
.sight-head{ display:flex; flex-wrap:wrap; gap:8px 12px; align-items:center; color:#103c70; margin:4px 0 10px; }
.sight-head .where{ color:#103c70; font-weight:800; }

/* Σώμα: δύο ίσες στήλες */
.sight-body{
  display:grid; grid-template-columns:1fr 1fr; gap:12px;
  flex:1; min-height:0; align-items:stretch;
}

/* Εικόνα panel */
.sight-photos{ position:relative; height:100%; border:1px solid rgba(0,0,0,.06); border-radius:10px; background:#f2f6fd; overflow:hidden; }
.sight-photos .photo{ width:100%; height:100%; object-fit:contain; background:#eef4ff; }

/* Βελάκια */
.viewer.sighting .nav.in-image{
  position:absolute; top:50%; transform:translateY(-50%);
  width:42px; height:42px; border-radius:999px;
  border:2px solid #164a8a; background:#fff; color:#164a8a;
  display:flex; align-items:center; justify-content:center;
}
.viewer.sighting .nav.in-image.left{ left:8px; }
.viewer.sighting .nav.in-image.right{ right:8px; }
.viewer.sighting .nav.in-image:hover{ background:#f2f6fd; }

/* Counter */
.counter-ovl{
  position:absolute; left:50%; bottom:8px; transform:translateX(-50%);
  background:#ffffff; border:1px solid rgba(0,0,0,.08);
  padding:4px 8px; border-radius:999px; font-weight:700; color:#103c70; box-shadow:0 2px 10px rgba(0,0,0,.06);
}

/* Στοιχεία panel */
.sight-details{
  height: 100%;
  border: none; border-radius: 0; background: transparent; padding: 0;
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; overflow: auto; color: #0b2e55;
}
.sight-details div{ display:contents; }
.sight-details dt{ font-weight:800; color:#103c70; }
.sight-details dd{ margin:0; color:#1f3660; }

@media (max-width: 900px){
  .viewer.sighting{ --ovl-w: 92vw; --ovl-h: 60vh; }
  .sight-body{ grid-template-columns:1fr; }
}
</style>

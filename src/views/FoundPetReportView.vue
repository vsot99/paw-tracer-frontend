<!-- src/views/FoundPetReportView.vue -->
<script setup>
/* global google */
import { ref, onMounted, watch, computed, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useApplicationStore } from '@/stores/application.js'

const route = useRoute()
const app = useApplicationStore()

const backend  = import.meta.env.VITE_BACKEND
const gmapsKey = import.meta.env.VITE_GMAPS_KEY || import.meta.env.VITE_GMAPS_API_KEY

const id = computed(() => Number(route.params.id))

// --------- State ----------
const loading  = ref(true)
const errorMsg = ref('')

const report = ref({
  id: null,
  reporter: '',
  dateTimeFound: '',
  address: '',
  latitude: null,
  longitude: null,
  holdingPet: null,
  notes: '',
  species: '',
  breed: '',
  color: '',
  size: '',
  gender: '',
  hasCollar: null,
  collarColor: '',
  name: '',
  approximateBehavior: '',
  // ΔΥΟ ΛΙΣΤΕΣ: original & presigned
  imageUrls: [],            // για DELETE
  imagePresignedUrls: []    // για VIEW
})

// --------- Ownership ----------
const isOwner = computed(() => {
  const u = app?.userData
  const currentUsername = u?.username || u?.user?.username
  return !!currentUsername && !!report.value?.reporter && currentUsername === report.value.reporter
})

// --------- Images ----------
const FALLBACK = '/no-image.jpg'
const images = computed(() =>
  Array.isArray(report.value.imagePresignedUrls) ? report.value.imagePresignedUrls : []
)
function onImgError(e){ e.target.src = FALLBACK }

const imgBusy = ref(false)
const fileInput = ref(null)
function clickUpload() {
  if (!isOwner.value) return
  fileInput.value?.click()
}
async function onFilesSelected(e) {
  const files = Array.from(e.target.files || [])
  if (!files.length || !isOwner.value) return
  try{
    imgBusy.value = true
    const fd = new FormData()
    files.forEach(f => fd.append('file', f))
    const headers = {}
    if (app?.userData?.accessToken) headers.Authorization = `Bearer ${app.userData.accessToken}`

    const res = await fetch(`${backend}/api/found-pet-reports/${report.value.id}/images`, {
      method: 'POST',
      headers,
      body: fd
    })
    if (!res.ok){
      const t = await res.text().catch(()=> '')
      throw new Error(t || `HTTP ${res.status}`)
    }
    await fetchReport()
  } catch (e){
    errorMsg.value = e?.message || 'Failed to upload images.'
  } finally {
    imgBusy.value = false
    if (fileInput.value) fileInput.value.value = '' // reset
  }
}

/** Αντιστοίχιση presigned -> original με index
 *  ΥΠΟΘΕΣΗ: ίδια σειρά από backend (συνήθως ισχύει).
 */
function originalUrlForIndex(i){
  const arr = report.value.imageUrls || []
  return (i >= 0 && i < arr.length) ? arr[i] : null
}

// --------- Delete with confirmation modal ----------
const confirmOpen = ref(false)
const confirmIndex = ref(-1)
function askDelete(i){
  if (!isOwner.value) return
  confirmIndex.value = i
  confirmOpen.value = true
}
function cancelDelete(){
  confirmOpen.value = false
  confirmIndex.value = -1
}

async function confirmDelete(){
  const i = confirmIndex.value
  if (i < 0) return cancelDelete()
  const originalUrl = originalUrlForIndex(i)
  cancelDelete()
  if (!originalUrl) {
    errorMsg.value = 'Could not resolve original image URL.'
    return
  }
  try{
    imgBusy.value = true
    const headers = {}
    if (app?.userData?.accessToken) headers.Authorization = `Bearer ${app.userData.accessToken}`
    const url = new URL(`${backend}/api/found-pet-reports/${report.value.id}/images`)
    url.searchParams.set('imageUrl', originalUrl)
    const res = await fetch(url.toString(), { method: 'DELETE', headers })
    if (!res.ok){
      const t = await res.text().catch(()=> '')
      if (res.status === 403) {
        throw new Error(t || '403 Forbidden: You can only delete images from your own report.')
      }
      throw new Error(t || `HTTP ${res.status}`)
    }
    await fetchReport()
  } catch (e){
    errorMsg.value = e?.message || 'Failed to delete image.'
  } finally {
    imgBusy.value = false
  }
}

// --------- Lightbox / Overlay ----------
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)
function openLightbox(i){ lightboxIndex.value = i; lightboxOpen.value = true }
function closeLightbox(){ lightboxOpen.value = false }
function prevImg(){ if (!images.value.length) return; lightboxIndex.value = (lightboxIndex.value - 1 + images.value.length) % images.value.length }
function nextImg(){ if (!images.value.length) return; lightboxIndex.value = (lightboxIndex.value + 1) % images.value.length }

function onKey(e){
  if (!lightboxOpen.value) return
  if (e.key === 'Escape') return closeLightbox()
  if (e.key === 'ArrowLeft') return prevImg()
  if (e.key === 'ArrowRight') return nextImg()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

// --------- Fetch ----------
async function fetchReport() {
  loading.value = true
  errorMsg.value = ''
  try {
    const headers = { Accept: 'application/json' }
    if (app?.userData?.accessToken) headers.Authorization = `Bearer ${app.userData.accessToken}`

    const res = await fetch(`${backend}/api/found-pet-reports/${id.value}`, { headers })
    if (!res.ok) {
      const t = await res.text().catch(()=> '')
      throw new Error(t || `HTTP ${res.status}`)
    }
    const data = await res.json()
    report.value = {
      id: data.id ?? id.value,
      reporter: data.reporter ?? '',
      dateTimeFound: data.dateTimeFound ?? '',
      address: data.address ?? '',
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      holdingPet: typeof data.holdingPet === 'boolean' ? data.holdingPet : null,
      notes: data.notes ?? '',
      species: data.species ?? '',
      breed: data.breed ?? '',
      color: data.color ?? '',
      size: data.size ?? '',
      gender: data.gender ?? '',
      hasCollar: typeof data.hasCollar === 'boolean' ? data.hasCollar : null,
      collarColor: data.collarColor ?? '',
      name: data.name ?? '',
      approximateBehavior: data.approximateBehavior ?? '',
      imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
      imagePresignedUrls: Array.isArray(data.imagePresignedUrls) ? data.imagePresignedUrls : []
    }

    if (gmapsKey) {
      await ensureGoogleMapsLoaded(gmapsKey)
      initMap()
    }
  } catch (e) {
    errorMsg.value = e?.message || 'Failed to load found pet report.'
  } finally {
    loading.value = false
  }
}

// --------- Google Maps ---------
let map, marker
const mapEl = ref(null)

function ensureGoogleMapsLoaded(key){
  return new Promise((resolve) => {
    if (window.google?.maps) return resolve(true)
    if (!key) return resolve(false)
    const cb = 'initGmaps_' + Math.random().toString(36).slice(2)
    window[cb] = () => resolve(true)
    const s = document.createElement('script')
    s.async = true
    s.defer = true
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${cb}`
    s.onerror = () => resolve(false)
    document.head.appendChild(s)
  })
}

function initMap(){
  if (!mapEl.value || !window.google?.maps) return
  const lat = Number(report.value.latitude) || 37.9838
  const lng = Number(report.value.longitude) || 23.7275
  const center = { lat, lng }

  map = new google.maps.Map(mapEl.value, {
    center,
    zoom: (report.value.latitude && report.value.longitude) ? 15 : 12,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false
  })

  marker = new google.maps.Marker({ map, position: center })
}

watch(id, () => fetchReport())
onMounted(() => { if (id.value) fetchReport() })
</script>

<template>
  <main class="found-view">
    <section class="wrap">


      <header class="head-top">
        <div class="left">
          <h1 class="title">Found report</h1>
          <span class="id">#{{ report.id }}</span>
          <span class="dot">·</span>
          <span class="by">by <b class="username">{{ report.reporter || '—' }}</b></span>
          <span v-if="report?.dateTimeFound" class="sep-dot">•</span>
          <span v-if="report?.dateTimeFound" class="when">
            {{ String(report.dateTimeFound).replace('T',' ').slice(0,16) }}
          </span>
        </div>
      </header>

        <p v-if="errorMsg" class="alert err">{{ errorMsg }}</p>
        <p v-else-if="loading" class="alert info">Loading…</p>

      <!-- SECTION: IMAGES (ίσοι τετράγωνοι, full width) -->
      <section class="images">
        <div class="head">
          <h2 class="h">Images</h2>
          <div class="actions">
            <button v-if="isOwner" class="btn" :disabled="imgBusy" @click="clickUpload">Upload photos</button>
            <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onFilesSelected" />
          </div>
        </div>

        <!-- Έχει φωτογραφίες -->
        <div v-if="images.length" class="grid-squares">
          <div
            v-for="(src, i) in images"
            :key="i"
            class="square"
            @click="openLightbox(i)"
            :title="'Open image '+(i+1)"
          >
            <img :src="src || FALLBACK" alt="" @error="onImgError" />
            <!-- κάδος μόνο για owner -->
            <button
              v-if="isOwner"
              class="trash"
              title="Delete image"
              @click.stop.prevent="askDelete(i)"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Z"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Δεν έχει φωτογραφίες: μικρό icon centered -->
        <div v-else class="images-empty">
          <div class="empty-box">
            <img src="/no-image.jpg" alt="" class="empty-icon" />
            <p class="empty-text">No images uploaded yet.</p>
            <button
              v-if="isOwner"
              class="btn"
              :disabled="imgBusy"
              @click="clickUpload"
            >Upload photos</button>
          </div>
        </div>
      </section>

      <!-- LIGHTBOX / OVERLAY -->
      <div v-if="lightboxOpen" class="lightbox" @click.self="closeLightbox">
        <button class="lb-btn close" aria-label="Close" @click="closeLightbox">×</button>
        <button class="lb-btn prev" aria-label="Prev" @click="prevImg">‹</button>
        <img
          class="lb-img"
          :src="images[lightboxIndex] || FALLBACK"
          alt=""
          @error="onImgError"
        />
        <button class="lb-btn next" aria-label="Next" @click="nextImg">›</button>
        <div class="lb-count">{{ lightboxIndex+1 }} / {{ images.length }}</div>
      </div>

      <!-- CONFIRM DELETE MODAL -->
      <div v-if="confirmOpen" class="modal-overlay" @click.self="cancelDelete">
        <div class="modal">
          <header class="modal-head">
            <h3>Delete photo</h3>
            <button class="x" aria-label="Close" @click="cancelDelete">✕</button>
          </header>
          <div class="modal-body">
            <p>Are you sure you want to delete this photo?</p>
          </div>
          <footer class="modal-foot">
            <button class="btn ghost" @click="cancelDelete">Cancel</button>
            <button class="btn danger" @click="confirmDelete">Delete</button>
          </footer>
        </div>
      </div>

      <!-- ΚΑΤΩ GRID: Αριστερά (Report + Pet) | Δεξιά (Location) -->
      <div class="grid">
        <!-- LEFT PANEL: Report + Pet -->
        <section class="panel panel-left">
          <h2 class="panel-title">Report details</h2>
          <div class="kv">
            <div><span class="k">Address</span><span class="v">{{ report.address || '—' }}</span></div>
            <div><span class="k">Holding pet</span><span class="v">{{ report.holdingPet === true ? 'Yes' : report.holdingPet === false ? 'No' : '—' }}</span></div>
            <div class="full">
              <span class="k">Notes</span>
              <p class="v multiline">{{ report.notes || '—' }}</p>
            </div>
          </div>

          <div class="sep"></div>

          <h2 class="panel-title">Pet details</h2>
          <div class="kv">
            <div><span class="k">Species</span><span class="v">{{ report.species || '—' }}</span></div>
            <div><span class="k">Breed</span><span class="v">{{ report.breed || '—' }}</span></div>
            <div><span class="k">Color</span><span class="v">{{ report.color || '—' }}</span></div>
            <div><span class="k">Size</span><span class="v">{{ report.size || '—' }}</span></div>
            <div><span class="k">Gender</span><span class="v">{{ report.gender || '—' }}</span></div>
            <div><span class="k">Collar</span><span class="v">{{ report.hasCollar === true ? 'Yes' : report.hasCollar === false ? 'No' : '—' }}</span></div>
            <div v-if="report.hasCollar"><span class="k">Collar color</span><span class="v">{{ report.collarColor || '—' }}</span></div>
            <div v-if="report.name"><span class="k">Name on collar</span><span class="v">{{ report.name }}</span></div>
            <div class="full">
              <span class="k">Behavior</span>
              <p class="v multiline">{{ report.approximateBehavior || '—' }}</p>
            </div>
          </div>
        </section>

        <!-- RIGHT PANEL: Location -->
        <section class="panel panel-right">
          <h2 class="panel-title">Location</h2>
          <div class="kv">
            <div><span class="k">Latitude</span><span class="v">{{ report.latitude ?? '—' }}</span></div>
            <div><span class="k">Longitude</span><span class="v">{{ report.longitude ?? '—' }}</span></div>
          </div>
          <div class="map-wrap">
            <div v-if="gmapsKey" ref="mapEl" class="map"></div>
            <div v-else class="map-fallback">
              Map unavailable (missing <code>VITE_GMAPS_KEY</code>)
            </div>
          </div>
        </section>
      </div>
    </section>
  </main>
</template>

<style scoped>
.found-view { background:#fff; }
.wrap { max-width: 1200px; margin:0 auto; padding: 20px; }

/* ---------- Header πάνω-αριστερά ---------- */
.head-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin: 2px 0 12px;
}
.head-top .left{
  display:flex;
  align-items:baseline;
  gap:10px;
  flex-wrap: nowrap;      /* ΜΗΝ τυλίγεις σε 2η γραμμή */
  white-space: nowrap;    /* κράτα τα εντελώς στην ίδια γραμμή */
}
.title {
  margin:0; display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;
  color:#103c70; font-weight:900; font-size:28px;
}

.title { margin:0; font-size:28px; font-weight:900; color:#103c70; }

.id { color:#64748b; font-size:13px; }

.eyebrow { color:#103c70; }
.dot { opacity:.6; }
.by { color:#0b2e55; font-weight:900; }
.username { color:#164a8a; font-size: 20px;}
.sub { margin:6px 0 0; color:#64748b; }
.sep-dot { margin: 0 6px; opacity:.6; }

.alert { margin-top:10px; padding:10px 12px; border-radius:10px; }
.alert.info { background:#eef5ff; color:#0b2e55; border:1px solid #d5e5ff; }
.alert.err  { background:#fde8ea; color:#7a1020; border:1px solid #f3c2c9; }

/* ---------- IMAGES section ---------- */
.images { margin: 10px 0 16px; }
.images .head {
  display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;
}
.h { font-size:18px; font-weight:900; color:#103c70; margin:0; }
.actions { display:flex; gap:8px; }
.btn {
  height:38px; padding:0 14px; border-radius:10px; border:2px solid #164a8a;
  background:#164a8a; color:#fff; font-weight:800; letter-spacing:.2px; cursor:pointer;
  transition: transform .12s ease, filter .15s ease;
}
.btn:hover { filter:brightness(1.04); transform:translateY(-1px); }
.btn:disabled { opacity:.65; cursor:default; transform:none; }
.btn.ghost { background:#fff; color:#164a8a; }
.btn.danger { background:#b42318; border-color:#b42318; }

/* Grid ίσων τετραγώνων */
.grid-squares {
  display:grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap:10px;
}
.square {
  position:relative;
  background:#e9f0fb;
  border:1px solid rgba(0,0,0,.08);
  border-radius:12px;
  overflow:hidden;
  aspect-ratio: 1 / 1; /* ίσο τετράγωνο */
  cursor: zoom-in;
}
.square img {
  width:100%; height:100%; object-fit:cover; display:block;
  transition: transform .25s ease;
}
.square:hover img { transform: scale(1.02); }

/* κάδος (owner only) */
.trash {
  position:absolute; left:8px; bottom:8px;
  display:inline-flex; align-items:center; justify-content:center;
  height:30px; width:30px; border-radius:10px;
  background:#ffffff; color:#1f2937; border:1px solid rgba(0,0,0,.12);
  cursor:pointer;
}

/* Empty (no images): μικρό icon centered, ίδιο ύψος αίσθησης με main image (-40%) */
.images-empty {
  background:#fff; border:1px solid rgba(0,0,0,.08);
  border-radius:14px; box-shadow:0 8px 20px rgba(16,60,112,.06);
  padding:16px; min-height: 216px; display:grid; place-items:center;
}
.empty-box { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; }
.empty-icon { width:96px; height:96px; object-fit:contain; opacity:.9; }
.empty-text { color:#475569; font-weight:700; }

/* ---------- Lightbox / Overlay ---------- */
.lightbox{
  position:fixed; inset:0; background:rgba(0,0,0,.8);
  display:grid; grid-template-columns: 1fr; place-items:center;
  z-index: 120;
}
.lb-img {
  max-width: 92vw; max-height: 86vh; object-fit: contain; border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0,0,0,.45);
}
.lb-btn{
  position:fixed; top:50%; transform:translateY(-50%);
  width:48px; height:48px; border-radius:999px;
  background:#ffffff; color:#111827; border:none; cursor:pointer;
  display:grid; place-items:center; font-size:26px; font-weight:700;
}
.lb-btn.prev { left:20px; }
.lb-btn.next { right:20px; }
.lb-btn.close{
  top: 18px; right: 18px; left: auto; transform:none;
  width:44px; height:44px; font-size:28px;
}
.lb-count{
  position:fixed; bottom:16px; left:50%; transform:translateX(-50%);
  background:rgba(0,0,0,.55); color:#fff; padding:6px 10px; border-radius:10px; font-weight:800; font-size:12px;
}

/* ---------- Confirm Modal ---------- */
.modal-overlay{
  position:fixed; inset:0; background:rgba(0,0,0,.35);
  display:grid; place-items:center; z-index:130;
}
.modal{
  width:min(520px, 92vw);
  background:#fff; border-radius:18px; overflow:hidden;
  box-shadow:0 30px 80px rgba(0,0,0,.25);
  animation: pop .15s ease-out;
}
@keyframes pop { from{ transform: translateY(6px); opacity:.6 } to{ transform:none; opacity:1 } }
.modal-head{
  display:flex; align-items:center; justify-content:space-between; gap:8px;
  padding:14px 16px; background:#f2f6fd; border-bottom:1px solid rgba(0,0,0,.06);
  color:#103c70; font-weight:900;
}
.modal-head h3{ margin:0; font-size:18px; }
.modal-head .x{
  background:transparent; border:none; font-size:20px; cursor:pointer; color:#0b2e55;
}
.modal-body{ padding:18px 16px; color:#0f1b2d; font-weight:700; }
.modal-foot{
  padding:12px 16px; display:flex; gap:8px; justify-content:flex-end;
  border-top:1px solid rgba(0,0,0,.06);
}

/* ---------- Κάτω grid: Panels ίσου ύψους ---------- */
.grid {
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap:16px;
  align-items: stretch;
}
.panel {
  background:#fff; border:1px solid rgba(0,0,0,.08);
  border-radius:14px; box-shadow:0 8px 20px rgba(16,60,112,.06);
  padding:14px; display:flex; flex-direction:column;
  height:100%; min-height: 360px;
}
.panel-title { margin:2px 0 10px; font-size:18px; font-weight:900; color:#103c70; }
.sep { margin:12px 0; border-top:1px dashed rgba(0,0,0,.14); }

/* key-value grid */
.kv { display:grid; grid-template-columns: 1fr 1fr; gap:10px 14px; }
.kv .full { grid-column: 1 / -1; }
.k { display:block; font-size:12px; color:#0b2e55; font-weight:800; opacity:.85; }
.v { display:block; color:#0f172a; font-weight:700; }
.multiline { white-space:pre-wrap; line-height:1.45; }

/* Map */
.map-wrap { margin-top: 10px; display:grid; }
.map {
  height: 300px; width: 100%;
  border-radius:12px; border:1px solid rgba(0,0,0,.08);
  box-shadow:0 8px 20px rgba(16,60,112,.08);
}
.map-fallback {
  height: 300px; display:grid; place-items:center;
  border-radius:12px; border:1px dashed rgba(0,0,0,.15); color:#6b7280;
}

@media (max-width: 1000px){
  .grid { grid-template-columns: 1fr; }
}
</style>

<!-- src/views/FoundPetForAdoptionView.vue -->
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

/* ---------------- State ---------------- */
const loading  = ref(true)
const errorMsg = ref('')

/** FoundPetResponseDTO (που γυρνάς από /api/adoption/found-pets/:id)
 *  user (ή reporter), dateTimeFound, address, latitude, longitude,
 *  id, species, breed, color, size, gender, name, approximateBehavior, imagePresignedUrls
 */
const report = ref({
  // user details
  user: '',               // μπορεί να έρθει ως 'reporter' — δες ownerUsername κάτω
  dateTimeFound: '',
  address: '',
  latitude: null,
  longitude: null,

  // pet details
  id: null,
  species: '',
  breed: '',
  color: '',
  size: '',
  gender: '',
  name: '',
  approximateBehavior: '',

  // images
  imagePresignedUrls: []
})

/* ------------ Owner / Viewer logic ------------- */
const currentUsername = computed(() => app?.userData?.username || app?.userData?.user?.username || '')
const ownerUsername = computed(() => {
  // στήριξη και για 'reporter' αν το backend το ονομάζει έτσι
  return report.value.user || report.value.reporter || ''
})
const isOwner = computed(() => !!currentUsername.value && !!ownerUsername.value && currentUsername.value === ownerUsername.value)
const canCreateRequest = computed(() => !!currentUsername.value && !!ownerUsername.value && currentUsername.value !== ownerUsername.value)

/* ------------- Images (ίδιο λογικό με FoundPetReportView) ------------- */
const FALLBACK = '/no-image.jpg'
const images = computed(() => Array.isArray(report.value.imagePresignedUrls) ? report.value.imagePresignedUrls : [])
function onImgError(e){ e.target.src = FALLBACK }

/* ------------- Lightbox ------------- */
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

/* ---------------- Fetch FoundPet item ---------------- */
async function fetchItem() {
  loading.value = true
  errorMsg.value = ''
  try {
    const headers = { Accept: 'application/json' }
    if (app?.userData?.accessToken) headers.Authorization = `Bearer ${app.userData.accessToken}`

    const res = await fetch(`${backend}/api/adoption/found-pets/${id.value}`, { headers })
    if (!res.ok) {
      const t = await res.text().catch(()=> '')
      throw new Error(t || `HTTP ${res.status}`)
    }
    const data = await res.json()
    report.value = {
      user: data.user ?? data.reporter ?? '',
      dateTimeFound: data.dateTimeFound ?? '',
      address: data.address ?? '',
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,

      id: data.id ?? id.value,
      species: data.species ?? '',
      breed: data.breed ?? '',
      color: data.color ?? '',
      size: data.size ?? '',
      gender: data.gender ?? '',
      name: data.name ?? '',
      approximateBehavior: data.approximateBehavior ?? '',

      imagePresignedUrls: Array.isArray(data.imagePresignedUrls) ? data.imagePresignedUrls : []
    }

    if (gmapsKey) {
      await ensureGoogleMapsLoaded(gmapsKey)
      initMap()
    }
  } catch (e) {
    errorMsg.value = e?.message || 'Failed to load adoption item.'
    // για debugging:
    console.error('fetchItem error:', e)
  } finally {
    loading.value = false
  }
}

/* ---------------- Google Maps ---------------- */
let map, marker
const mapEl = ref(null)

function ensureGoogleMapsLoaded(key){
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

function initMap(){
  if (!mapEl.value || !window.google?.maps) return
  const lat = Number(report.value.latitude) || 37.9838
  const lng = Number(report.value.longitude) || 23.7275
  const center = { lat, lng }
  map = new google.maps.Map(mapEl.value, {
    center,
    zoom: (report.value.latitude && report.value.longitude) ? 15 : 12,
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false
  })
  marker = new google.maps.Marker({ map, position: center })
}

/* Re-fetch όταν αλλάζει route id */
watch(id, () => fetchItem())
onMounted(() => { if (id.value) fetchItem() })

/* ---------------- Create Adoption Request (non-owner) ---------------- */
const createOpen = ref(false)
const createMsg  = ref('')
const createBusy = ref(false)
function openCreate(){ createMsg.value = ''; createOpen.value = true }
function closeCreate(){ if (!createBusy.value) createOpen.value = false }

async function submitCreate(){
  if (!canCreateRequest.value) return
  createBusy.value = true
  errorMsg.value = ''
  try{
    const headers = { 'Content-Type': 'application/json' }
    if (app?.userData?.accessToken) headers.Authorization = `Bearer ${app.userData.accessToken}`

    const res = await fetch(`${backend}/api/adoption/found-pets/${id.value}/adoption-requests/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: createMsg.value || null }) // μόνο το message χρειάζεται
    })
    if (!res.ok) {
      const t = await res.text().catch(()=> '')
      throw new Error(t || `HTTP ${res.status}`)
    }
    createOpen.value = false
  } catch (e){
    errorMsg.value = e?.message || 'Failed to create adoption request.'
    console.error('submitCreate error:', e)
  } finally {
    createBusy.value = false
  }
}

/* ---------------- View Adoption Requests (owner) ---------------- */
const requestsOpen = ref(false)
const requestsBusy = ref(false)
const adoptionRequests = ref([]) // List<AdoptionRequestResponseDTO>

async function openRequests(){
  if (!isOwner.value) return
  requestsOpen.value = true
  await fetchRequests()
}
function closeRequests(){ if (!requestsBusy.value) requestsOpen.value = false }

async function fetchRequests(){
  requestsBusy.value = true
  errorMsg.value = ''
  try{
    const headers = { Accept: 'application/json' }
    if (app?.userData?.accessToken) headers.Authorization = `Bearer ${app.userData.accessToken}`
    const res = await fetch(`${backend}/api/adoption/found-pets/${id.value}/adoption-requests`, { headers })
    if (!res.ok) {
      const t = await res.text().catch(()=> '')
      throw new Error(t || `HTTP ${res.status}`)
    }
    /** Περιμένουμε Array<AdoptionRequestResponseDTO>:
     *  { id, message, status, timestamp, requesterUsername }
     */
    adoptionRequests.value = await res.json()
  } catch (e){
    errorMsg.value = e?.message || 'Failed to load adoption requests.'
    console.error('fetchRequests error:', e)
  } finally {
    requestsBusy.value = false
  }
}

async function actOnRequest(reqId, action){ // action: 'approve' | 'reject'
  if (!isOwner.value) return
  requestsBusy.value = true
  errorMsg.value = ''
  try{
    const headers = {}
    if (app?.userData?.accessToken) headers.Authorization = `Bearer ${app.userData.accessToken}`
    const res = await fetch(`${backend}/api/adoption/adoption-requests/${reqId}/${action}`, {
      method: 'POST',
      headers
    })
    if (!res.ok){
      const t = await res.text().catch(()=> '')
      throw new Error(t || `HTTP ${res.status}`)
    }
    await fetchRequests()
  } catch (e){
    errorMsg.value = e?.message || `Failed to ${action} request.`
    console.error('actOnRequest error:', e)
  } finally {
    requestsBusy.value = false
  }
}
</script>

<template>
  <main class="found-view">
    <section class="wrap">
      <header class="head-top">
        <div class="left">
          <h1 class="title">Adoption item</h1>
          <span class="id">#{{ report.id }}</span>
          <span class="dot">·</span>
          <span class="by">by <b class="username">{{ ownerUsername || '—' }}</b></span>
          <span v-if="report?.dateTimeFound" class="sep-dot">•</span>
          <span v-if="report?.dateTimeFound" class="when">
            {{ String(report.dateTimeFound).replace('T',' ').slice(0,16) }}
          </span>
        </div>

        <div class="right-actions">
          <button
            v-if="canCreateRequest"
            class="btn"
            @click="openCreate"
          >
            Create adoption request
          </button>

          <button
            v-if="isOwner"
            class="btn ghost"
            @click="openRequests"
          >
            View adoption requests
          </button>
        </div>
      </header>

      <p v-if="errorMsg" class="alert err">{{ errorMsg }}</p>
      <p v-else-if="loading" class="alert info">Loading…</p>

      <!-- SECTION: IMAGES (ίσιο grid τετράγωνων) -->
      <section class="images">
        <div class="head">
          <h2 class="h">Images</h2>
        </div>

        <div v-if="images.length" class="grid-squares">
          <div
            v-for="(src, i) in images"
            :key="i"
            class="square"
            @click="openLightbox(i)"
            :title="'Open image '+(i+1)"
          >
            <img :src="src || FALLBACK" alt="" @error="onImgError" />
          </div>
        </div>

        <div v-else class="images-empty">
          <div class="empty-box">
            <img src="/no-image.jpg" alt="" class="empty-icon" />
            <p class="empty-text">No images uploaded yet.</p>
          </div>
        </div>
      </section>

      <!-- LIGHTBOX -->
      <div v-if="lightboxOpen" class="lightbox" @click.self="closeLightbox">
        <button class="lb-btn close" aria-label="Close" @click="closeLightbox">×</button>
        <button class="lb-btn prev" aria-label="Prev" @click="prevImg">‹</button>
        <img class="lb-img" :src="images[lightboxIndex] || FALLBACK" alt="" @error="onImgError" />
        <button class="lb-btn next" aria-label="Next" @click="nextImg">›</button>
        <div class="lb-count">{{ lightboxIndex+1 }} / {{ images.length }}</div>
      </div>

      <!-- ΚΑΤΩ GRID: Αριστερά (User + Pet) | Δεξιά (Location) -->
      <div class="grid">
        <!-- LEFT PANEL -->
        <section class="panel panel-left">
          <h2 class="panel-title">User details</h2>
          <div class="kv">
            <div><span class="k">User</span><span class="v">{{ ownerUsername || '—' }}</span></div>
            <div><span class="k">Date &amp; time found</span><span class="v">{{ report.dateTimeFound ? String(report.dateTimeFound).replace('T',' ').slice(0,16) : '—' }}</span></div>
            <div class="full"><span class="k">Address</span><span class="v">{{ report.address || '—' }}</span></div>
          </div>

          <div class="sep"></div>

          <h2 class="panel-title">Pet details</h2>
          <div class="kv">
            <div v-if="report.name"><span class="k">Name</span><span class="v">{{ report.name }}</span></div>
            <div><span class="k">Species</span><span class="v">{{ report.species || '—' }}</span></div>
            <div><span class="k">Breed</span><span class="v">{{ report.breed || '—' }}</span></div>
            <div><span class="k">Gender</span><span class="v">{{ report.gender || '—' }}</span></div>
            <div><span class="k">Size</span><span class="v">{{ report.size || '—' }}</span></div>
            <div><span class="k">Color</span><span class="v">{{ report.color || '—' }}</span></div>
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

      <!-- CREATE REQUEST MODAL -->
      <div v-if="createOpen" class="modal-overlay" @click.self="closeCreate">
        <div class="modal">
          <header class="modal-head">
            <h3>Adoption request</h3>
            <button class="x" aria-label="Close" @click="closeCreate">✕</button>
          </header>
          <div class="modal-body">
            <label class="field">
              <span>Message (optional)</span>
              <textarea v-model.trim="createMsg" rows="4" placeholder="Write a short message…"></textarea>
            </label>
          </div>
          <footer class="modal-foot">
            <button class="btn ghost" :disabled="createBusy" @click="closeCreate">Cancel</button>
            <button class="btn" :disabled="createBusy" @click="submitCreate">
              {{ createBusy ? 'Creating…' : 'Create' }}
            </button>
          </footer>
        </div>
      </div>

      <!-- VIEW REQUESTS MODAL (OWNER) -->
      <div v-if="requestsOpen" class="modal-overlay" @click.self="closeRequests">
        <div class="modal big">
          <header class="modal-head">
            <h3>Adoption requests</h3>
            <button class="x" aria-label="Close" @click="closeRequests">✕</button>
          </header>
          <div class="modal-body">
            <p v-if="requestsBusy">Loading…</p>
            <p v-else-if="!adoptionRequests.length" class="muted">No requests yet.</p>

            <div v-else class="req-list">
              <div
                v-for="r in adoptionRequests"
                :key="r.id"
                class="req-row"
              >
                <div class="req-main">
                  <div class="req-top">
                    <b class="req-user">@{{ r.requesterUsername || 'unknown' }}</b>
                    <span class="req-dot">•</span>
                    <span class="req-when">{{ r.timestamp ? String(r.timestamp).replace('T',' ').slice(0,16) : '—' }}</span>
                  </div>
                  <div class="req-msg">{{ r.message || '—' }}</div>
                </div>

                <div class="req-side">
                  <span class="status" :data-status="r.status">{{ r.status }}</span>
                  <div class="actions">
                    <button class="btn ghost" :disabled="requestsBusy || r.status!=='PENDING'" @click="actOnRequest(r.id, 'approve')">Approve</button>
                    <button class="btn danger" :disabled="requestsBusy || r.status!=='PENDING'" @click="actOnRequest(r.id, 'reject')">Reject</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <footer class="modal-foot">
            <button class="btn" @click="closeRequests">Close</button>
          </footer>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.found-view { background:#fff; }
.wrap { max-width: 1200px; margin:0 auto; padding: 20px; }

/* Header */
.head-top{
  display:flex; align-items:center; justify-content:space-between; gap:12px; margin: 2px 0 12px;
}
.head-top .left{
  display:flex; align-items:baseline; gap:10px; white-space:nowrap;
}
.right-actions{ display:flex; gap:8px; }
.title { margin:0; color:#103c70; font-weight:900; font-size:28px; }
.id { color:#64748b; font-size:13px; }
.dot { opacity:.6; }
.by { color:#0b2e55; font-weight:900; }
.username { color:#164a8a; font-size: 20px;}
.sep-dot { margin: 0 6px; opacity:.6; }
.alert { margin-top:10px; padding:10px 12px; border-radius:10px; }
.alert.info { background:#eef5ff; color:#0b2e55; border:1px solid #d5e5ff; }
.alert.err  { background:#fde8ea; color:#7a1020; border:1px solid #f3c2c9; }

/* Buttons */
.btn{
  height:38px; padding:0 14px; border-radius:10px; border:2px solid #164a8a;
  background:#164a8a; color:#fff; font-weight:800; letter-spacing:.2px; cursor:pointer;
  transition: transform .12s ease, filter .15s ease;
}
.btn:hover { filter:brightness(1.04); transform:translateY(-1px); }
.btn:disabled { opacity:.65; cursor:default; transform:none; }
.btn.ghost { background:#fff; color:#164a8a; }
.btn.danger { background:#b42318; border-color:#b42318; }

/* Images */
.images { margin: 10px 0 16px; }
.images .head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px; }
.h { font-size:18px; font-weight:900; color:#103c70; margin:0; }

.grid-squares {
  display:grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap:10px;
}
.square {
  position:relative; background:#e9f0fb; border:1px solid rgba(0,0,0,.08);
  border-radius:12px; overflow:hidden; aspect-ratio: 1 / 1; cursor: zoom-in;
}
.square img {
  width:100%; height:100%; object-fit:cover; display:block; transition: transform .25s ease;
}
.square:hover img { transform: scale(1.02); }

.images-empty {
  background:#fff; border:1px solid rgba(0,0,0,.08);
  border-radius:14px; box-shadow:0 8px 20px rgba(16,60,112,.06);
  padding:16px; min-height: 216px; display:grid; place-items:center;
}
.empty-box { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; }
.empty-icon { width:96px; height:96px; object-fit:contain; opacity:.9; }
.empty-text { color:#475569; font-weight:700; }

/* Lightbox */
.lightbox{
  position:fixed; inset:0; background:rgba(0,0,0,.8);
  display:grid; place-items:center; z-index: 120;
}
.lb-img { max-width: 92vw; max-height: 86vh; object-fit: contain; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,.45); }
.lb-btn{
  position:fixed; top:50%; transform:translateY(-50%);
  width:48px; height:48px; border-radius:999px; background:#ffffff; color:#111827; border:none; cursor:pointer;
  display:grid; place-items:center; font-size:26px; font-weight:700;
}
.lb-btn.prev { left:20px; }
.lb-btn.next { right:20px; }
.lb-btn.close{ top: 18px; right: 18px; left: auto; transform:none; width:44px; height:44px; font-size:28px; }
.lb-count{ position:fixed; bottom:16px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,.55); color:#fff; padding:6px 10px; border-radius:10px; font-weight:800; font-size:12px; }

/* Κάτω grid */
.grid { display:grid; grid-template-columns: 1fr 1fr; gap:16px; align-items: stretch; }
.panel {
  background:#fff; border:1px solid rgba(0,0,0,.08);
  border-radius:14px; box-shadow:0 8px 20px rgba(16,60,112,.06);
  padding:14px; display:flex; flex-direction:column; height:100%; min-height: 360px;
}
.panel-title { margin:2px 0 10px; font-size:18px; font-weight:900; color:#103c70; }
.sep { margin:12px 0; border-top:1px dashed rgba(0,0,0,.14); }

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

/* Modals */
.modal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.35); display:grid; place-items:center; z-index:130; }
.modal{
  width:min(520px, 92vw);
  background:#fff; border-radius:18px; overflow:hidden;
  box-shadow:0 30px 80px rgba(0,0,0,.25);
  animation: pop .15s ease-out;
}
.modal.big{ width:min(820px, 94vw); }
@keyframes pop { from{ transform: translateY(6px); opacity:.6 } to{ transform:none; opacity:1 } }
.modal-head{
  display:flex; align-items:center; justify-content:space-between; gap:8px;
  padding:14px 16px; background:#f2f6fd; border-bottom:1px solid rgba(0,0,0,.06);
  color:#103c70; font-weight:900;
}
.modal-head h3{ margin:0; font-size:18px; }
.modal-head .x{ background:transparent; border:none; font-size:20px; cursor:pointer; color:#0b2e55; }
.modal-body{ padding:18px 16px; color:#0f1b2d; font-weight:700; }
.modal-foot{ padding:12px 16px; display:flex; gap:8px; justify-content:flex-end; border-top:1px solid rgba(0,0,0,.06); }
.field{ display:grid; gap:6px; }
.field > span { color:#0b2e55; font-weight:800; font-size:14px; }
textarea{ min-height:110px; padding:10px 12px; border-radius:12px; border:1px solid rgba(0,0,0,.14); font-size:14px; outline:none; }
textarea:focus { border-color:#164a8a; box-shadow:0 0 0 3px rgba(22,74,138,.12); }

.req-list { display:flex; flex-direction:column; gap:10px; }
.req-row{
  display:grid; grid-template-columns: 1fr auto; gap:12px;
  border:1px solid rgba(0,0,0,.08); border-radius:12px; padding:10px; background:#fff;
}
.req-top{ display:flex; align-items:baseline; gap:8px; color:#475569; }
.req-user{ color:#0b2e55; }
.req-msg{ margin-top:4px; white-space:pre-wrap; }
.req-dot{ opacity:.5; }
.req-side{ display:flex; align-items:center; gap:10px; }
.status{
  font-size:12px; font-weight:900; padding:2px 8px; border-radius:999px; background:#eef2ff; color:#1d2b50;
  border:1px solid #c9d7ef;
}
.status[data-status="APPROVED"]{ background:#e8f7ef; border-color:#bfe7cf; color:#114b2d; }
.status[data-status="REJECTED"]{ background:#fde8ea; border-color:#f3c2c9; color:#7a1020; }
</style>

<script setup>
import { ref, computed, onMounted, onUnmounted, reactive, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApplicationStore } from '@/stores/application.js'
import { useRemoteData } from '@/composables/useRemoteData.js'

const route = useRoute()
const router = useRouter()
const app = useApplicationStore()
const backend = import.meta.env.VITE_BACKEND
const petId = route.params.id

// --- Load Pet ---
const urlRef = ref(`${backend}/api/pets/${petId}`)
const authRef = ref(true)
const { data, error, loading, performRequest } = useRemoteData(urlRef, authRef)

onMounted(() => { loading.value = true; performRequest() })
const pet = computed(() => data.value || null)

// εικόνες για εμφάνιση (presigned πρώτα, αλλιώς raw)
const displayImages = computed(() => {
  const p = pet.value
  if (!p) return []
  if (Array.isArray(p.presignedImageUrls) && p.presignedImageUrls.length) {
    return p.presignedImageUrls.map((src, i) => ({ src, kind: 'presigned', index: i }))
  }
  if (Array.isArray(p.imageUrls) && p.imageUrls.length) {
    return p.imageUrls.map((src, i) => ({ src, kind: 'raw', index: i }))
  }
  return []
})
function resolveDeletableUrl(img) {
  const p = pet.value
  if (!p) return img.src
  if (img.kind === 'raw') return img.src
  if (Array.isArray(p.imageUrls) && p.imageUrls[img.index]) return p.imageUrls[img.index]
  return img.src
}

const FALLBACK = '/no-image.jpg'
function onImgError(e){ e.target.src = FALLBACK }

// ---------- EDITABLE DETAILS ----------
const editableKeys = ['color','size','age','weight','microchipNumber','behavior']
const isEditing = ref(false)
const saving = ref(false)
const editError = ref('')
const editSuccess = ref('')
const temp = reactive({
  color:'', size:'', age:null, weight:null, microchipNumber:'', behavior:''
})

// size options: περιλαμβάνω το τρέχον value και μερικές κοινές τιμές
const sizeOptions = computed(() => {
  const base = ['SMALL','MEDIUM','LARGE','EXTRA_LARGE']
  const cur = (pet.value?.size ?? '').toString().toUpperCase()
  return cur && !base.includes(cur) ? [cur, ...base] : base
})

function startEdit(){
  editError.value = ''; editSuccess.value = ''
  const p = pet.value || {}
  temp.color = p.color ?? ''
  temp.size = (p.size ?? '').toString().toUpperCase()
  temp.age = p.age ?? null
  temp.weight = p.weight ?? null
  temp.microchipNumber = p.microchipNumber ?? ''
  temp.behavior = p.behavior ?? ''
  isEditing.value = true
}

function cancelEdit(){
  isEditing.value = false
  editError.value = ''
  editSuccess.value = ''
}

function diffEditablePayload(){
  const p = pet.value || {}
  const out = {}
  for (const k of editableKeys){
    const oldVal = p[k]
    let newVal = temp[k]
    if (k === 'age' && newVal !== null && newVal !== '') newVal = Number.parseInt(newVal)
    if (k === 'weight' && newVal !== null && newVal !== '') newVal = Number.parseFloat(newVal)
    if (k === 'size' && typeof newVal === 'string') newVal = newVal.toUpperCase()
    // μόνο αν άλλαξε:
    if (String(oldVal ?? '') !== String(newVal ?? '')) out[k] = newVal
  }
  return out
}

async function saveEdit(){
  editError.value = ''; editSuccess.value = ''
  const payload = diffEditablePayload()
  if (!Object.keys(payload).length){
    editSuccess.value = 'Δεν έγιναν αλλαγές.'
    isEditing.value = false
    return
  }
  // απλό validation
  if (payload.age !== undefined && (payload.age < 0 || !Number.isFinite(payload.age))) {
    editError.value = 'Το age πρέπει να είναι μη αρνητικός αριθμός.'
    return
  }
  if (payload.weight !== undefined && (payload.weight < 0 || !Number.isFinite(payload.weight))) {
    editError.value = 'Το weight πρέπει να είναι μη αρνητικός αριθμός.'
    return
  }

  saving.value = true
  try{
    const res = await fetch(`${backend}/api/pets/${petId}`, {
      method:'PUT',
      headers:{
        'Content-Type':'application/json',
        ...(app.userData?.accessToken ? { Authorization:`Bearer ${app.userData.accessToken}` } : {})
      },
      body: JSON.stringify(payload)
    })
    if(!res.ok){
      const t = await res.text().catch(()=> '')
      throw new Error(t || `Failed to update pet (${res.status})`)
    }
    // sync το τοπικό αντικείμενο:
    data.value = { ...(data.value || {}), ...payload }
    editSuccess.value = 'Οι αλλαγές αποθηκεύτηκαν.'
    isEditing.value = false
  }catch(e){
    editError.value = e.message || 'Αποτυχία ενημέρωσης.'
  }finally{
    saving.value = false
  }
}

// ---------- VIEW DETAILS (όλα τα πεδία εκτός id, qrCodeToken, σύνθετα/arrays) ----------
function prettyLabel(key){
  // camelCase -> "Camel Case", microchipNumber -> "Microchip Number"
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim()
}
const viewEntries = computed(() => {
  const p = pet.value
  if (!p) return []
  const exclude = new Set(['id','qrCodeToken'])
  // Αγνοώ arrays/objects (π.χ. imageUrls) για καθαρό UI
  const entries = Object.keys(p)
    .filter(k => !exclude.has(k) && (p[k] === null || ['string','number','boolean'].includes(typeof p[k])))
    .map(k => ({ key:k, label: prettyLabel(k), value: p[k] }))
  // Προσπάθεια να κρατήσω σχετικά ωραία σειρά:
  const order = ['name','species','breed','color','size','gender','age','weight','microchipNumber','behavior','address','latitude','longitude','createdAt','updatedAt']
  entries.sort((a,b) => {
    const ia = order.indexOf(a.key), ib = order.indexOf(b.key)
    if (ia === -1 && ib === -1) return a.label.localeCompare(b.label)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
  return entries
})
const immutableEntries = computed(() => viewEntries.value.filter(e => !editableKeys.includes(e.key)))

// --- QR overlay ---
const qrOpen = ref(false), qrUrl = ref(''), qrError = ref(''), qrLoading = ref(false)
async function openQr() {
  qrError.value=''; qrLoading.value=true
  try{
    const token = pet.value?.qrCodeToken
    let res = null
    if (token) res = await fetch(`${backend}/api/qr/${encodeURIComponent(token)}`, { headers:{Accept:'image/png'} })
    if (!res || !res.ok || !res.headers.get('content-type')?.includes('image/png')) {
      res = await fetch(`${backend}/api/pets/${pet.value.id}/qr`, {
        headers:{ Accept:'image/png', ...(app.userData?.accessToken?{Authorization:`Bearer ${app.userData.accessToken}`}:{}) }
      })
    }
    if (!res.ok){ const t=await res.text().catch(()=> ''); throw new Error(t||`Failed to fetch QR (${res.status})`) }
    const blob=await res.blob(); if(qrUrl.value) URL.revokeObjectURL(qrUrl.value)
    qrUrl.value=URL.createObjectURL(blob); qrOpen.value=true
  }catch(e){ qrError.value=e.message||'Unable to load QR code.' } finally{ qrLoading.value=false }
}
function closeQr(){ qrOpen.value=false }
function downloadQr(){ const a=document.createElement('a'); a.href=qrUrl.value; a.download=`pet-${pet.value?.id}-qr.png`; document.body.appendChild(a); a.click(); a.remove() }

// --- Delete PET ---
const confirmOpen = ref(false), confirmingDelete = ref(false), confirmError = ref('')
function askDelete(){ confirmError.value=''; confirmOpen.value=true }
async function confirmDelete(){
  confirmingDelete.value=true; confirmError.value=''
  try{
    const res=await fetch(`${backend}/api/pets/${petId}`,{ method:'DELETE', headers:{ ...(app.userData?.accessToken?{Authorization:`Bearer ${app.userData.accessToken}`}:{}) }})
    if(!res.ok){ const t=await res.text().catch(()=> ''); throw new Error(t||`Failed to delete pet (${res.status})`) }
    confirmOpen.value=false; router.replace('/profile')
  }catch(e){ confirmError.value=e.message||'Could not delete.' } finally{ confirmingDelete.value=false }
}
function cancelDelete(){ confirmOpen.value=false }

// --- Delete IMAGE ---
const photoConfirmOpen = ref(false)
const photoTarget = ref(null)
const deletingImg = ref(false)
function askDeletePhoto(img){
  photoTarget.value = img
  photoConfirmOpen.value = true
}
async function confirmDeletePhoto(){
  if(!photoTarget.value) return
  deletingImg.value = true
  try{
    const imageUrl = resolveDeletableUrl(photoTarget.value)
    const res = await fetch(`${backend}/api/pets/${petId}/images?imageUrl=${encodeURIComponent(imageUrl)}`, {
      method:'DELETE',
      headers:{ ...(app.userData?.accessToken?{Authorization:`Bearer ${app.userData.accessToken}`}:{}) }
    })
    if(!res.ok){ const t=await res.text().catch(()=> ''); throw new Error(t||`Failed to delete image (${res.status})`) }
    loading.value=true; await performRequest()
    photoConfirmOpen.value=false
  }catch(e){ alert(e.message||'Could not delete image.') } finally{ deletingImg.value=false }
}
function cancelDeletePhoto(){ photoConfirmOpen.value=false }

// --- Upload photos ---
const fileInput = ref(null), uploading = ref(false)
function openFilePicker(){ fileInput.value?.click() }
async function onFilesSelected(e){
  const files = Array.from(e.target.files || []); if(!files.length) return
  const fd = new FormData(); files.forEach(f=> fd.append('file', f))
  uploading.value=true
  try{
    const res = await fetch(`${backend}/api/pets/${petId}/images`, {
      method:'POST',
      headers:{ ...(app.userData?.accessToken?{Authorization:`Bearer ${app.userData.accessToken}`}:{}) },
      body: fd
    })
    if(!res.ok){ const t=await res.text().catch(()=> ''); throw new Error(t||`Failed to upload (${res.status})`) }
    loading.value=true; await performRequest()
  }catch(e){ alert(e.message || 'Upload failed.') } finally{
    uploading.value=false; if(fileInput.value) fileInput.value.value=''
  }
}

// --- Lightbox (overlay gallery) ---
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)
function openLightbox(i){ lightboxIndex.value = i; lightboxOpen.value = true }
function closeLightbox(){ lightboxOpen.value = false }
const totalImages = computed(()=> displayImages.value.length)
function lbSrc(idx){ return displayImages.value[idx]?.src || FALLBACK }
function prevImage(){ if(!totalImages.value) return; lightboxIndex.value = (lightboxIndex.value - 1 + totalImages.value) % totalImages.value }
function nextImage(){ if(!totalImages.value) return; lightboxIndex.value = (lightboxIndex.value + 1) % totalImages.value }
// keyboard
function onKey(e){
  if(lightboxOpen.value){
    if(e.key === 'Escape') closeLightbox()
    if(e.key === 'ArrowLeft') prevImage()
    if(e.key === 'ArrowRight') nextImage()
  }
}
onMounted(()=> window.addEventListener('keydown', onKey))
onUnmounted(()=> window.removeEventListener('keydown', onKey))
</script>

<template>
  <main class="page">
    <section class="wrap" v-if="pet">
      <header class="head">
        <div class="title">
          <h1>{{ pet.name }}</h1>
          <span class="id">#{{ pet.id }}</span>
        </div>
        <div class="actions">
          <button class="btn ghost" @click="openQr" :disabled="qrLoading">
            {{ qrLoading ? 'Loading QR…' : 'Προβολή QR Code' }}
          </button>
          <button class="btn ghost" @click="openFilePicker" :disabled="uploading">
            {{ uploading ? 'Uploading…' : 'Upload photos' }}
          </button>
          <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="onFilesSelected" />
          <button class="btn danger" @click="askDelete">Delete Pet</button>
        </div>
      </header>

      <div class="grid">
        <section class="card full">
          <h2 class="h2">Photos</h2>
          <div v-if="displayImages.length" class="gallery">
            <figure
              v-for="(img, i) in displayImages"
              :key="img.src"
              class="ph"
              @click="openLightbox(i)"
            >
              <img :src="img.src || FALLBACK" alt="" loading="lazy" @error="onImgError" />
              <!-- trash button (hover) -->
              <button
                class="trash"
                :title="'Delete image'"
                @click.stop="askDeletePhoto(img)"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9z" fill="currentColor"/>
                </svg>
              </button>
            </figure>
          </div>
          <div v-else class="gallery">
            <figure class="ph"><img :src="FALLBACK" alt="" /></figure>
          </div>
        </section>

        <!-- DETAILS -->
        <section class="card">
          <div class="details-head">
            <h2 class="h2">Details</h2>
            <div class="row-actions">
              <template v-if="!isEditing">
                <button class="btn" @click="startEdit">Edit</button>
              </template>
              <template v-else>
                <button class="btn" :disabled="saving" @click="saveEdit">
                  <span v-if="!saving">Save</span>
                  <span v-else>Saving…</span>
                </button>
                <button class="btn ghost" :disabled="saving" @click="cancelEdit">Cancel</button>
              </template>
            </div>
          </div>

          <!-- VIEW MODE: δυναμική λίστα όλων των πεδίων (εκτός id/qrCodeToken) -->
          <dl v-if="!isEditing" class="details">
            <template v-for="e in viewEntries" :key="e.key">
              <div>
                <dt>{{ e.label }}</dt>
                <dd>{{ e.value ?? '—' }}</dd>
              </div>
            </template>
          </dl>

          <!-- EDIT MODE: editable πεδία + immutable πεδία (disabled) -->
          <form v-else class="edit-grid" @submit.prevent="saveEdit">
            <!-- Editable left -->
            <div class="col fields">
              <label class="field">
                <span>Color</span>
                <input v-model.trim="temp.color" placeholder="e.g. Brown/White" />
              </label>

              <label class="field">
                <span>Size</span>
                <select v-model="temp.size">
                  <option v-for="opt in sizeOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </label>

              <label class="field">
                <span>Age (years)</span>
                <input v-model.number="temp.age" type="number" min="0" step="1" />
              </label>

              <label class="field">
                <span>Weight (kg)</span>
                <input v-model.number="temp.weight" type="number" min="0" step="0.1" />
              </label>

              <label class="field">
                <span>Microchip</span>
                <input v-model.trim="temp.microchipNumber" placeholder="Microchip number" />
              </label>

              <label class="field">
                <span>Behavior</span>
                <textarea v-model.trim="temp.behavior" rows="3" placeholder="Temperament, habits, notes"></textarea>
              </label>
            </div>

            <!-- Immutable right: όλα τα υπόλοιπα ως disabled -->
            <div class="col immutables">
              <div class="immutable-grid">
                <label v-for="e in immutableEntries" :key="e.key" class="field">
                  <span>{{ e.label }}</span>
                  <input :value="e.value ?? '—'" disabled class="immutable" />
                </label>
              </div>
            </div>
          </form>

          <p v-if="editError" class="alert err">{{ editError }}</p>
          <p v-if="editSuccess" class="alert ok">{{ editSuccess }}</p>
        </section>
      </div>

      <p v-if="error" class="err">{{ String(error) }}</p>
    </section>

    <div v-else class="loading">Loading…</div>

    <!-- QR Overlay -->
    <div v-if="qrOpen" class="overlay" @click.self="closeQr">
      <div class="modal">
        <header class="modal-head">
          <h3>QR Code</h3>
          <button class="x" @click="closeQr">✕</button>
        </header>
        <div class="qr-wrap">
          <img v-if="qrUrl" :src="qrUrl" alt="QR Code" />
          <p v-if="qrError" class="err">{{ qrError }}</p>
        </div>
        <footer class="modal-actions">
          <button class="btn ghost" @click="downloadQr" :disabled="!qrUrl">Download</button>
          <button class="btn" @click="closeQr">Close</button>
        </footer>
      </div>
    </div>

    <!-- DELETE PET CONFIRM -->
    <div v-if="confirmOpen" class="overlay" @click.self="cancelDelete">
      <div class="modal">
        <header class="modal-head warn">
          <h3>Delete pet</h3>
          <button class="x" @click="cancelDelete">✕</button>
        </header>
        <div class="confirm-body">
          <p>You are about to delete {{ pet?.name }}</p>
          <p class="muted">Are you sure? This action cannot be undone..</p>
          <p v-if="confirmError" class="err">{{ confirmError }}</p>
        </div>
        <footer class="modal-actions">
          <button class="btn ghost" @click="cancelDelete" :disabled="confirmingDelete">Cancel</button>
          <button class="btn danger" @click="confirmDelete" :disabled="confirmingDelete">
            {{ confirmingDelete ? 'Deleting…' : 'Delete' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- DELETE PHOTO CONFIRM (blue UI) -->
    <div v-if="photoConfirmOpen" class="overlay" @click.self="cancelDeletePhoto">
      <div class="modal">
        <header class="modal-head">
          <h3>Delete photo</h3>
          <button class="x" @click="cancelDeletePhoto">✕</button>
        </header>
        <div class="confirm-body">
          <p><strong>Are you sure you want to delete this photo?</strong></p>
        </div>
        <footer class="modal-actions">
          <button class="btn ghost" @click="cancelDeletePhoto" :disabled="deletingImg">Cancel</button>
          <button class="btn danger" @click="confirmDeletePhoto" :disabled="deletingImg">
            {{ deletingImg ? 'Deleting…' : 'Delete' }}
          </button>
        </footer>
      </div>
    </div>

    <!-- LIGHTBOX -->
    <div v-if="lightboxOpen" class="overlay" @click.self="closeLightbox">
      <button class="nav prev" @click.stop="prevImage" aria-label="Previous">‹</button>
      <img class="lightbox-img" :src="lbSrc(lightboxIndex)" alt="" />
      <button class="nav next" @click.stop="nextImage" aria-label="Next">›</button>
      <button class="x abs" @click="closeLightbox" aria-label="Close">✕</button>
    </div>
  </main>
</template>

<style scoped>
.page { background:#fff; min-height:100dvh; }
.wrap { max-width: 1200px; margin: 0 auto; padding: 20px; }
.head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:16px; }
.title { display:flex; align-items:baseline; gap:10px; }
.title h1 { margin:0; font-size:28px; font-weight:900; color:#103c70; }
.id { color:#64748b; font-size:13px; }
.actions { display:flex; gap:10px; flex-wrap:wrap; }
.btn { height:40px; padding:0 14px; border-radius:10px; border:2px solid #164a8a; background:#164a8a; color:#fff; font-weight:800; cursor:pointer; }
.btn.ghost { background:#fff; color:#164a8a; }
.btn.danger { border-color:#b42318; background:#b42318; }
.hidden { display:none; }

.grid { display:grid; grid-template-columns: 2fr 1fr; gap:14px; }
.card { background:#fff; border:1px solid rgba(0,0,0,.08); border-radius:14px; padding:14px; box-shadow:0 8px 24px rgba(16,60,112,.06); }
.card.full { grid-column: 1 / -1; }
.h2 { margin:0 0 10px; font-size:18px; font-weight:900; color:#103c70; }

/* Photos */
.gallery { display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:10px; }
.ph { position:relative; padding-top:66%; background:#e9effa; border-radius:12px; overflow:hidden; cursor:zoom-in; }
.ph img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }

/* Hover trash */
.trash {
  position:absolute; right:8px; bottom:8px;
  width:34px; height:34px; border-radius:10px;
  border:1px solid rgba(0,0,0,.1);
  background: rgba(255,255,255,.95);
  color:#b42318; display:flex; align-items:center; justify-content:center;
  cursor:pointer; opacity:0; transform: translateY(4px);
  transition: opacity .18s ease, transform .18s ease, filter .15s ease;
}
.ph:hover .trash { opacity:1; transform: translateY(0); }
.trash:hover { filter: brightness(0.96); }

/* Details */
.details-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; }
.row-actions { display:flex; gap:8px; }
.details { display:grid; grid-template-columns: 1fr 1fr; gap:8px 16px; }
.details div { display:contents; }
dt { font-weight:800; color:#0b2e55; }
dd { margin:0; color:#1f3660; }
.err { color:#b00020; margin-top:8px; }
.loading { color:#164a8a; padding:24px; }

/* Edit mode */
.edit-grid { display:grid; grid-template-columns: 1.2fr 1fr; gap:16px; align-items:start; }
.col { min-width:0; }
.fields { display:grid; gap:12px; }
.field { display:grid; gap:6px; }
.field > span { color:#0b2e55; font-weight:800; font-size:14px; }
input, select, textarea { border:1px solid rgba(0,0,0,.14); border-radius:12px; padding:10px 12px; font-size:16px; outline:none; }
input:focus, select:focus, textarea:focus { border-color:#164a8a; box-shadow:0 0 0 3px rgba(22,74,138,.12); }

/* Immutable pane */
.immutables { background:#f9fbff; border:1px dashed rgba(16,60,112,.12); border-radius:12px; padding:10px; }
.immutable-grid { display:grid; grid-template-columns: 1fr; gap:10px; }
input.immutable { background:#f3f4f6; color:#6b7280; cursor:not-allowed; }

/* Alerts */
.alert { padding:10px 12px; border-radius:10px; margin:10px 0 0; font-size:14px; }
.alert.err { background:#fde8ea; color:#7a1020; border:1px solid #f3c2c9; }
.alert.ok  { background:#e8f7ef; color:#114b2d; border:1px solid #bfe7cf; }

/* Overlays base */
.overlay { position:fixed; inset:0; background:rgba(0,0,0,.58); display:flex; align-items:center; justify-content:center; padding:16px; z-index:60; }
.modal { width:min(520px, 96vw); background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.3); overflow:hidden; }
.modal-head { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; background:#f2f6fd; border-bottom:1px solid rgba(0,0,0,.06); color:#103c70; font-weight:800; }
.modal-head.warn { background:#fff3f3; border-bottom-color: rgba(180,35,24,.25); }
.confirm-body { padding: 16px; color:#103c70; }
.modal-actions { display:flex; gap:10px; justify-content:flex-end; padding:12px 14px; border-top:1px solid rgba(0,0,0,.06); }
.x { border:none; background:transparent; font-size:20px; line-height:1; cursor:pointer; color:#0b2e55; }
.x.abs { position:absolute; top:12px; right:14px; color:#fff; }

/* Lightbox */
.lightbox-img { max-width:min(92vw,1200px); max-height:80vh; border-radius:14px; box-shadow:0 30px 80px rgba(0,0,0,.4); }
.nav {
  position:absolute; top:50%; transform: translateY(-50%);
  width:48px; height:48px; border-radius:50%; border:2px solid #fff;
  background:rgba(11,46,85,.9); color:#fff; font-size:28px; line-height:46px; text-align:center;
  cursor:pointer; user-select:none;
}
.nav.prev { left:24px; }
.nav.next { right:24px; }
</style>

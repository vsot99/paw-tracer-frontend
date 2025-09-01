<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import SearchResultRow from '@/components/search/SearchResultRow.vue'

const backend = import.meta.env.VITE_BACKEND
const GMAPS_KEY = import.meta.env.VITE_GMAPS_KEY || import.meta.env.VITE_GMAPS_API_KEY

// Τύπος αναζήτησης (ΜΗΝ αλλάξεις τη λογική)
const type = ref('lost')

// Φίλτρα (κρατάμε ακριβώς τη λογική σου — ΔΕΝ στέλνουμε empty strings)
const form = reactive({
  species: '', size: '', gender: '',
  breed: '', color: '',
  areaText: '',
  lat: null, lng: null, radiusKm: 3
})

// Δεν στέλνουμε page/size params (όπως ζήτησες)
const urlRef = ref('')
const loading = ref(false)
const error = ref('')
const data = ref(null)

// helper: πρόσθεσε param ΜΟΝΟ αν έχει νόημα
function setIf(p, key, v) {
  if (v === null || v === undefined) return
  if (typeof v === 'string' && v.trim() === '') return
  p.set(key, String(v))
}

function buildUrl () {
  const base = type.value === 'lost'
    ? `${backend}/api/lost-pet-reports`
    : `${backend}/api/found-pet-reports`

  const p = new URLSearchParams()
  setIf(p, 'species', form.species)
  setIf(p, 'size',    form.size)
  setIf(p, 'gender',  form.gender)
  setIf(p, 'breed',   form.breed)
  setIf(p, 'color',   form.color)

  if (form.lat != null && form.lng != null) {
    setIf(p, 'lat', form.lat)
    setIf(p, 'lng', form.lng)
    setIf(p, 'radiusKm', form.radiusKm || 3)
  }

  const qs = p.toString()
  return qs ? `${base}?${qs}` : base
}

async function fetchResults () {
  try {
    loading.value = true
    error.value = ''
    urlRef.value = buildUrl()
    const res = await fetch(urlRef.value, { method: 'GET', headers: { Accept: 'application/json' } })
    if (!res.ok) {
      const txt = await res.text().catch(()=>'')
      throw new Error(`HTTP ${res.status} ${res.statusText}${txt ? ' – ' + txt : ''}`)
    }
    data.value = await res.json()
  } catch (e) {
    error.value = e.message || 'Request failed'
    data.value = null
  } finally {
    loading.value = false
  }
}

function runSearch () { fetchResults() }

// normalize Page / Array
const items = computed(() => {
  const v = data.value
  if (!v) return []
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object' && Array.isArray(v.content)) return v.content
  return []
})

// ---------- Google Places Autocomplete (μόνο input, χωρίς χάρτη) ----------
const areaInputRef = ref(null)

function loadGooglePlacesOnce () {
  return new Promise((resolve) => {
    if (window.google?.maps?.places) return resolve(true)
    if (!GMAPS_KEY) return resolve(false)

    const id = 'gmaps-places-sdk'
    if (document.getElementById(id)) return resolve(false)

    const s = document.createElement('script')
    s.id = id
    s.async = true
    s.defer = true
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places`
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.head.appendChild(s)
  })
}

function initAutocomplete () {
  if (!window.google?.maps?.places || !areaInputRef.value) return
  const g = window.google
  const sessionToken = new g.maps.places.AutocompleteSessionToken()
  const ac = new g.maps.places.Autocomplete(areaInputRef.value, {
    fields: ['geometry', 'name'],
    types: ['(cities)'],
    // componentRestrictions: { country: 'gr' },
    sessionToken
  })
  ac.addListener('place_changed', () => {
    const place = ac.getPlace()
    const loc = place?.geometry?.location
    if (!loc) return
    form.lat = loc.lat()
    form.lng = loc.lng()
    form.areaText = place?.name || areaInputRef.value.value || ''
  })
}

function clearArea () {
  form.areaText = ''
  form.lat = null
  form.lng = null
}

onMounted(async () => {
  const ok = await loadGooglePlacesOnce()
  if (ok) initAutocomplete()
  // Πρώτη κλήση χωρίς φίλτρα (όπως Postman)
  runSearch()
})

watch(type, () => runSearch())
</script>

<template>
  <main class="search-page">
    <section class="wrap">
      <h1 class="title">Search</h1>

      <!-- ΦΙΛΤΡΑ -->
      <form class="filters" @submit.prevent="runSearch">
        <div class="row">
          <label class="lbl">Type</label>
          <div class="seg">
            <label class="seg-item"><input type="radio" value="lost" v-model="type" /><span>Lost</span></label>
            <label class="seg-item"><input type="radio" value="found" v-model="type" /><span>Found</span></label>
          </div>
        </div>

        <div class="row">
          <label class="lbl">Species</label>
          <select v-model="form.species">
            <option value="">Any</option>
            <option value="DOG">Dog</option>
            <option value="CAT">Cat</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div class="row">
          <label class="lbl">Size</label>
          <select v-model="form.size">
            <option value="">Any</option>
            <option value="SMALL">Small</option>
            <option value="MEDIUM">Medium</option>
            <option value="LARGE">Large</option>
            <option value="EXTRA_LARGE">Extra Large</option>
          </select>
        </div>

        <div class="row">
          <label class="lbl">Gender</label>
          <select v-model="form.gender">
            <option value="">Any</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
        </div>

        <div class="row">
          <label class="lbl">Breed</label>
          <input v-model.trim="form.breed" type="text" placeholder="e.g., husky" />
        </div>

        <div class="row">
          <label class="lbl">Color</label>
          <input v-model.trim="form.color" type="text" placeholder="e.g., white" />
        </div>

        <div class="row area">
          <label class="lbl">Area</label>
          <input
            ref="areaInputRef"
            v-model="form.areaText"
            type="text"
            placeholder="π.χ. Κορυδαλλός"
            autocomplete="off"
          />
          <button type="button" class="btn ghost" @click="clearArea" v-if="form.areaText">Clear</button>
          <span class="hint" v-if="form.lat && form.lng">±3km from chosen area</span>
          <span class="hint warn" v-else-if="!form.areaText && !GMAPS_KEY">Add VITE_GMAPS_KEY (ή VITE_GMAPS_API_KEY) για autocomplete</span>
        </div>

        <div class="actions">
          <button class="btn" type="submit">Search</button>
        </div>
      </form>

      <!-- Προαιρετικό debug -->
      <p class="debug">URL: {{ urlRef }}</p>

      <!-- ΑΠΟΤΕΛΕΣΜΑΤΑ -->
      <div class="results">
        <div v-if="loading" class="info">Loading…</div>
        <div v-else-if="error" class="err">{{ error }}</div>
        <div v-else-if="items.length === 0" class="info">No results.</div>

        <div v-else class="list">
          <SearchResultRow
            v-for="it in items"
            :key="`${type}-${it.id}`"
            :item="it"
            :type="type"
          />
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.search-page { background:#fff; min-height:100dvh; }
.wrap { max-width:1200px; margin:0 auto; padding:20px; }
.title { font-size:28px; font-weight:900; color:#103c70; margin:6px 0 16px; }

/* ΦΙΛΤΡΑ */
.filters {
  display:grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap:12px;
  padding:14px;
  background:#f6f9ff;
  border:1px solid #dfe9fb;
  border-radius:14px;
  margin-bottom:8px;
}
.row { display:flex; align-items:center; gap:10px; }
.lbl { min-width:80px; color:#103c70; font-weight:800; }
select, input[type="text"] {
  flex:1; height:40px; padding:0 10px;
  border:1px solid #cfe0fb; border-radius:10px; outline:none;
}
select:focus, input:focus { border-color:#164a8a; box-shadow:0 0 0 3px rgba(22,74,138,.12); }

.seg { display:flex; gap:8px; }
.seg-item {
  display:inline-flex; align-items:center; gap:6px;
  padding:8px 12px; border-radius:10px; border:2px solid #164a8a; color:#164a8a;
  cursor:pointer; user-select:none; font-weight:800;
}
.seg-item input { accent-color:#164a8a; }

.row.area { grid-column: 1 / -1; flex-wrap:wrap; }
.hint { color:#0b2e55; opacity:.85; font-size:12px; }
.hint.warn { color:#b45309; opacity:1; }

.actions { display:flex; align-items:center; justify-content:flex-end; grid-column: 1 / -1; }
.btn {
  height:40px; padding:0 14px; border-radius:10px; border:2px solid #164a8a;
  background:#164a8a; color:#fff; font-weight:800; cursor:pointer;
  text-decoration: none; display:inline-flex; align-items:center; justify-content:center;
}
.btn.ghost { background:#fff; color:#164a8a; }
.btn.ghost:hover { background:#164a8a; color:#fff; }

.debug { margin:8px 0 0; font-size:12px; color:#475569; }

/* ΑΠΟΤΕΛΕΣΜΑΤΑ */
.results { margin-top:8px; }
.info { color:#164a8a; }
.err { color:#b00020; }

/* Λίστα rows */
.list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

@media (max-width: 980px){
  .list {grid-template-columns: 1fr;}
}

@media (max-width: 980px){
  .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .row.area, .actions { grid-column: 1 / -1; }
}
</style>

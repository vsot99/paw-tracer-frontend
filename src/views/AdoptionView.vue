<!-- src/views/FoundPetForAdoption.vue -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useApplicationStore } from '@/stores/application.js'

const backend = import.meta.env.VITE_BACKEND
const store   = useApplicationStore()

const loading = ref(false)
const errorMsg = ref('')
const items = ref([])

/** Προαιρετικά: auth header αν υπάρχει token */
const headers = computed(() => {
  const h = { Accept: 'application/json' }
  if (store?.userData?.accessToken) h.Authorization = `Bearer ${store.userData.accessToken}`
  return h
})

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await fetch(`${backend}/api/adoption/found-pets`, { headers: headers.value })
    if (!res.ok) throw new Error(await res.text().catch(()=>`HTTP ${res.status}`))
    items.value = await res.json()
  } catch (e) {
    errorMsg.value = e?.message || 'Failed to load pets for adoption.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

/* ------- helpers για πεδία/εικόνα/format ------- */
const FALLBACK = '/no-image.jpg'
function mainImage(it) {
  const arr = it?.imagePresignedUrls || it?.imageUrls || it?.images
  const u = Array.isArray(arr) ? arr[0] : null
  return (typeof u === 'string' && u.trim()) ? u : null
}
function onImgError(e){ e.target.src = FALLBACK }
function fmtWhen(v){ return v ? String(v).replace('T',' ').slice(0,16) : '—' }

/** Περιγραφή: Size, Color, Species (αν υπάρχουν) */
function description(it) {
  const parts = [it?.size, it?.color, it?.species].filter(Boolean)
  return parts.length ? parts.join(', ') : '—'
}
</script>

<template>
  <section class="wrap">
    <header class="head">
      <h1>Pets available for adoption</h1>
      <div class="meta-bar">
        <span v-if="loading">Loading…</span>
        <span v-else>{{ items.length }} result(s)</span>
      </div>
    </header>

    <p v-if="errorMsg" class="alert">{{ errorMsg }}</p>

    <div v-if="!loading && !errorMsg && items.length === 0" class="empty">
      No pets available at the moment.
    </div>

    <div class="list" v-else>
      <article v-for="it in items" :key="it.id" class="row">
        <!-- ΑΡΙΣΤΕΡΑ: εικόνα -->
        <div class="left">
          <img
            v-if="mainImage(it)"
            class="photo"
            :src="mainImage(it)"
            alt=""
            @error="onImgError"
          />
          <div v-else class="noimg"><img :src="FALLBACK" alt="no image"/></div>
        </div>

        <!-- ΔΕΞΙΑ: πληροφορίες -->
        <div class="right">
          <h3 class="title">
            <div class="title-heading">
              <span class="title-chip"> Pet for adoption</span>
              <span class="title-id">#{{ it.id }}</span>
              <span class="title-by">by <b class="username">{{ it.reporter ?? '—' }}</b> </span>
            </div>
            <div class="title-by">

            </div>
          </h3>

          <div class="meta">
            <div class="line">
              <span class="label">Description:</span>
              <span class="tag">{{ description(it) }}</span>
            </div>

            <div class="line">
              <span class="label">Where:</span>
              <span class="tag">{{ it.address || '—' }}</span>
            </div>

            <div class="line">
              <span class="label">Published at:</span>
              <span class="tag">{{ fmtWhen(it.dateTimeFound) }}</span>
            </div>

            <div v-if="it.name" class="line">
              <span class="label">Name:</span>
              <span class="tag">{{ it.name }}</span>
            </div>
          </div>

          <div class="actions">
            <!-- Προσαρμόζεις το route αν θες άλλο path -->
            <RouterLink :to="`/found-pet/${it.id}`" class="btn ghost">
              More information
            </RouterLink>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.wrap { display:grid; gap:16px; }
.head { display:flex; align-items:end; justify-content:space-between; gap:12px; }
h1 { margin:0; font-size:22px; font-weight:900; color:#103c70; }
.meta-bar { color:#475569; font-weight:700; }

/* Λίστα */
.list{
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

/* Κάρτα: 40% / 60% */
.row{
  display:grid;
  grid-template-columns: 280px 1fr; /* ← σταθερή αριστερή στήλη */
  align-items: stretch;
  gap:14px;

  border:1px solid rgba(0,0,0,.08);
  background:#fff;
  border-radius:14px;
  padding:14px;
  box-shadow:0 8px 20px rgba(16,60,112,.06);

  min-height: 260px;
}

/* Αριστερά */
.left{
  position:relative;
  min-height: 260px;      /* ίδιο ύψος με την κάρτα */
  border-radius:12px;
  overflow:hidden;
  border:1px solid rgba(0,0,0,.06);
  background:#e9f0fb;
}

.photo{
  position:absolute; inset:0;
  width:100%; height:100%;
  object-fit: cover;       /* γεμίζει */
  object-position: center; /* κεντράρισμα κάδρου */
  display:block;
}

.noimg{
  position:absolute; inset:0;
  display:grid; place-items:center;
  background:#eef3ff;
}
.noimg img{
  width:56%; height:56%; object-fit:contain;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,.08));
}


/* Δεξιά */
.right{
  display:flex;
  flex-direction:column;
  justify-content:flex-start;
  gap:12px;
  padding-top:4px;
}

/* Τίτλος */
.title{
  margin:0 0 8px 0;
  display:flex;
  flex-direction:column;
  align-items:center;
  text-align:center;
  gap:4px;
}
.title-heading{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:8px;
}
.title-chip{
  display:inline-block;
  padding:6px 12px;
  border-radius:999px;
  background:#f3f7ff;
  border:1.5px solid #c9d7ef;
  color:#0b2e55;
  font-weight:900;
  font-size: clamp(16px, 2vw, 20px);
  line-height:1;
}
.title-id{ color:#64748b; font-weight:800; font-size: clamp(14px, 1.6vw, 18px); }
.title-by{ color:#0b2e55; font-weight:900; font-size:12px; }
.username{ color:#164a8a; font-size:12px; }

/* Πληροφορίες */
.label{ color:#0b2e55; font-weight:800; font-size:12px; }
.meta{ display:flex; flex-direction:column; gap:6px; }
.line{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

.tag{
  background:#f1f5ff; color:#0b2e55; font-weight:800;
  padding:2px 8px; border-radius:999px; font-size:12px;
}

/* Κουμπί */
.actions{
  margin-top: 6px;
  display:flex;
  justify-content:center;
}
.btn{
  height: 38px; padding: 0 14px; border-radius: 10px; border: 2px solid #164a8a;
  background: #164a8a; color: #fff; font-weight: 800; cursor: pointer;
  text-decoration: none; display: inline-flex; align-items:center; justify-content:center;
}
.btn.ghost{ background:#fff; color:#164a8a; }
.btn.ghost:hover{ background:#164a8a; color:#fff; }

/* Empty / Error */
.alert { background:#fde8ea; color:#7a1020; border:1px solid #f3c2c9; border-radius:10px; padding:10px 12px; }
.empty { padding:16px; text-align:center; color:#475569; }

/* Mobile */
@media (max-width: 980px){
  .row{ grid-template-columns: 1fr; }
  .left{ width:100%; }
  .right{ width:100%; }
}
</style>

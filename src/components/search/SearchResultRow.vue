<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useApplicationStore } from '@/stores/application.js'

const props = defineProps({
  item: { type: Object, required: true },
  type: { type: String, required: true }, // "lost" | "found"
})

const backend = import.meta.env.VITE_BACKEND
const store = useApplicationStore()

// LOST έχει pet id στο item.pet — το φέρνουμε για όνομα + φωτογραφίες
const petId = computed(() => props.type === 'lost' ? props.item?.pet : null)

const pet = ref(null)
const images = computed(() => {
  if (props.type === 'lost') {
    const arr = pet.value?.presignedImageUrls || pet.value?.imageUrls
    return Array.isArray(arr) ? arr : []
  }
  return []
})
const petName = computed(() => pet.value?.name || '—')

// Ημερομηνία/διεύθυνση/κατάσταση
const formattedWhen = computed(() => {
  const s = props.type === 'lost' ? props.item?.dateTimeLost : props.item?.dateTimeFound
  if (!s) return '—'
  return String(s).replace('T', ' ').slice(0, 16)
})
const address = computed(() => props.item?.address || '—')

// Overlay images fallback
const FALLBACK = '/no-image.jpg'
function onImgError(e) { e.target.src = FALLBACK }

// Πλοήγηση στη λεπτομέρεια (φτιάξε αντίστοιχες routes)
const detailsTo = computed(() =>
  props.type === 'lost' ? `/lost/${props.item.id}` : `/found/${props.item.id}`
)

onMounted(async () => {
  if (!petId.value) return
  try {
    const headers = { Accept: 'application/json' }
    if (store?.userData?.accessToken) {
      headers.Authorization = `Bearer ${store.userData.accessToken}`
    }
    const res = await fetch(`${backend}/api/pets/${petId.value}`, { headers })
    if (!res.ok) return
    pet.value = await res.json()
  } catch { /* ignore */ }
})
</script>

<template>
  <article class="row">
    <!-- ΑΡΙΣΤΕΡΑ: φωτογραφίες -->
    <div class="left">
      <div class="thumbs" v-if="images.length">
        <img
          v-for="(src, i) in images.slice(0, 3)"
          :key="i"
          :src="src || FALLBACK"
          alt=""
          loading="lazy"
          @error="onImgError"
        />
      </div>
      <div class="thumbs" v-else>
        <img :src="FALLBACK" alt="" />
      </div>
    </div>

    <!-- ΔΕΞΙΑ: στοιχεία + action -->
    <div class="right">
      <h3 class="title">
        <span class="badge">{{ type === 'lost' ? 'Lost' : 'Found' }}</span>
        <span class="name">{{ petName }}</span>
        <span class="id">#{{ item.id }}</span>
      </h3>
      <div class="meta">
        <span class="tag">{{ formattedWhen }}</span>
        <span class="tag">{{ address }}</span>
        <span class="tag">{{ item.status }}</span>
      </div>

      <div class="actions">
        <RouterLink :to="detailsTo" class="btn ghost">More information</RouterLink>
      </div>
    </div>
  </article>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 14px;
  border: 1px solid rgba(0,0,0,.08);
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 8px 20px rgba(16,60,112,.06);
}

.left { display:flex; align-items:center; justify-content:center; }
.thumbs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  width: 100%;
}
.thumbs img {
  width: 100%; height: 100px; object-fit: cover;
  border-radius: 10px; background: #e9f0fb;
}

.right { display:flex; flex-direction:column; justify-content:center; gap:10px; }
.title { margin:0; display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
.badge {
  display:inline-block; padding:2px 8px; border-radius:999px;
  background:#e9f0fb; color:#0b2e55; font-weight:900; font-size:12px;
}
.name { font-weight:900; color:#103c70; font-size:20px; }
.id { color:#64748b; font-size:13px; }

.meta { display:flex; gap:8px; flex-wrap:wrap; }
.tag {
  background:#f1f5ff; color:#0b2e55; font-weight:800;
  padding:2px 8px; border-radius:999px; font-size:12px;
}

.actions { margin-top: 6px; }
.btn {
  height: 38px; padding: 0 14px; border-radius: 10px; border: 2px solid #164a8a;
  background: #164a8a; color: #fff; font-weight: 800; cursor: pointer;
  text-decoration: none; display: inline-flex; align-items:center; justify-content:center;
}
.btn.ghost { background:#fff; color:#164a8a; }
.btn.ghost:hover { background:#164a8a; color:#fff; }

@media (max-width: 980px){
  .row { grid-template-columns: 1fr; }
  .thumbs img { height: 140px; }
}
</style>

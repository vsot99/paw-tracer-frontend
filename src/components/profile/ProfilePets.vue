<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRemoteData } from '@/composables/useRemoteData.js'

const backend = import.meta.env.VITE_BACKEND
const router = useRouter()

// useRemoteData -> /api/pets (επιστρέφει array των δικών σου pets)
const urlRef  = ref(`${backend}/api/pets`)
const authRef = ref(true)
const { data, error, loading, performRequest } = useRemoteData(urlRef, authRef)

onMounted(() => {
  loading.value = true
  performRequest()
})

const pets = computed(() => (Array.isArray(data.value) ? data.value : []))

function addPet() {
  router.push('/pets/new')
}

function firstImage(p) {
  if (Array.isArray(p?.presignedImageUrls) && p.presignedImageUrls.length > 0) return p.presignedImageUrls[0]
  if (p?.imageUrl) return p.imageUrl
  return ''
}

const FALLBACK = '/no-image.jpg' // από /public
function onImgError(e) {
  e.target.src = FALLBACK
}
</script>

<template>
  <section>
    <div class="head">
      <h2 class="h">My pets</h2>
      <div class="actions">
        <button class="btn" @click="addPet">Add Pet</button>
        <button class="btn ghost" @click="performRequest" :disabled="loading">Refresh</button>
      </div>
    </div>

    <p v-if="error" class="err">{{ String(error) }}</p>
    <div v-if="loading" class="loading">Loading…</div>

    <div v-else-if="pets.length" class="grid">
      <article v-for="p in pets" :key="p.id" class="pet-card">
        <!-- Header: μόνο Name + ID -->
        <div class="card-head">
          <strong class="name">{{ p.name }}</strong>
          <span class="id">#{{ p.id }}</span>
        </div>

        <!-- Εικόνα: πρώτη από imageUrls ή fallback, και clickable -->
        <div class="thumb">
          <!-- Αν έχεις route name για λεπτομέρειες, μπορείς: :to="{ name:'petDetails', params:{ id:p.id } }" -->
          <RouterLink :to="`/pets/${p.id}`" class="img-link" :title="p.name">
            <img :src="firstImage(p) || FALLBACK" alt="" @error="onImgError" />
          </RouterLink>
        </div>
      </article>
    </div>

    <p v-else class="empty">You haven’t added any pets yet.</p>
  </section>
</template>

<style scoped>
.head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
.h { font-size:20px; font-weight:800; color:#103c70; margin:0; }
.actions { display:flex; gap:8px; }
.btn {
  height:38px; padding:0 14px; border-radius:10px; border:2px solid #164a8a;
  background:#164a8a; color:#fff; font-weight:800; letter-spacing:.2px; cursor:pointer;
  transition: transform .12s ease, filter .15s ease;
}
.btn:hover { filter:brightness(1.04); transform:translateY(-1px); }
.btn.ghost { background:#fff; color:#164a8a; }

.err { color:#b00020; margin:8px 0; }
.loading { color:#164a8a; opacity:.85; margin:8px 0; }
.empty { color:#475569; opacity:.9; margin-top:8px; }

/* Grid καρτών */
.grid {
  display:grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap:12px;
}

/* Κάρτα */
.pet-card {
  border:1px solid rgba(0,0,0,.08);
  border-radius:14px;
  overflow:hidden;
  background:#fff;
  box-shadow:0 8px 20px rgba(16,60,112,.06);
  display:grid;
  grid-template-rows: auto 1fr;
}

/* Header */
.card-head {
  display:flex; align-items:baseline; gap:8px; justify-content:space-between;
  padding:10px 12px; background:#f2f6fd; border-bottom:1px solid rgba(0,0,0,.06);
}
.name { color:#103c70; font-weight:900; }
.id { color:#64748b; font-size:12px; }

/* Εικόνα */
.thumb { position:relative; padding-top:66%; background:#e9effa; }
.img-link { position:absolute; inset:0; display:block; }
.thumb img {
  position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block;
  transition: transform .25s ease;
}
.thumb:hover img { transform: scale(1.02); }
</style>

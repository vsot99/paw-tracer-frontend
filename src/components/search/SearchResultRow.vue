
<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
  item: { type: Object, required: true },
  type: { type: String, required: true }, // "lost" | "found"
})

/* ---------- Images (from DTO) ---------- */
const images = computed(() => {
  const arr =
    (Array.isArray(props.item?.imagePresignedUrls) && props.item.imagePresignedUrls.length
      ? props.item.imagePresignedUrls
      : props.item?.imageUrls) || []
  return Array.isArray(arr) ? arr : []
})
const mainImage = computed(() => {
  const u = images.value?.[0]
  return (typeof u === 'string' && u.trim().length) ? u : null
})

/* ---------- Pet fields (from DTO) ---------- */
const petName = computed(() => props.item?.petName || '')
const showPetName = computed(() => props.type === 'lost' && !!petName.value)

// Description: size, color, species από το ίδιο DTO
const norm = v => (typeof v === 'string' ? v.trim() : '')
const description = computed(() => {
  const parts = [
    norm(props.item?.size),
    norm(props.item?.color),
    norm(String(props.item?.species ?? ''))
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : '—'
})
const hasDescription = computed(() => description.value !== '—')

/* ---------- Meta ---------- */
const formattedWhen = computed(() => {
  const raw = props.type === 'lost' ? props.item?.dateTimeLost : props.item?.dateTimeFound
  return raw ? String(raw).replace('T', ' ').slice(0, 16) : '—'
})
const address = computed(() => props.item?.address || '—')

// Lost DTO έχει owner (username)
const reporterUsername = computed(() => {
  const it = props.item || {}
  return it.owner
    || it.reporterUsername
    || it.reporter
    || it.ownerUsername
    || it.createdByUsername
    || it.user?.username
    || '—'
})

/* ---------- Routing ---------- */
const detailsTo = computed(() =>
  props.type === 'lost' ? `/lost/${props.item.id}` : `/found/${props.item.id}`
)

/* ---------- Fallback image ---------- */
const FALLBACK = '/no-image.jpg'
function onImgError(e){ e.target.src = FALLBACK }
</script>

<template>
  <article class="row">
    <!-- ΑΡΙΣΤΕΡΑ: 40% — εικόνα που γεμίζει -->
    <div class="left">
      <img v-if="mainImage" class="photo" :src="mainImage" alt="" @error="onImgError" />
      <div v-else class="noimg"><img :src="FALLBACK" alt="no image"/></div>
    </div>

    <!-- ΔΕΞΙΑ: 60% — στοιχεία -->
    <div class="right">
      <h3 class="title">
        <div class="title-heading">
          <span class="title-chip">
            {{ type === 'lost' ? 'Lost pet report' : 'Found pet report' }}
          </span>
          <span class="title-id">#{{ item.id }}</span>
        </div>
        <div class="title-by">by <b class="username">{{ reporterUsername }}</b></div>
      </h3>

      <div class="meta">
        <div v-if="showPetName" class="line">
          <span class="label">Pet name:</span>
          <span class="name">{{ petName }}</span>
        </div>

        <div v-if="hasDescription" class="line">
          <span class="label">Description:</span>
          <span class="tag">{{ description }}</span>
        </div>

        <div class="line">
          <span class="label">Where:</span>
          <span class="tag">{{ address }}</span>
        </div>

        <div class="line">
          <span class="label">Published at:</span>
          <span class="tag">{{ formattedWhen }}</span>
        </div>
      </div>

      <div class="actions">
        <RouterLink :to="detailsTo" class="btn ghost">More information</RouterLink>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* Κάρτα: 40% / 60% σταθερά */
.row{
  display:grid;
  grid-template-columns: 40% 60%;
  align-items: stretch;
  gap:14px;

  border:1px solid rgba(0,0,0,.08);
  background:#fff;
  border-radius:14px;
  padding:14px;
  box-shadow:0 8px 20px rgba(16,60,112,.06);

  min-height: 260px;
}

/* Αριστερά (40%) */
.left{
  position:relative;
  width:45%;
  height:100%;
  min-height: 260px;
  border-radius:12px;
  overflow:hidden;
  border:1px solid rgba(0,0,0,.06);
  background:#e9f0fb;
}
.photo{
  position:absolute; inset:0;
  width:100%; height:100%;
  object-fit: cover;
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

/* Δεξιά (60%) */
.right{
  width:55%;
  display:flex;
  flex-direction:column;
  justify-content:flex-start;
  gap:12px;
  padding-top:4px;
}

/* ΤΙΤΛΟΣ (κεντραρισμένος) */
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

/* Λεζάντες/γραμμές meta */
.label{ color:#0b2e55; font-weight:800; font-size:12px; }
.meta{ display:flex; flex-direction:column; gap:6px; }
.line{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

.name{ font-weight:900; color:#103c70; font-size:16px; }
.tag{
  background:#f1f5ff; color:#0b2e55; font-weight:800;
  padding:2px 8px; border-radius:999px; font-size:12px;
}

/* Button */
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

/* Mobile */
@media (max-width: 980px){
  .row{ grid-template-columns: 1fr; }
  .left{ min-height: 260px; width:100%; }
  .right{ width:100%; }
}
</style>

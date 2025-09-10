<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore } from '@/stores/application.js'
import { useRemoteData } from '@/composables/useRemoteData.js'

const backend = import.meta.env.VITE_BACKEND
const app = useApplicationStore()
const router = useRouter()

// ---- fetch my adoption requests ----
const urlRef  = ref(`${backend}/api/adoption/my-requests`)
const authRef = ref(true)
const { data, error, loading, performRequest } = useRemoteData(urlRef, authRef)

onMounted(async () => {
  try { loading.value = true; await performRequest() } catch(_) {}
})

const requests = computed(() => Array.isArray(data.value) ? data.value : [])

// ---- actions ----
const cancelingId = ref(null)

async function cancelRequest(id) {
  if (!id) return
  if (!confirm('Cancel this adoption request?')) return
  cancelingId.value = id
  try {
    const res = await fetch(`${backend}/api/adoption-requests/${id}/cancel`, {
      method: 'POST',
      headers: {
        ...(app.userData?.accessToken
            ? { Authorization: `Bearer ${app.userData.accessToken}` }
            : {}
        ),
      },
    })
    if (!res.ok) {
      const t = await res.text().catch(()=> '')
      throw new Error(t || `Failed to cancel (${res.status})`)
    }
    loading.value = true
    await performRequest()
  } catch (e) {
    alert(e.message || 'Cancel failed.')
  } finally {
    cancelingId.value = null
  }
}

function goToPet(foundPetId){
  if (foundPetId === undefined || foundPetId === null) return
  router.push(`/found-pet/${foundPetId}`)
}

// ---- helpers ----
function prettyStatus(s) {
  if (typeof s !== 'string') return s
  const t = s.replace(/[_-]+/g,' ').toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}
function fmtDate(ts){
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d)) return ts
  return d.toLocaleString()
}
function isCancellable(status){
  return String(status).toUpperCase() === 'PENDING'
}
</script>

<template>
  <section>
    <div class="head">
      <h2 class="h">My adoption requests</h2>
    </div>

    <p v-if="error" class="err">{{ String(error) }}</p>
    <div v-if="loading" class="loading">Loading…</div>

    <div v-else-if="requests.length" class="rows">
      <article v-for="r in requests" :key="r.id" class="req-row">
        <!-- LEFT: status + created at -->
        <div class="left">
          <span :class="['badge', String(r.status).toLowerCase()]">{{ prettyStatus(r.status) }}</span>
          <span class="created">Created at: <b>{{ fmtDate(r.timestamp) }}</b></span>
        </div>

        <!-- RIGHT: actions -->
        <div class="right">
          <button
            class="btn ghost"
            @click="goToPet(r.foundPetId)"
            :title="`Go to /found-pet/${r.foundPetId}`">
            View pet
          </button>
          <button
            class="btn danger"
            @click="cancelRequest(r.id)"
            :disabled="cancelingId === r.id || !isCancellable(r.status)">
            {{ cancelingId === r.id ? 'Cancelling…' : 'Cancel' }}
          </button>
        </div>
      </article>
    </div>

    <p v-else class="empty">You have no adoption requests.</p>
  </section>
</template>

<style scoped>
/* Header */
.head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
.h { font-size:20px; font-weight:800; color:#103c70; margin:0; }
.actions { display:flex; gap:8px; }

/* Buttons */
.btn {
  height:38px; padding:0 14px; border-radius:10px; border:2px solid #164a8a;
  background:#164a8a; color:#fff; font-weight:800; letter-spacing:.2px; cursor:pointer;
  transition: transform .12s ease, filter .15s ease;
}
.btn.ghost { background:#fff; color:#164a8a; }
.btn.danger { border-color:#b42318; background:#b42318; }
.btn:hover { filter:brightness(1.04); transform:translateY(-1px); }
.btn:disabled { opacity:.7; cursor:not-allowed; transform:none; }

/* States */
.err { color:#b00020; margin:8px 0; }
.loading { color:#164a8a; opacity:.85; margin:8px 0; }
.empty { color:#475569; opacity:.9; margin-top:8px; }

/* List container */
.rows { display:grid; gap:10px; padding: 4px;}

/* Each row: απλό flex ώστε να χωράει όμορφα στο μισό πλάτος */
.req-row {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  padding:10px 12px;
  border:1px solid rgba(0,0,0,.08);
  border-radius:12px;
  background:#fff;
  box-shadow:0 8px 20px rgba(16,60,112,.06);
  width:100%;
  box-sizing: border-box;
}

/* Left stack (status + created) */
.left {
  display:flex;
  align-items:center;
  gap:12px;
  min-width:0;
  flex-wrap:wrap; /* για στενό χώρο */
}
.created { color:#0b2e55; white-space:nowrap; }

/* Right actions */
.right {
  display:flex;
  align-items:center;
  gap:8px;
  flex-shrink:0;
  flex-wrap: nowrap;
}

/* Status badge */
.badge {
  display:inline-block; padding:6px 10px; border-radius:999px; font-weight:800; font-size:12px;
  background:#eef2ff; color:#1e293b; border:1px solid rgba(0,0,0,.06);
}
.badge.pending  { background:#fff7ed; color:#7c2d12; border-color:#fed7aa; }
.badge.approved { background:#ecfdf5; color:#064e3b; border-color:#bbf7d0; }
.badge.rejected { background:#fef2f2; color:#7f1d1d; border-color:#fecaca; }
.badge.canceled, .badge.cancelled { background:#f1f5f9; color:#334155; border-color:#e2e8f0; }

/* Responsive: στο πολύ στενό πλάτος, στοίβαξε κάθετα */
@media (max-width: 720px){
  .req-row { flex-direction:column; align-items:flex-start; }
  .right { width:100%; justify-content:flex-start; flex-wrap:wrap; }
  .created { white-space:normal; }
}
</style>

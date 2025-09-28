<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
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

// ---- Confirm modal state ----
const showConfirm = ref(false)
const confirmId = ref(null)
const cancelingId = ref(null)

function askCancel(id) {
  confirmId.value = id
  showConfirm.value = true
}

function closeConfirm() {
  if (cancelingId.value) return // μην κλείνεις όσο γίνεται request
  showConfirm.value = false
  confirmId.value = null
}

// ESC για κλείσιμο
function onEsc(e){
  if (e.key === 'Escape') closeConfirm()
}
watch(showConfirm, (v)=>{
  if (v) document.addEventListener('keydown', onEsc)
  else document.removeEventListener('keydown', onEsc)
})
onUnmounted(()=> document.removeEventListener('keydown', onEsc))

async function confirmCancel() {
  const id = confirmId.value
  if (!id) return
  cancelingId.value = id

  let success = false
  try {
    const res = await fetch(`${backend}/api/adoption/adoption-requests/${id}/cancel`, {
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
    // ανανέωση λίστας
    loading.value = true
    await performRequest()
    success = true
  } catch (e) {
    alert(e.message || 'Cancel failed.')
  } finally {
    // 1) σταμάτα το "in-flight" state
    cancelingId.value = null
    // 2) κλείσε το modal μόνο αν πέτυχε
    if (success) closeConfirm()
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
            @click="askCancel(r.id)"
            :disabled="cancelingId === r.id || !isCancellable(r.status)">
            {{ cancelingId === r.id ? 'Cancelling…' : 'Cancel' }}
          </button>
        </div>
      </article>
    </div>

    <p v-else class="empty">You have no adoption requests.</p>

    <!-- ===== Confirm Modal (custom) ===== -->
    <div v-if="showConfirm" class="modal-overlay" @click.self="closeConfirm">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <header class="modal-head">
          <h3 id="dlg-title">Cancel adoption request</h3>
          <button class="x" type="button" @click="closeConfirm" aria-label="Close">×</button>
        </header>

        <div class="modal-body">
          <p>You are about to cancel this adoption request.</p>
          <p>Are you sure? This action cannot be undone.</p>
        </div>

        <footer class="modal-foot">
          <button class="btn outline" type="button" @click="closeConfirm" :disabled="cancelingId !== null">Cancel</button>
          <button class="btn danger" type="button" @click="confirmCancel" :disabled="cancelingId !== null">
            {{ cancelingId ? 'Cancelling…' : 'Cancel request' }}
          </button>
        </footer>
      </div>
    </div>
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
.btn.outline { background:#fff; color:#164a8a; border-color:#164a8a; }
.btn:hover { filter:brightness(1.04); transform:translateY(-1px); }
.btn:disabled { opacity:.7; cursor:not-allowed; transform:none; }

/* States */
.err { color:#b00020; margin:8px 0; }
.loading { color:#164a8a; opacity:.85; margin:8px 0; }
.empty { color:#475569; opacity:.9; margin-top:8px; }

/* List container */
.rows { display:grid; gap:10px; padding: 4px;}

/* Each row */
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
  flex-wrap:wrap;
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

/* Modal */
.modal-overlay{
  position:fixed; inset:0; background:rgba(3,7,18,.45);
  display:grid; place-items:center; z-index:10000;
}
.modal{
  width:min(520px, 92vw);
  background:#fff; border:1px solid rgba(0,0,0,.08);
  border-radius:16px; box-shadow:0 20px 60px rgba(2,8,23,.35);
  overflow:hidden;
}

/* Header: now white */
.modal-head{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px;
  background:#fff;                 /* πριν: #fde8ea */
  border-bottom:1px solid rgba(0,0,0,.08);  /* πριν: #f3c2c9 */
}
.modal-head h3{
  margin:0; font-size:18px; font-weight:900; color:#103c70;
}
.modal-head .x{
  height:32px; width:32px; border-radius:8px;
  border:1px solid rgba(0,0,0,.12);
  background:#fff; cursor:pointer; font-size:18px; line-height:1;
}

/* Body & footer μένουν όπως ήταν */
.modal-body{ padding:16px 18px; color:#0b2e55; }
.modal-body p{ margin:0 0 8px; }
.modal-foot{
  display:flex; justify-content:flex-end; gap:8px;
  padding:12px 14px; border-top:1px solid rgba(0,0,0,.08);
}


/* Responsive */
@media (max-width: 720px){
  .req-row { flex-direction:column; align-items:flex-start; }
  .right { width:100%; justify-content:flex-start; flex-wrap:wrap; }
  .created { white-space:normal; }
}
</style>

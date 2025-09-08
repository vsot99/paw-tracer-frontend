<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRemoteData } from '@/composables/useRemoteData.js'
import ReportRow from '@/components/reports/ReportRow.vue'

const backend = import.meta.env.VITE_BACKEND
const urlRef = ref(`${backend}/api/found-pet-reports/my-reports`)
const authRef = ref(true)

const { data, error, loading, performRequest } = useRemoteData(urlRef, authRef)

async function firstLoad(){ try { loading.value = true; await performRequest() } catch(_) {} }
async function refresh(){ try { await performRequest() } catch(_) {} }
onMounted(firstLoad)

const items = computed(() => Array.isArray(data.value) ? data.value : [])
</script>

<template>
  <section>
    <div class="head">
      <h2 class="h">My found pet reports</h2>
    </div>

    <p v-if="error" class="err">{{ String(error) }}</p>
    <div v-if="loading" class="loading">Loading…</div>

    <div v-else-if="items.length" class="cards-grid">
      <ReportRow v-for="it in items" :key="it.id" :item="it" type="found" />
    </div>

    <p v-else class="empty">You haven’t submitted any found pet reports yet.</p>
  </section>
</template>

<style scoped>
.head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
.h { font-size:20px; font-weight:800; color:#103c70; margin:0; }
.actions { display:flex; gap:8px; }
.btn { height:38px; padding:0 14px; border-radius:10px; border:2px solid #164a8a; background:#164a8a; color:#fff; font-weight:800; cursor:pointer; transition:transform .12s, filter .15s; }
.btn:hover { filter:brightness(1.04); transform:translateY(-1px); }
.btn.ghost { background:#fff; color:#164a8a; }
.err { color:#b00020; margin:8px 0; }
.loading { color:#164a8a; opacity:.85; margin:8px 0; }
.empty { color:#475569; opacity:.9; margin-top:8px; }

/* ΔΥΟ ανά σειρά */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

/* Κινητό: 1 ανά σειρά */
@media (max-width: 980px){
  .cards-grid { grid-template-columns: 1fr; }
}
</style>

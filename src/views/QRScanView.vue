<template>
  <main class="qr-page">
    <div class="wrap">
      <!-- Header πάνω από την κάρτα -->
      <header class="hero">
        <h1 class="hero-title">Hi there, this pet you just scanned is likely lost.</h1>
        <p class="hero-sub">Use information below to contact its owner, this pet depends on you!</p>
      </header>

      <!-- Κεντρική κάρτα (13cm) -->
      <section class="qr-card">
        <!-- Loading -->
        <div v-if="loading" class="loading">Loading…</div>

        <!-- Error -->
        <div v-if="error && !loading" class="alert">{{ error }}</div>

        <!-- Content -->
        <div v-if="qrData && !loading" class="content">
          <div class="grid-2">
            <!-- Owner -->
            <section class="box">
              <h2 class="box-title">
                <span class="chip">Owner Details</span>
              </h2>
              <dl class="list">
                <div class="row">
                  <dt>Name:</dt><dd>{{ qrData.username || '—' }}</dd>
                </div>
                <div class="row">
                  <dt>Email:</dt><dd class="break">{{ qrData.email || '—' }}</dd>
                </div>
                <div class="row">
                  <dt>Phone:</dt><dd>{{ qrData.phoneNumber || '—' }}</dd>
                </div>
              </dl>
            </section>

            <!-- Pet -->
            <section class="box">
              <h2 class="box-title">
                <span class="chip">Pet Details</span>
              </h2>
              <dl class="list">
                <div class="row">
                  <dt>Name:</dt><dd>{{ qrData.petName || '—' }}</dd>
                </div>
                <div class="row">
                  <dt>Species:</dt><dd>{{ speciesCap || '—' }}</dd>
                </div>
                <div class="row">
                  <dt>Breed:</dt><dd>{{ qrData.breed || '—' }}</dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'

const props = defineProps({
  qrCodeToken: { type: String, required: true }
})

const base = import.meta.env.VITE_BACKEND
const loading = ref(true)
const error = ref(null)
const qrData = ref(null)

const endpoint = computed(() => `${base}/api/qr/${encodeURIComponent(props.qrCodeToken)}`)

// Species με πρώτο κεφαλαίο, υπόλοιπα μικρά (Dog, Cat)
const speciesCap = computed(() => {
  const s = qrData.value?.species
  if (!s || typeof s !== 'string') return ''
  const low = s.toLowerCase()
  return low.charAt(0).toUpperCase() + low.slice(1)
})

onMounted(async () => {
  try {
    const res = await fetch(endpoint.value, { headers: { Accept: 'application/json' } })
    const ct = res.headers.get('content-type') || ''
    if (!res.ok) {
      const preview = await res.text().catch(() => '')
      throw new Error(`Request failed (${res.status}). ${preview.slice(0, 140)}`)
    }
    if (!ct.includes('application/json')) {
      const preview = await res.text().catch(() => '')
      throw new Error(`Expected JSON, got: ${preview.slice(0, 140)}`)
    }
    qrData.value = await res.json()
  } catch (e) {
    error.value = e?.message || 'Something went wrong.'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
/* Σελίδα: πάνω-πάνω, οριζόντια κεντραρισμένο */
.qr-page{
  min-height: 100vh;
  background: linear-gradient(to bottom, #ffffff, #eef5ff);
  padding: 16px 16px 48px; /* πάνω-ψηλά */
}
.wrap{
  width: 100%;
  display: grid;
  justify-items: center; /* οριζόντια στο κέντρο */
  gap: 12px;
}

/* Header */
.hero{ text-align: center; max-width: 900px; }
.hero-title{
  margin: 0;
  font-size: clamp(22px, 3.2vw, 32px);
  font-weight: 900;
  letter-spacing: .2px;
  color: #103c70;
}
.hero-sub{
  margin: 8px 0 0;
  color: #174a89;
  opacity: .85;
  font-size: clamp(14px, 2.2vw, 18px);
}

/* Κεντρική κάρτα 13cm */
.qr-card{
  width: min(100%, 20cm);
  background: #fff;
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 10px 28px rgba(16,60,112,.12);
}

/* States */
.loading{ color:#164a8a; opacity:.85; text-align:center; padding:6px 0; }
.alert{
  background:#fde8ea; color:#7a1020; border:1px solid #f3c2c9;
  border-radius:10px; padding:10px 12px; margin:8px 0; font-size:14px;
}

/* Περιεχόμενο */
.content{ display:block; }
.grid-2{
  display:grid; gap:12px;
  grid-template-columns: 1fr;
}
@media (min-width: 700px){
  .grid-2{ grid-template-columns: 1fr 1fr; }
}

/* Ίδιες “card” θήκες γύρω από Owner/Pet */
.box{
  border: 1px solid rgba(0,0,0,.08);
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 8px 20px rgba(16,60,112,.06);
  background: #fff;
}
.box-title{
  margin: 0 0 10px 0;
  display:flex; align-items:center; justify-content:flex-start;
}
.chip{
  display:inline-block; padding:6px 12px; border-radius:999px;
  background:#f3f7ff; border:1.5px solid #c9d7ef; color:#0b2e55; font-weight:900;
  font-size: 14px; line-height:1;
}

/* DL λίστες */
.list{ display:grid; gap:8px; }
.row{ display:flex; gap:8px; align-items:baseline; }
.row dt{
  width: 86px; min-width:86px;
  color:#0b2e55; font-weight:800; font-size:13px;
}
.row dd{
  margin:0; color:#0f172a; font-weight:600;
}
.break{ word-break: break-word; overflow-wrap: anywhere; }
</style>

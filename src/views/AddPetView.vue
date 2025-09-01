<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore } from '@/stores/application.js'

const backendEnvVar = import.meta.env.VITE_BACKEND
const router = useRouter()
const app = useApplicationStore()

// Enums από το backend
const SPECIES = ['DOG', 'CAT', 'OTHER']
const SIZES   = ['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE']
const GENDERS = ['MALE', 'FEMALE']

// Μοντέλο φόρμας
const form = ref({
  // AbstractPet (όλα required)
  species: 'DOG',
  breed: '',
  color: '',
  size: 'MEDIUM',
  gender: 'MALE',
  // Pet (required)
  name: '',
  age: null,
  weight: null,
  // Pet (optional)
  microchipNumber: '',
  behavior: ''
})

const loading = ref(false)
const errorMsg = ref('')

function validate() {
  errorMsg.value = ''
  const f = form.value

  // AbstractPet required
  if (!f.species || !f.breed.trim() || !f.color.trim() || !f.size || !f.gender) {
    errorMsg.value = 'Please complete all required pet attributes.'
    return false
  }
  // Pet required
  if (!f.name.trim()) {
    errorMsg.value = 'Name is required.'
    return false
  }
  if (f.age == null || isNaN(f.age) || Number(f.age) < 0) {
    errorMsg.value = 'Age must be a non-negative number.'
    return false
  }
  if (f.weight == null || isNaN(f.weight) || Number(f.weight) <= 0) {
    errorMsg.value = 'Weight must be a positive number.'
    return false
  }
  return true
}

async function submit() {
  if (!validate()) return
  loading.value = true

  try {
    const token = app.userData?.accessToken

    // Φτιάξε payload χωρίς QR code και χωρίς imageUrls
    const payload = {
      species: form.value.species,
      breed: form.value.breed.trim(),
      color: form.value.color.trim(),
      size: form.value.size,
      gender: form.value.gender,

      name: form.value.name.trim(),
      age: Number(form.value.age),
      weight: Number(form.value.weight),
    }
    // optional μόνο αν έχουν δοθεί
    if (form.value.microchipNumber && form.value.microchipNumber.trim() !== '') {
      payload.microchipNumber = form.value.microchipNumber.trim()
    }
    if (form.value.behavior && form.value.behavior.trim() !== '') {
      payload.behavior = form.value.behavior.trim()
    }

    const res = await fetch(`${backendEnvVar}/api/pets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(txt || `Failed to create pet (${res.status})`)
    }

    // const created = await res.json() // αν το χρειαστείς
    router.push('/profile')
  } catch (e) {
    errorMsg.value = e.message || 'Failed to create pet.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="page">
    <section class="card">
      <header class="head">
        <h1>Add new pet</h1>
      </header>

      <p v-if="errorMsg" class="alert">{{ errorMsg }}</p>

      <form class="grid" @submit.prevent="submit">
        <!-- Αριστερή στήλη -->
        <label class="field">
          <span>Name *</span>
          <input v-model.trim="form.name" required />
        </label>

        <label class="field">
          <span>Species *</span>
          <select v-model="form.species">
            <option v-for="s in SPECIES" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>

        <label class="field">
          <span>Breed *</span>
          <input v-model.trim="form.breed" required />
        </label>

        <label class="field">
          <span>Color *</span>
          <input v-model.trim="form.color" required />
        </label>

        <label class="field">
          <span>Size *</span>
          <select v-model="form.size">
            <option v-for="s in SIZES" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>

        <label class="field">
          <span>Gender *</span>
          <select v-model="form.gender">
            <option v-for="g in GENDERS" :key="g" :value="g">{{ g }}</option>
          </select>
        </label>

        <label class="field">
          <span>Age (years) *</span>
          <input v-model.number="form.age" type="number" min="0" step="1" required />
        </label>

        <label class="field">
          <span>Weight (kg) *</span>
          <input v-model.number="form.weight" type="number" min="0" step="0.1" required />
        </label>

        <label class="field">
          <span>Microchip number</span>
          <input v-model.trim="form.microchipNumber" />
        </label>

        <label class="field full">
          <span>Behavior</span>
          <textarea v-model.trim="form.behavior" rows="3" />
        </label>

        <div class="actions">
          <button class="btn primary" type="submit" :disabled="loading">
            <span v-if="!loading">Save pet</span>
            <span v-else class="spinner"></span>
          </button>
          <button class="btn ghost" type="button" @click="router.back()">Cancel</button>
        </div>
      </form>
    </section>
  </main>
</template>

<style scoped>
/* Theme */
.page {
  --brand-800:#0b2e55; --brand-700:#103c70; --brand-600:#164a8a; --brand-100:#e9f0fb;
  background:#fff; min-height:100dvh;
  display:flex; justify-content:center; align-items:flex-start; padding:56px 16px;
}
.card {
  width:min(880px, 98vw);
  background:#fff; border:1px solid rgba(0,0,0,.08); border-radius:16px;
  box-shadow:0 12px 36px rgba(16,60,112,.10); padding:22px 22px 18px;
}
.head h1 { margin:0 0 12px; font-size:26px; font-weight:900; color:var(--brand-700); }

/* Alert */
.alert { background:#fde8ea; color:#7a1020; border:1px solid #f3c2c9; border-radius:10px; padding:10px 12px; margin:0 0 12px; font-size:14px; }

/* Form */
.grid { display:grid; gap:12px; grid-template-columns: repeat(2, 1fr); }
.field { display:flex; flex-direction:column; gap:6px; }
.field.full { grid-column: 1 / -1; }
.field span { color:var(--brand-800); font-weight:700; font-size:14px; }

input, select, textarea {
  height:44px; padding:0 12px; border-radius:12px;
  border:1px solid rgba(0,0,0,.14); background:#fff; font-size:16px; outline:none;
}
textarea { height:auto; padding:10px 12px; }
input:focus, select:focus, textarea:focus {
  border-color:var(--brand-600); box-shadow:0 0 0 3px rgba(22,74,138,.12);
}

/* Actions */
.actions { grid-column: 1 / -1; display:flex; gap:10px; margin-top:6px; }
.btn {
  height:46px; padding:0 16px; border-radius:12px; font-weight:800; letter-spacing:.2px; cursor:pointer;
  border:2px solid var(--brand-600);
}
.btn.primary { background:var(--brand-600); color:#fff; }
.btn.ghost { background:#fff; color:var(--brand-700); }
.btn:disabled { opacity:.75; cursor:not-allowed; }
.spinner {
  width:18px; height:18px; border:3px solid rgba(255,255,255,.45); border-top-color:#fff;
  border-radius:50%; display:inline-block; animation:spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
</style>

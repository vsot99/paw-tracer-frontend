<!-- src/views/AddPetView.vue -->
<script setup>
import { ref, onMounted, computed, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore } from '@/stores/application.js'

const backendEnvVar = import.meta.env.VITE_BACKEND
const router = useRouter()
const app = useApplicationStore()

/* ================== Enums (UI) ================== */
const SPECIES = ['DOG', 'CAT']
const SIZES   = ['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE']
const GENDERS = ['MALE', 'FEMALE']

/* Helper: εμφάνιση ωραίας ετικέτας αλλά χωρίς να αλλάζει η τιμή */
const pretty = (s) =>
  String(s)
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())

/* ================== Form model ================== */
const form = ref({
  species: 'DOG',
  breed: '',
  color: '',
  size: 'MEDIUM',
  gender: 'MALE',
  name: '',
  age: null,
  weight: null,
  microchipNumber: '',
  behavior: ''
})

/* ================== Breeds data ================== */
const breeds = ref({ DOG: [], CAT: [] })
async function loadBreeds() {
  const readTxt = async (url) => {
    try {
      const res = await fetch(url)
      if (!res.ok) return []
      const txt = await res.text()
      return txt
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('#'))
    } catch { return [] }
  }
  const [cats, dogs] = await Promise.all([
    readTxt('/breeds/cat_breeds.txt'),
    readTxt('/breeds/dog_breeds_fci.txt')
  ])
  breeds.value = { CAT: cats, DOG: dogs }
}
onMounted(loadBreeds)

/* ================== Breed combobox ================== */
const breedQuery = ref('')
const showBreedMenu = ref(false)
const breedWrapEl = ref(null)

const availableBreeds = computed(() =>
  form.value.species === 'DOG' ? breeds.value.DOG
    : form.value.species === 'CAT' ? breeds.value.CAT
      : []
)

const filteredBreeds = computed(() => {
  const q = breedQuery.value.trim().toLowerCase()
  if (!q) return availableBreeds.value
  return availableBreeds.value.filter(b => b.toLowerCase().startsWith(q))
})

function pickBreed(b) {
  form.value.breed = b
  breedQuery.value = b
  showBreedMenu.value = false
}

watch(() => form.value.species, () => {
  showBreedMenu.value = false
  form.value.breed = ''
  breedQuery.value = ''
  customBreed.value = ''
})

watch(() => form.value.breed, (v) => {
  if (v && v !== breedQuery.value) breedQuery.value = v
})

function onDocClick(e){
  const el = breedWrapEl.value
  if (!el) return
  if (!el.contains(e.target)) showBreedMenu.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

/* ================== Custom breed ================== */
const customBreed = ref('')
const isOtherBreed = computed(() => form.value.breed === 'Other') // αν το χρησιμοποιήσεις

/* ================== Validation & Submit ================== */
const loading = ref(false)
const errorMsg = ref('')

function validate() {
  errorMsg.value = ''
  const f = form.value

  if (!f.species) { errorMsg.value = 'Species is required.'; return false }
  if (!f.breed)   { errorMsg.value = 'Please pick a breed from the list.'; return false }
  if (isOtherBreed.value && !customBreed.value.trim()) {
    errorMsg.value = 'Please fill "Insert breed manually".'; return false
  }
  if (!f.color.trim() || !f.size || !f.gender) {
    errorMsg.value = 'Please complete all required pet attributes.'; return false
  }
  if (!f.name.trim()) { errorMsg.value = 'Name is required.'; return false }
  if (f.age == null || isNaN(f.age) || Number(f.age) < 0) {
    errorMsg.value = 'Age must be a non-negative number.'; return false
  }
  if (f.weight == null || isNaN(f.weight) || Number(f.weight) <= 0) {
    errorMsg.value = 'Weight must be a positive number.'; return false
  }
  return true
}

async function submit() {
  if (!validate()) return
  loading.value = true
  try {
    const token = app.userData?.accessToken

    const payload = {
      species: String(form.value.species).toUpperCase(),
      size:    String(form.value.size).toUpperCase(),
      gender:  String(form.value.gender).toUpperCase(),
      breed: isOtherBreed.value
        ? customBreed.value.trim()
        : String(form.value.breed).trim(),
      color:  form.value.color.trim(),
      name:   form.value.name.trim(),
      age:    Number(form.value.age),
      weight: Number(form.value.weight),
    }
    if (form.value.microchipNumber?.trim()) payload.microchipNumber = form.value.microchipNumber.trim()
    if (form.value.behavior?.trim())        payload.behavior = form.value.behavior.trim()

    const res = await fetch(`${backendEnvVar}/api/pets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(txt || `Failed to create pet (${res.status})`)
    }
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
        <!-- Name -->
        <label class="field">
          <span>Name *</span>
          <input v-model.trim="form.name" required />
        </label>

        <!-- Species (εμφάνιση Pretty, τιμή UPPERCASE) -->
        <label class="field">
          <span>Species *</span>
          <select v-model="form.species" required>
            <option v-for="s in SPECIES" :key="s" :value="s">{{ pretty(s) }}</option>
          </select>
        </label>

        <!-- Breed (searchable dropdown) -->
        <div class="field breed-field" ref="breedWrapEl">
          <span>Breed *</span>

          <div class="combo">
            <input
              class="combo-input"
              v-model="breedQuery"
              type="text"
              placeholder="Search breed…"
              @focus="showBreedMenu = true"
              @input="showBreedMenu = true"
              :aria-expanded="showBreedMenu ? 'true' : 'false'"
              autocomplete="off"
              required
            />
            <button
              type="button"
              class="combo-caret"
              @click="showBreedMenu = !showBreedMenu"
              aria-label="Toggle breed list"
            >▾</button>
          </div>

          <ul v-show="showBreedMenu" class="menu" role="listbox">
            <li
              v-for="b in filteredBreeds"
              :key="b"
              class="item"
              role="option"
              @mousedown.prevent="pickBreed(b)"
            >{{ b }}</li>
            <li v-if="filteredBreeds.length === 0" class="empty-item">No matches</li>
          </ul>
        </div>

        <!-- Insert breed manually (only when Breed=Other) -->
        <label class="field" v-if="isOtherBreed">
          <span>Insert breed manually *</span>
          <input v-model.trim="customBreed" placeholder="Insert breed manually" required />
        </label>

        <!-- Color -->
        <label class="field">
          <span>Color *</span>
          <input v-model.trim="form.color" required />
        </label>

        <!-- Size (Pretty label) -->
        <label class="field">
          <span>Size *</span>
          <select v-model="form.size" required>
            <option v-for="s in SIZES" :key="s" :value="s">{{ pretty(s) }}</option>
          </select>
        </label>

        <!-- Gender (Pretty label) -->
        <label class="field">
          <span>Gender *</span>
          <select v-model="form.gender" required>
            <option v-for="g in GENDERS" :key="g" :value="g">{{ pretty(g) }}</option>
          </select>
        </label>

        <!-- Age -->
        <label class="field">
          <span>Age (years) *</span>
          <input v-model.number="form.age" type="number" min="0" step="1" required />
        </label>

        <!-- Weight -->
        <label class="field">
          <span>Weight (kg) *</span>
          <input v-model.number="form.weight" type="number" min="0" step="0.1" required />
        </label>

        <!-- Microchip -->
        <label class="field">
          <span>Microchip number</span>
          <input v-model.trim="form.microchipNumber" />
        </label>

        <!-- Behavior -->
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

/* Breed combobox (overlay dropdown) */
.breed-field { position: relative; }
.combo{ position:relative; display:flex; align-items:center; }
.combo-input{
  flex:1; height:44px; padding-right:34px;
  border-radius:12px; border:1px solid rgba(0,0,0,.14); font-size:16px; outline:none;
}
.combo-input:focus{ border-color:#164a8a; box-shadow:0 0 0 3px rgba(22,74,138,.12); }
.combo-caret{
  position:absolute; right:6px; top:50%; transform:translateY(-50%);
  height:32px; min-width:32px; border-radius:8px;
  border:1px solid rgba(0,0,0,.14); background:#fff; z-index:1001; cursor:pointer;
}
.menu{
  position:absolute; left:0; right:0; top:calc(100% + 6px); z-index:1000;
  margin:0; border:1px solid rgba(0,0,0,.14); border-radius:12px; background:#fff;
  box-shadow:0 12px 28px rgba(16,60,112,.16);
  max-height:224px; overflow:auto; list-style:none; padding:6px;
}
.item{ padding:8px 10px; border-radius:8px; cursor:pointer; }
.item:hover{ background:#f3f7ff; }
.empty-item{ padding:8px 10px; color:#64748b; }

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

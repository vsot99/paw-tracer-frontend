<script setup>
import { onBeforeMount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore } from '@/stores/application.js'
const backendEnvVar = import.meta.env.VITE_BACKEND

const router = useRouter()
const { setUserData, persistUserData, isAuthenticated } = useApplicationStore()

const loading = ref(false)
const credentials = ref({ username: '', password: '' })
const authenticationFailed = ref(false)

const onFormSubmit = () => {
  loading.value = true
  authenticationFailed.value = false

  fetch(`${backendEnvVar}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials.value),
  })
    .then((response) => {
      if (response.ok) {
        response.json().then((data) => {
          setUserData(data)
          persistUserData()
          router.push({ name: 'home' })
        })
      } else {
        authenticationFailed.value = true
      }
    })
    .catch(() => {
      authenticationFailed.value = true
    })
    .finally(() => {
      loading.value = false
    })
}

onBeforeMount(() => {
  if (isAuthenticated?.value === true) {
    router.push({ name: 'home' })
  }
})
</script>

<template>
  <main class="auth-page">
    <section class="auth-card">
      <h1 class="title">Login</h1>

      <div v-if="authenticationFailed" class="alert">
        Authentication failed. Please check your credentials.
      </div>

      <form class="form" @submit.prevent="onFormSubmit">
        <label class="field">
          <span>Email or Username</span>
          <input
            v-model="credentials.username"
            type="text"
            autocomplete="username"
            required
          />
        </label>

        <label class="field">
          <span>Password</span>
          <input
            v-model="credentials.password"
            type="password"
            autocomplete="current-password"
            required
          />
        </label>

        <button class="btn" type="submit" :disabled="loading">
          <span v-if="!loading">Log in</span>
          <span v-else class="spinner"></span>
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  --brand-700:#103c70;
  --brand-600:#164a8a;

  min-height: 100dvh;
  display: flex;
  justify-content: center;
  align-items: flex-start;  /* βάζουμε ψηλά */
  background: #fff;
  padding-top: 80px;        /* ~1/3 από πάνω */
}

.auth-card {
  width: min(420px, 92vw);
  background: #fff;
  border: 1px solid rgba(0,0,0,.08);
  border-radius: 16px;
  padding: 28px;
  box-shadow: 0 8px 24px rgba(16,60,112,.08);
}

.title {
  font-size: 32px;          /* πιο μεγάλη γραμματοσειρά */
  font-weight: 900;
  color: var(--brand-700);
  margin: 0 0 20px;
  text-align: center;
}

.alert {
  background: #fde8ea;
  color: #7a1020;
  border: 1px solid #f3c2c9;
  border-radius: 10px;
  padding: 10px 12px;
  margin: 0 0 14px;
  font-size: 14px;
}

.form { display: grid; gap: 14px; }
.field { display: grid; gap: 6px; }
.field > span {
  font-weight: 600;
  color: var(--brand-700);
  font-size: 14px;
}
input {
  height: 46px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,.14);
  font-size: 16px;
  outline: none;
}
input:focus {
  border-color: var(--brand-600);
  box-shadow: 0 0 0 3px rgba(22,74,138,.12);
}

.btn {
  height: 48px;
  border-radius: 10px;
  background: var(--brand-600);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  border: none;
  cursor: pointer;
}
.btn:hover { filter: brightness(1.05); }
.btn:disabled { opacity: .75; cursor: not-allowed; }

.spinner {
  width: 18px; height: 18px;
  border: 3px solid rgba(255,255,255,.45);
  border-top-color: #fff;
  border-radius: 50%;
  display: inline-block;
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore } from '@/stores/application.js'

const router = useRouter()
const { clearUserData } = useApplicationStore()

onMounted(() => {
  // καθάρισε credentials από Pinia + localStorage
  clearUserData()
  // γύρνα στην αρχική χωρίς να κρατήσεις το /logout στο history
  router.replace({ name: 'home' }) // ή: router.replace('/')
})
</script>

<template>
  <!-- Προαιρετικό: σχεδόν δεν προλαβαίνει να φανεί -->
  <div style="padding:24px; color:#103c70; font-weight:700;">Signing you out…</div>
</template>

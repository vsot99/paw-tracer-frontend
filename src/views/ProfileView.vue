<script setup>
/* Μόνο layout — αυτή τη φορά ένα section: ProfilePets + ProfileInfo + Reports */
</script>

<template>
  <main class="profile-page">
    <section class="wrap">
      <h1 class="title">Your Profile</h1>

      <div class="grid">
        <ProfilePets class="card" />
        <ProfileInfo class="card" />

        <!-- Full width καθένα -->
        <ProfileLostReports class="card" />
        <ProfileFoundReports class="card" />
      </div>
    </section>
  </main>
</template>

<script>
/* local registration για να μη ζητά imports στο main */
import ProfilePets from '@/components/profile/ProfilePets.vue'
import ProfileInfo from '@/components/profile/ProfileInfo.vue'
import ProfileLostReports from '@/components/profile/ProfileLostReports.vue'
import ProfileFoundReports from '@/components/profile/ProfileFoundReports.vue'

export default {
  components: {
    ProfilePets,
    ProfileInfo,
    ProfileLostReports,
    ProfileFoundReports,
  }
}
</script>

<style scoped>
.profile-page { background: #fff; }
.wrap { max-width: 1240px; margin: 0 auto; padding: 24px; }
.title { font-size: 28px; font-weight: 900; color: #103c70; margin: 8px 0 20px; }

/* Στήλη — κάθε section πλήρους πλάτους, όπως και πριν */
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
}
.card {
  background: #ffffff;
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(16,60,112,.06);
}
</style>

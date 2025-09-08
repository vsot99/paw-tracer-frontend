<script setup>
/* Layout: ProfilePets (full) + ProfileInfo (1/2) + ProfileAdoptionRequests (1/2) + Lost/Found (full) */
</script>

<template>
  <main class="profile-page">
    <section class="wrap">
      <h1 class="title">Your Profile</h1>

      <div class="grid">
        <!-- full width -->
        <ProfilePets class="card" />

        <!-- 50/50 στην ίδια σειρά -->
        <ProfileInfo class="card half" />
        <ProfileAdoptionRequestsView class="card half" />

        <!-- full width -->
        <ProfileLostReports class="card" />
        <ProfileFoundReports class="card" />
      </div>
    </section>
  </main>
</template>

<script>
/* local registration */
import ProfilePets from '@/components/profile/ProfilePets.vue'
import ProfileInfo from '@/components/profile/ProfileInfo.vue'
import ProfileLostReports from '@/components/profile/ProfileLostReports.vue'
import ProfileFoundReports from '@/components/profile/ProfileFoundReports.vue'
import ProfileAdoptionRequestsView from '@/components/profile/ProfileAdoptionRequests.vue'

export default {
  components: {
    ProfilePets,
    ProfileInfo,
    ProfileAdoptionRequestsView,
    ProfileLostReports,
    ProfileFoundReports,
  }
}
</script>

<style scoped>
.profile-page { background: #fff; }
.wrap { max-width: 1240px; margin: 0 auto; padding: 24px; }
.title { font-size: 28px; font-weight: 900; color: #103c70; margin: 8px 0 20px; }

/* Default: 1 στήλη (mobile/tablet) */
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
}

/* Κάρτες */
.card {
  background: #ffffff;
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(16,60,112,.06);
}

/* Από ~1000px και πάνω: κάνε 12-στήλες.
   - Όλες οι κάρτες default span 12 (full width)
   - .half => span 6 (άρα δύο δίπλα-δίπλα) */
@media (min-width: 1000px) {
  .grid {
    grid-template-columns: repeat(12, 1fr);
  }
  .card { grid-column: span 12; }
  .card.half { grid-column: span 6; }
}
</style>

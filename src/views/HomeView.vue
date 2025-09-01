<!-- HomeView.vue -->
<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore } from '@/stores/application.js'

const router = useRouter()
const app = useApplicationStore()
const isAuthed = computed(() => app.isAuthenticated)

function smartNavigate(candidates) {
  for (const c of candidates) {
    if (typeof c === 'object') {
      if (router.hasRoute && router.hasRoute(c.name)) return router.push(c)
    } else {
      const r = router.resolve(c)
      if (r?.matched?.length) return router.push(c)
    }
  }
  router.push('/')
}
function createLost() {
  smartNavigate([{ name:'lost-report-create' }, { name:'lost-create' }, '/lost/new'])
}
function createFound() {
  smartNavigate([{ name:'found-report-create' }, { name:'found-create' }, '/found/new'])
}
</script>

<template>
  <main class="home-hero">
    <section class="shell">
      <!-- κείμενο -->
      <div class="copy" style="transform: translateY(-75px);">
        <h1>
          Hear that? <span>Home</span> is calling.
        </h1>
        <p class="lead">
          PawTracer is a community-powered app that helps reunite lost pets with their families.
          Create “lost” or “found” reports, attach photos and location, log sightings,
          and get smart alerts from people nearby.
        </p>

        <!-- CTA: δύο ίσα μπλε κουμπιά, δίπλα-δίπλα, ελεγχόμενο πλάτος -->
        <div
          v-if="isAuthed"
          :style="{
            display: 'flex',
            gap: '16px',
            marginTop: '18px',
            /* κράτα τα δίπλα-δίπλα και μην προεξέχουν από το κείμενο */
            maxWidth: '560px',   // ~κάτω από το 'is'
            flexWrap: 'nowrap'
          }"
        >
          <button
            @click="createLost"
            style="
              flex: 0 0 220px;        /* ίδιο πλάτος */
              height: 80px;
              background:#164a8a;
              color:#fff;
              border:2px solid #164a8a;
              border-radius:12px;
              font-weight:800;
              padding:0 16px;
              cursor:pointer;
              box-shadow:0 10px 24px rgba(16,60,112,.18);
              transition:transform .12s ease, filter .15s ease;
            "
            onmouseover="this.style.filter='brightness(1.05)'; this.style.transform='translateY(-1px)'"
            onmouseout="this.style.filter=''; this.style.transform=''"
          >
            Create lost pet report
          </button>

          <button
            @click="createFound"
            style="
              flex: 0 0 220px;        /* ίδιο πλάτος με το πρώτο */
              height: 80px;
              background:#164a8a;
              color:#fff;
              border:2px solid #164a8a;
              border-radius:12px;
              font-weight:800;
              padding:0 16px;
              cursor:pointer;
              box-shadow:0 10px 24px rgba(16,60,112,.18);
              transition:transform .12s ease, filter .15s ease;
            "
            onmouseover="this.style.filter='brightness(1.05)'; this.style.transform='translateY(-1px)'"
            onmouseout="this.style.filter=''; this.style.transform=''"
          >
            Create found pet report
          </button>
        </div>
      </div>

      <!-- εικονογράφηση -->
      <div class="art">
        <svg class="backdrop" viewBox="0 0 600 600" aria-hidden="true">
          <defs>
            <radialGradient id="glow" cx="50%" cy="45%" r="60%">
              <stop offset="0%"  stop-color="#2a67b3" stop-opacity="0.30"/>
              <stop offset="70%" stop-color="#164a8a" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="#103c70" stop-opacity="0.10"/>
            </radialGradient>
          </defs>
          <circle cx="320" cy="280" r="220" fill="url(#glow)"/>
          <circle cx="320" cy="280" r="180" fill="none" stroke="#164a8a" stroke-width="20" opacity=".35"/>
          <rect x="455" y="420" width="160" height="26" rx="13"
                fill="#164a8a" opacity=".45" transform="rotate(38 455 420)"/>
          <g fill="#103c70" opacity=".14">
            <g transform="translate(160,160)">
              <circle cx="0" cy="18" r="16"/>
              <circle cx="-22" cy="-10" r="8"/><circle cx="0" cy="-16" r="8"/><circle cx="22" cy="-8" r="8"/><circle cx="-2" cy="40" r="10" opacity=".9"/>
            </g>
            <g transform="translate(460,170) scale(.9)">
              <circle cx="0" cy="18" r="16"/>
              <circle cx="-22" cy="-10" r="8"/><circle cx="0" cy="-16" r="8"/><circle cx="22" cy="-8" r="8"/><circle cx="-2" cy="40" r="10" opacity=".9"/>
            </g>
          </g>
        </svg>
        <img class="pets" src="/home-hero.png" alt="Dogs and cats" />
      </div>
    </section>
  </main>
</template>

<style scoped>
:root{ --brand-800:#0b2e55; --brand-700:#103c70; --brand-600:#164a8a; --paper:#fff; }

.home-hero{ background:var(--paper); }
.shell{
  max-width:1240px; margin:0 auto; padding:72px 24px 48px;
  display:grid; grid-template-columns:1.05fr 1fr; align-items:center; gap:32px;
  min-height:560px;
}
.copy h1{ font-size:clamp(40px,5vw,64px); line-height:1.05; font-weight:900; color:var(--brand-800); margin:0 0 16px; }
.copy h1 span{ color:var(--brand-600); text-shadow:0 1px 0 rgba(0,0,0,.06); }
.lead{ font-size:18px; line-height:1.6; color:#334155; max-width:56ch; margin:0; }

.art{ position:relative; height:520px; display:grid; place-items:center; }
.backdrop{ position:absolute; inset:0; width:100%; height:100%; }
.pets{ position:relative; width:min(540px,90%); height:auto; object-fit:contain; filter:drop-shadow(0 24px 40px rgba(16,60,112,.18)); z-index:1; }

@media (max-width:1100px){
  .shell{ grid-template-columns:1fr; text-align:center; }
  .copy{ transform: translateY(-40px) !important; }
}
</style>

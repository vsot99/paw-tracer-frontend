<script setup>
import { RouterLink } from 'vue-router'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useApplicationStore } from '@/stores/application.js'
import { useRemoteData } from '@/composables/useRemoteData.js'

const applicationStore = useApplicationStore()
const backend = import.meta.env.VITE_BACKEND

/* ---------- Notifications ---------- */
const notifOpen = ref(false)
const urlRef = ref(`${backend}/api/users/notifications`)
const authRef = ref(true)
const { data, error, loading, performRequest } = useRemoteData(urlRef, authRef)

const notifications = computed(() => {
  if (!Array.isArray(data.value)) return []
  return [...data.value].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
})

/* Μετατροπή τύπων σε "ανθρώπινες" λέξεις */
function humanType(type) {
  switch (String(type).toUpperCase()) {
    case 'LOST_NEAR_YOU':      return 'Pet lost nearby'
    case 'SIGHTING_REPORT':    return 'New sighting report'
    case 'POSSIBLE_MATCH':     return 'Possible match'
    case 'NEW_ADOPTION_REQ':   return 'New adoption request'
    case 'ADOPTION_REQ_ANSWER':return 'Adoption request answer'
    default:                   return type
  }
}

/* Υπολογισμός αδιάβαστων: μετράει μέχρι το πρώτο isRead=true */
const unreadCount = ref(0)
function computeUnread() {
  let count = 0
  for (const n of notifications.value) {
    if (n.read === false) count++
    else break
  }
  unreadCount.value = count
}

/* Ανοιγοκλείσιμο panel */
function toggleNotifications () {
  notifOpen.value = !notifOpen.value
  if (notifOpen.value) {
    refreshNotifications()
    clearBadge()
  }
}
function closeNotifications () { notifOpen.value = false }

/* Με το που ανοίγει -> καθαρίζει το badge */
function clearBadge() { unreadCount.value = 0 }

/* Refresh ειδοποιήσεων */
async function refreshNotifications () {
  loading.value = true
  await performRequest()
  computeUnread()
}

/* Time ago helper */
function timeAgo (iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}

/* Esc για κλείσιμο overlay */
function onKey (e) { if (e.key === 'Escape') closeNotifications() }
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

/* Helper για link */
function notificationLink(n) {
  if (n.lostPetReportId) return `/lost/${n.lostPetReportId}`
  if (n.foundPetReportId) return `/found/${n.foundPetReportId}`
  if (n.foundPetId) return `/found-pet/${n.foundPetId}`
  return '/'
}

/* Σημαδεύει όλα ως διαβασμένα όταν κλείσει το panel */
async function markAllAsRead() {
  try {
    await fetch(`${backend}/api/users/notifications`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${applicationStore.userData?.accessToken}` }
    })
  } catch (_) {}
}

/* -------- Real-time polling -------- */
let intervalId
onMounted(async () => {
  await refreshNotifications()
  intervalId = setInterval(refreshNotifications, 30000) // κάθε 30s
})
onUnmounted(() => clearInterval(intervalId))
</script>

<template>
  <header class="pt-header">
    <div class="pt-container">
      <!-- Brand -->
      <RouterLink to="/" class="brand" aria-label="PawTracer Home">
        <img src="/logo-plain.png" alt="PawTracer" class="logo" />
        <span class="wordmark">PawTracer</span>
      </RouterLink>

      <!-- Nav -->
      <div class="nav-area">
        <nav class="nav">
          <RouterLink to="/"        class="nav-link">Home</RouterLink>
          <RouterLink to="/search"  class="nav-link">Search</RouterLink>
          <RouterLink to="/adopt"   class="nav-link">Adopt</RouterLink>
          <RouterLink to="/about"   class="nav-link">About&nbsp;Us</RouterLink>
        </nav>
      </div>

      <!-- Right actions -->
      <div class="actions" v-if="!applicationStore.isAuthenticated">
        <RouterLink to="/signin" class="btn outline">Log in</RouterLink>
        <RouterLink to="/signup" class="btn outline">Register</RouterLink>
      </div>

      <div class="actions" v-else>
        <!-- Notifications -->
        <button class="icon-btn" @click="toggleNotifications" aria-label="Notifications">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z" fill="currentColor"/>
          </svg>
          <span v-if="unreadCount>0" class="badge">{{ unreadCount }}</span>
        </button>

        <RouterLink to="/profile" class="btn outline">Profile</RouterLink>
        <RouterLink to="/logout"  class="btn outline">Logout</RouterLink>
      </div>
    </div>

    <!-- Notifications panel -->
    <div
      v-if="applicationStore.isAuthenticated && notifOpen"
      class="notif-overlay"
      @click.self="() => { closeNotifications(); markAllAsRead() }"
    >
      <aside class="notif-panel">
        <header class="notif-head">
          <h3>Notifications</h3>
          <div class="spacer"></div>
          <button class="mini ghost" :disabled="loading" @click="refreshNotifications">Refresh</button>
          <button class="mini" @click="() => { closeNotifications(); markAllAsRead() }">Close</button>
        </header>

        <div class="notif-body">
          <div v-if="loading" class="loading">Loading…</div>
          <div v-else-if="error" class="error">Failed to load notifications.</div>
          <ul v-else-if="notifications.length" class="notif-list">
            <li
              v-for="n in notifications"
              :key="n.id"
              class="notif-item"
              :class="{ unread: n.read === false }"
            >
              <RouterLink :to="notificationLink(n)" class="notif-link" @click="closeNotifications">
                <div class="row1">
                  <span class="type">{{ humanType(n.type) }}</span>
                  <time class="ago">{{ timeAgo(n.timestamp) }}</time>
                </div>
                <p class="msg" :title="n.message">{{ n.message || '—' }}</p>
              </RouterLink>
            </li>
          </ul>
          <div v-else class="empty">No notifications yet.</div>
        </div>
      </aside>
    </div>
  </header>
</template>
<style scoped>
/* Theme */
.pt-header{
  --brand-800:#0b2e55; --brand-700:#103c70; --brand-600:#164a8a; --brand-100:#e9f0fb;
  background:#fff; border-bottom:1px solid rgba(0,0,0,.06);
  box-shadow:0 6px 24px rgba(16,60,112,.06);
}
.pt-container{
  max-width:1240px; margin:0 auto; height:94px; padding:0 24px;
  display:flex; align-items:center;
}

/* Brand */
.brand{ display:inline-flex; align-items:center; gap:12px; text-decoration:none; }
.logo{ width:90px; height:90px; object-fit:contain; }
.wordmark{ font-size:24px; font-weight:900; letter-spacing:.3px; color:var(--brand-700); }

/* Nav */
.nav-area{ flex:1; display:flex; justify-content:center; }
.nav{ display:flex; align-items:center; gap:28px; }
.nav-link{
  color:var(--brand-700); text-decoration:none; font-size:19px; font-weight:800;
  padding:12px 18px; border-radius:12px; transition:background .15s ease, color .15s ease;
}
.nav-link:hover{ background:var(--brand-100); }
:deep(.router-link-exact-active.nav-link){ background:var(--brand-100); color:var(--brand-800); }

/* Actions */
.actions{ display:flex; align-items:center; gap:12px; margin-left:24px; }
.btn{
  display:inline-flex; align-items:center; justify-content:center;
  height:46px; padding:0 18px; border-radius:14px;
  font-size:16px; font-weight:800; letter-spacing:.2px; text-decoration:none;
  transition:background .15s, color .15s, border-color .15s, transform .12s;
}
.btn.outline{ color:var(--brand-700); background:#fff; border:2px solid var(--brand-600); }
.btn.outline:hover{ background:var(--brand-600); color:#fff; transform:translateY(-1px); }

/* Bell + badge */
.icon-btn{
  position:relative; width:46px; height:46px; border-radius:14px;
  border:2px solid var(--brand-600); background:#fff; color:var(--brand-700);
  display:inline-flex; align-items:center; justify-content:center;
  cursor:pointer; transition:background .15s, color .15s, transform .12s;
}
.icon-btn:hover{ background:var(--brand-600); color:#fff; transform:translateY(-1px); }
.badge{
  position:absolute; top:-6px; right:-6px;
  min-width:20px; height:20px; padding:0 6px;
  border-radius:12px; background:#164a8a; color:#fff; font-size:12px; font-weight:800;
  display:flex; align-items:center; justify-content:center; border:2px solid #fff;
}

/* Panel */
.notif-overlay{
  position:fixed; inset:0; background:rgba(0,0,0,.35);
  display:flex; justify-content:flex-end; z-index:80;
}
.notif-panel{
  width:min(520px, 92vw); height:100%; background:#fff;
  box-shadow: -12px 0 40px rgba(0,0,0,.18);
  display:flex; flex-direction:column; animation: slideIn .18s ease-out;
}
@keyframes slideIn { from{ transform: translateX(20px); opacity:0 } to{ transform:none; opacity:1 } }
.notif-head{
  display:flex; align-items:center; gap:8px;
  padding:12px 14px; background:#f2f6fd; border-bottom:1px solid rgba(0,0,0,.06);
  color:#103c70; font-weight:900;
}
.notif-head .spacer{ flex:1 }
.mini{
  height:34px; padding:0 12px; border-radius:10px; border:2px solid var(--brand-600);
  background:var(--brand-600); color:#fff; font-weight:800; cursor:pointer;
}
.mini.ghost{ background:#fff; color:var(--brand-700); }
.mini:disabled{ opacity:.6; cursor:not-allowed }

.notif-body{ padding:8px 10px 14px; overflow:auto; flex:1; }
.loading{ color:#164a8a; padding:8px; }
.error, .empty{ color:#475569; padding:8px; }

/* List */
.notif-list{ list-style:none; margin:0; padding:0; display:grid; gap:10px; }
.notif-item{
  border:1px solid rgba(0,0,0,.08);
  border-radius:12px; padding:10px 12px; background:#fff;
  box-shadow:0 8px 20px rgba(16,60,112,.05);
}
.notif-item.unread {
  background: #eaf1ff;              /* πιο έντονο γαλάζιο φόντο */
  border-color: #99b8f2;            /* πιο σκούρο μπλε περίγραμμα */
  box-shadow: 0 0 0 2px #99b8f2;    /* extra περίγραμμα γύρω γύρω */
}

.row1{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
.type{
  font-size:12px; font-weight:800; color:#0b2e55;
  background:#e9f0fb; padding:2px 8px; border-radius:999px;
}
.ago{ color:#6b7b91; font-size:12px; }
.msg{
  margin:6px 0 0; color:#0f1b2d; line-height:1.4;
  max-height:3.6em; overflow:hidden; text-overflow:ellipsis;
}
.notif-link { display:block; color:inherit; text-decoration:none; }
.notif-link:hover .msg { text-decoration: underline; }
</style>

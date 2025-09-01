<script setup>

import { onBeforeMount } from 'vue';

import { useApplicationStore } from '@/stores/application.js';
//import { RouterView } from 'vue-router';
import AppHeader from '@/components/AppHeader.vue';
//import AppFooter from '@/components/AppFooter.vue';


const {loadUserData} = useApplicationStore();

onBeforeMount(()=>{
  loadUserData();
});
</script>



<template>

    <AppHeader />

    <RouterView />

   <!--
  <AppFooter />
  -->

</template>

<style scoped></style>

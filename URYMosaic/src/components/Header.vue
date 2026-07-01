<template>

    <header class="bg-white p-4 flex justify-between items-center">
    <div class="flex items-center">
        <img :src="imagePath" alt="Logo" class="ml-20 w-40 h-14 mr-2">

    </div>
    <div class="flex items-center">

        <button class="hover:bg-slate-300 text-blue-600 font-semibold px-6 py-1 rounded-md flex items-center gap-1" @click="$emit('refresh')">
          <svg class="w-6 h-6 text-blue-800" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 18 20">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 1v5h-5M2 19v-5h5m10-4a8 8 0 0 1-14.947 3.97M1 10a8 8 0 0 1 14.947-3.97"/>
          </svg>
          <span>Refresh</span>
        </button>
    </div>
</header>


</template>

<script>

import uriMosaicImage from "@/assets/logos/mosaic.jpg";

export default {
  name: "Header",
  emits: ['refresh'],
  data() {
    return {
      imagePath: uriMosaicImage,
    };
  },
};
</script>
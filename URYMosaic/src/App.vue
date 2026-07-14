<template>
	<Header/>
 	<div class="bg-slate-300 min-h-screen"><KOT /></div>
</template>

<script>
import KOT from './components/kot.vue';
import Header from "./components/Header.vue";

export default {
	
	name: "app",
	components: {
		KOT,
		Header,
	},
};
</script>


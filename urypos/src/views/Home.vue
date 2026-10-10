<template>
  <div>
    <h1>{{ $t('home.title') }}</h1>
    <!-- Fetch the resource on click -->
    <button @click="$resources.ping.fetch()">{{ $t('home.ping') }}</button>
  </div>
</template>

<script>
export default {
  resources: {
    ping() {
      return {
        method: "frappe.ping", // Method to call on backend
        onSuccess(d) {
          alert(d);
        },
      };
    },
  },
};
</script>

<template>
  <div class="min-h-screen bg-card flex">
    <div class="mx-auto w-full max-w-sm lg:w-96">
      <form @submit.prevent="login" class="space-y-6">
        <label for="email"> {{ $t('login.username') }} </label>
        <input type="text" v-model="email" />
        <br />
        <label for="password"> {{ $t('login.password') }} </label>
        <input type="password" v-model="password" />

        <button
          class="bg-primary block text-primary-foreground p-2 hover:bg-primary"
          type="submit"
        >
          {{ $t('login.sign_in') }}
        </button>
      </form>
    </div>
  </div>
</template>
<script>
export default {
  data() {
    return {
      email: null,
      password: null,
    };
  },
  inject: ["$auth"],
  async mounted() {
    if (this.$route?.query?.route) {
      this.redirect_route = this.$route.query.route;
      this.$router.replace({ query: null });
    }
  },
  methods: {
    async login() {
      if (this.email && this.password) {
        let res = await this.$auth.login(this.email, this.password);
        if (res) {
          this.$router.push({ name: "Home" });
        }
      }
    },
  },
};
</script>

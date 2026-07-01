<template>
  <div class="flex items-center justify-center min-h-screen bg-slate-300">
    <div class="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
      <div class="text-center mb-6">
        <img
          v-if="!imageFailed"
          src="/assets/ury/images/mosaic.jpg"
          alt="URY Mosaic"
          class="w-20 h-20 mx-auto mb-4 rounded-lg"
          @error="imageFailed = true"
        />
        <h1 class="text-2xl font-bold text-gray-800">URY Kitchen Display</h1>
        <p class="text-gray-500 mt-1">Sign in to access the kitchen display</p>
      </div>

      <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-sm">
        {{ error }}
      </div>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
          <input
            v-model="username"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
            placeholder="Enter your username"
            required
            autocomplete="username"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            v-model="password"
            type="password"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
            placeholder="Enter your password"
            required
            autocomplete="current-password"
          />
        </div>
        <button
          type="submit"
          :disabled="isLoading"
          class="w-full py-2 px-4 bg-gray-800 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span v-if="isLoading">Signing in...</span>
          <span v-else>Sign In</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script>
export default {
  name: "Login",
  inject: ['authState'],
  data() {
    return {
      username: "",
      password: "",
      error: "",
      isLoading: false,
      imageFailed: false,
    };
  },
  methods: {
    async handleLogin() {
      this.isLoading = true;
      this.error = "";

      try {
        const res = await fetch("/api/method/login", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            usr: this.username,
            pwd: this.password,
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          this.error = text || `Server error (${res.status})`;
          return;
        }

        const data = await res.json();

        if (res.ok && (data.message === "Logged In" || data.home_page)) {
          // Update shared auth state so route guard works
          if (this.authState) {
            this.authState.isLoggedIn = true;
          }
          // Navigate to the intended route or home
          const redirectPath = this.$route.query.route || "/";
          this.$router.push(redirectPath);
        } else {
          this.error = data.message || "Login failed. Please try again.";
        }
      } catch (err) {
        this.error = "Network error. Please check your connection.";
      } finally {
        this.isLoading = false;
      }
    },
  },
};
</script>
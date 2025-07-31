<template>
  <div class="flex flex-col items-center justify-center">
    <!-- Main Container -->
    <div class="mt-20 w-full max-w-md">
      <!-- Logo Container -->

      <!-- Card Container -->
      <div class="rounded-lg bg-white px-6 py-8 shadow-md">
        <div class="mb-8 flex justify-center">
          <img
            :src="imagePath"
            alt="URY POS logo"
            class="h-8 w-auto sm:h-8 lg:h-8"
          />
        </div>

        <form class="space-y-6" @submit.prevent="this.auth.login">
          <!-- Email Input -->
          <div class="relative">
            <div class="absolute inset-y-0 left-0 flex items-center pl-3">
              <svg
                class="h-5 w-5 text-gray-400"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2.5 7.65149V15.0757C2.5 15.4374 2.64367 15.7842 2.8994 16.04C3.15513 16.2957 3.50198 16.4394 3.86364 16.4394H16.1364C16.498 16.4394 16.8449 16.2957 17.1006 16.04C17.3563 15.7842 17.5 15.4374 17.5 15.0757V7.65149"
                  stroke="currentColor"
                  stroke-miterlimit="10"
                  stroke-linecap="square"
                />
                <path
                  d="M17.5 7.57572V5.53026C17.5 5.1686 17.3563 4.82176 17.1006 4.56603C16.8449 4.31029 16.498 4.16663 16.1364 4.16663H3.86364C3.50198 4.16663 3.15513 4.31029 2.8994 4.56603C2.64367 4.82176 2.5 5.1686 2.5 5.53026V7.57572L10 10.8333L17.5 7.57572Z"
                  stroke="currentColor"
                  stroke-miterlimit="10"
                  stroke-linecap="square"
                />
              </svg>
            </div>
            <input
              name="user_id"
              v-model="this.auth.userId"
              required
              class="block w-full rounded-md border border-gray-200 py-3 pl-10 text-sm placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
              placeholder="jane@example.com"
            />
          </div>

          <!-- Password Input -->
          <div class="relative">
            <div class="absolute inset-y-0 left-0 flex items-center pl-3">
              <svg
                class="field-icon password-icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M10.0961 1.93768H10.0264C8.94806 1.92763 7.90976 2.34591 7.13951 3.10075C6.36866 3.85619 5.9294 4.88687 5.91833 5.96612L5.91831 5.96612V5.97124V6.52695H4.3125C3.20793 6.52695 2.3125 7.42238 2.3125 8.52695V16.0165C2.3125 17.121 3.20793 18.0165 4.3125 18.0165H15.7356C16.8401 18.0165 17.7356 17.121 17.7356 16.0165V8.52695C17.7356 7.42238 16.8401 6.52695 15.7356 6.52695H14.1297V6.04576C14.1397 4.96742 13.7214 3.92913 12.9666 3.15888C12.2112 2.38803 11.1805 1.94877 10.1012 1.9377V1.93768H10.0961ZM13.1297 6.52695V6.04336V6.03838H13.1297C13.1378 5.22428 12.8222 4.44029 12.2524 3.85881C11.6831 3.27793 10.9067 2.94667 10.0934 2.93768H10.024H10.019V2.93765C9.20491 2.92955 8.42092 3.24512 7.83944 3.81497C7.25856 4.38423 6.9273 5.1607 6.91831 5.9739V6.52695H13.1297ZM4.3125 7.52695C3.76022 7.52695 3.3125 7.97467 3.3125 8.52695V16.0165C3.3125 16.5687 3.76022 17.0165 4.3125 17.0165H15.7356C16.2879 17.0165 16.7356 16.5687 16.7356 16.0165V8.52695C16.7356 7.97467 16.2879 7.52695 15.7356 7.52695H4.3125ZM10.0242 13.2384C10.5581 13.2384 10.9909 12.8056 10.9909 12.2717C10.9909 11.7377 10.5581 11.3049 10.0242 11.3049C9.49023 11.3049 9.05738 11.7377 9.05738 12.2717C9.05738 12.8056 9.49023 13.2384 10.0242 13.2384ZM11.9909 12.2717C11.9909 13.3579 11.1104 14.2384 10.0242 14.2384C8.93794 14.2384 8.05738 13.3579 8.05738 12.2717C8.05738 11.1854 8.93794 10.3049 10.0242 10.3049C11.1104 10.3049 11.9909 11.1854 11.9909 12.2717Z"
                  fill="#74808B"
                ></path>
              </svg>
            </div>
            <input
              :type="this.auth.showPassword ? 'text' : 'password'"
              name="currentPassword"
              v-model="this.auth.currentPassword"
              required
              class="block w-full rounded-md border border-gray-200 py-3 pl-10 pr-16 text-sm placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500"
              placeholder="•••••"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 flex items-center pr-3"
              @click="this.auth.showPassword = !this.auth.showPassword"
            >
              <span class="text-sm text-gray-400">
                {{ this.auth.showPassword ? "Hide" : "Show" }}
              </span>
            </button>
          </div>

          <!-- Login Button -->
          <button
            type="submit"
            class="flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
import { useAuthStore } from "@/stores/Auth.js";
import uriPosImage from "@/assets/logos/URY_POS.jpg";

export default {
  setup() {
    const auth = useAuthStore();
    return { auth };
  },
  data() {
    return {
      imagePath: uriPosImage,
    };
  },
};
</script>

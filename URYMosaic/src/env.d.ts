export {};

interface UryAuthState {
  isLoggedIn: boolean;
}

declare global {
  interface Window {
    __uryAuthState?: UryAuthState;
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
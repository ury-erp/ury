interface UryAuthState {
  isLoggedIn: boolean;
}

interface Window {
  __uryAuthState: UryAuthState;
}
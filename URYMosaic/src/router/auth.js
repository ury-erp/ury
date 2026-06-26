export default [
        {
                path: '/login',
                name: 'Login',
                component: () =>
                        import('../views/Login.vue'),
                meta: {
                        isLoginPage: true
                }
        }
]

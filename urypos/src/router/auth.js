export default [
    {
		path: '/login',
		name: 'Login',
		component: () =>
			import(/* webpackChunkName: "login" */ '../components/Login.vue'),
		meta: {
			isLoginPage: true
		},
		props: true
	}
]

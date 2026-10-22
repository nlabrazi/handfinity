import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes: [
		{
			path: "/",
			name: "home",
			component: () => import("./views/HomeView.vue"),
			meta: { title: "Handfinity — Entrez dans le mouvement" },
		},
		{
			path: "/paint",
			name: "paint",
			component: () => import("paint/view"),
			meta: { title: "Paint — Handfinity" },
		},
		{
			path: "/playground",
			name: "playground",
			component: () => import("playground/view"),
			meta: { title: "Playground — Handfinity" },
		},
		{
			path: "/:pathMatch(.*)*",
			name: "not-found",
			component: () => import("./views/NotFoundView.vue"),
			meta: { title: "Espace introuvable — Handfinity" },
		},
	],
	scrollBehavior(_to, _from, savedPosition) {
		return savedPosition ?? { top: 0 };
	},
});

router.afterEach((to) => {
	document.title = String(to.meta.title);
});

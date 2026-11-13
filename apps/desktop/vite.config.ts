import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
	root: import.meta.dirname,
	base: "/",
	publicDir: false,
	plugins: [vue(), tailwindcss()],
	build: {
		outDir: "dist/renderer",
	},
});

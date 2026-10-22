import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
	publicDir: "../../public",
	plugins: [vue(), tailwindcss()],
	server: {
		host: "0.0.0.0",
		port: 3002,
		strictPort: true,
		watch: {
			usePolling: true,
		},
	},
});

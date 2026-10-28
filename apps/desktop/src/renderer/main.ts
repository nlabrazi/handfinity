import { createApp } from "vue";
import App from "./App.vue";
import OverlayView from "./OverlayView.vue";
import "./style.css";

const isOverlay =
	window.location.hash === "#overlay" ||
	window.location.search.includes("view=overlay");

createApp(isOverlay ? OverlayView : App).mount("#app");

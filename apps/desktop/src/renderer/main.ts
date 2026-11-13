import { createApp } from "vue";
import App from "./App.vue";
import HudView from "./HudView.vue";
import OverlayView from "./OverlayView.vue";
import "./style.css";

const url = new URL(window.location.href);
const view =
	url.searchParams.get("view") || window.location.hash.replace("#", "");

let rootComponent = App;
if (view === "hud") {
	rootComponent = HudView;
} else if (view === "overlay" || view === "keyboard") {
	rootComponent = OverlayView;
}

createApp(rootComponent).mount("#app");

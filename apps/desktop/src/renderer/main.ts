import Playground from "playground/view";
import { createApp } from "vue";
import "./style.css";

createApp(Playground, {
	trackingOptions: { scheduling: "timer" },
}).mount("#app");

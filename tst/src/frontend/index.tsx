import { Theme } from "@tolokoban/ui";
import { createRoot } from "react-dom/client";
import App from "./app";

Theme.apply({
	colors: {
		neutral: ["000", "#444"],
		primary: ["#09f"],
		secondary: ["#f90"],
	},
});
const root = document.getElementById("root");
if (!root) throw Error('Missing element with id "root"!');

createRoot(root).render(<App />);

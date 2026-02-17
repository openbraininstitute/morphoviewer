import { Theme } from "@tolokoban/ui";
import { createRoot } from "react-dom/client";
import App from "./app";

function start() {
    const root = document.getElementById("root");
    if (!root) throw Error(`Missing element with id "root"!`);

    Theme.apply({
        colors: {
            neutral: ["#999", "#fff"],
            primary: ["rgb(0, 101, 135)", "#9cd"],
        },
    });
    createRoot(root).render(<App />);
    window.setTimeout(removeSplash, 500);
}

const SPLASH_SCREEN_VANISHING_TIME_MS = 600;

function removeSplash() {
    const splash = document.getElementById("splash");
    if (splash) {
        splash.classList.add("vanish");
        window.setTimeout(
            () => document.body.removeChild(splash),
            SPLASH_SCREEN_VANISHING_TIME_MS,
        );
    }
}

void start();

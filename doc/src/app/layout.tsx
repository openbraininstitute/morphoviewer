import Styles from "./layout.module.css";

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className={Styles.main}>
            <header>
                <a href="#/morpho-viewer-simul">&lt;MorphoViewerSimul /&gt;</a>
                <a href="#/morphology">Morphology</a>
                <a href="#/">API Documentation</a>
            </header>
            <main>{children}</main>
        </div>
    );
}

import styles from "./page.module.css";

export default function Page() {
	return <iframe src="./docs/index.html" className={styles.page}></iframe>;
}

import { version } from "@bbp/morphoviewer";
import { IconMenu, ViewStrip } from "@tolokoban/ui";

import Styles from "./layout.module.css";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<ViewStrip
			orientation="row"
			template="*1"
			position="absolute"
			fullsize
			className={Styles.main}
		>
			<nav>
				<a href="#/">
					<IconMenu />
				</a>
				<span className={Styles.version}>@bbp/morphoviewer v{version}</span>
			</nav>
			<main>{children}</main>
		</ViewStrip>
	);
}

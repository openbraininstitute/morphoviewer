import { ViewPanel } from "@tolokoban/ui";

import ApiURL from "./api.webp";
import MorphologyURL from "./morphology.webp";
import OctreeURL from "./octree.webp";
import styles from "./page.module.css";
import SimulURL from "./simul.webp";
import SmallCircuitURL from "./small-circuit.webp";

export default function Page() {
	return (
		<ViewPanel
			className={styles.page}
			fullwidth
			position="absolute"
			display="flex"
			justifyContent="center"
			alignItems="start"
			gap="L"
			color="neutral-5"
			fullsize
		>
			<Button href="#/morpho-viewer-simul" image={SimulURL}>
				MorphoViewerSimul
			</Button>
			<Button href="#/morpho-viewer-small-circuit" image={SmallCircuitURL}>
				MorphoViewerSmallCircuit
			</Button>
			<Button href="#/morpho-viewer-octree" image={OctreeURL}>
				MorphoViewerOctree
			</Button>
			<Button href="#/morphology" image={MorphologyURL}>
				Morphology
			</Button>
			<Button href="#/api" image={ApiURL}>
				API Documentation
			</Button>
		</ViewPanel>
	);
}

interface ButtonProps {
	href: string;
	image: string;
	children: React.ReactNode;
}

function Button({ href, image, children }: ButtonProps) {
	return (
		<a href={href} style={{ background: `url(${image})` }}>
			<div>{children}</div>
		</a>
	);
}

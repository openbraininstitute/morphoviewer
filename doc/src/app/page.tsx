import { ViewPanel } from "@tolokoban/ui";

export default function Page() {
	return (
		<ViewPanel
			fullwidth
			position="absolute"
			display="flex"
			justifyContent="center"
			alignItems="center"
			gap="L"
			color="neutral-5"
		>
			<a href="#/morpho-viewer-simul">
				<Comp name="MorphoViewerSimul" />
			</a>
			<a href="#/morpho-viewer-small-circuit">
				<Comp name="MorphoViewerSmallCircuit" />
			</a>
			<a href="./docs/index.html">API Documentation</a>
		</ViewPanel>
	);
}

function Comp({
	name,
	attributes = {},
}: {
	name: string;
	attributes?: Record<string, string>;
}) {
	const keys = Object.keys(attributes);
	return (
		<div>
			<code>
				&lt;<strong>{name}</strong> /&gt;
			</code>
		</div>
	);
}

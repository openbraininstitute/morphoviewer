export function morphoViewerOctreeBlockToId(
	x: number,
	y: number,
	z: number,
	level: number,
): string {
	if (level < 1) return "0";

	return `${toBin(x, level)}${toBin(y, level)}${toBin(z, level)}`;
}

function toBin(value: number, level: number): string {
	return value.toString(2).padStart(level, "0");
}

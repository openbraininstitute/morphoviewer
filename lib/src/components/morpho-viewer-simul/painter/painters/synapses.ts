import {
	type TgdContext,
	TgdPainterGroup,
	TgdPainterPointsCloud,
	TgdTexture2D,
	tgdCanvasCreateFill,
} from "@tolokoban/tgd";

export class PainterSynapses extends TgdPainterGroup {
    private readonly textures: TgdTexture2D[]=[]

	constructor(
		context: TgdContext,
		synapses: Array<{ color: string; data: Float32Array }>,
	) {
		super();
		for (const { color, data: dataPoint } of synapses) {
        const texture=new TgdTexture2D(context).loadBitmap(
					tgdCanvasCreateFill(1, 1, color),
				)
                this.textures.push(texture)
			const cloud = new TgdPainterPointsCloud(context, {
				name: `TgdPainterPointsCloud[${color}]`,
				dataPoint,
				minSizeInPixels: 4,
				radiusMultiplier: 5,
				texture,
			});
			this.add(cloud);
		}
	}

	delete(): void {
		super.delete();
        this.textures.forEach(texture =>texture.delete())
	}
}

import FS from "node:fs"
import Path from "node:path"
import * as Rspack from "@rspack/core"
import { CleanWebpackPlugin } from "clean-webpack-plugin"
import highlightJs from "highlight.js"
import rehypeHighlight from "rehype-highlight"
import rehypeHighlightCodeLines from "rehype-highlight-code-lines"
import remarkEmoji from "remark-emoji"
import remarkGfm from "remark-gfm"
import remarkImages from "remark-images"
import WebpackShellPluginNext from "webpack-shell-plugin-next"
import Package from "./package.json" with { type: "json" }

const __dirname = Path.dirname(new URL(import.meta.url).pathname)

if (typeof Package.port !== "number") {
	// Define a random port number for dev server.
	Package.port = 1204 + Math.floor(Math.random() * (0xffff - 1024))
	FS.writeFileSync(
		Path.resolve(__dirname, "package.json"),
		JSON.stringify(Package, null, "    "),
	)
	console.log("A random port has been set for dev server:", Package.port)
}

/**
 *
 * @param {Record<string, string | undefined>} env
 * @param {Record<string, unknown>} argv
 * @returns {Rspack.Configuration}
 */
export default function (env, argv) {
	const isProdMode = process.env.NODE_ENV === "production"

	return {
		cache: false,
		lazyCompilation: false,
		output: {
			filename: "scr/[name].[contenthash].js",
			path: Path.resolve(__dirname, "build"),
			devtoolModuleFilenameTemplate: "[absolute-resource-path]",
		},
		watchOptions: {
			aggregateTimeout: 600,
		},
		entry: {
			app: "./src/index.tsx",
		},
		target: "web",
		resolve: {
			extensions: [".tsx", ".ts", ".js", ".jsx", ".wasm"],
			enforceExtension: false,
			alias: {
				"@": Path.resolve(__dirname, "src/"),
			},
		},
		devtool: isProdMode ? false : "inline-source-map",
		devServer: {
			compress: true,
			historyApiFallback: true,
			static: {
				directory: Path.resolve(__dirname, "./public"),
			},
			client: {
				logging: "none",
				overlay: { errors: false, warnings: false },
				progress: true,
			},
			hot: true,
			open: true,
			host: "0.0.0.0",
			port: env.PORT ? Number.parseInt(env.PORT, 10) : Package.port,
			server: "http",
		},
		stats: {
			children: true,
			colors: true,
			errorDetails: false,
		},
		plugins: [
			new Rspack.ProgressPlugin(),
			new WebpackShellPluginNext({
				onBeforeCompile: {
					scripts: ["npm run generate"],
					blocking: true,
					parallel: false,
				},
			}),
			new CleanWebpackPlugin({
				cleanStaleWebpackAssets: false,
			}),
			new Rspack.CopyRspackPlugin({
				patterns: [
					{
						from: "public/*",
						context: Path.resolve(__dirname, "public"),
						globOptions: {
							ignore: ["index.html"],
						},
					},
				],
			}),
			new Rspack.HtmlRspackPlugin({
				template: "public/index.html",
				filename: "index.html",
				templateParameters: {
					version: Package.version,
					title: "Tolokoban",
				},
				minify: isProdMode,
			}),
			new Rspack.CssExtractRspackPlugin(),
		],
		performance: {
			hints: "warning",
			maxAssetSize: 300000,
			maxEntrypointSize: 200000,
			assetFilter: (filename) => {
				if (filename.endsWith(".png")) return false
				if (filename.endsWith(".map")) return false
				return true
			},
		},
		optimization: {
			splitChunks: {
				chunks: "all",
				cacheGroups: {
					defaultVendors: {
						test: /[\\/]node_modules[\\/]/,
						priority: -10,
						reuseExistingChunk: true,
					},
					default: {
						minChunks: 2,
						priority: -20,
						reuseExistingChunk: true,
					},
				},
			},
			moduleIds: "deterministic",
		},
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					use: [
						{
							loader: "ts-loader",
							options: {
								transpileOnly: false,
							},
						},
					],
					exclude: /node_modules/,
				},
				{
					test: /\.(png|jpe?g|gif|webp|avif|svg)$/i,
					type: "asset",
					generator: {
						filename: "img/[name].[hash][ext][query]",
					},
				},
				{
					test: /\.(bin|glb|dat|swc)$/i,
					type: "asset",
					generator: {
						filename: "bin/[name].[hash][ext][query]",
					},
				},
				{
					test: /\.(eot|ttf|woff|woff2)$/i,
					type: "asset/resource",
					generator: {
						filename: "fnt/[name].[hash][ext][query]",
					},
				},
				{
					test: /\.(vert|frag|obj)$/i,
					type: "asset/source",
				},
				{
					test: /\.(py|txt|sh|md)$/i,
					// More information here https://webpack.js.org/guides/asset-modules/
					type: "asset/source",
				},
				{
					test: /\.css$/,
					use: [
						{
							loader: Rspack.CssExtractRspackPlugin.loader,
							options: {},
						},
						{
							loader: "css-loader",
							options: {
								modules: {
									auto: true,
									namedExport: false,
									localIdentName: isProdMode
										? "[hash:base64]"
										: "[path][name]_[local]_[hash:base64:6]",
								},
							},
						},
					],
				},
				{
					test: /\.mdx?$/,
					use: [
						{ loader: "builtin:swc-loader", options: {} },
						{
							loader: "@mdx-js/loader",
							options: {
								rehypePlugins: [
									[
										rehypeHighlight,
										{
											languages: {
												ts: () => highlightJs.getLanguage("ts"),
												glsl: () => highlightJs.getLanguage("glsl"),
											},
										},
									],
									rehypeHighlightCodeLines,
								],
								remarkPlugins: [remarkImages, remarkEmoji, remarkGfm],
								providerImportSource: "@mdx-js/react",
							},
						},
					],
				},
			],
		},
	}
}

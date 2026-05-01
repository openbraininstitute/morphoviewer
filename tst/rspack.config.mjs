import * as Rspack from "@rspack/core"

import { execSync } from "node:child_process"
import Path from "node:path"

const __dirname = Path.dirname(new URL(import.meta.url).pathname)

/**
 * @param {Record<string, string | undefined>} env
 * @param {Record<string, unknown>} argv
 * @returns {Rspack.Configuration}
 */
export default function (env, argv) {
    const isProdMode = process.env.NODE_ENV === "production"

    return {
        entry: "./src/frontend/index.tsx",
        output: {
            path: Path.resolve(__dirname, "src/frontend/dist"),
            filename: "[name].[contenthash].js",
        },
        resolve: {
            extensions: [".tsx", ".ts", ".js", ".jsx"],
        },
        devtool: isProdMode ? false : "inline-source-map",
        devServer: {
            port: 14920,
            historyApiFallback: true,
            hot: true,
        },
        plugins: [
            {
                apply(compiler) {
                    compiler.hooks.beforeCompile.tap("BuildRoutes", () => {
                        execSync("npm run routes", { stdio: "inherit" })
                    })
                },
            },
            new Rspack.HtmlRspackPlugin({
                template: "./public/index.html",
            }),
            new Rspack.CssExtractRspackPlugin(),
        ],
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: [{ loader: "ts-loader", options: { transpileOnly: true } }],
                    exclude: /node_modules/,
                },
                {
                    test: /\.css$/,
                    use: [
                        { loader: Rspack.CssExtractRspackPlugin.loader },
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
                    test: /\.(png|jpe?g|gif|webp|avif|svg|mp4|webm)$/i,
                    type: "asset",
                    generator: {
                        filename: "img/[name].[hash][ext][query]",
                    },
                },
                {
                    test: /\.(bin|glb|dat|swc|zip)$/i,
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
            ],
        },
    }
}

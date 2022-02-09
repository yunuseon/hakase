const path = require('path');

const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const srcPath = path.resolve('.', 'src');
const distPath = path.resolve('.', 'dist');

module.exports = {
    entry: path.resolve(srcPath, 'main.ts'),
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.css$/i,
                use: [MiniCssExtractPlugin.loader, 'css-loader'],
            },
            {
                test: /\.(png|svg|jpg|jpeg|gif)$/i,
                type: 'asset/resource',
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
        filename: 'main.js',
        path: distPath,
        assetModuleFilename: 'assets/[name][ext][query]',
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: '[name].css',
        }),
        new HtmlWebpackPlugin({
            title: 'RxJS Easing Animate',
            template: path.resolve(srcPath, 'index.html'),
            filename: path.resolve(distPath, 'index.html'),
            hash: true,
        }),
    ],
};

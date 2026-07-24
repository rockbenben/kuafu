import { defineConfig } from 'vite';
// base 必须保持相对：同一份 gh-pages 产物既由 EdgeOne 挂在根域
// (kuafu.newzone.top)，也被 GitHub Pages 挂在子路径 (rockbenben.github.io/kuafu/)，
// 绝对路径会让后者整站 404。
// 预渲染出的子目录页（/en/ 等）由 scripts/prerender.mjs 把 './' 改写成 '../'，
// 这样任何部署前缀下都成立。
export default defineConfig({ base: './', build: { target: 'es2022' } });

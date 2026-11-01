# 第三方内容与许可范围

根目录 MIT 许可证适用于本项目原创代码和原创开发文档，不替代以下独立许可，也不授权第三方商标。分发构建产物时应保留相关依赖的版权和许可证。

| 内容 | 许可与来源 |
| --- | --- |
| React / React DOM | MIT，https://github.com/facebook/react |
| Vite / TypeScript / OpenCC-JS | 各自上游许可，安装包内保留完整 LICENSE；https://github.com/vitejs/vite / https://github.com/microsoft/TypeScript / https://github.com/nk2028/opencc-js |
| Three.js、React Three Fiber / Drei | MIT，依赖安装包内 LICENSE；历史3D组件保留兼容源码，不发布旧模型查看器 |
| Lucide 图标 | ISC，https://github.com/lucide-icons/lucide |
| react-markdown / remark-gfm | MIT，各自依赖包 LICENSE |
| Noto Serif SC 字体 | SIL OFL 1.1，`@fontsource/noto-serif-sc` 包内 LICENSE；https://github.com/notofonts/noto-cjk |
| Google Sans 字体子集 | SIL OFL 1.1，仓库内 `src/assets/fonts/google-sans/OFL.txt` 及同目录来源说明 |
| pypdf（Python PDF解析） | BSD-3-Clause，https://github.com/py-pdf/pypdf/blob/main/LICENSE |
| ReportLab（仅测试生成PDF） | BSD，安装包内 LICENSE；https://hg.reportlab.com/hg-public/reportlab/file/tip/LICENSE.txt |

完整依赖版本和传递依赖由 `package-lock.json` 记录。原始许可正文以对应版本安装包为准。本清单不是对每项历史采集许可的独立法律核验结论。

已移除未核许可的隔离语料、原始网页快照和旧3D查看器；默认PDF解析不再依赖 PyMuPDF。旧本地维护环境可能仍装有 PyMuPDF，但不是公开项目的运行或测试依赖。

本次安装版本中可取得的完整依赖许可正文已汇总在 `THIRD_PARTY_LICENSES.txt`，分发运行包时一并保留。

团队 RAG 知识库及其衍生数据不在开源范围，也不包含在本仓库中。

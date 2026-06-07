<div align="center">

# PDF 工具箱

**纯前端、本地处理的 PDF 合并、拆分与批量水印工具**

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)
![PDF--Lib](https://img.shields.io/badge/PDF--Lib-1.17.1-ef4444)
![PDF.js](https://img.shields.io/badge/PDF.js-3.11.174-f59e0b)
![JSZip](https://img.shields.io/badge/JSZip-3.10.1-10b981)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare%20Pages-Ready-F38020?logo=cloudflare&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

</div>

---

PDF 工具箱是一个无需后端服务的静态 Web 应用，用于在浏览器本地完成 PDF 合并、拆分和批量添加文字/图片水印。所有 PDF 文件都在用户本机浏览器中处理，不会上传到服务器。

## 功能特性

### PDF 合并

- 支持一次上传多个 PDF 文件。
- 按上传顺序合并为一个 PDF。
- 显示文件大小与页数信息。
- 输出文件不会覆盖原文件。

### PDF 拆分

- 支持自定义页面范围，例如：`1-3, 5, 7-9`。
- 自动读取并显示 PDF 总页数。
- 下载拆分后的新 PDF 文件。

### 批量水印

- 支持批量上传多个 PDF，并统一打包为 ZIP 下载。
- 支持多个水印配置叠加。
- 支持文字水印和图片水印。
- 支持水印配置自动保存，下次打开自动恢复。
- 支持自定义常用文字预设，预设会保存在浏览器本地。
- 支持常用颜色块快速选择。
- 支持字体选择：系统默认/微软雅黑、宋体、楷体、仿宋、华文中宋、黑体。
- 支持加粗、倾斜、字号、颜色、透明度、旋转角度、缩放比例。
- 支持九宫格位置与自定义位置。
- 支持单次、固定重复、铺满三种重复模式。
- 支持按页码添加水印。
- 支持按单个文件配置使用哪些水印、应用到哪些页面。
- 支持一键清空上传文件，水印配置保留。
- 支持一键清空水印配置，上传文件保留。

### 页码规则说明

批量处理多个 PDF 时，不同文件页数可能不同。本工具采用以下规则：

- 水印配置里的页码按钮会按已上传 PDF 中的最大页数展示。
- 具体处理每个 PDF 时，会按该文件自己的实际页数过滤。
- 超出当前 PDF 页数的页码会自动跳过，不会导致整个批处理失败。

例如：如果上传了一个 5 页 PDF 和一个 12 页 PDF，水印页码会展示到 12 页；如果选择第 10 页，则 5 页 PDF 会跳过该页码，12 页 PDF 会正常添加水印。

## 隐私与安全

本项目是纯前端静态应用：

- PDF 文件不会上传到服务器。
- 文件合并、拆分、水印处理都在浏览器本地完成。
- 水印配置和文字预设保存在浏览器 `localStorage` 中。
- 部署到 Cloudflare Pages 后，Cloudflare 只负责托管静态文件，不参与处理用户 PDF 内容。

请注意：浏览器本地处理大文件会消耗较多内存，建议单个 PDF 文件控制在合理大小内。

## 在线部署

本项目可以部署到任意静态网站托管平台，包括：

- Cloudflare Pages
- GitHub Pages
- Netlify
- Vercel
- Gitee Pages
- 任意静态文件服务器

### Cloudflare Pages 部署配置

当前项目无构建步骤，Cloudflare Pages 可按静态站点部署：

```text
Framework preset: None
Build command: 留空
Build output directory: .
Root directory: /
```

需要上传或部署的核心文件：

```text
index.html
styles.css
app.js
vendor/
```

## 本地运行

### 方式一：直接打开

可以直接在浏览器中打开：

```text
index.html
```

### 方式二：启动本地静态服务

推荐使用本地 HTTP 服务，避免浏览器对本地文件访问的限制：

```bash
python -m http.server 8010
```

然后访问：

```text
http://localhost:8010
```

如果 `8010` 端口被占用，可以换成其他端口。

## 使用方法

1. 打开页面。
2. 从左侧选择功能：
   - 合并 PDF
   - 拆分 PDF
   - 添加水印
3. 上传 PDF 文件。
4. 根据功能配置参数。
5. 点击处理按钮并下载结果。

### 添加水印流程

1. 进入“添加水印”。
2. 上传一个或多个 PDF。
3. 点击“添加水印”创建水印配置。
4. 设置文字、字体、颜色、透明度、位置、重复方式和页码。
5. 如需针对单个 PDF 单独设置页面，点击文件右侧“配置”。
6. 点击“批量处理并下载 ZIP”。

## 技术栈

| 技术 | 说明 |
| --- | --- |
| HTML5 | 页面结构 |
| CSS3 | 界面样式与响应式布局 |
| JavaScript ES6+ | 业务逻辑与浏览器端处理 |
| PDF-Lib | PDF 合并、拆分、水印写入 |
| PDF.js | PDF 页数读取与受限 PDF 的页面渲染兜底 |
| JSZip | 批量水印结果打包下载 |
| localStorage | 水印配置与文字预设持久化 |

第三方依赖已本地化到 `vendor/`，部署后无需依赖外部 CDN。

## 项目结构

```text
pdf-tool/
├── index.html                 # 应用入口页面
├── styles.css                 # 全局样式与水印配置界面样式
├── app.js                     # PDF 处理逻辑与交互逻辑
├── vendor/                    # 本地化第三方依赖
│   ├── pdf-lib.min.js
│   ├── jszip.min.js
│   ├── pdf.min.js
│   └── pdf.worker.min.js
├── README.md                  # 项目说明文档
├── TECHNICAL.md               # 技术说明文档
├── test.html                  # 测试页面
└── .gitignore
```

## 受保护 PDF 说明

本工具仅用于处理你有权访问和编辑的 PDF。

对于部分可打开但禁止编辑的 PDF，工具会尝试使用页面图片化方式添加水印。此类输出可能导致：

- 原文本不可再选择。
- 原链接、表单等高级 PDF 能力不可继续使用。
- 输出体积可能增加。

如果 PDF 需要打开密码，或使用了浏览器端库不支持的加密方式，请先使用你有权限的工具解除密码保护后再处理。

## 常见问题

### 文件会上传到服务器吗？

不会。所有处理都在浏览器本地完成。

### 为什么大文件处理比较慢？

PDF 解析、页面渲染、图片化兜底和 ZIP 打包都会占用浏览器内存与 CPU。大文件或大量文件处理时需要等待更久。

### 为什么某些 PDF 加水印后文字不能选中了？

对于部分受限 PDF，工具会使用页面图片化方式兜底处理。图片化后原 PDF 文本和链接可能不可再选择或使用。

### 水印配置为什么刷新后还在？

水印配置会保存在浏览器 `localStorage` 中。如果你清理浏览器数据，配置也会被清除。

### 可以部署到 Cloudflare Pages 吗？

可以。本项目是静态站点，不需要后端和构建步骤，适合部署到 Cloudflare Pages。

## 许可证

MIT License

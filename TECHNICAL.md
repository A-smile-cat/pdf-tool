# 受权限限制 PDF 水印处理技术说明

本文档说明本项目如何在纯前端环境中为普通 PDF、受权限限制 PDF 添加水印，以及批量处理时如何给出逐文件结果。

## 背景

PDF 可能存在不同类型的保护：

1. **普通 PDF**：可以直接读取、修改、保存。
2. **用户密码 PDF**：打开文件时需要密码，没有密码无法读取页面内容。
3. **所有者权限限制 PDF**：可以打开查看，但禁止编辑、复制、填表、签名或注释。

用户反馈的文件属于第三类：PDF 可以正常打开查看，但权限里禁止“编辑文件内容”。这类文件用 `pdf-lib` 直接修改时可能失败，或者保存成功但水印不可见。因此项目实现了两级处理策略：

- 优先直接修改 PDF。
- 直接修改不可靠时，使用 PDF.js 将页面渲染为图片，再重新生成 PDF 并添加水印。

## 处理流程

批量添加水印时，每个文件独立处理，互不影响。

```text
上传 PDF 文件
  ↓
逐个处理文件
  ↓
尝试直接使用 pdf-lib 加水印
  ↓ 成功
加入 ZIP，保留原文件名
  ↓ 失败或检测到权限限制
使用 PDF.js 渲染页面为图片
  ↓
重新创建 PDF，并把页面图片作为背景
  ↓
复用同一套水印配置绘制水印
  ↓ 成功
加入 ZIP，保留原文件名，并标记为“降级处理”
  ↓ 仍失败
跳过该文件，不加入 ZIP，并在结果中显示原因
```

## 直接处理策略

直接处理使用 `pdf-lib`：

```js
PDFDocument.load(arrayBuffer)
PDFDocument.load(arrayBuffer, { password: '' })
PDFDocument.load(arrayBuffer, { ignoreEncryption: true })
```

加载成功后，代码直接遍历页面：

```js
const pages = pdfDoc.getPages();
await applyWatermarkToPage(page, config, pdfDoc);
```

然后保存：

```js
pdfDoc.save({ useObjectStreams: false, addDefaultPage: false });
```

如果 PDF 是通过 `ignoreEncryption: true` 加载的，说明它带有权限限制。为了避免“看似处理成功但水印不可见”，项目会转入更稳定的图片化兜底流程。

## 图片化兜底策略

图片化兜底使用 PDF.js 渲染页面，再用 PDF-Lib 重新生成 PDF。

核心思路：

1. 使用 PDF.js 打开 PDF：

```js
const pdfJsDoc = await pdfjsLib.getDocument({ data }).promise;
```

2. 将每一页渲染到 canvas：

```js
const page = await pdfJsDoc.getPage(pageNumber);
const viewport = page.getViewport({ scale: 2 });
await page.render({ canvasContext, viewport }).promise;
```

3. 将 canvas 转为图片：

```js
const imageDataUrl = canvas.toDataURL('image/jpeg', 0.92);
```

4. 创建新 PDF，并把图片画到页面背景：

```js
const newPdf = await PDFDocument.create();
const pdfPage = newPdf.addPage([pageWidth, pageHeight]);
pdfPage.drawImage(background, { x: 0, y: 0, width: pageWidth, height: pageHeight });
```

5. 复用普通水印绘制逻辑：

```js
await applyWatermarkToPage(pdfPage, config, newPdf);
```

## 图片化兜底的优缺点

### 优点

- 对“能打开查看但禁止编辑”的 PDF 成功率更高。
- 不需要后端服务。
- 可以保留当前纯前端隐私模型。
- 批量处理时失败文件不会影响其它文件。

### 缺点

- 输出 PDF 页面会被扁平化为图片。
- 原文字可能无法再选择或复制。
- 链接、书签、表单、批注等高级结构可能丢失。
- 输出文件体积可能变大。

因此结果界面会把这类文件标记为“降级处理”。

## 批量结果报告

批量处理完成后，结果区会显示逐文件状态：

- `✅ 已加入 ZIP · 直接处理`
- `⚠️ 已加入 ZIP（降级处理） · 页面图片化处理`
- `❌ 未加入 ZIP · 失败原因`

这样用户可以明确知道：

- 哪些文件成功加了水印。
- 哪些文件使用了图片化兜底。
- 哪些文件没有加入 ZIP。
- 每个失败文件的原因。

## 文件名策略

成功处理的文件加入 ZIP 时保持原文件名不变：

```text
原文件：合同.pdf
ZIP 内：合同.pdf
```

如果多个文件重名，浏览器/ZIP 工具可能显示重复项或覆盖显示；实际业务中建议上传前保证文件名唯一。

## 真正需要打开密码的 PDF

如果 PDF 打开时需要用户密码，并且没有提供密码，前端无法可靠读取页面内容。此时：

- 直接处理会失败。
- PDF.js 也可能失败。
- 文件会被跳过，不加入 ZIP。
- 结果区会显示失败原因。

后续如果要支持这类文件，可以增加“输入 PDF 密码”功能：用户明确输入密码后，再尝试 `PDFDocument.load(arrayBuffer, { password })` 和 PDF.js 密码加载。

## 关键文件

- `app.js`
  - `loadPdfWithDecryption()`：PDF 加载策略。
  - `batchAddWatermark()`：批量处理与逐文件结果汇总。
  - `processSingleFile()`：直接处理 + 图片化兜底包装。
  - `processSingleFileDirect()`：PDF-Lib 直接加水印。
  - `processSingleFileRasterized()`：PDF.js 图片化兜底。
  - `applyWatermarkToPage()`：统一水印绘制逻辑。
- `styles.css`
  - 批量结果报告样式。
  - 水印配置与自定义位置预览样式。

## 验证建议

准备三类文件测试：

1. 普通 PDF：应显示“直接处理”，并加入 ZIP。
2. 可查看但禁止编辑的 PDF：应显示“页面图片化处理”，并加入 ZIP。
3. 需要打开密码的 PDF：若未提供密码，应显示“未加入 ZIP”和失败原因。

验证时重点检查：

- ZIP 内文件名是否保持原名。
- 成功文件是否都能打开。
- 降级处理文件是否能看到水印。
- 跳过文件是否没有加入 ZIP。
- 控制台是否无未捕获错误。

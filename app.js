const { PDFDocument, rgb, StandardFonts, degrees } = PDFLib;

let currentTool = null;
let files = [];
let watermarkConfigs = [];
let watermarkConfigCounter = 0;
let textPresets = [];

const STORAGE_KEYS = {
    watermarkConfigs: 'pdfTool.watermarkConfigs.v1',
    textPresets: 'pdfTool.textPresets.v1',
};

const DEFAULT_TEXT_PRESETS = ['仅供学习参考使用，请勿用于其它用途'];
const COMMON_COLORS = ['#ff0000', '#000000', '#666666', '#ffffff', '#409eff', '#67c23a', '#e6a23c', '#8b5cf6', '#f56c6c', '#c9a227'];
const FONT_OPTIONS = [
    { label: '系统默认/微软雅黑', value: 'Microsoft YaHei, 微软雅黑, sans-serif' },
    { label: '宋体', value: 'SimSun, 宋体, serif' },
    { label: '楷体', value: 'KaiTi, 楷体, serif' },
    { label: '仿宋', value: 'FangSong, 仿宋, serif' },
    { label: '华文中宋', value: 'STZhongsong, 华文中宋, serif' },
    { label: '黑体', value: 'SimHei, 黑体, sans-serif' },
];

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function isPdfFile(file) {
    return file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function getMaxPageCount() {
    return Math.max(1, ...files.map(file => file.pageCount || 1));
}

function safePdfName(name, prefix = '') {
    const base = (name || 'document.pdf').replace(/[\\/:*?"<>|]/g, '_');
    return prefix + (base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`);
}

function loadTextPresets() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.textPresets) || '[]');
        const custom = Array.isArray(stored) ? stored.map(item => String(item || '').trim()).filter(Boolean) : [];
        textPresets = Array.from(new Set([...DEFAULT_TEXT_PRESETS, ...custom]));
    } catch (error) {
        textPresets = [...DEFAULT_TEXT_PRESETS];
    }
}

function saveTextPresets() {
    const custom = textPresets
        .map(item => String(item || '').trim())
        .filter(item => item && !DEFAULT_TEXT_PRESETS.includes(item));
    localStorage.setItem(STORAGE_KEYS.textPresets, JSON.stringify(Array.from(new Set(custom))));
}

function sanitizeStoredWatermarkConfig(config) {
    return createDefaultWatermarkConfig({
        ...config,
        image: null,
        imageType: '',
        id: watermarkConfigCounter++,
    });
}

function loadWatermarkSettings() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.watermarkConfigs) || '[]');
        watermarkConfigCounter = 0;
        watermarkConfigs = Array.isArray(stored) ? stored.map(sanitizeStoredWatermarkConfig) : [];
    } catch (error) {
        watermarkConfigs = [];
        watermarkConfigCounter = 0;
    }
}

function saveWatermarkSettings() {
    const serializable = watermarkConfigs.map(config => ({
        ...config,
        image: null,
        imageType: '',
    }));
    localStorage.setItem(STORAGE_KEYS.watermarkConfigs, JSON.stringify(serializable));
}

function buildCanvasFont(config, fontSize) {
    const style = config.fontItalic ? 'italic' : 'normal';
    const weight = config.fontBold ? '700' : '400';
    const family = config.fontFamily || FONT_OPTIONS[0].value;
    return `${style} ${weight} ${fontSize}px ${family}`;
}

function setResultMessage(type, title, detail = '') {
    const resultArea = document.getElementById('resultArea');
    if (!resultArea) return;
    const icon = type === 'success' ? '✓' : type === 'error' ? '!' : '…';
    resultArea.innerHTML = `
        <div class="${type === 'error' ? 'error-message' : 'success-message'} compact-result">
            <div class="success-icon">${icon}</div>
            <h3>${escapeHtml(title)}</h3>
            ${detail ? `<p>${escapeHtml(detail)}</p>` : ''}
        </div>
    `;
}

async function loadPdfWithDecryption(arrayBuffer) {
    let lastError = null;

    try {
        const doc = await PDFDocument.load(arrayBuffer);
        return { doc, needsRebuild: false, ignoredEncryption: false };
    } catch (error) {
        lastError = error;
    }

    try {
        const doc = await PDFDocument.load(arrayBuffer, { password: '' });
        return { doc, needsRebuild: false, ignoredEncryption: false };
    } catch (error) {
        lastError = error;
    }

    try {
        const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        return { doc, needsRebuild: false, ignoredEncryption: true };
    } catch (error) {
        lastError = error;
    }

    throw new Error(
        '无法加载此 PDF。它可能需要打开密码，或使用了当前浏览器库不支持的加密方式。' +
        (lastError?.message ? ` 原始错误：${lastError.message}` : '')
    );
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tool-nav-item').forEach(item => {
        item.addEventListener('click', () => openTool(item.dataset.tool));
    });

    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', resetToWelcome);
    }
});

function resetToWelcome() {
    document.getElementById('tool-panel')?.classList.add('hidden');
    const welcome = document.getElementById('welcomePlaceholder');
    if (welcome) welcome.style.display = 'flex';
    document.querySelectorAll('.tool-nav-item').forEach(item => item.classList.remove('active'));
    currentTool = null;
    files = [];
    watermarkConfigs = [];
    watermarkConfigCounter = 0;
}

function openTool(tool) {
    currentTool = tool;
    files = [];
    watermarkConfigs = [];
    watermarkConfigCounter = 0;
    loadTextPresets();

    const toolPanel = document.getElementById('tool-panel');
    const welcome = document.getElementById('welcomePlaceholder');
    if (toolPanel) toolPanel.classList.remove('hidden');
    if (welcome) welcome.style.display = 'none';

    document.querySelectorAll('.tool-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tool === tool);
    });

    if (tool === 'merge') renderMergeTool();
    if (tool === 'split') renderSplitTool();
    if (tool === 'watermark') renderWatermarkTool();
}

function uploadMarkup({ multiple = false, compact = false } = {}) {
    return `
        <div class="upload-area ${compact ? 'compact-upload' : ''}" id="uploadArea">
            <div class="upload-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#409eff" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
            </div>
            <div>
                <div class="upload-text">点击或拖拽PDF文件到这里</div>
                <div class="upload-hint">${multiple ? '支持多个 PDF 文件' : '支持单个 PDF 文件'}</div>
            </div>
            <input type="file" id="fileInput" accept=".pdf,application/pdf" ${multiple ? 'multiple' : ''} style="display: none;">
        </div>
    `;
}

function renderMergeTool() {
    const toolContent = document.getElementById('tool-content');
    toolContent.innerHTML = `
        <h2>合并PDF文件</h2>
        <p class="tool-desc">上传多个PDF文件，将它们合并为一个文件</p>
        ${uploadMarkup({ multiple: true })}
        <div class="file-list" id="fileList"></div>
        <button class="action-btn" id="mergeBtn" disabled>合并PDF</button>
        <div class="progress-bar hidden" id="progressBar"><div class="progress-fill" id="progressFill"></div></div>
        <div id="resultArea"></div>
    `;
    setupFileUpload();
    document.getElementById('mergeBtn').addEventListener('click', mergePDFs);
}

function renderSplitTool() {
    const toolContent = document.getElementById('tool-content');
    toolContent.innerHTML = `
        <h2>拆分PDF文件</h2>
        <p class="tool-desc">上传一个PDF文件，选择要提取的页面范围</p>
        ${uploadMarkup({ multiple: false })}
        <div class="file-list" id="fileList"></div>
        <div class="options-panel" id="splitOptions" style="display: none;">
            <div class="option-group"><label class="option-label">PDF总页数：<span id="totalPages">0</span></label></div>
            <div class="option-group">
                <label class="option-label">页面范围</label>
                <div class="page-range-input">
                    <input type="text" class="option-input" id="pageRange" placeholder="例如: 1-3, 5, 7-9">
                    <button class="action-btn" id="splitBtn" style="margin: 0;">拆分PDF</button>
                </div>
                <div class="upload-hint" style="margin-top: 10px;">使用逗号分隔多个范围，例如：1-3, 5, 7-9</div>
            </div>
        </div>
        <div class="progress-bar hidden" id="progressBar"><div class="progress-fill" id="progressFill"></div></div>
        <div id="resultArea"></div>
    `;
    setupFileUpload();
    document.getElementById('splitBtn').addEventListener('click', splitPDF);
}

function renderWatermarkTool() {
    const toolContent = document.getElementById('tool-content');
    loadTextPresets();
    loadWatermarkSettings();
    toolContent.innerHTML = `
        <div class="watermark-page">
            <div class="watermark-toolbar">
                <div>
                    <h2>批量添加水印</h2>
                    <p class="tool-desc">文字/图片水印、位置、重复、页面范围和批量ZIP下载</p>
                </div>
                <div class="watermark-actions-bar">
                    <button class="add-watermark-btn" id="addWatermarkBtn">＋ 添加水印</button>
                    <button class="clear-btn" id="clearWatermarksBtn">清空水印</button>
                    <button class="clear-btn" id="clearFilesBtn">清空文件</button>
                    <button class="action-btn" id="watermarkBtn">批量处理并下载ZIP</button>
                </div>
            </div>
            ${uploadMarkup({ multiple: true, compact: true })}
            <div class="watermark-batch-hint">
                <strong>批量默认：</strong>下方水印会自动应用到所有上传文件的全部页面。
                如果某个文件只想加部分页面，请点该文件右侧“配置”，为该文件单独选择水印和页码。
                <br><strong>页码规则：</strong>水印配置里的页码按钮会按已上传文件中的最大页数展示；处理每个 PDF 时会按该文件自己的实际页数过滤，超出页数的选择会自动跳过。
                <br><strong>受限 PDF：</strong>可查看但禁止编辑的 PDF 会尝试转为图片页面后加水印；这类输出的文字/链接/表单可能不可再选择或使用。
            </div>
            <div class="file-list compact-file-list" id="fileList"></div>
            <div class="options-panel watermark-options" id="watermarkOptions" style="display:${watermarkConfigs.length ? 'block' : 'none'};">
                <div id="watermarkConfigsContainer"></div>
            </div>
            <div class="progress-bar hidden" id="progressBar"><div class="progress-fill" id="progressFill"></div></div>
            <div id="resultArea"></div>
        </div>
    `;
    setupFileUpload();
    document.getElementById('addWatermarkBtn').addEventListener('click', () => addWatermarkConfig());
    document.getElementById('watermarkBtn').addEventListener('click', () => batchAddWatermark());
    document.getElementById('clearFilesBtn').addEventListener('click', clearFilesOnly);
    document.getElementById('clearWatermarksBtn').addEventListener('click', clearWatermarksOnly);
    renderWatermarkConfigs();
}

function setupFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    if (!uploadArea || !fileInput) return;

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
}

async function handleFiles(newFiles) {
    const fileArray = Array.from(newFiles).filter(isPdfFile);
    if (fileArray.length === 0) {
        alert('请选择PDF文件');
        return;
    }

    if (currentTool === 'merge' || currentTool === 'watermark') {
        files = [...files, ...fileArray];
    } else {
        if (files.length > 0 && !confirm('替换当前文件？')) return;
        files = [fileArray[0]];
    }

    await hydrateFilePageCounts(fileArray);
    await renderFileList();

    if (currentTool === 'split' && files.length > 0) {
        await loadPdfInfo();
    } else if (currentTool === 'watermark' && files.length > 0) {
        document.getElementById('watermarkOptions').style.display = 'block';
        if (watermarkConfigs.length === 0) addWatermarkConfig();
        else await renderWatermarkConfigs();
    }
}

async function hydrateFilePageCounts(targetFiles = files) {
    for (const file of targetFiles) {
        file.pageCount = await getPdfPageCount(file);
    }
}

async function renderFileList() {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;
    if (files.length === 0) {
        fileList.innerHTML = '';
        return;
    }

    fileList.innerHTML = files.map((file, i) => {
        const pageText = file.pageCount > 0 ? `${file.pageCount} 页` : '无法读取页数';
        return `
            <div class="file-item">
                <div class="file-item-left">
                    <div class="drag-handle" title="按上传顺序处理">⋮⋮</div>
                    <div class="file-icon">PDF</div>
                    <div class="file-item-details">
                        <div class="file-name">${escapeHtml(file.name)}</div>
                        <div class="file-size">${formatFileSize(file.size)} · ${escapeHtml(pageText)}</div>
                    </div>
                </div>
                ${currentTool === 'watermark' ? `<button class="config-watermark-btn" data-index="${i}">配置</button>` : ''}
                <button class="remove-btn" data-index="${i}">删除</button>
            </div>
        `;
    }).join('');

    fileList.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const index = parseInt(e.target.closest('.remove-btn').dataset.index);
            files.splice(index, 1);
            await renderFileList();
            if (currentTool === 'split' && files.length === 0) {
                document.getElementById('splitOptions').style.display = 'none';
            } else if (currentTool === 'watermark') {
                document.getElementById('watermarkOptions').style.display = files.length ? 'block' : 'none';
                await renderWatermarkConfigs();
            }
        });
    });

    fileList.querySelectorAll('.config-watermark-btn').forEach(btn => {
        btn.addEventListener('click', (e) => showFileConfigModal(parseInt(e.target.closest('.config-watermark-btn').dataset.index)));
    });

    updateMergeButton();
}

async function getPdfPageCount(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const { doc } = await loadPdfWithDecryption(arrayBuffer);
        return doc.getPageCount();
    } catch (error) {
        console.error('Error getting page count:', error);
        return 0;
    }
}

function updateMergeButton() {
    const mergeBtn = document.getElementById('mergeBtn');
    if (mergeBtn) mergeBtn.disabled = files.length < 2;
}

async function loadPdfInfo() {
    if (files.length === 0) return;
    try {
        const pageCount = files[0].pageCount || await getPdfPageCount(files[0]);
        document.getElementById('totalPages').textContent = pageCount;
        document.getElementById('splitOptions').style.display = 'block';
    } catch (error) {
        alert('无法加载PDF: ' + error.message);
    }
}

async function mergePDFs() {
    if (files.length < 2) return;
    const mergeBtn = document.getElementById('mergeBtn');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    mergeBtn.disabled = true;
    progressBar.classList.remove('hidden');
    setResultMessage('info', '正在合并PDF...');

    try {
        const mergedPdf = await PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
            progressFill.style.width = `${((i + 1) / files.length) * 100}%`;
            const { doc } = await loadPdfWithDecryption(await files[i].arrayBuffer());
            const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
            copiedPages.forEach(page => mergedPdf.addPage(page));
        }
        downloadPdf(await mergedPdf.save(), 'merged.pdf');
        setResultMessage('success', '合并成功！', '文件已开始下载');
    } catch (error) {
        setResultMessage('error', '合并失败', error.message);
    } finally {
        mergeBtn.disabled = false;
    }
}

function parsePageRange(rangeStr, totalPages) {
    const pages = new Set();
    const parts = rangeStr.split(',').map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(num => parseInt(num.trim(), 10));
            if (isNaN(start) || isNaN(end)) continue;
            const min = Math.max(1, Math.min(start, end));
            const max = Math.min(totalPages, Math.max(start, end));
            for (let i = min; i <= max; i++) pages.add(i - 1);
        } else {
            const num = parseInt(part, 10);
            if (!isNaN(num) && num >= 1 && num <= totalPages) pages.add(num - 1);
        }
    }
    return Array.from(pages).sort((a, b) => a - b);
}

async function splitPDF() {
    if (files.length === 0) return;
    const rangeStr = document.getElementById('pageRange').value.trim();
    if (!rangeStr) {
        alert('请输入页面范围');
        return;
    }

    const splitBtn = document.getElementById('splitBtn');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    splitBtn.disabled = true;
    progressBar.classList.remove('hidden');
    progressFill.style.width = '50%';

    try {
        const { doc: pdfDoc } = await loadPdfWithDecryption(await files[0].arrayBuffer());
        const pagesToExtract = parsePageRange(rangeStr, pdfDoc.getPageCount());
        if (pagesToExtract.length === 0) throw new Error('无效的页面范围');
        const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(pdfDoc, pagesToExtract);
        copiedPages.forEach(page => newPdf.addPage(page));
        progressFill.style.width = '100%';
        downloadPdf(await newPdf.save(), safePdfName(files[0].name.replace(/\.pdf$/i, '_split.pdf')));
        setResultMessage('success', '拆分成功！', `提取了 ${pagesToExtract.length} 页`);
    } catch (error) {
        setResultMessage('error', '拆分失败', error.message);
    } finally {
        splitBtn.disabled = false;
    }
}

function createDefaultWatermarkConfig(overrides = {}) {
    return {
        id: watermarkConfigCounter++,
        type: 'text',
        text: '仅供学习参考使用，请勿用于其它用途',
        fontSize: 48,
        opacity: 0.3,
        rotation: -35,
        color: '#ff0000',
        fontFamily: FONT_OPTIONS[0].value,
        fontBold: true,
        fontItalic: false,
        position: 'center',
        repeatMode: 'once',
        repeatCount: 4,
        customPosX: 50,
        customPosY: 50,
        pageMode: 'all',
        customPages: [],
        image: null,
        imageType: '',
        scale: 0.25,
        ...overrides,
    };
}

function addWatermarkConfig(overrides = {}) {
    watermarkConfigs.push(createDefaultWatermarkConfig(overrides));
    const options = document.getElementById('watermarkOptions');
    if (options) options.style.display = 'block';
    saveWatermarkSettings();
    renderWatermarkConfigs();
}

function clearFilesOnly() {
    files = [];
    renderFileList();
    const fileInput = document.getElementById('fileInput');
    const progressBar = document.getElementById('progressBar');
    const resultArea = document.getElementById('resultArea');
    if (fileInput) fileInput.value = '';
    if (progressBar) progressBar.classList.add('hidden');
    if (resultArea) resultArea.innerHTML = '';
}

function clearWatermarksOnly() {
    watermarkConfigs = [];
    saveWatermarkSettings();
    const progressBar = document.getElementById('progressBar');
    const resultArea = document.getElementById('resultArea');
    const options = document.getElementById('watermarkOptions');
    if (progressBar) progressBar.classList.add('hidden');
    if (resultArea) resultArea.innerHTML = '';
    if (options) options.style.display = 'none';
    renderWatermarkConfigs();
}

async function renderWatermarkConfigs() {
    const container = document.getElementById('watermarkConfigsContainer');
    if (!container) return;
    saveWatermarkSettings();
    container.innerHTML = watermarkConfigs.map((config, index) => renderWatermarkConfigCard(config, index)).join('');
    bindAllWatermarkEvents();
}

function renderWatermarkConfigCard(config, index) {
    const maxPages = getMaxPageCount();
    const preview = getWatermarkPreviewMetrics(config);
    const pageChips = Array.from({ length: maxPages }, (_, i) => {
        const checked = config.customPages.includes(i);
        return `<button type="button" class="page-chip ${checked ? 'active' : ''}" data-config-id="${config.id}" data-page="${i}">${i + 1}</button>`;
    }).join('');
    const positions = [
        ['top-left', '左上'], ['top-center', '上中'], ['top-right', '右上'],
        ['middle-left', '左中'], ['center', '中心'], ['middle-right', '右中'],
        ['bottom-left', '左下'], ['bottom-center', '下中'], ['bottom-right', '右下'],
    ].map(([value, label]) => `<button type="button" class="position-cell ${config.position === value ? 'active' : ''}" data-config-id="${config.id}" data-pos="${value}">${label}</button>`).join('');

    return `
        <div class="watermark-config" data-config-id="${config.id}">
            <div class="watermark-header">
                <div class="watermark-title">水印 #${index + 1}</div>
                <div class="watermark-actions">
                    <button class="icon-btn duplicate-wm" data-config-id="${config.id}" title="复制">⧉</button>
                    <button class="icon-btn danger remove-wm" data-config-id="${config.id}" title="删除">×</button>
                </div>
            </div>
            <div class="watermark-config-body compact-watermark-grid">
                <div class="wm-field wm-type-field">
                    <label class="option-label">类型</label>
                    <select class="option-input watermark-type" data-config-id="${config.id}">
                        <option value="text" ${config.type === 'text' ? 'selected' : ''}>文字</option>
                        <option value="image" ${config.type === 'image' ? 'selected' : ''}>图片</option>
                    </select>
                </div>
                <div class="wm-field wm-main-field text-field" style="display:${config.type === 'text' ? 'flex' : 'none'};">
                    <label class="option-label">文字</label>
                    <input type="text" class="option-input watermark-text" data-config-id="${config.id}" value="${escapeHtml(config.text)}">
                    <div class="preset-row">
                        <div class="preset-list">
                            ${textPresets.map(preset => `
                                <div class="preset-list-item">
                                    <button type="button" class="preset-chip" data-config-id="${config.id}" data-preset="${escapeHtml(preset)}">${escapeHtml(preset)}</button>
                                    ${DEFAULT_TEXT_PRESETS.includes(preset) ? '' : `<button type="button" class="preset-delete" data-preset="${escapeHtml(preset)}" title="删除预设">×</button>`}
                                </div>
                            `).join('')}
                            <button type="button" class="preset-add" data-config-id="${config.id}">＋ 自定义添加</button>
                        </div>
                    </div>
                </div>
                <div class="wm-field wm-main-field image-field" style="display:${config.type === 'image' ? 'flex' : 'none'};">
                    <label class="option-label">图片（PNG/JPG）</label>
                    <div class="image-upload-row">
                        <button type="button" class="image-upload-btn" data-config-id="${config.id}">选择图片</button>
                        <input type="file" class="image-input" data-config-id="${config.id}" accept="image/png,image/jpeg" style="display:none;">
                        <span class="image-name">${config.image ? escapeHtml(config.imageType || '已上传') : '未上传'}</span>
                        ${config.image ? `<img src="${config.image}" class="wm-image-preview" alt="水印预览">` : ''}
                    </div>
                </div>
                <div class="wm-field small"><label class="option-label">大小</label><input type="number" class="option-input watermark-font-size" data-config-id="${config.id}" value="${config.fontSize}" min="10" max="200"></div>
                <div class="wm-field small"><label class="option-label">透明</label><input type="number" class="option-input watermark-opacity" data-config-id="${config.id}" value="${config.opacity}" min="0.05" max="1" step="0.05"></div>
                <div class="wm-field small"><label class="option-label">旋转</label><input type="number" class="option-input watermark-rotation" data-config-id="${config.id}" value="${config.rotation}" min="-180" max="180"></div>
                <div class="wm-field small"><label class="option-label">缩放</label><input type="number" class="option-input watermark-scale" data-config-id="${config.id}" value="${config.scale}" min="0.05" max="2" step="0.05"></div>
                <div class="wm-field font-field">
                    <label class="option-label">字体</label>
                    <select class="option-input watermark-font-family" data-config-id="${config.id}">
                        ${FONT_OPTIONS.map(font => `<option value="${escapeHtml(font.value)}" ${config.fontFamily === font.value ? 'selected' : ''}>${escapeHtml(font.label)}</option>`).join('')}
                    </select>
                    <div class="font-style-row">
                        <button type="button" class="font-style-btn ${config.fontBold ? 'active' : ''}" data-config-id="${config.id}" data-style="bold">加粗</button>
                        <button type="button" class="font-style-btn ${config.fontItalic ? 'active' : ''}" data-config-id="${config.id}" data-style="italic">倾斜</button>
                    </div>
                </div>
                <div class="wm-field color">
                    <label class="option-label">颜色</label>
                    <input type="color" class="option-input watermark-color" data-config-id="${config.id}" value="${escapeHtml(config.color)}">
                    <div class="color-swatches">
                        ${COMMON_COLORS.map(color => `<button type="button" class="color-swatch ${config.color.toLowerCase() === color ? 'active' : ''}" data-config-id="${config.id}" data-color="${color}" style="--swatch-color:${color}" title="${color}" aria-label="选择颜色 ${color}"></button>`).join('')}
                    </div>
                </div>

                <div class="wm-field position-field">
                    <label class="option-label">位置</label>
                    <div class="position-grid">${positions}</div>
                    <button type="button" class="position-custom ${config.position === 'custom' ? 'active' : ''}" data-config-id="${config.id}" data-pos="custom">自定义</button>
                    <div class="custom-position-group" style="display:${config.position === 'custom' ? 'flex' : 'none'};">
                        <span>X</span><input type="number" class="option-input custom-pos-x" data-config-id="${config.id}" value="${config.customPosX}" min="0" max="100">
                        <span>Y</span><input type="number" class="option-input custom-pos-y" data-config-id="${config.id}" value="${config.customPosY}" min="0" max="100">
                    </div>
                    ${config.position === 'custom' ? `
                        <div class="a4-preview-canvas" data-config-id="${config.id}" title="拖动水印框调整自定义位置">
                            <div class="preview-crosshair horizontal"></div>
                            <div class="preview-crosshair vertical"></div>
                            <div class="watermark-preview-box"
                                data-config-id="${config.id}"
                                style="left:${config.customPosX}%; top:${config.customPosY}%; width:${preview.width}px; height:${preview.height}px; transform: translate(-50%, -50%) rotate(${preview.rotation}deg);">
                                ${preview.image ? `<img src="${preview.image}" alt="预览">` : `<span>${escapeHtml(preview.label)}</span>`}
                            </div>
                        </div>
                    ` : ''}
                </div>
                <div class="wm-field repeat-field">
                    <label class="option-label">重复</label>
                    <div class="repeat-mode-options">
                        ${['once:单次', 'repeat:固定', 'tile:铺满'].map(item => {
                            const [value, label] = item.split(':');
                            return `<button type="button" class="repeat-option ${config.repeatMode === value ? 'active' : ''}" data-config-id="${config.id}" data-mode="${value}">${label}</button>`;
                        }).join('')}
                    </div>
                    <div class="repeat-count-inline" style="display:${config.repeatMode === 'repeat' ? 'flex' : 'none'};">
                        <input type="range" class="repeat-count-slider" data-config-id="${config.id}" value="${config.repeatCount}" min="2" max="20">
                        <span>${config.repeatCount}次</span>
                    </div>
                </div>
                <div class="wm-field page-field">
                    <label class="option-label">页面</label>
                    <div class="page-mode-options">
                        <button type="button" class="page-mode ${config.pageMode === 'all' ? 'active' : ''}" data-config-id="${config.id}" data-mode="all">全部页面</button>
                        <button type="button" class="page-mode ${config.pageMode === 'custom' ? 'active' : ''}" data-config-id="${config.id}" data-mode="custom">自定义</button>
                    </div>
                    <div class="page-selector" style="display:${config.pageMode === 'custom' ? 'flex' : 'none'};">${pageChips}</div>
                </div>
            </div>
        </div>
    `;
}

function getConfig(configId) {
    return watermarkConfigs.find(c => c.id === Number(configId));
}

function getWatermarkPreviewMetrics(config) {
    const rotation = clampNumber(config.rotation, -180, 180, 0);
    const scale = clampNumber(config.scale, 0.05, 2, 0.25);

    if (config.type === 'image') {
        return {
            width: Math.round(clampNumber(120 * scale, 28, 150, 42)),
            height: Math.round(clampNumber(80 * scale, 20, 120, 32)),
            rotation,
            label: config.image ? '图片水印' : '图片',
            image: config.image,
        };
    }

    const text = config.text || '水印';
    const fontSize = clampNumber(config.fontSize, 10, 200, 48);
    let measuredWidth = text.length * fontSize * 0.7;
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = buildCanvasFont(config, fontSize);
        measuredWidth = ctx.measureText(text).width;
    } catch (error) {
        // Fallback above is good enough for preview.
    }

    const previewScale = 0.22 * Math.max(0.35, scale * 2);
    return {
        width: Math.round(clampNumber(measuredWidth * previewScale + 18, 36, 150, 80)),
        height: Math.round(clampNumber(fontSize * previewScale + 12, 22, 90, 32)),
        rotation,
        label: text.length > 10 ? `${text.slice(0, 10)}…` : text,
        image: null,
    };
}

function positionToCustomPercent(position) {
    const map = {
        'top-left': [15, 15],
        'top-center': [50, 15],
        'top-right': [85, 15],
        'middle-left': [15, 50],
        'center': [50, 50],
        'middle-right': [85, 50],
        'bottom-left': [15, 85],
        'bottom-center': [50, 85],
        'bottom-right': [85, 85],
    };
    const [x, y] = map[position] || [50, 50];
    return { x, y };
}

function updatePreviewPosition(configId, xPercent, yPercent) {
    const x = clampNumber(xPercent, 0, 100, 50);
    const y = clampNumber(yPercent, 0, 100, 50);
    const config = getConfig(configId);
    if (config) {
        config.customPosX = Math.round(x * 10) / 10;
        config.customPosY = Math.round(y * 10) / 10;
    }
    const card = document.querySelector(`.watermark-config[data-config-id="${configId}"]`);
    const box = card?.querySelector('.watermark-preview-box');
    const inputX = card?.querySelector('.custom-pos-x');
    const inputY = card?.querySelector('.custom-pos-y');
    if (box) {
        box.style.left = `${x}%`;
        box.style.top = `${y}%`;
    }
    if (inputX) inputX.value = String(Math.round(x * 10) / 10);
    if (inputY) inputY.value = String(Math.round(y * 10) / 10);
}

function bindPreviewDrag() {
    document.querySelectorAll('.a4-preview-canvas').forEach(canvas => {
        const configId = canvas.dataset.configId;
        const moveToEvent = (event) => {
            const rect = canvas.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;
            updatePreviewPosition(configId, x, y);
        };

        canvas.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            canvas.classList.add('dragging');
            canvas.setPointerCapture(event.pointerId);
            moveToEvent(event);
        });
        canvas.addEventListener('pointermove', (event) => {
            if (!canvas.classList.contains('dragging')) return;
            moveToEvent(event);
        });
        canvas.addEventListener('pointerup', (event) => {
            canvas.classList.remove('dragging');
            try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* ignore */ }
        });
        canvas.addEventListener('pointercancel', () => canvas.classList.remove('dragging'));
    });
}

function bindAllWatermarkEvents() {
    document.querySelectorAll('.watermark-type').forEach(el => el.addEventListener('change', e => {
        const config = getConfig(e.target.dataset.configId);
        if (!config) return;
        config.type = e.target.value;
        renderWatermarkConfigs();
    }));
    document.querySelectorAll('.watermark-text').forEach(el => el.addEventListener('input', e => {
        const config = getConfig(e.target.dataset.configId);
        if (config) {
            config.text = e.target.value;
            saveWatermarkSettings();
            const card = e.target.closest('.watermark-config');
            const previewBox = card?.querySelector('.watermark-preview-box span');
            if (previewBox) previewBox.textContent = config.text.length > 10 ? `${config.text.slice(0, 10)}…` : (config.text || '水印');
        }
    }));
    document.querySelectorAll('.watermark-font-size').forEach(el => el.addEventListener('change', e => {
        const config = getConfig(e.target.dataset.configId);
        if (config) {
            config.fontSize = clampNumber(e.target.value, 10, 200, 48);
            renderWatermarkConfigs();
        }
    }));
    document.querySelectorAll('.watermark-opacity').forEach(el => el.addEventListener('change', e => {
        const config = getConfig(e.target.dataset.configId);
        if (config) {
            config.opacity = clampNumber(e.target.value, 0.05, 1, 0.3);
            saveWatermarkSettings();
        }
    }));
    document.querySelectorAll('.watermark-rotation').forEach(el => el.addEventListener('change', e => {
        const config = getConfig(e.target.dataset.configId);
        if (config) {
            config.rotation = clampNumber(e.target.value, -180, 180, -35);
            renderWatermarkConfigs();
        }
    }));
    document.querySelectorAll('.watermark-scale').forEach(el => el.addEventListener('change', e => {
        const config = getConfig(e.target.dataset.configId);
        if (config) {
            config.scale = clampNumber(e.target.value, 0.05, 2, 0.25);
            renderWatermarkConfigs();
        }
    }));
    document.querySelectorAll('.watermark-color').forEach(el => el.addEventListener('change', e => {
        const config = getConfig(e.target.dataset.configId);
        if (!config) return;
        config.color = e.target.value;
        renderWatermarkConfigs();
    }));
    document.querySelectorAll('.watermark-font-family').forEach(el => el.addEventListener('change', e => {
        const config = getConfig(e.target.dataset.configId);
        if (!config) return;
        config.fontFamily = e.target.value;
        renderWatermarkConfigs();
    }));
    document.querySelectorAll('.font-style-btn').forEach(el => el.addEventListener('click', e => {
        const config = getConfig(e.target.dataset.configId);
        if (!config) return;
        if (e.target.dataset.style === 'bold') config.fontBold = !config.fontBold;
        if (e.target.dataset.style === 'italic') config.fontItalic = !config.fontItalic;
        renderWatermarkConfigs();
    }));
    document.querySelectorAll('.color-swatch').forEach(el => el.addEventListener('click', e => {
        const config = getConfig(e.target.dataset.configId);
        if (!config) return;
        config.color = e.target.dataset.color;
        renderWatermarkConfigs();
    }));
    document.querySelectorAll('.preset-chip').forEach(el => el.addEventListener('click', e => {
        const config = getConfig(e.target.dataset.configId);
        if (!config) return;
        config.text = e.target.dataset.preset;
        renderWatermarkConfigs();
    }));
    document.querySelectorAll('.preset-add').forEach(el => el.addEventListener('click', e => {
        const config = getConfig(e.target.dataset.configId);
        const currentText = config?.text?.trim() || '';
        const preset = prompt('请输入要添加的常用文字：', currentText)?.trim();
        if (!preset) return;
        if (!textPresets.includes(preset)) {
            textPresets.push(preset);
            saveTextPresets();
        }
        if (config) {
            config.text = preset;
            saveWatermarkSettings();
        }
        renderWatermarkConfigs();
    }));
    document.querySelectorAll('.preset-delete').forEach(el => el.addEventListener('click', e => {
        const preset = e.target.dataset.preset;
        if (!preset || DEFAULT_TEXT_PRESETS.includes(preset)) return;
        textPresets = textPresets.filter(item => item !== preset);
        saveTextPresets();
        renderWatermarkConfigs();
    }));
    document.querySelectorAll('.custom-pos-x').forEach(el => el.addEventListener('change', e => {
        const config = getConfig(e.target.dataset.configId);
        if (!config) return;
        updatePreviewPosition(config.id, clampNumber(e.target.value, 0, 100, 50), config.customPosY);
        saveWatermarkSettings();
    }));
    document.querySelectorAll('.custom-pos-y').forEach(el => el.addEventListener('change', e => {
        const config = getConfig(e.target.dataset.configId);
        if (!config) return;
        updatePreviewPosition(config.id, config.customPosX, clampNumber(e.target.value, 0, 100, 50));
        saveWatermarkSettings();
    }));
    document.querySelectorAll('.position-cell, .position-custom').forEach(el => el.addEventListener('click', e => {
        const config = getConfig(e.target.dataset.configId);
        if (!config) return;
        if (e.target.dataset.pos === 'custom' && config.position !== 'custom') {
            const current = positionToCustomPercent(config.position);
            config.customPosX = current.x;
            config.customPosY = current.y;
        }
        config.position = e.target.dataset.pos;
        renderWatermarkConfigs();
    }));
    document.querySelectorAll('.repeat-option').forEach(el => el.addEventListener('click', e => {
        const config = getConfig(e.target.dataset.configId);
        if (!config) return;
        config.repeatMode = e.target.dataset.mode;
        renderWatermarkConfigs();
    }));
    document.querySelectorAll('.repeat-count-slider').forEach(el => el.addEventListener('input', e => {
        const config = getConfig(e.target.dataset.configId);
        if (!config) return;
        config.repeatCount = clampNumber(e.target.value, 2, 20, 4);
        renderWatermarkConfigs();
    }));
    document.querySelectorAll('.page-mode').forEach(el => el.addEventListener('click', e => {
        const config = getConfig(e.target.dataset.configId);
        if (!config) return;
        config.pageMode = e.target.dataset.mode;
        if (config.pageMode === 'all') config.customPages = [];
        renderWatermarkConfigs();
    }));
    document.querySelectorAll('.page-chip').forEach(el => el.addEventListener('click', e => {
        const config = getConfig(e.target.dataset.configId);
        if (!config) return;
        const page = Number(e.target.dataset.page);
        if (config.customPages.includes(page)) config.customPages = config.customPages.filter(p => p !== page);
        else config.customPages.push(page);
        config.customPages.sort((a, b) => a - b);
        renderWatermarkConfigs();
    }));
    document.querySelectorAll('.image-upload-btn').forEach(el => el.addEventListener('click', e => {
        document.querySelector(`.image-input[data-config-id="${e.target.dataset.configId}"]`)?.click();
    }));
    document.querySelectorAll('.image-input').forEach(el => el.addEventListener('change', e => {
        if (e.target.files.length > 0) handleImageUpload(e.target.files[0], e.target.dataset.configId);
    }));
    document.querySelectorAll('.duplicate-wm').forEach(el => el.addEventListener('click', e => duplicateWatermarkConfig(e.target.dataset.configId)));
    document.querySelectorAll('.remove-wm').forEach(el => el.addEventListener('click', e => removeWatermarkConfig(e.target.dataset.configId)));
    bindPreviewDrag();
    saveWatermarkSettings();
}

function handleImageUpload(file, configId) {
    if (!file || !['image/png', 'image/jpeg'].includes(file.type)) {
        alert('图片水印仅支持 PNG 或 JPG/JPEG 文件');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const config = getConfig(configId);
        if (!config) return;
        config.image = e.target.result;
        config.imageType = file.type;
        renderWatermarkConfigs();
    };
    reader.readAsDataURL(file);
}

function removeWatermarkConfig(configId) {
    watermarkConfigs = watermarkConfigs.filter(c => c.id !== Number(configId));
    renderWatermarkConfigs();
}

function duplicateWatermarkConfig(configId) {
    const original = getConfig(configId);
    if (!original) return;
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = watermarkConfigCounter++;
    watermarkConfigs.push(copy);
    renderWatermarkConfigs();
}

function showFileConfigModal(fileIndex) {
    const file = files[fileIndex];
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    const selected = file.selectedWatermarks || watermarkConfigs.map(c => c.id);
    const overrides = file.watermarkPageOverrides || {};
    const filePageCount = Math.max(1, file.pageCount || 1);
    modal.innerHTML = `
        <div class="file-config-modal wide">
            <h3>${escapeHtml(file.name)}</h3>
            <p>默认会应用全部水印到这个文件的全部页面；这里可以为单个文件选择水印，并覆盖每个水印的应用页码。</p>
            <div id="modal-watermark-selector">
                ${watermarkConfigs.map((config, index) => {
                    const override = overrides[config.id] || { pageMode: 'all', customPages: [] };
                    const pageChips = Array.from({ length: filePageCount }, (_, i) => `
                        <button type="button" class="modal-page-chip ${override.customPages?.includes(i) ? 'active' : ''}" data-watermark-id="${config.id}" data-page="${i}">${i + 1}</button>
                    `).join('');
                    return `
                        <div class="modal-watermark-row" data-watermark-id="${config.id}">
                            <label class="modal-checkbox-row">
                                <input type="checkbox" ${selected.includes(config.id) ? 'checked' : ''} data-watermark-id="${config.id}">
                                <span>水印 #${index + 1}（${config.type === 'text' ? escapeHtml(config.text || '文字') : '图片'}）</span>
                            </label>
                            <div class="modal-page-override">
                                <span class="modal-page-label">此文件页面：</span>
                                <button type="button" class="modal-page-mode ${override.pageMode !== 'custom' ? 'active' : ''}" data-watermark-id="${config.id}" data-mode="all">全部页面</button>
                                <button type="button" class="modal-page-mode ${override.pageMode === 'custom' ? 'active' : ''}" data-watermark-id="${config.id}" data-mode="custom">部分页面</button>
                                <div class="modal-page-selector" style="display:${override.pageMode === 'custom' ? 'flex' : 'none'};">${pageChips}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="modal-actions">
                <button id="modal-save-btn" class="modal-primary-btn">确定</button>
                <button id="modal-cancel-btn" class="modal-secondary-btn">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const draftOverrides = JSON.parse(JSON.stringify(overrides));
    watermarkConfigs.forEach(config => {
        if (!draftOverrides[config.id]) draftOverrides[config.id] = { pageMode: 'all', customPages: [] };
    });

    modal.querySelectorAll('.modal-page-mode').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.watermarkId;
            draftOverrides[id] = draftOverrides[id] || { pageMode: 'all', customPages: [] };
            draftOverrides[id].pageMode = btn.dataset.mode;
            if (btn.dataset.mode === 'all') draftOverrides[id].customPages = [];

            const row = btn.closest('.modal-watermark-row');
            row.querySelectorAll('.modal-page-mode').forEach(item => item.classList.toggle('active', item === btn));
            const selector = row.querySelector('.modal-page-selector');
            if (selector) selector.style.display = btn.dataset.mode === 'custom' ? 'flex' : 'none';
            selector?.querySelectorAll('.modal-page-chip').forEach(chip => chip.classList.remove('active'));
        });
    });

    modal.querySelectorAll('.modal-page-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const id = chip.dataset.watermarkId;
            const page = Number(chip.dataset.page);
            draftOverrides[id] = draftOverrides[id] || { pageMode: 'custom', customPages: [] };
            draftOverrides[id].pageMode = 'custom';
            if (draftOverrides[id].customPages.includes(page)) {
                draftOverrides[id].customPages = draftOverrides[id].customPages.filter(p => p !== page);
                chip.classList.remove('active');
            } else {
                draftOverrides[id].customPages.push(page);
                draftOverrides[id].customPages.sort((a, b) => a - b);
                chip.classList.add('active');
            }
        });
    });

    modal.querySelector('#modal-save-btn').addEventListener('click', () => {
        file.selectedWatermarks = Array.from(modal.querySelectorAll('.modal-checkbox-row input:checked')).map(input => Number(input.dataset.watermarkId));
        file.watermarkPageOverrides = draftOverrides;
        document.body.removeChild(modal);
    });
    modal.querySelector('#modal-cancel-btn').addEventListener('click', () => document.body.removeChild(modal));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) document.body.removeChild(modal);
    });
}

function renderBatchResultReport(results) {
    const resultArea = document.getElementById('resultArea');
    if (!resultArea) return;

    const successCount = results.filter(item => item.status === 'success').length;
    const warningCount = results.filter(item => item.status === 'warning').length;
    const skippedCount = results.filter(item => item.status === 'skipped').length;
    const rows = results.map(item => {
        const icon = item.status === 'success' ? '✅' : item.status === 'warning' ? '⚠️' : '❌';
        const statusText = item.status === 'success' ? '已加入 ZIP' : item.status === 'warning' ? '已加入 ZIP（降级处理）' : '未加入 ZIP';
        const methodText = {
            direct: '直接处理',
            ignoreEncryption: '权限忽略处理',
            rasterized: '页面图片化处理',
            failed: '失败',
        }[item.method] || item.method;
        return `
            <div class="batch-result-row ${item.status}">
                <div class="batch-result-main">
                    <span class="batch-result-icon">${icon}</span>
                    <span class="batch-result-name">${escapeHtml(item.name)}</span>
                </div>
                <div class="batch-result-meta">${escapeHtml(statusText)} · ${escapeHtml(methodText)}</div>
                <div class="batch-result-message">${escapeHtml(item.message)}</div>
            </div>
        `;
    }).join('');

    resultArea.innerHTML = `
        <div class="batch-result-report">
            <h3>批量处理完成</h3>
            <p>成功 ${successCount} 个，降级处理 ${warningCount} 个，跳过 ${skippedCount} 个。跳过的文件没有加入 ZIP。</p>
            <div class="batch-result-list">${rows}</div>
        </div>
    `;
}

async function batchAddWatermark() {
    if (files.length === 0) {
        alert('请先上传PDF文件');
        return;
    }
    if (watermarkConfigs.length === 0) {
        alert('请添加至少一个水印配置');
        return;
    }

    const watermarkBtn = document.getElementById('watermarkBtn');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    watermarkBtn.disabled = true;
    progressBar.classList.remove('hidden');
    setResultMessage('info', '正在处理文件...');

    try {
        const zip = new JSZip();
        const results = [];

        for (let i = 0; i < files.length; i++) {
            progressFill.style.width = `${((i + 1) / files.length) * 100}%`;
            setResultMessage('info', `正在处理文件 ${i + 1}/${files.length}...`, files[i].name);

            try {
                const result = await processSingleFile(files[i]);
                zip.file(safePdfName(files[i].name), result.bytes);
                results.push({
                    name: files[i].name,
                    status: result.warning ? 'warning' : 'success',
                    method: result.method,
                    message: result.warning || '已成功加水印并加入 ZIP',
                });
            } catch (fileError) {
                console.warn(`跳过文件 ${files[i].name}:`, fileError);
                results.push({
                    name: files[i].name,
                    status: 'skipped',
                    method: 'failed',
                    message: fileError.message,
                });
            }
        }

        const successfulResults = results.filter(item => item.status !== 'skipped');
        if (successfulResults.length === 0) {
            const skippedNames = results.map(item => `${item.name}：${item.message}`).join('；');
            throw new Error(`没有可处理的文件。已跳过：${skippedNames}`);
        }

        setResultMessage('info', '正在压缩文件...');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipBlob, 'watermarked_pdfs.zip');
        renderBatchResultReport(results);
    } catch (error) {
        setResultMessage('error', '批量处理失败', error.message);
    } finally {
        watermarkBtn.disabled = false;
    }
}

async function processSingleFile(file) {
    try {
        return await processSingleFileDirect(file);
    } catch (directError) {
        console.warn(`直接处理失败，尝试页面图片化：${file.name}`, directError);
        try {
            const bytes = await processSingleFileRasterized(file);
            return {
                bytes,
                method: 'rasterized',
                warning: '已将页面转为图片后加水印；原文本、链接、表单等高级内容可能不可再选择或使用。',
            };
        } catch (rasterError) {
            throw new Error(`直接处理失败：${directError.message}；图片化处理也失败：${rasterError.message}`);
        }
    }
}

async function processSingleFileDirect(file) {
    const { doc: pdfDoc, ignoredEncryption } = await loadPdfWithDecryption(await file.arrayBuffer());
    if (ignoredEncryption) {
        throw new Error('该文件带有编辑权限限制，改用页面图片化方式处理以保证水印可见');
    }
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;
    const selectedIds = file.selectedWatermarks || watermarkConfigs.map(c => c.id);
    const fileConfig = watermarkConfigs.filter(c => selectedIds.includes(c.id));

    if (fileConfig.length === 0) throw new Error(`文件「${file.name}」没有选择任何水印`);

    for (let configIndex = 0; configIndex < fileConfig.length; configIndex++) {
        const config = fileConfig[configIndex];
        const pagesToApply = getPagesToApplyForFile(file, config, totalPages, configIndex);
        if (pagesToApply.length === 0) continue;
        for (const pageIndex of pagesToApply) {
            await applyWatermarkToPage(pages[pageIndex], config, pdfDoc, configIndex + 1);
        }
    }

    const bytes = await pdfDoc.save({ useObjectStreams: false, addDefaultPage: false });
    return {
        bytes,
        method: ignoredEncryption ? 'ignoreEncryption' : 'direct',
        warning: ignoredEncryption ? '该文件带有权限限制，已尝试忽略权限限制直接加水印；如水印不可见，请使用页面图片化兜底结果。' : '',
    };
}

function getWatermarkConfigsForFile(file) {
    const selectedIds = file.selectedWatermarks || watermarkConfigs.map(c => c.id);
    const fileConfig = watermarkConfigs.filter(c => selectedIds.includes(c.id));
    if (fileConfig.length === 0) throw new Error(`文件「${file.name}」没有选择任何水印`);
    return fileConfig;
}

function getPagesToApplyForFile(file, config, totalPages, configIndex) {
    const override = file.watermarkPageOverrides?.[config.id];
    const source = override?.pageMode === 'custom'
        ? (override.customPages || [])
        : config.pageMode === 'custom'
            ? (config.customPages || [])
            : null;
    const pagesToApply = source
        ? source.filter(p => p >= 0 && p < totalPages)
        : Array.from({ length: totalPages }, (_, i) => i);
    if (source && pagesToApply.length === 0) {
        console.warn(`水印 #${configIndex + 1} 在「${file.name}」没有匹配页码，已跳过这个水印`);
    }
    return pagesToApply;
}

async function processSingleFileRasterized(file) {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js 未加载，无法执行页面图片化兜底处理');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdfJsDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
    const newPdf = await PDFDocument.create();
    const fileConfig = getWatermarkConfigsForFile(file);

    for (let pageNumber = 1; pageNumber <= pdfJsDoc.numPages; pageNumber++) {
        const pdfJsPage = await pdfJsDoc.getPage(pageNumber);
        const viewport = pdfJsPage.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await pdfJsPage.render({ canvasContext: context, viewport }).promise;

        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const imageBytes = await fetch(imageDataUrl).then(res => res.arrayBuffer());
        const background = await newPdf.embedJpg(imageBytes);

        const pageWidth = viewport.width / 2;
        const pageHeight = viewport.height / 2;
        const page = newPdf.addPage([pageWidth, pageHeight]);
        page.drawImage(background, { x: 0, y: 0, width: pageWidth, height: pageHeight });
    }

    const pages = newPdf.getPages();
    const totalPages = pages.length;
    for (let configIndex = 0; configIndex < fileConfig.length; configIndex++) {
        const config = fileConfig[configIndex];
        const pagesToApply = getPagesToApplyForFile(file, config, totalPages, configIndex);
        for (const pageIndex of pagesToApply) {
            await applyWatermarkToPage(pages[pageIndex], config, newPdf, configIndex + 1);
        }
    }

    return newPdf.save({ useObjectStreams: false, addDefaultPage: false });
}

async function applyWatermarkToPage(page, config, pdfDoc, displayIndex = 1) {
    const { width, height } = page.getSize();
    const opacity = clampNumber(config.opacity, 0.05, 1, 0.3);
    const rotation = clampNumber(config.rotation, -180, 180, -35);

    if (config.type === 'text') {
        const text = config.text || '';
        if (!text.trim()) throw new Error(`水印 #${displayIndex} 的文字不能为空`);
        const fontSize = clampNumber(config.fontSize, 10, 200, 48);
        const textImage = await createTextWatermarkImage(text, fontSize, config.color, config);
        const imageBytes = await fetch(textImage).then(res => res.arrayBuffer());
        const image = await pdfDoc.embedPng(imageBytes);
        const imgDims = image.scale(clampNumber(config.scale, 0.05, 2, 0.25) * 4);
        const positions = calculateImagePositions(config, width, height, imgDims);
        positions.forEach(pos => drawRotatedImage(page, image, pos.x, pos.y, imgDims.width, imgDims.height, rotation, opacity));
    } else {
        if (!config.image || !['image/png', 'image/jpeg'].includes(config.imageType)) {
            throw new Error(`请为水印 #${displayIndex} 上传 PNG 或 JPG 图片`);
        }
        const imageBytes = await fetch(config.image).then(res => res.arrayBuffer());
        const image = config.imageType === 'image/png'
            ? await pdfDoc.embedPng(imageBytes)
            : await pdfDoc.embedJpg(imageBytes);
        const imgDims = image.scale(clampNumber(config.scale, 0.05, 2, 0.25));
        const positions = calculateImagePositions(config, width, height, imgDims);
        positions.forEach(pos => drawRotatedImage(page, image, pos.x, pos.y, imgDims.width, imgDims.height, rotation, opacity));
    }
}

function calculateWatermarkPositions(config, pageWidth, pageHeight, textWidth, fontSize) {
    const positions = [];
    const padding = 20;
    const getPosition = () => {
        switch (config.position) {
            case 'top-left': return { x: padding, y: pageHeight - fontSize - padding };
            case 'top-center': return { x: (pageWidth - textWidth) / 2, y: pageHeight - fontSize - padding };
            case 'top-right': return { x: pageWidth - textWidth - padding, y: pageHeight - fontSize - padding };
            case 'middle-left': return { x: padding, y: (pageHeight - fontSize) / 2 };
            case 'center': return { x: (pageWidth - textWidth) / 2, y: pageHeight / 2 - fontSize / 2 };
            case 'middle-right': return { x: pageWidth - textWidth - padding, y: (pageHeight - fontSize) / 2 };
            case 'bottom-left': return { x: padding, y: padding };
            case 'bottom-center': return { x: (pageWidth - textWidth) / 2, y: padding };
            case 'bottom-right': return { x: pageWidth - textWidth - padding, y: padding };
            case 'custom': {
                const x = clampNumber(config.customPosX, 0, 100, 50) / 100 * pageWidth;
                const y = clampNumber(config.customPosY, 0, 100, 50) / 100 * pageHeight;
                return { x: x - textWidth / 2, y: pageHeight - y - fontSize / 2 };
            }
            default: return { x: (pageWidth - textWidth) / 2, y: pageHeight / 2 };
        }
    };
    if (config.repeatMode === 'once') positions.push(getPosition());
    else if (config.repeatMode === 'repeat') {
        const count = clampNumber(config.repeatCount, 2, 20, 4);
        const centerX = pageWidth / 2;
        const centerY = pageHeight / 2;
        const radius = Math.min(pageWidth, pageHeight) * 0.3;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            positions.push({ x: centerX + Math.cos(angle) * radius - textWidth / 2, y: centerY + Math.sin(angle) * radius - fontSize / 2 });
        }
    } else if (config.repeatMode === 'tile') {
        const stepX = Math.max(textWidth + 100, 160);
        const stepY = Math.max(fontSize + 100, 120);
        for (let y = padding; y < pageHeight; y += stepY) {
            for (let x = padding; x < pageWidth; x += stepX) positions.push({ x, y });
        }
    }
    return positions;
}

function calculateImagePositions(config, pageWidth, pageHeight, imgDims) {
    const positions = [];
    const padding = 20;
    const getPosition = () => {
        switch (config.position) {
            case 'top-left': return { x: padding, y: pageHeight - imgDims.height - padding };
            case 'top-center': return { x: (pageWidth - imgDims.width) / 2, y: pageHeight - imgDims.height - padding };
            case 'top-right': return { x: pageWidth - imgDims.width - padding, y: pageHeight - imgDims.height - padding };
            case 'middle-left': return { x: padding, y: (pageHeight - imgDims.height) / 2 };
            case 'center': return { x: (pageWidth - imgDims.width) / 2, y: (pageHeight - imgDims.height) / 2 };
            case 'middle-right': return { x: pageWidth - imgDims.width - padding, y: (pageHeight - imgDims.height) / 2 };
            case 'bottom-left': return { x: padding, y: padding };
            case 'bottom-center': return { x: (pageWidth - imgDims.width) / 2, y: padding };
            case 'bottom-right': return { x: pageWidth - imgDims.width - padding, y: padding };
            case 'custom': {
                const x = clampNumber(config.customPosX, 0, 100, 50) / 100 * pageWidth;
                const y = clampNumber(config.customPosY, 0, 100, 50) / 100 * pageHeight;
                return { x: x - imgDims.width / 2, y: pageHeight - y - imgDims.height / 2 };
            }
            default: return { x: (pageWidth - imgDims.width) / 2, y: (pageHeight - imgDims.height) / 2 };
        }
    };
    if (config.repeatMode === 'once') positions.push(getPosition());
    else if (config.repeatMode === 'repeat') {
        const count = clampNumber(config.repeatCount, 2, 20, 4);
        const centerX = pageWidth / 2;
        const centerY = pageHeight / 2;
        const radius = Math.min(pageWidth, pageHeight) * 0.3;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            positions.push({ x: centerX + Math.cos(angle) * radius - imgDims.width / 2, y: centerY + Math.sin(angle) * radius - imgDims.height / 2 });
        }
    } else if (config.repeatMode === 'tile') {
        const stepX = Math.max(imgDims.width + 70, 120);
        const stepY = Math.max(imgDims.height + 70, 100);
        for (let y = padding; y < pageHeight; y += stepY) {
            for (let x = padding; x < pageWidth; x += stepX) positions.push({ x, y });
        }
    }
    return positions;
}

function downloadPdf(bytes, fileName) {
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), fileName);
}

function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function hexToRgbColor(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? rgb(parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255) : rgb(1, 0, 0);
}

function drawRotatedImage(page, image, x, y, width, height, rotation, opacity) {
    page.drawImage(image, { x, y, width, height, opacity, rotate: degrees(rotation) });
}

async function createTextWatermarkImage(text, fontSize, color, config = {}) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const padding = 20;
        const font = buildCanvasFont(config, fontSize);
        ctx.font = font;
        const metrics = ctx.measureText(text);
        const textWidth = Math.ceil(metrics.width);
        const textHeight = Math.ceil(
            (metrics.actualBoundingBoxAscent || fontSize * 0.8) +
            (metrics.actualBoundingBoxDescent || fontSize * 0.2)
        );
        canvas.width = textWidth + padding * 2;
        canvas.height = textHeight + padding * 2;
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('无法创建文字水印图片'));
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        }, 'image/png');
    });
}

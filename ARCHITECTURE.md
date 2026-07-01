# Re: LeechBlock NG — 架构与实现说明

> 面向后续维护者（人类与 AI）的项目地图。说明目录结构、核心数据模型、运行机制，以及本项目新引入的 I18N（国际化）机制。
> 本文不重复 README 内容；README 面向终端用户，本文面向开发者。

## 1. 项目简介

- **本项目**：[LeechBlock NG](https://www.proginosko.com/leechblock/) 的中文 "Re:" fork。LeechBlock 是一款拦截"浪费时间"网站的效率扩展。
- **平台**：Chrome **Manifest V3** 扩展（`manifest.json` 中 `manifest_version: 3`）。各脚本顶部用 `const browser = chrome;` 把 `browser` 别名到 `chrome`，因此代码风格类 WebExtension，但实际依赖 Chrome API（`chrome.i18n` 同步可用、`action`、`offscreen`、Service Worker 等）。
- **后台**：MV3 Service Worker（`background.js`），无持久后台页。
- **许可证**：MPL 2.0。

## 2. 目录结构（顶层职责）

| 路径 | 职责 |
| --- | --- |
| `manifest.json` | 扩展清单。MV3。`name`/`description` 用 `__MSG_…__` 由 `chrome.i18n` 解析；`default_locale: en`。 |
| `background.js` | **核心**。Service Worker：拦截判定、计时、锁定/覆盖、右键菜单、命令、消息路由、徽章与图标、offscreen ticker 管理。 |
| `common.js` | 共享工具 + **选项 schema**（`PER_SET_OPTIONS`、`GENERAL_OPTIONS`）+ 时间/站点/正则等纯函数。被后台与各设置页共享加载。 |
| `content.js` | 内容脚本（`run_at: document_start`，匹配 `<all_urls>`）。注入页面计时器与警告提示框。 |
| `i18n.js` | **新增**。运行时 DOM 本地化器：把 `data-i18n*` 标记替换为 `chrome.i18n` 译文。见第 5 节。 |
| `popup.html` / `popup.js` | 工具栏弹出菜单（选项、锁定、覆盖、统计、添加站点等按钮）。 |
| `options.html` / `options.js` | **主设置页**（最大）。三个标签：拦截集（可 1–30 个，由 1 号克隆生成）、通用、关于。 |
| `stats.html` / `stats.js` | 统计页（每拦截集的用时/限额/锁定等）。 |
| `add-sites.html` / `add-sites.js` | "添加站点到拦截集"页。 |
| `lockdown.html` / `lockdown.js` | 锁定页（在一段时间内强制拦截选定拦截集）。 |
| `override.html` / `override.js` | 临时覆盖页（暂停拦截一段时间，可带密码/访问码）。 |
| `diagnostics.html` / `diagnostics.js` | 诊断页（用 URL 测试当前拦截集的正则匹配；输出为技术文本）。 |
| `blocked.html` / `delayed.html` / `password.html` | 三种拦截结果页，**共用 `blocked.js`**（也作为 `*lb-custom*` 页的内容脚本）。 |
| `ticker.html` / `ticker.js` | offscreen 文档，用于在 MV3 下维持后台计时心跳（无 UI 文本）。 |
| `_locales/<lang>/messages.json` | **翻译单一数据源**。`en` 为完整基底，`zh_CN` 为完整中文。 |
| `themes/*.css` | 主题（default/light/dark/spruce）。由 `setTheme()`（`common.js`）通过 `#themeLink` 切换。 |
| `style.css` / `options.css` / `popup.css` / `content.css` / `fonts.css` | 各页样式。 |
| `icons/` `images/` `fonts/` | 图标、Logo、内嵌 Open Sans 字体。 |
| `jquery-ui/` | 设置类页面使用的 jQuery + jQuery UI（标签页、对话框、按钮）。 |

## 3. 核心数据模型

定义于 `common.js`：

- **`PER_SET_OPTIONS`**：每个拦截集的选项 schema（`setName`、`sites`、`times`、`limitMins`、`blockURL`、`days`、各类延迟/覆盖/正则开关等）。每项含 `def`（默认值）、`type`、`id`（对应 `options.html` 中的表单元素 id，**不含集编号**，集编号在运行时追加，如 `sites1`、`sites2`）。
- **`GENERAL_OPTIONS`**：全局选项 schema（`numSets`、`theme`、访问控制、计时器、警告、覆盖、性能、导入导出等）。
- **`timedata<set>`**：每集一个 9 元组数组，含义见 `common.js` 中 `cleanTimeData()` 上方注释（统计起点、累计用时、限额周期、锁定结束、结转时间等）。
- 选项存储在 `chrome.storage.local`（或开启同步时 `chrome.storage.sync`）。`cleanOptions()`/`cleanTimeData()` 负责补全与类型校正。

> **多拦截集的克隆机制**：`options.html`/`stats.html`/`lockdown.html` 中只静态写出"1 号集"的标记，JS（`options.js:initForm` 等）用正则把 `id="…1"` 替换为 `id="…N"`、把文本 `Block Set 1` 替换为 `Block Set N` 来克隆出 2..N 号。**因此 `data-i18n` 的键值不能带集编号**（克隆会共享同一键，正是期望行为）；而"集名"这类动态文本由 JS 单独用 `getMessage("blockSetDefaultName", [n])` 设置。

## 4. 运行机制（简述）

- **拦截判定**：`background.js` 监听标签/导航事件，对每个 URL 按各拦截集的站点正则、时间段、时间限额、星期、锁定/覆盖状态综合判定，命中则重定向到拦截页 URL 模板（`DEFAULT_BLOCK_URL = "blocked.html?$S&$U"` 等，`$S`=集号、`$U`=原 URL、`$K`=关键词）。
- **拦截页数据**：`blocked.js` 向后台 `sendMessage({type:"blocked"})` 拉取信息（被拦截 URL、集名、解除时间、自定义留言、延迟秒数等），填入页面动态占位元素（这些是**数据**，非 UI 文案，不参与 i18n）。
- **计时**：`content.js` 注入页面计时器；后台用 alarms/offscreen ticker 周期累计用时并存储。
- **警告**：`background.js:checkWarning()` 在临近拦截时向标签页发 `{type:"alert", text}`，由 `content.js:showAlert()` 显示。文案经 `chrome.i18n.getMessage("alertSitesBlockedIn"/"…Named", …)` 本地化。
- **锁定/覆盖**：`lockdown.js`/`override.js` 计算结束时间并发消息给后台；后台写入 `timedata`/选项。

## 5. I18N 机制（本项目新增，重点）

### 5.1 设计

- **单一数据源**：所有界面文案集中在 `_locales/<lang>/messages.json`，键名见各页 `data-i18n*` 属性与 JS 中 `getMessage(...)` 调用。
- **运行时 DOM 本地化**：`chrome.i18n` 不会自动替换 HTML 文本（只处理 manifest 与 CSS），故由 `i18n.js` 在 `DOMContentLoaded` 时遍历并替换标记元素。每个有界面文案的页面都在自身页面脚本前引入 `<script src="/i18n.js"></script>`（`ticker.html` 无 UI，未引入）。

### 5.2 标记属性（`i18n.js` 支持）

| 属性 | 作用 |
| --- | --- |
| `data-i18n` | 设置 `textContent`（纯文本） |
| `data-i18n-html` | 设置 `innerHTML`（用于含 `<code>`/`<a>`/`<strong>`/`<br>` 等可信静态标记的文案） |
| `data-i18n-placeholder` | 设置 `placeholder` 属性 |
| `data-i18n-title` | 设置 `title` 属性 |
| `data-i18n-label` / `data-i18n-value` | 设置 `label` / `value` 属性 |
| `<body data-i18n-document-title="key">` | 设置 `document.title` |

取不到译文时**保留原 HTML 文本**（英文兜底），不会出现空白或键名。`i18n.js` 还把 `window.localizePage` 暴露给页面脚本。

### 5.3 与"重置表单"页面脚本的协作（重要陷阱）

`options.js`/`stats.js`/`lockdown.js` 在 `DOMContentLoaded` 时会把 `#form` 重置为原始英文 HTML（`gFormHTML`）并克隆出多份拦截集/行。这会**覆盖** `i18n.js` 在 `DOMContentLoaded` 的首次本地化。因此这些脚本在表单重建完成、显示前会再次调用 `window.localizePage()` 重新本地化：
- `options.js`：在 `confirmAccess()` 开头调用。
- `stats.js` / `lockdown.js`：在 `$("#form").show()` 前调用。

不重置表单的页面（`popup`/`blocked`/`add-sites`/`override`/`diagnostics`）依赖 `i18n.js` 的 `DOMContentLoaded` 一次本地化即可。

### 5.4 句中带表单控件的文案

当一句话中间嵌有 `<input>`/`<select>`（如"至少拦截站点 [N] 分钟"），拆成 `…Pre` / `…Post` 两个 `<span data-i18n>` 包住前后文，控件保持不动。译文需保证语序在前后片段中读得通（中文已按此调整）。

### 5.5 占位符与转义

带变量的消息使用命名占位符（`$SET$`/`$SECS$`/`$NAME$`，映射到 `getMessage(key, [a,b,…])` 的 `$1`/`$2`/…），例如 `blockSetDefaultName`、`blockSetNamed`、`lockdownSiteLabel`、`alertSitesBlockedIn[Named]`。消息文本中的字面 `$` 需转义为 `$$`（如 `optBlockURLTitle` 的 `$$U`、`optSitesURLTitle` 的 `$$S`/`$$T`）。

### 5.6 jQuery UI 对话框按钮

各设置页的 jQuery UI 对话框按钮由 JS 创建，已从对象写法 `{ OK: fn }` 改为数组写法 `[{ text: getMessage("buttonOK"), click: fn }]` 以便本地化（`buttonOK`/`buttonCancel`）。

### 5.7 新增一种语言

只需新增 `_locales/<lang>/messages.json`，按 `en` 的键逐条翻译即可（缺失键自动回退到 `default_locale` = `en`）。无需改任何 HTML/JS。

### 5.8 语言现状

- **完整维护**：`en`（基底）、`zh_CN`（中文）。
- **部分**：`de`/`es`/`he`/`it`/`pt_BR`/`vi` 仅含扩展名/描述/右键菜单等少量旧键，其余自动回退英文（其中 `de` 已清理掉已废弃的 `localePath` 键；其余文件中残留的 `localePath` 为无用死键，不影响功能）。

### 5.9 已移除的旧机制

原版用"按语言整页复制 HTML 到 `de/ es/ …` 子目录" + `localePath` + `common.js:getLocalizedURL()` 切换。本次重构已**全部删除**：删除了各语言 HTML 子目录、`getLocalizedURL()`、`background.js` 中对 `localePath` 的读取（弹窗与拦截页 URL 改用普通路径）。

## 6. 页面与脚本对照

| 页面 | 脚本 | 入口/用途 |
| --- | --- | --- |
| `popup.html` | `popup.js` | 工具栏弹出 |
| `options.html` | `common.js` + `i18n.js` + `options.js` | 主设置页（`options_ui`，`open_in_tab`） |
| `stats.html` | `common.js` + `i18n.js` + `stats.js` | 统计 |
| `add-sites.html` | `common.js` + `i18n.js` + `add-sites.js` | 添加站点 |
| `lockdown.html` | `common.js` + `i18n.js` + `lockdown.js` | 锁定 |
| `override.html` | `common.js` + `i18n.js` + `override.js` | 临时覆盖 |
| `diagnostics.html` | `common.js` + `i18n.js` + `diagnostics.js` | 诊断 |
| `blocked/delayed/password.html` | `i18n.js` + `blocked.js` | 拦截结果页 |
| `ticker.html` | `ticker.js` | offscreen 计时心跳（无 UI） |

## 7. 本地开发与验证

1. Chrome `chrome://extensions` → 打开"开发者模式" → "加载已解压的扩展程序" → 选择项目根目录，确认无清单/缺文件错误。
2. 英文环境逐页核对文案；中文环境（Chrome 语言设为简体中文并重启）复核全部呈现中文，触发一次拦截核对拦截页与警告提示。
3. 校验译文 JSON：`node -e "JSON.parse(require('fs').readFileSync('_locales/zh_CN/messages.json','utf8'))"`。
4. 全局搜索确认无 `getLocalizedURL`/`localePath` 残留引用、无裸 `__MSG_`/`data-i18n` 文本泄漏。

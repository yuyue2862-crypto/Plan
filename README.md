# 四象限时间管理 · 第 1 步

轻量的四象限任务工具，使用 Vite、React 和 TypeScript。真实任务保存在当前浏览器本地，无后端或账号。

## 本地运行

```bash
npm install
npm run dev
```

浏览器访问终端显示的地址，默认是 `http://localhost:5173/`。

## 局域网手机预览

确认 Mac 和手机连接到同一个 Wi-Fi，然后运行：

```bash
npm run dev:lan
```

Vite 会在终端显示 `Local` 和 `Network` 两个地址。手机浏览器打开 `Network` 行中的地址，例如 `http://192.168.1.20:5173/`，即可使用现有的响应式手机页面。

若 5173 已被占用，Vite 会自动选择可用端口，并在终端输出实际端口；手机应使用该条 `Network` 地址。

## 手机 HTTPS 实机预览

语音权限、手机拍照和相册选择应通过安全的 HTTPS 地址测试。项目提供受邮箱验证码保护的 Cloudflare Quick Tunnel 启动命令：

```bash
npm run phone:preview
```

启动过程会：

1. 在终端提示输入允许访问的邮箱。邮箱只传给当前 `cloudflared --allowed-mail` 进程，不写入项目文件、任务数据或 Git 仓库。
2. 执行 `npm run build`，确保使用最新生产构建。
3. 在仅本机可访问的 `127.0.0.1` 地址启动 Vite preview；默认从 4173 开始选择空闲端口。
4. 创建临时 `https://随机名称.trycloudflare.com` 地址，并在终端完整打印。

手机打开终端打印的 HTTPS 地址，输入刚才允许的邮箱，再输入 Cloudflare 发到该邮箱的一次性验证码。结束测试时回到 Mac 终端按 `Ctrl+C`，本地 preview 和 Quick Tunnel 会一起关闭，临时网址随即失效。

如果终端提示“隧道网络连接失败”，说明 `cloudflared` 尚未连上 Cloudflare Edge，网址不会被误报为可用。请暂时切换网络，或在防火墙／VPN／代理软件中允许 Cloudflare Tunnel 出站 TCP 或 UDP 7844 后重试；这类错误发生在网页加载之前，与麦克风、语音转写或 OCR 无关。

Vite 只允许 `trycloudflare.com` 的 Quick Tunnel 主机名通过 preview Host 校验；本地 preview 只监听 `127.0.0.1`。没有启用 `allowedHosts: true`，也没有开放任意 Host。

当前 Mac 没有 Homebrew，因此本项目使用经过 Apple Developer ID 签名校验的 Cloudflare 官方 Apple Silicon 二进制，位置是被 Git 忽略的 `.tools/cloudflared`。若以后安装了 Homebrew，可执行：

```bash
brew install cloudflared
```

启动脚本会优先使用 PATH 中的 Homebrew 版本；也可临时通过 `CLOUDFLARED_PATH` 指定其他官方二进制。若希望在非交互终端运行，可临时设置 `PHONE_PREVIEW_EMAIL`，该环境变量同样不会由项目保存。

注意：手机 HTTPS 域名与 Mac 的 `localhost` 是不同浏览器来源，二者的 `localStorage` 相互独立。手机测试任务不会自动同步到 Mac，本功能也不会清空或迁移任何已有任务。

手机诊断提示会区分：浏览器缺少原生语音识别、麦克风权限被拒绝、无法取得音频、语音服务网络失败、未检测到语音、OCR 模型加载失败、图片无法识别等情况。Safari／部分手机浏览器是否提供普通话原生语音识别仍取决于浏览器；OCR 首次打开需要加载约 50 MB 的本地模型资源。

```bash
npm run test
npm run build
```

## 当前数据说明

- `src/data/demoTasks.ts` 是独立的演示数据。保存第一项真实任务后，主页切换为真实任务模式，不混合展示或统计。
- 演示任务完成只影响本次页面；真实任务完成会写入浏览器本地存储。
- 日期筛选以任务截止日期为准；无截止日期时以创建日期为准。已逾期且未完成的任务在任一有效日期范围内继续显示。
- “当前逾期”按全局未完成任务统计，包含待分类任务，不受页面日期筛选影响。
- 新建任务支持文字、语音与拍照 OCR 录入，三者共用候选预览和分类保存流程。完整任务详情编辑仍待后续阶段接入。

## 代码位置

- `src/domain/tasks.ts`：任务类型、排序、日期筛选、逾期判断与日期显示。
- `src/data/demoTasks.ts`：隔离的演示任务数据读取。
- `src/App.tsx`：页面组件及本次页面内的交互状态。
- `src/styles.css`：桌面和手机布局样式。

## 正式任务数据接口（第 2-1 步）

正式任务保存在当前浏览器当前站点的 `localStorage`，键为 `four-quadrant:tasks:v1`，数据格式带 `version: 1`。`src/data/taskRepository.ts` 的 `browserTaskRepository()` 提供 `read`、`add`、`update`、`updateStatus`、`remove` 和 `findById`。这些方法返回 `{ ok: true, value }` 或 `{ ok: false, code, message }`，调用方应处理失败结果。

正式任务结构定义在 `src/domain/tasks.ts` 的 `SavedTask`。截止日期和具体时刻分别保存为 `dueDate`、`dueTime`，未填写时均为 `null`。重要性、紧急性可独立保持未判断状态；工作状态使用字符串以兼容后续已冻结的状态集合。

演示数据不会写入正式任务存储。新建任务入口通过 `add({ title, ... })` 保存，编辑和状态变更分别调用 `update`、`updateStatus`。损坏或未知版本的数据会返回错误并保留原始存储，不会自动覆盖。

## 文字批量录入（第 2-2 步）

点击“新建任务”，按行输入内容并生成预览。行首的数字编号（`1.`、`1、`、`（1）`）或中文编号（`一、`）会被移除；普通逗号保留在任务正文中。预览可编辑、选择、合并相邻项、按字符位置拆分。疑似重复任务需要明确选择跳过、仍然保存或返回编辑。

未保存内容暂存在独立的 `four-quadrant:text-draft:v1` 草稿键中。保存成功的候选项从草稿移除；失败项保留供重试。新任务默认“待开始”；重要性和紧急性都确定后显示在相应象限，否则进入待分类。

## 日期识别与任务分类

文字预览会按本机日期识别“今天、明天、后天、本周五、下周五、月底、下个月月底”、中文年月日和 `YYYY-MM-DD`。原任务名称不变。识别出的日期必须在预览中确认或修改；缺少年份、可能已过去或无效的日期会提示核对。只有日期时不补充截止时刻。

重要性由“主要职责／目标／考核”和“严重后果／明显影响”两个问题判断：任一“是”为重要，两题都“否”为不重要，其余暂不确定。人工重要性调整优先。无截止日期时人工选择紧急性；有截止日期时按默认 3 天自动判断，可在“紧急性设置”中改为 1—14 天，人工锁定紧急性优先。任务逾期仍显示警示。修改截止日期或阈值后，未锁定任务的象限会重新计算。

旧版真实任务继续使用 `four-quadrant:tasks:v1`，新分类字段为可选字段，不会在读取时改写旧记录。原有无截止日期的紧急性选择保留。点击“待分类任务”中的任务可补充分类；已进入象限的真实任务可通过任务行的详情箭头调整分类和截止日期。设置单独保存在 `four-quadrant:settings:v1`。

## 语音与拍照 OCR 录入

- 语音：打开“新建任务 → 语音录入”，按住按钮说普通话，松开识别；上滑 80px 后松开可取消，单段最多 60 秒。各段识别文字可编辑、删除并合并生成候选任务。若录制到音频，可在当前弹窗回听；浏览器原生语音识别**不能重新转写已保存的录音**。不支持语音识别时会提示改用文字录入。
- 麦克风：使用浏览器的 `SpeechRecognition`／`webkitSpeechRecognition`、`getUserMedia` 和 `MediaRecorder`，运行时逐项检查支持情况。浏览器可能使用自己的在线识别服务；本项目不上传音频到自建服务。麦克风需要安全上下文和浏览器授权。Mac 的 `localhost` 属于安全上下文；手机通过局域网 `http://IP:端口` 访问时，浏览器可能阻止麦克风，请改用 HTTPS 环境或文字录入。
- OCR：可拍照、从相册选图或电脑上传，每次最多 5 张。每张图可选择裁剪并独立调整左、上、宽、高比例；逐张识别，失败可单独重试，成功文字保持可编辑。原图默认折叠。识别文字沿用同一个任务拆分、日期确认、分类和保存流程。
- OCR 技术：Tesseract.js 7，简体中文 `chi_sim` 与英文 `eng`。`public/ocr/` 存放本地 worker、WASM 核心和压缩语言模型（合计约 50 MB）；首次加载需要一些时间，语言模型由 Tesseract.js 在浏览器 IndexedDB 中缓存。无需付费接口或 API 密钥。语言模型来自 [Project Naptha tessdata](https://tessdata.projectnaptha.com/4.0.0/)，运行核心来自 `tesseract.js-core`，对应许可文本在 `public/ocr/core-LICENSE.txt`。
- 存储：正式任务只保存确认后的文字与分类字段；语音和 OCR 的未保存文字写入独立草稿。音频 Blob 和原图只在当前弹窗内存中保留，关闭后释放，刷新后不能回听或恢复原图。原图不写入任务数据库或 `localStorage`。

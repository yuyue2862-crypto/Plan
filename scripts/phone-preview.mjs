import { spawn, spawnSync } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const projectCloudflared = new URL("../.tools/cloudflared", import.meta.url);
const viteCli = new URL("../node_modules/vite/bin/vite.js", import.meta.url);
const tunnelUrlPattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/iu;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const children = new Set();
let stopping = false;
let temporaryConfigDirectory = "";

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  if (children.size) {
    setTimeout(() => {
      for (const child of children) {
        if (!child.killed) child.kill("SIGKILL");
      }
      process.exit(exitCode);
    }, 1_500);
  }
  if (temporaryConfigDirectory) void rm(temporaryConfigDirectory, { recursive: true, force: true });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

async function executableExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function commandWorks(command, args) {
  return spawnSync(command, args, { stdio: "ignore" }).status === 0;
}

async function findCloudflared() {
  const configured = process.env.CLOUDFLARED_PATH?.trim();
  if (configured) {
    if (!await executableExists(configured)) throw new Error(`CLOUDFLARED_PATH 不可用：${configured}`);
    return configured;
  }
  if (commandWorks("cloudflared", ["--version"])) return "cloudflared";
  if (await executableExists(projectCloudflared)) return fileURLToPath(projectCloudflared);
  throw new Error("未找到 cloudflared。请先运行 brew install cloudflared，或按 README 的备用方式安装项目本地版本。");
}

async function askEmail() {
  const configured = process.env.PHONE_PREVIEW_EMAIL?.trim();
  if (configured) {
    if (!emailPattern.test(configured)) throw new Error("PHONE_PREVIEW_EMAIL 不是有效邮箱地址");
    return configured;
  }
  if (!input.isTTY) throw new Error("当前终端无法交互输入邮箱。请临时设置 PHONE_PREVIEW_EMAIL 后重试。");
  const prompt = createInterface({ input, output });
  try {
    const value = (await prompt.question("请输入接收 Cloudflare 验证码的邮箱（不会写入项目）： ")).trim();
    if (!emailPattern.test(value)) throw new Error("邮箱格式不正确，未启动手机预览");
    return value;
  } finally {
    prompt.close();
  }
}

async function freePort(start = 4173, end = 4192) {
  for (let port = start; port <= end; port += 1) {
    const alreadyListening = await new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      socket.setTimeout(250);
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("timeout", () => { socket.destroy(); resolve(false); });
      socket.once("error", () => resolve(false));
    });
    if (alreadyListening) continue;
    const available = await new Promise((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error(`本机 ${start}–${end} 端口均被占用`);
}

async function waitForPreview(url, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite preview 已退出（代码 ${child.exitCode}）`);
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.ok) return;
    } catch {
      // Preview can take a brief moment to bind after the process starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("等待 Vite preview 启动超时");
}

function listenToTunnel(stream, onLine) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/u);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const visibleLine = onLine(line) ?? line;
      process.stderr.write(`${visibleLine}\n`);
    }
  });
}

async function main() {
  const cloudflared = await findCloudflared();
  const email = await askEmail();

  console.log("\n[1/3] 构建最新页面…");
  const build = spawnSync("npm", ["run", "build"], { cwd: projectRoot, stdio: "inherit" });
  if (build.status !== 0) throw new Error("npm run build 失败，手机预览未启动");

  const port = await freePort();
  const localUrl = `http://127.0.0.1:${port}`;
  console.log(`\n[2/3] 启动只监听本机的 Vite preview：${localUrl}`);
  const preview = spawn(process.execPath, [fileURLToPath(viteCli), "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: projectRoot,
    stdio: ["ignore", "inherit", "inherit"],
  });
  children.add(preview);
  preview.on("exit", (code) => {
    children.delete(preview);
    if (!stopping) {
      console.error(`Vite preview 意外退出（代码 ${code ?? "未知"}）`);
      stop(1);
    }
  });
  await waitForPreview(localUrl, preview);

  console.log("\n[3/3] 创建受邮箱验证码保护的 Cloudflare Quick Tunnel…");
  temporaryConfigDirectory = await mkdtemp(join(tmpdir(), "plan-phone-preview-"));
  const tunnelConfig = join(temporaryConfigDirectory, "cloudflared.yml");
  await writeFile(tunnelConfig, "protocol: auto\n", { encoding: "utf8", mode: 0o600 });
  const tunnel = spawn(cloudflared, [
    "tunnel", "--config", tunnelConfig, "--no-autoupdate",
    "--url", localUrl, "--allowed-mail", email,
  ], { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] });
  children.add(tunnel);
  let announced = false;
  let protectedUrl = "";
  let edgeConnected = false;
  const announce = (url) => {
    if (announced) return;
    announced = true;
    console.log("\n============================================================");
    console.log(`手机 HTTPS 地址：${url}`);
    console.log("手机打开后，输入刚才填写的邮箱，再输入收到的一次性验证码。");
    console.log("按 Ctrl+C 同时关闭临时链接和本地预览服务。");
    console.log("============================================================\n");
  };
  const inspectLine = (line) => {
    protectedUrl ||= line.match(tunnelUrlPattern)?.[0] ?? "";
    if (/registered tunnel connection/iu.test(line)) edgeConnected = true;
    if (protectedUrl && edgeConnected) announce(protectedUrl);
    return edgeConnected ? line : line.replace(tunnelUrlPattern, "[等待 Cloudflare Edge 连接成功后显示]");
  };
  listenToTunnel(tunnel.stdout, inspectLine);
  listenToTunnel(tunnel.stderr, inspectLine);
  const connectionTimeout = setTimeout(() => {
    if (announced || stopping) return;
    console.error("\n隧道网络连接失败：60 秒内未能连接 Cloudflare Edge。请检查防火墙或 VPN，允许出站 TCP 或 UDP 7844 后重试。此错误发生在网页加载之前，与语音识别或 OCR 无关。");
    stop(1);
  }, 60_000);
  tunnel.on("exit", (code) => {
    clearTimeout(connectionTimeout);
    children.delete(tunnel);
    if (!stopping) {
      console.error(`cloudflared 已退出（代码 ${code ?? "未知"}），临时链接已失效。`);
      stop(code === 0 ? 0 : 1);
    }
  });

  await new Promise(() => {});
}

main().catch((error) => {
  console.error(`\n手机预览启动失败：${error instanceof Error ? error.message : String(error)}`);
  stop(1);
});

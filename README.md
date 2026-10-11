# 六级英语精读工作台

在自己电脑上运行的英语文章精读网站。支持逐词释义、短语/句子/段落翻译、本地单词本以及 Markdown / Word 导出。
文章库与单词本保存在**电脑上**（`data/library.json`），因此手机、平板、其他浏览器打开同一地址时看到的是同一份数据。

## 首次运行

1. 将 `.env.example` 复制为 `.env`，填入自己的 DeepSeek API Key：

   ```env
   DEEPSEEK_API_KEY=sk-你的真实密钥
   PORT=3000
   HOST=127.0.0.1
   DATA_DIR=./data
   ```

2. 在本目录执行：

   ```powershell
   npm install
   npm start
   ```

3. 在浏览器打开 [http://localhost:3000](http://localhost:3000)。

4. 如果以前用旧版本存过文章（浏览器 IndexedDB）或单词本（localStorage）：打开「我的精读」，点击**把本机数据上传到服务器**。
   上传是合并式的——文章按 `updatedAt` 取较新的一方，单词本只补服务器上还没有的词；浏览器里的旧数据不会被删除。

## 手机访问（Tailscale 私有组网）

只有你自己的设备能访问，不需要公网 IP，也不用改路由器；在校园网/公共 Wi-Fi 下不会向同网设备开放任何端口。

1. **电脑**：安装并登录 Tailscale（需要管理员权限）

   ```powershell
   winget install --id Tailscale.Tailscale
   tailscale up
   ```

2. **Tailscale 管理后台** → DNS 页面 → 开启 **HTTPS Certificates**（`tailscale serve` 需要它才能签发证书）。

3. **电脑**：把本机 3000 端口反代到 tailnet 的 HTTPS 地址

   ```powershell
   tailscale serve --bg --https=443 http://127.0.0.1:3000
   tailscale serve status
   ```

   `status` 会给出形如 `https://<电脑名>.<tailnet 名>.ts.net` 的地址。

4. **手机**：安装 Tailscale App，登录**同一个账号**并连接，然后用浏览器打开上面那个地址。

5. **加桌面图标**：Android Chrome 菜单 → 添加到主屏幕；iOS Safari → 共享 → 添加到主屏幕。打开后是全屏的应用样式。

6. **电源计划**：控制面板 → 电源选项 → 更改计划设置 → 把「使计算机进入睡眠状态」改为**从不**（至少在插电时），否则电脑睡眠后手机就连不上了。

### 常见故障

| 现象 | 原因与处理 |
| --- | --- |
| 手机打开地址报「无法访问此网站」 | 手机上的 Tailscale 没连接；或电脑上的 Tailscale 服务没登录（`tailscale status` 检查）。 |
| 页面能开但顶部显示「未连接到电脑服务器」 | 电脑上的 `npm start` 没在跑，或端口被占用。 |
| `tailscale serve` 报证书相关错误 | 管理后台的 HTTPS Certificates 没开，或电脑名含不支持的字符。 |
| 手机能开、但打开文章报错 | 看电脑终端里 Node 打印的错误；`data/library.json` 若损坏会明确报出文件路径。 |

### 想在局域网内直连（可选）

把 `.env` 里的 `HOST` 改成 `0.0.0.0` 后重启，手机用 `http://<电脑 IP>:3000` 访问。
注意：这会让同一网络下的其他设备也能访问，公共/校园网络里不安全，仅建议在家用路由器下临时使用。

## 安全说明

- 不要把 `.env`、API Key 或浏览器控制台截图发给任何人；如果曾经发过，去 DeepSeek 后台重置密钥。
- 网页只请求本机服务；DeepSeek Key 仅由电脑上的 Node 服务读取，不会下发到手机。
- 访问控制由 Tailscale 负责：只有登录了同一账号的设备才在同一个 tailnet 里。若以后要把网址分享给别人，需要另行加一层应用密码。
- `data/` 已在 `.gitignore` 中，文章与单词本不会进 git。

## 测试

```powershell
npm test
```

import 'dotenv/config';
import { createApp } from './app.js';
import { createDeepSeekClient } from './deepseek.js';

const port = Number(process.env.PORT || 3000);
// 默认只听回环：手机通过 tailscale serve 进来，校园网/局域网里扫不到这个端口。
// 要在同一 Wi-Fi 内直连，把 .env 里的 HOST 改成 0.0.0.0 后重启。
const host = process.env.HOST || '127.0.0.1';
const apiKey = process.env.DEEPSEEK_API_KEY;
const translator = apiKey
  ? createDeepSeekClient({ apiKey })
  : {
      async translate() {
        const error = new Error('请在 .env 中配置 DEEPSEEK_API_KEY 后重启网站。');
        error.statusCode = 503;
        throw error;
      }
    };

createApp({ translator }).listen(port, host, () => {
  console.log(`六级精读工作台已启动：http://localhost:${port}`);
  if (host === '127.0.0.1') {
    console.log('手机访问：先在电脑上运行 tailscale serve --bg --https=443 http://127.0.0.1:3000，再用手机打开 tailnet 地址。');
  } else {
    console.log(`当前监听 ${host}：同一网络下的设备可用 http://<本机 IP>:${port} 访问（请自行确认防火墙与网络隔离）。`);
  }
});

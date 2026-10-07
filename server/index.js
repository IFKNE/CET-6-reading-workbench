import 'dotenv/config';
import { createApp } from './app.js';
import { createDeepSeekClient } from './deepseek.js';

const port = Number(process.env.PORT || 3000);
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

createApp({ translator }).listen(port, () => {
  console.log(`六级精读工作台已启动：http://localhost:${port}`);
});

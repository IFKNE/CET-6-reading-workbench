# 六级英语精读工作台

这是一个只在本机运行的英语文章精读网站。它支持逐词释义、短语/句子/段落翻译、本地单词本以及 Markdown 导出。

## 首次运行

1. 将 `.env.example` 复制为 `.env`。
2. 在 `.env` 中填入自己的 DeepSeek API Key：

   ```env
   DEEPSEEK_API_KEY=sk-你的真实密钥
   PORT=3000
   ```

3. 在本目录执行：

   ```powershell
   npm install
   npm start
   ```

4. 在浏览器打开 [http://localhost:3000](http://localhost:3000)。

## 安全说明

- 不要把 `.env`、API Key 或浏览器控制台截图发给任何人。
- 网页只请求本机的 `/api/translate`；DeepSeek Key 仅由本机 Node 服务读取。
- 文章和单词本默认保存在当前浏览器的本地存储，不会自动上传或同步。

## 测试

运行：

```powershell
npm test
```

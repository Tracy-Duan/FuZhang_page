# 生产部署

需要 Node.js 22.12+；通过 Nginx 提供 HTTPS 静态网页，并将 `/api/` 转发至本机 Node 服务。以下目录为通用示例，请替换为自己的安装位置。

## 构建与发布

在开发机器执行 `npm ci`、`npm run release`。产物位于 `out/deploy/fuzhang-<时间>/`，可将此目录打包上传至服务器独立版本目录。发布包包含网页、接口、许可说明，不包含账号、密钥、知识库、隔离档案或源码备份。

在发布目录执行：

```sh
npm ci --omit=dev --no-audit --no-fund
npm run init-env
```

初始化只在 `.env.local` 不存在时创建文件，自动生成会话签名密钥和私密邀请码；不要将命令输出或环境文件公开。填写自己的 `DASHSCOPE_API_KEY`，并查看或修改 `INVITE_CODES`。账号路径默认模板为 `/www/fuzhang-data/users.json`，请预先创建其父目录并限制为服务用户访问。另行在服务器私有目录配置自己的知识库，设置 `HANFU_RAG_DATA_DIR`；运行包不带数据。启动前检查文件权限和模型访问权限。

PDF/DOCX附件需要 Python 环境：

```sh
python3 -m venv /www/fuzhang-data/venv
/www/fuzhang-data/venv/bin/python -m pip install -r server/requirements-attachments.txt
```

将 `FUZHANG_PYTHON` 指向该 Python。随后通过进程管理器以单个实例运行 `npm start`，工作目录为发布目录。服务仅监听本机3001端口，不能将项目根目录作为网页目录。

## Nginx

静态站点根目录指向该版本的 `dist/`，配置自己域名的 HTTPS。将 `deploy/nginx-api.conf` 内的片段放入现有 `server` 块，先检查配置再重载。保留原有证书配置，不重复添加已有的 `location` 块。此项目使用 hash 路由，不要求额外 SPA 重写。

## 检查与更新

未登录访问 `/api/auth/me` 应返回401。通过HTTPS检查注册、登录、退出、藏书阅读、流式问答与附件；真实模型检查会消耗自己的额度。构建或模拟测试通过不代表服务器、真实手机、模型输出或并发容量已验收。

更新时保留外部账号文件、`AUTH_SECRET` 及私密配置，使用新版本目录部署，避免多个进程同时写同一账号文件。若旧邀请码曾公开，必须在实际服务器的私密环境文件中更换 `INVITE_CODES` 并重启；仓库修改不会自动更新已部署服务。

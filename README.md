# 服章 FuZhang

汉服知识检索、来源引用与古籍阅读应用，使用 React、TypeScript、Vite 和 Node.js。包含阿箬书灵、流式对话、本地历史、藏书搜索与阅读，以及文本附件解析。

## 快速开始

需要 Node.js **22.12 或更新版本**。模型问答需要自己的阿里云百炼 API 密钥及对应模型访问权限，会产生供应商费用。藏书浏览需要另行配置私有知识库并登录。

```sh
git clone https://github.com/Tracy-Duan/FuZhang_page.git
cd FuZhang_page
npm ci
```

将 `.env.example` 复制为 `.env.local`，填写 `DASHSCOPE_API_KEY`、随机生成的 `AUTH_SECRET` 和自定义 `INVITE_CODES`。可用下面的命令生成会话签名密钥，再仅写入自己的私密环境文件：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`INVITE_CODES` 为你自行设置的六位大写字母，多个以逗号分隔；留空时关闭新注册。应用没有通用默认邀请码。配置后重启服务，使用自设邀请码注册。修改邀请码不影响已有账号登录。

```sh
npm run dev
```

打开 http://127.0.0.1:8080/ 。Windows 也可双击 `启动预览.bat`，使用系统安装的 Node.js。

## 配置

| 变量 | 用途 |
| --- | --- |
| `DASHSCOPE_API_KEY` | 服务端模型密钥，不可放入前端变量或提交 Git |
| `AUTH_SECRET` | 随机固定的会话签名密钥；生产环境至少32字符 |
| `INVITE_CODES` | 私密注册邀请码，留空关闭注册 |
| `AUTH_USERS_FILE` | 账号 JSON 路径，默认 `server/rag-data/users.json`，已忽略 |
| `HANFU_RAG_DATA_DIR` | 自行配置的私有知识库路径；仓库不提供数据 |
| `LLM_MODEL` / `INTENT_MODEL` / `COMPANION_MODEL` | 主问答、分类、陪聊模型，默认值见模板 |
| `FUZHANG_PYTHON` | 附件解析 Python 路径，默认使用系统 Python |

聊天历史和部分偏好保存在浏览器本地；账号保存在服务端 JSON 文件。本版本适合单实例运行，没有多进程账号写入协调或云端聊天同步。

## 附件

支持图片、UTF-8 TXT/MD/CSV、文本型 PDF 和 DOCX；合计最多4个、每个5MB。PDF/DOCX 需要 Python：

```sh
python -m pip install -r server/requirements-attachments.txt
```

PDF 使用 pypdf，不提供 OCR；扫描页、加密文档、超过100页或文字超限会拒绝。DOCX 正文使用 Python 标准库解析。

## 知识库与边界

本项目仅开源应用代码。团队整理的 RAG 知识库、索引、实体表、来源清单、采集档案、衍生摘录及评测资料均不随仓库发布，也不由本项目 MIT 许可证授权。请自行准备有权使用的数据，通过 `HANFU_RAG_DATA_DIR` 指定目录。未配置时检索报告不可用，藏书接口返回503；应用仍可启动。

配置目录需要 `passages.jsonl`、`term_index.json` 和 `corpus-policy.json`，格式约定见 `server/rag.mjs`；公开测试只使用程序生成的虚构记录。数据应与代码分开存放，发布包不会自动复制知识库。可用 `HANFU_COMPANION_QUOTES_FILE` 指定独立私有摘录 JSON，未配置且无本地文件时返回空摘录列表。图像、字体和品牌资源见 [资源说明](ASSETS.md)。

联网搜索只有在用户开启时才启用；关闭搜索仍会调用远程模型。模型回答可能有误，应核对引用原文。历史生图和3D生成模块当前停用，不需要配置对应密钥。

## 验证与部署

```sh
python -m pip install -r server/requirements-dev.txt
npm test
npm run build
```

测试使用独立账号文件和测试邀请码，不使用真实模型密钥；模拟上游通过不代表真实模型、手机或线上环境已验收。

生产部署参见 [部署指南](deploy/README.md)。`npm run release` 可生成独立运行包；构建输出、发布包和私密配置均不提交。

## 目录

- `src/`：页面、书灵交互、藏书与阅读组件。
- `server/`：接口、认证、检索、附件处理与测试。
- `server/rag-data/`：本地私有数据目录，整体忽略，不上传。
- `deploy/`：运行包构建和部署模板。

## 许可与贡献

项目原创代码按 [MIT](LICENSE) 授权；第三方依赖、字体和标识分别遵循 [第三方说明](THIRD_PARTY_NOTICES.md) 与 [资源说明](ASSETS.md)，不因本项目 MIT 许可证改变其许可。

欢迎通过 Issue 报告问题或提交 PR。提交前请运行与改动相关的测试和构建；请勿提交团队知识库及其衍生数据。不要提交真实账号、邀请码、密钥、服务器地址或个人机器路径。

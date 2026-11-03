# Coze Agent Factory · Coze 智能体工厂

一个 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 插件：内置 **32 个行业**的智能体模板，调用 **Coze 开放 API**，在对话中一句话即可把一个配置完整的智能体（人设 Prompt / 开场白 / 建议问题）直接创建到你的 Coze 工作空间，并支持绑定工作流、运行工作流、生成工作流搭建蓝图。

## 功能一览

| 工具 | 功能 |
|---|---|
| `coze_list_templates` | 列出 32 个行业模板目录（编号 / ID / 行业 / 名称 / 定位，一目了然） |
| `coze_get_template` | 查看模板全文：人设与回复逻辑（Prompt）、开场白、建议问题 |
| `coze_create_bot` | 调用 `POST /v1/bot/create` 创建智能体，可选发布为 API 服务（`/v1/bot/publish`），支持 `workflow_ids` 绑定已有工作流 |
| `coze_list_bots` | 查看工作空间智能体列表（查重 / 确认） |
| `coze_run_workflow` | 调用 `POST /v1/workflow/run` 运行已发布的工作流 |
| `coze_design_workflow` | 按需求生成工作流搭建蓝图（节点清单 / 连线 / 验收清单） |

## 行业模板（32 个）

电商零售、法律咨询、医疗健康、教育培训、心理服务、金融理财、旅游出行、人力资源、编程开发、新媒体运营、房产家居、运动健身、保险经纪、留学教育、宠物养护、汽车服务、农业种植、餐饮美食、跨境贸易、物流售后、政务民生、职业发展、母婴育儿、奢侈品服务、新闻传媒、家装设计、婚庆服务、养老服务、财税代账、游戏电竞、音乐教育、二手交易。

每个模板包含完整的人设与回复逻辑 Prompt（含行业安全红线，如医疗不做诊断、理财不荐股、法律附免责声明）、开场白与建议问题。

## 安装

无需构建，纯 JavaScript：

1. 克隆本仓库到本地任意目录：

   ```bash
   git clone https://github.com/<你的用户名>/coze-agent-factory.git
   ```

2. 在 DeepSeek Harness 中安装：

   - 对话说"帮我安装插件，路径是 <克隆目录>"，或
   - 用 DSH CLI：`dsh plugin --profile <profile> add <克隆目录的绝对路径>`

3. 配置凭据：编辑插件包内的 `cordis.patch.yml`，填入：

   ```yaml
   token: '<你的 Coze 个人访问令牌 PAT>'   # Coze 个人中心 → API 管理，权限勾选「Bot 管理」
   spaceId: '<你的工作空间 ID>'            # Coze 工作空间页面 URL 中 workspace 参数
   apiBaseUrl: 'https://api.coze.cn'       # 海外版改为 https://api.coze.com
   ```

   ⚠️ **`token` 是敏感凭据，切勿提交到公开仓库或分享给他人。**

## 使用示例

安装后直接在对话中说：

- “帮我生成智能体” → 展示 32 行业模板目录
- “用旅游规划模板建一个，名字叫‘川西旅行管家’” → 一键创建，返回 Bot ID 与编辑页地址
- “运行工作流 7413xxxx，参数 input=今天上海天气” → 真实执行并返回输出

## 文件结构

```
coze-agent-factory/
├── index.js           # Host 插件主体：注册 6 个 Agent 工具 + Coze OpenAPI 客户端
├── templates.js       # 32 个行业模板库（Prompt / 开场白 / 建议问题）
├── cordis.patch.yml   # DSH 安装清单 + 配置项（token / spaceId / apiBaseUrl）
├── locale/            # 插件展示元数据（中 / 英）
└── icon.svg           # 原创图标
```

## 依赖

- DeepSeek Harness（DSH）
- Node.js ≥ 18（全局 `fetch`）
- Coze 账号 + 个人访问令牌（PAT）

## License

MIT

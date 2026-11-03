/** Coze 智能体工厂：注册三个 Agent 工具（模板目录 / 模板详情 / 调用 Coze OpenAPI 创建智能体）。 */

import { templates, templateOf, buildPrompt, renderCatalog } from './templates.js';

/** 模板 id 的完整枚举，模型可直接选择。 */
const TEMPLATE_ENUM = templates.map((entry) => entry.id);
/** 行业模板总数，用于工具描述。 */
const TEMPLATE_COUNT = templates.length;

const TEXT_OUTPUT = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: value }],
};

/** Coze OpenAPI 调用封装。 */
class CozeClient {
  constructor(config) {
    const baseUrl = (config.apiBaseUrl || 'https://api.coze.cn').replace(/\/+$/, '');
    this.baseUrl = baseUrl;
    this.token = config.token || process.env.COZE_API_TOKEN || '';
    this.spaceId = config.spaceId || process.env.COZE_SPACE_ID || '';
  }

  assertReady() {
    if (!this.token) {
      throw new Error('缺少 Coze 访问令牌：请在插件配置中填写 token（Coze 个人中心 → API 管理 → 个人访问令牌 PAT），或设置环境变量 COZE_API_TOKEN。');
    }
    if (!this.spaceId) {
      throw new Error('缺少空间 ID：请在插件配置中填写 spaceId（Coze 工作空间页面 URL 中 workspace 后的数字），或设置环境变量 COZE_SPACE_ID。');
    }
  }

  async request(path, method, body, signal) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
      const detail = JSON.stringify(payload);
      throw new Error(`Coze API ${method} ${path} 失败（HTTP ${response.status}）：${detail}。请检查 token 是否有效、spaceId 是否正确。`);
    }
    return payload.data ?? payload;
  }

  createBot(spec, signal) {
    return this.request('/v1/bot/create', 'POST', spec, signal);
  }

  publishBot(botId, connectorIds, signal) {
    return this.request('/v1/bot/publish', 'POST', { bot_id: botId, connector_ids: connectorIds }, signal);
  }

  listBots(signal) {
    return this.request('/v1/bots?workspace_id=' + encodeURIComponent(this.spaceId), 'GET', undefined, signal);
  }

  runWorkflow(workflowId, parameters, botId, signal) {
    const body = { workflow_id: workflowId, ...(parameters ? { parameters } : {}), ...(botId ? { bot_id: botId } : {}) };
    return this.request('/v1/workflow/run', 'POST', body, signal);
  }
}

export const inject = ['tools'];

export function apply(ctx, config) {
  const client = new CozeClient(config ?? {});

  const disposers = [
    ctx.tools.register({
      name: 'coze_list_templates',
      description: `列出内置的 Coze 智能体行业模板目录（${TEMPLATE_COUNT} 个行业，每个模板一行：编号、模板 ID、行业、智能体名称、定位说明）。一目了然。创建智能体前先用本工具选定模板 ID。`,
      parameters: { type: 'object', properties: {}, required: [] },
      output: TEXT_OUTPUT,
      async execute() {
        return renderCatalog();
      },
    }),

    ctx.tools.register({
      name: 'coze_get_template',
      description: '查看一个行业模板的完整内容：人设与回复逻辑（Prompt 全文）、开场白、建议问题。让用户确认或修改后再创建。',
      parameters: {
        type: 'object',
        properties: {
          template_id: {
            type: 'string',
            enum: TEMPLATE_ENUM,
            description: '模板 ID，来自 coze_list_templates。',
          },
        },
        required: ['template_id'],
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const template = templateOf(args.template_id);
        if (template === undefined) throw new Error(`未知模板 ID：${args.template_id}。请用 coze_list_templates 查看目录。`);
        return [
          `模板：${template.name}`,
          `行业：${template.industry}`,
          `定位：${template.description}`,
          '',
          '【人设与回复逻辑 Prompt】',
          template.prompt,
          '',
          '【开场白】',
          template.prologue,
          '',
          '【建议问题】',
          template.suggestedQuestions.map((question, index) => `${index + 1}. ${question}`).join('\n'),
          '',
          '确认后调用 coze_create_bot 创建；需要调整可在 extra_requirements 中写明附加要求。',
        ].join('\n');
      },
    }),

    ctx.tools.register({
      name: 'coze_create_bot',
      description: '调用 Coze 开放 API 在用户的工作空间中创建一个智能体（写入名称、描述、人设与回复逻辑、开场白、建议问题），可选立即发布。需要插件已配置 token 和 spaceId。创建成功后向用户报告智能体 ID 与 Coze 编辑页地址。',
      parameters: {
        type: 'object',
        properties: {
          template_id: {
            type: 'string',
            enum: TEMPLATE_ENUM,
            description: '使用的行业模板 ID，来自 coze_list_templates。',
          },
          name: {
            type: 'string',
            description: '智能体名称（1-20 字）。省略时使用模板默认名称。',
          },
          description: {
            type: 'string',
            description: '智能体描述（0-500 字）。省略时使用模板定位说明。',
          },
          extra_requirements: {
            type: 'string',
            description: '附加定制要求，会追加到模板 Prompt 的"附加定制要求"一节；例如指定品牌、语气、禁忌话题。',
          },
          publish: {
            type: 'boolean',
            description: '是否创建后立即发布为 API 服务。默认 false，仅创建草稿。发布需要 connector_ids。',
          },
          connector_ids: {
            type: 'array',
            items: { type: 'string' },
            description: '发布渠道 ID 列表（publish 为 true 时必填；"Agent as API" 渠道通常为 "1024"，其他渠道以 Coze 后台为准）。',
          },
          workflow_ids: {
            type: 'array',
            items: { type: 'string' },
            description: '要绑定到该智能体的工作流 ID 列表（可选）。工作流需已在 Coze 中创建；绑定后智能体可在对话中使用这些工作流。',
          },
        },
        required: ['template_id'],
      },
      output: TEXT_OUTPUT,
      async execute(args, exec) {
        const template = templateOf(args.template_id);
        if (template === undefined) throw new Error(`未知模板 ID：${args.template_id}。请用 coze_list_templates 查看目录。`);
        client.assertReady();
        const name = (args.name ?? template.name).trim();
        if (name.length === 0 || name.length > 20) throw new Error('智能体名称必须为 1-20 个字符。');
        const description = (args.description ?? template.description).trim().slice(0, 500);
        const spec = {
          space_id: client.spaceId,
          name,
          description,
          prompt_info: { prompt: buildPrompt(template, args.extra_requirements) },
          onboarding_info: { prologue: template.prologue, suggested_questions: template.suggestedQuestions },
          ...(Array.isArray(args.workflow_ids) && args.workflow_ids.length > 0
            ? { workflow_id_list: { ids: args.workflow_ids.map((id) => ({ id: String(id) })) } }
            : {}),
        };
        const created = await client.createBot(spec, exec?.signal);
        const lines = [
          `已创建智能体（行业模板：${template.industry}）`,
          `名称：${name}`,
          `Bot ID：${created.bot_id}`,
          `编辑地址：https://www.coze.cn/space/${client.spaceId}/bot/${created.bot_id}`,
          '已写入：人设与回复逻辑（模板 Prompt' + (args.extra_requirements ? ' + 附加定制要求' : '') + '）、开场白、建议问题。',
          ...(Array.isArray(args.workflow_ids) && args.workflow_ids.length > 0 ? [`已绑定工作流：${args.workflow_ids.join('、')}`] : []),
        ];
        if (args.publish === true) {
          const connectorIds = args.connector_ids ?? ['1024'];
          await client.publishBot(created.bot_id, connectorIds, exec?.signal);
          lines.push(`已发布到渠道：${connectorIds.join('、')}`);
        } else {
          lines.push('当前为草稿状态；如需发布为 API 服务，可再次调用本工具并将 publish 设为 true。');
        }
        return lines.join('\n');
      },
    }),

    ctx.tools.register({
      name: 'coze_list_bots',
      description: '查看已配置的 Coze 工作空间中的智能体列表（名称、ID、发布状态）。用于创建前查重或创建后确认。',
      parameters: { type: 'object', properties: {}, required: [] },
      output: TEXT_OUTPUT,
      async execute(_args, exec) {
        client.assertReady();
        const data = await client.listBots(exec?.signal);
        const items = Array.isArray(data.items) ? data.items : [];
        if (items.length === 0) return '当前工作空间暂无智能体。';
        return [
          `共 ${data.total ?? items.length} 个智能体：`,
          ...items.map((entry) => `- ${entry.name}（ID ${entry.id}）｜${entry.is_published ? '已发布' : '草稿'}｜${entry.description || '无描述'}`),
        ].join('\n');
      },
    }),

    ctx.tools.register({
      name: 'coze_run_workflow',
      description: '运行一个已发布的工作流并返回输出（调用 Coze /v1/workflow/run）。用于验证工作流是否按预期工作，或在对话中直接取用工作流结果。工作流的创建/编辑需在 Coze 网页编辑器完成（无公开 API）；设计蓝图可用 coze_design_workflow。',
      parameters: {
        type: 'object',
        properties: {
          workflow_id: {
            type: 'string',
            description: '要运行的工作流 ID（在 Coze 工作流编辑页 URL 或工作流列表中可见）。',
          },
          parameters: {
            type: 'object',
            additionalProperties: true,
            description: '工作流的输入参数对象，键值对按工作流"开始节点"定义的参数名填写，例如 {"input": "今天上海天气如何"}。',
          },
          bot_id: {
            type: 'string',
            description: '关联的智能体 ID（可选，工作流依赖绑定智能体时填写）。',
          },
        },
        required: ['workflow_id'],
      },
      output: TEXT_OUTPUT,
      async execute(args, exec) {
        client.assertReady();
        const result = await client.runWorkflow(args.workflow_id, args.parameters, args.bot_id, exec?.signal);
        return [
          '工作流运行完成。',
          `输出：${typeof result.data === 'string' ? result.data : JSON.stringify(result.data)}`,
          `消耗：${result.cost ?? '-'}｜Token：${result.token ?? '-'}`,
          result.debug_url ? `调试链接：${result.debug_url}` : '',
          result.execute_id ? `执行 ID：${result.execute_id}（可用于查询运行历史）` : '',
        ].filter((line) => line.length > 0).join('\n');
      },
    }),

    ctx.tools.register({
      name: 'coze_design_workflow',
      description: '生成一个 Coze 工作流的搭建蓝图：按用户需求输出节点清单、各节点类型与配置要点、连线关系与验收清单。工作流的创建/编辑没有公开 API，蓝图供用户照着在 Coze 网页编辑器搭建（通常几分钟可完成）。',
      parameters: {
        type: 'object',
        properties: {
          requirement: {
            type: 'string',
            description: '工作流要完成的任务描述，例如"用户输入城市名，查天气并生成穿搭建议"。',
          },
          complexity: {
            type: 'string',
            enum: ['simple', 'standard', 'advanced'],
            description: '期望复杂度：simple 尽量精简（默认），standard 常规分支处理，advanced 含条件分支与多插件编排。',
          },
        },
        required: ['requirement'],
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const complexity = args.complexity ?? 'simple';
        return [
          `工作流搭建蓝图`,
          `需求：${args.requirement}`,
          `复杂度：${ { simple: '精简（单一主链路）', standard: '常规（含分支处理）', advanced: '高级（条件分支 + 多插件编排）' }[complexity] }`,
          '',
          '【Coze 工作流可用节点类型速查】',
          '- 开始（Start）：定义工作流入参，如 input(String)。',
          '- 结束（End）：定义返回值，通常绑定最终输出变量。',
          '- LLM 节点：写系统/用户提示词做文本生成、摘要、分类；变量可引用上游输出 {{node.output}}。',
          '- 插件节点：调用官方/自定义插件（如头条新闻、必应搜索、天气预报），需填插件入参映射。',
          '- 条件器（Choice）：按条件走不同分支（如意图判断后分流）。',
          '- 代码（Code）：用 JavaScript/Python 处理数据结构转换。',
          '- 知识库（Knowledge）：检索已上传文档内容。',
          '- 消息（Message）：向对话流式输出中间提示。',
          '- 数据库/变量：存取结构化状态（进阶）。',
          '',
          '【推荐搭建步骤】',
          '1. 开始节点：把需求里的输入定为入参（通常一个 input 字符串）。',
          '2. 顺着数据流向添加节点：能一步到位就不拆节点，先跑通再加分支。',
          '3. 每个节点只做一件事；节点命名用动宾短语（如"提取城市名"）。',
          '4. 结束节点绑定最终输出变量；试运行（右上角 Test run）验证后再发布。',
          '',
          '【验收清单】',
          '- [ ] 每个节点的入参都来自开始节点或上游节点的输出，无悬空变量',
          '- [ ] 试运行通过，输出符合预期',
          '- [ ] 异常输入有兜底（LLM 节点提示词里写明兜底行为或加条件分支）',
          '- [ ] 发布后可用 coze_run_workflow 做真实调用验证',
          '',
          '提示：搭好后把工作流 ID 告诉我，可用 coze_run_workflow 实测，或在 coze_create_bot 里用 workflow_ids 绑定到智能体。',
        ].join('\n');
      },
    }),
  ];

  return () => {
    for (const dispose of disposers.splice(0).reverse()) dispose();
  };
}

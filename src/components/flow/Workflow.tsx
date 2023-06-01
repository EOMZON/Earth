/** ! 与earth的同名文件一致
 * 
 * ask 等待用户输入，TODO待处理
 */


/**
 * workflow的开关
 * chatbot - 在对话框
 * editor - 编辑器
 * debug - 调试框
 * */
const display = [
    "chatbot", "editor", "debug"
]


const workflow = {
    "models": [
        {
            "label": "发散程度",
            "value": "temperature",
            "defaultValue": 0.7,
            "display": ["chatbot", "editor", "debug"]
        },
        {
            "label": "模型",
            "value": "model",
            "options": [
                { "value": "ChatGPT", "label": "ChatGPT" },
                { "value": "Bing", "label": "Bing" }
            ],
            "display": ["chatbot", "editor", "debug"]
        }
    ],
    "inputs": [{
        "label": "默认",
        "value": "default",
        "display": ["chatbot", "editor", "debug"]
    }, {
        "label": "绑定网页正文",
        "value": "bindCurrentPage",
        "display": ["chatbot", "editor"]
    },
    {
        "label": "绑定网页HTML",
        "value": "bindCurrentPageHTML",
        "display": ["chatbot", "editor"]

    },
    {
        "label": "绑定网页URL",
        "value": "bindCurrentPageURL",
        "display": ["chatbot", "editor"]

    },
    {
        "ask": true,
        "label": "用户划选",
        "value": "userSelection",
        "display": ["chatbot", "editor"]
    },
    {
        "label": "剪切板",
        "value": "clipboard",
        "display": ["chatbot", "editor"]
    }
    ],
    "outputs": [{
        "label": "默认",
        "value": "default",
        "display": ["chatbot", "editor", "debug"]

    }, {
        "label": "作为上下文",
        "value": "isNextUse",
        "display": ["editor"]
    }],
    "agents": [{
        "key": "prompt",
        "label": "Prompt",
        "checked": true,
        "parent": "prompt",
        "display": ["chatbot", "editor", "debug"]
    },
    {
        "key": "tasks",
        "label": "目标拆解",
        "parent": "prompt",
        "disabled": true,
        "display": ["chatbot", "editor", "debug"]
    },
    {
        "key": "query",
        "label": "根据选择器获取网页信息",
        "parent": "query",
        "display": ["editor"]
    },
    {
        "key": "query-click",
        "label": "模拟点击",
        "disabled": true,
        "parent": "query",
        "display": ["chatbot", "editor", "debug"]
    },
    {
        "key": "send-to-zsxq",
        "label": "发布内容至知识星球",
        "parent": "query",
        "display": ["editor"]
    },
    {
        "key": "highlight",
        "label": "高亮网页内容",
        "disabled": true,
        "parent": "query",
        "display": ["chatbot", "editor", "debug"]
    },
    {
        "key": "api",
        "label": "API",
        "parent": "api",
        "display": ["editor"]
    },
    {
        "label": "JSON格式",
        "key": "json",
        "parent": "formatter",
        "display": ["chatbot", "editor", "debug"]
    },
    {
        "label": "列表",
        "key": "list",
        "parent": "formatter",
        "disabled": true,
        "display": ["chatbot", "editor", "debug"]
    },
    {
        "label": "MarkDown格式",
        "key": "markdown",
        "parent": "formatter",
        "display": ["chatbot", "editor", "debug"]
    },
    {
        "label": "中文",
        "key": "translate-zh",
        "parent": "translate",
        "display": ["chatbot", "editor", "debug"]
    },
    {
        "label": "英文",
        "key": "translate-en",
        "parent": "translate",
        "display": ["chatbot", "editor", "debug"]
    },
    // {
    //     "label": "提取结构化数据",
    //     "key": "extract",
    //     "temperature": 0
    // },
    {
        "label": "条件判断",
        "key": "if-else",
        "parent": "logic",
        "disabled": true,
        "display": ["chatbot", "editor", "debug"]
    },
    {
        "label": "循环",
        "key": "for-of",
        "parent": "logic",
        "disabled": true,
        "display": ["chatbot", "editor", "debug"]
    }
    ]

}

const comboOptions = [
    {
        label: '作为对话流选项',
        value: 'showInChat',
    },
    {
        label: '作为右键菜单选项',
        value: 'contextMenus',
    },
    {
        label: '首页',
        value: 'home',
    },
    {
        label: '无限循环',
        value: 'infinite',
    }
];

const defaultNode = {
    role: {
        name: '',
        text: ''
    },
    text: '',
    url: '',
    api: {
        url: '',
        protocol: 'https://',
        init: {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: "{}",
            mode: 'cors',
            cache: 'default',
            responseType: 'text'
        },
        isApi: false
    },
    queryObj: {
        query: '', url: '', protocol: 'https://', isQuery: false
    },
    temperature: 0.6,
    model: 'ChatGPT',
    input: 'default',
    output: 'default',
    type: 'prompt',
    // 以下是选项
    opts: {
        ...workflow
    },

}


export {
    workflow, defaultNode, comboOptions
}
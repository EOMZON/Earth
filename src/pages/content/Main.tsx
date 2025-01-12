import React from 'react'

import { FlexColumn } from "@components/Style";
import MarkdownIt from 'markdown-it'

import ChatBotPanel from "@components/chatbot/ChatBotPanel"
import ChatBotConfig from "@components/chatbot/ChatBotConfig";

import ComboEditor from '@components/combo/ComboEditor';
import ComboModal from '@components/combo/ComboModal'

import {
    promptBindCurrentSite,
    promptBindUserSelection,
    promptBindTasks,
    promptBindUserClipboard,
    userSelectionInit,
    extractDomElement, promptParse, promptUseLastTalk
} from '@src/components/combo/Prompt'

import { highlightText } from "@components/combo/Agent"

import Setup from "@components/Setup"


//@ts-ignore
import PDF from '@components/files/PDF'


import { chromeStorageGet, chromeStorageSet } from "@components/Utils"
import { message } from 'antd';


const defaultChatbots: any = ChatBotConfig.get();

//['user']
const getPromptsData = async (keys = ['user']) => {
    let prompts: any[] = [];
    const res: any = await chromeStorageGet(keys);
    for (const k of keys) {
        if (res && res[k]) {
            for (const combo of res[k]) {
                prompts.push(combo);
            }
        }
    }
    return prompts;
}


const Talks = {
    save: (value: any) => {
        // console.log(value)
        let talks = Array.from(value, (v: any, index: number) => {
            // 去除user==true的连续重复
            if (v.user && value[index - 1] && v.html == value[index - 1].html) {
                return
            }
            return v
        }).filter(m => m);
        if (talks && talks.length > 0) {
            // console.log('_currentTalks save', talks)
            chromeStorageSet({
                '_currentTalks': {
                    talks
                }
            })
        }
    },
    clear: () => {
        chromeStorageSet({ '_currentTalks': null })
    },
    clearThinking: (talks: any) => {
        return [...talks].filter((n: any) => n.type != 'thinking')
    },
    updateThinking: (text: string, talks: any) => {
        const talksNew = [...talks].filter((n: any) => n.type != 'thinking');
        talksNew.push(ChatBotConfig.createTalkData('thinking', { hi: text }))
        return talksNew
    },
    get: async () => {
        let data: any = await chromeStorageGet(['_currentTalks'])
        if (data && data['_currentTalks'] && data['_currentTalks'].talks) {
            // 只保留type==markdown talk
            const talks = data['_currentTalks'].talks.filter((t: any) => t.type == 'talk' || t.type == 'markdown' || t.type == 'done' || t.type == 'images')
            return talks
        };
        return []
    },
    getLastTalk: (talks: any) => {
        const getTalkInnerText = (data: any) => {
            const json = { ...data };
            const dom = document.createElement('div');
            if (json && json.html) dom.innerHTML = json.html;
            dom.innerHTML = dom.innerHTML.replaceAll('<br><br>', '\n')
            // console.log('laskTalk:', dom.innerHTML, dom.innerText)
            return dom.innerText;
        };
        // n.type == 'talk' || n.type == 'markdown' || n.type == 'done'
        const lastTalks = talks.filter((talk: any) => (talk.type == "markdown" || talk.type == "done") && !talk.user);
        const laskTalk = lastTalks.slice(-1)[0];

        return getTalkInnerText(laskTalk)
    },
    createTalkBubble: (text: string) => {
        const dom = document.createElement('div');
        let md = new MarkdownIt();
        dom.innerHTML = md.render(text);
        const texts = Array.from(dom.innerText.split('\n'), t => t.trim()).filter(f => f);
        dom.innerHTML = texts.join('<br><br>')
        Array.from(dom.querySelectorAll('a'), (a: any) => {
            a.innerText = a.innerText.replace(/\^/ig, '');
            a.style = `background: #1677ff;
            color: white;
            width: 16px;
            height: 16px;
            display: inline-block;
            font-size: 12px;
            text-align: center;
            margin: 4px;
            border-radius: 8px;`
        })

        let json = { html: dom.innerHTML };
        return json
    },
    createShowInChatInterfaces: async () => {
        const buttons = Array.from(
            await getPromptsData(),
            d => {
                if (d && d.interfaces) return d.interfaces.includes('showInChat') ? {
                    from: 'combo',
                    data: {
                        combo: d.combo,
                        tag: d.tag,
                        prompt: d.prompt,
                        // 强制刷新
                        newTalk: true,
                        _combo: d
                    }
                } : null
            }
        ).filter((b: any) => b);

        if (buttons && buttons.length > 0) {
            return ChatBotConfig.createTalkData('new-talk', { buttons })
        }
    }
}

const sendMessageCanRetry = (cmd: any, data: any) => {
    let start = false, count = 0;
    const r = () => {
        chrome.runtime.sendMessage({
            cmd,
            data
        }, res => {
            console.log('status', res.status)
            start = true;
        })

        setTimeout(() => {
            if (start === false) {
                console.log('出错了，重试ing')
                count++;
                if (count > 10) {
                    message.info('出错了，请重试')
                } else {
                    //TODO 把上一条的对话输入，传过来
                    r();
                }
            }
        }, 2100)
    }
    r();
}

const sendMessageToBackground = {
    'chat-bot-talk': (data: any) => sendMessageCanRetry('chat-bot-talk', data),
    'chat-bot-talk-new': (data: any) => sendMessageCanRetry('chat-bot-talk-new', data),
    'chat-bot-talk-stop': (data: any) => sendMessageCanRetry('chat-bot-talk-stop', data),
    'run-agents': (data: any) => sendMessageCanRetry('run-agents', data),
    'open-url': (data: any) => sendMessageCanRetry('open-url', data),
    'api-run': (data: any) => sendMessageCanRetry('api-run', data)
}


class Main extends React.Component<{
    className: string,
    appName: string,
    agents: any,
    readability: any,
    fullscreen: boolean,
    initIsOpen: boolean,
    userInput: any,
    initChatBotType: string
}, {
    appName: string,
    title: string,
    // 默认是否开启
    initIsOpen: boolean,
    // 总面板开关
    loading: boolean,
    // 是否全屏
    fullscreen: boolean,

    // 全局的禁止操作
    disabledAll: boolean,
    // 加载机器人，初始化
    loadingChatBot: boolean,
    chatBotType: string,
    // 聊天服务是否可用
    chatBotIsAvailable: any,
    // 聊天风格 chatgpt bing
    chatBotStyle: any,
    // 告诉chatbot当前网页的信息
    chatbotInitPrompt: string,

    // 默认的输入
    userInput: any,


    // 是否显示Edit页面
    showEdit: boolean,

    activeIndex: any,

    talks: Array<{}>,
    mixedCards: Array<{}>,

    inputCardDisplay: string,
    promptDisplay: string,
    buttonsDisplay: string,
    expirationTime: number,


    toggleSetup: boolean,
    openMyPrompts: boolean,
    myPrompts: any,

    currentPrompt: any,

    //当前Prompts内有多少个prompt
    PromptIndex: number,

}> {


    constructor(props: any) {
        super(props)

        const defaultChatbot = {
            chatBotType: defaultChatbots[0].type,
            chatBotStyle: {
                label: defaultChatbots[0].style.label,
                value: defaultChatbots[0].style.values[0]?.value
            }
        }

        // 缓存
        const { chatBotStyle, chatBotType } = JSON.parse(localStorage.getItem('_chatBotSelect') || JSON.stringify(defaultChatbot));
        // console.log('缓存', chatBotStyle, chatBotType)

        this.state = {
            appName: this.props.appName,
            title: '',
            initIsOpen: this.props.initIsOpen,
            loading: this.props.initIsOpen ? false : true,
            fullscreen: this.props.fullscreen,
            activeIndex: undefined,

            talks: [],

            mixedCards: [],

            // 禁止点击
            disabledAll: true,

            loadingChatBot: true,
            chatBotType: this.props.initChatBotType || chatBotType,
            chatBotIsAvailable: undefined,
            chatBotStyle: chatBotStyle,
            chatbotInitPrompt: '',
            userInput: {
                prompt: '', tag: ''
            },


            // 界面控制
            inputCardDisplay: 'none',
            buttonsDisplay: 'none',
            promptDisplay: 'flex',
            // 缓存控制
            expirationTime: 1000 * 60,
            toggleSetup: false,
            openMyPrompts: false,
            myPrompts: [],
            showEdit: false,

            currentPrompt: {},
            PromptIndex: 0,


        }


        this.init();

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            const { cmd, data, success } = request;
            if (cmd === 'chat-bot-talk-result') {
                this._updateChatBotTalksResult(data);
            } else if (cmd === "api-run-result") {
                console.log('api-run-result', data)
                // 解析数据格式
                const { responseExtract,
                    responseType, data: result } = data;
                const ttype = responseExtract.type;

                const items: any = [{
                    type: 'done',
                    markdown: `API请求成功:<br>类型:${data.responseType} ${ttype}<br>内容:${ttype == 'text' ? data.data.slice(0, 100) : ''}...`,
                    tId: (new Date()).getTime(),
                    export: false
                }];

                if (ttype == 'images') {
                    items.push({
                        type: 'images',
                        images: result,
                        tId: (new Date()).getTime()
                    })
                }

                this._updateChatBotTalksResult(items);

            } else if (cmd === 'contextMenus') {
                this._control(data);
            }
        });

        if (this.props.agents) {

            this.updateChatBotStatus(true);

            // nTalks.push(ChatBotConfig.createTalkData('agents', {}));

            this._getAgentsResult();
            chrome.storage.local.onChanged.addListener((changes) => {
                console.log(changes)
                if (changes['run-agents-result'] && changes['run-agents-result'].newValue && !changes['run-agents-result'].oldValue) {
                    this._getAgentsResult();
                }
            })
        }

    }


    componentDidMount(): void {
        console.log('#### init #### ', this.state.appName)
        if (this.props.agents) {
            message.info('自动化执行任务ing')
        }

        //  is auto open
        let isOpen = this.props.fullscreen && this.props.userInput && this.props.userInput.prompt && this.props.initChatBotType;
        // 打开任何网站都会初始化

        Talks.get().then(talks => {
            if (this.props.agents) {
                talks.push({
                    type: 'done',
                    html: '自动化执行任务ing',
                    user: false,
                    tId: (new Date()).getTime() + '02',
                    export: false
                })
            }

            if (talks && talks.length > 0) {
                this.setState({
                    talks
                })
            }

        });

        if (!this.state.chatBotIsAvailable) this.initChatBot(isOpen);

        if (isOpen || this.props.initIsOpen) {
            // 传参过来的页面
            this.show(false)
        }

    }

    componentDidUpdate(prevProps: any, prevState: any) {
        // 更新状态
        if (prevState.chatBotType != this.state.chatBotType) {
            this.initChatBot();
        }

    }

    _getAgentsResult() {
        chromeStorageGet('run-agents-result').then((res: any) => {
            console.log('_getAgentsResult', res)
            if (res && res['run-agents-result']) {

                const combo = res['run-agents-result'].combo;

                this._promptControl({
                    cmd: 'update-prompt-for-combo',
                    data: { prompt: combo, from: "fromFlow" }
                });
                setTimeout(() => {
                    this._updateChatBotTalksResult([{
                        type: 'done',
                        markdown: res['run-agents-result'].markdown,
                        tId: (new Date()).getTime(),
                        export: false
                    }]);
                    chromeStorageSet({ 'run-agents-result': null })
                }, 1000)

            }
        })
    }

    init() {
        window.onfocus = (e) => {
            if (document.readyState == 'complete') {
                console.log('激活状态！')
                this._updateCurrentTalks()
            }
        }

        // 监听当前页面的显示状态
        document.addEventListener("visibilitychange", function () {
            var visibilityState = document.visibilityState == 'hidden' ? 0 : 1
            if (visibilityState === 0) { }
        }, false);

        chrome.runtime.onMessage.addListener(async (
            request,
            sender,
            sendResponse
        ) => {
            const {
                cmd, data, success
            } = request;
            if (cmd == 'open-readability') {
                window.location.href = window.location.origin + window.location.pathname + window.location.search + '&reader=1'
            } else if (cmd == 'toggle-insight') {
                this.setState({ initIsOpen: true });
                this.show(false);
            } else if (cmd == 'chat-bot-init-result') {
                this.initChatBot(false);
            }
            sendResponse('我是content，已收到消息')
            return true;
        });

        userSelectionInit();


        chrome.runtime.sendMessage({
            cmd: 'hi'
        }, res => console.log('hi status', res))

    }

    async show(loading: boolean) {
        this.setState({
            loading
        });
    }

    _updateCurrentTalks() {
        if (this.state.disabledAll) return
        Talks.get().then(async talks => {
            let talk = await Talks.createShowInChatInterfaces()
            talks.push(talk);
            talks = talks.filter((t: any) => t)
            if (talks.length > 0) this.setState({
                talks
            })
        });
    }

    _getChatBotFromLocal() {
        return new Promise((res: any, rej) => {
            chrome.storage.sync.get('chatBotAvailables').then((data) => {
                if (data.chatBotAvailables && data.chatBotAvailables.length > 0) {
                    let chatBotAvailables = data.chatBotAvailables.filter((n: any) => n && n.type == this.state.chatBotType && n.available);
                    let isHas = chatBotAvailables.length > 0;

                    // const availables = data.chatBotAvailables.filter((c: any) => c.available && c.available.success)

                    console.log('##聊天服务状态', Array.from(chatBotAvailables, (a: any) => {
                        if (a && a.available) {
                            return `${a.available.success} ${a.type}`
                        }
                    }).join('\n'))
                    if (isHas) {
                        let type = chatBotAvailables[0].type, available = chatBotAvailables[0].available;
                        // if (availables.length > 0) {
                        //     type = availables[0].type;
                        //     available = availables[0].available;
                        // }
                        res({
                            // 获取this.state.chatBotType
                            type,
                            available
                        });
                    }
                    ;
                }

                res()
            })
        });
    }



    // 用来判断聊天是否有效
    initChatBot(isAutoShow = true) {
        //console.log('initChatBot', isAutoShow)
        return new Promise((res: any, rej) => {
            this._getChatBotFromLocal().then((data: any) => {
                if (data) {
                    this.setState({
                        // 先获取第一个
                        chatBotType: data.type,
                        chatBotIsAvailable: data.available.success,
                        chatBotStyle: data.available.style,
                        chatbotInitPrompt: this.props.userInput && this.props.userInput.prompt ? this.props.userInput.prompt : '',
                        loadingChatBot: false,
                        disabledAll: this.props.agents ? true : false,
                        // initIsOpen: true
                    });
                    //console.log('chatbotInitPrompt', this.state.chatbotInitPrompt);
                    if (isAutoShow) {
                        // 自动显示，从newtab过来的
                        this.show(false)
                    }

                    res(data.available && data.available.success);
                } else if (!data) {
                    setTimeout(() => this.setState({
                        disabledAll: this.props.agents ? true : false,
                        loadingChatBot: false,
                        // initIsOpen: true
                    }), 3000)
                }

                res(data)
            });
        });

    }

    updateChatBotStatus(isLoading: boolean) {
        this.setState({
            disabledAll: isLoading
        })
    }

    // 用户剪切板
    async _promptBindUserClipboard(prompt: string) {
        return await promptBindUserClipboard(prompt);
    }

    // 用户划选
    _promptBindUserSelection(prompt: string) {
        return promptBindUserSelection(prompt);
    }

    /**
     * 绑定当前页面信息
     */
    _promptBindCurrentSite(prompt: string, type: string) {
        return promptBindCurrentSite(prompt, type)
    }

    // 
    _promptOutput(type: string, prompt: string, lastTalk = '') {
        if (type == 'isNextUse') {
            return promptUseLastTalk(prompt, lastTalk)
        }
        return prompt
    }
    //type markdown/json/
    // _promptByType(type: string, prompt: string, lastTalk = '') {
    //     return promptParse(prompt, type)
    // }

    _agentApiRun(api: any, prePromptText: string, combo: any) {
        let { url, init, isApi, protocol } = api;
        if (isApi == false) return;

        if (url && !url.match('//')) url = `${protocol}${url}`;
        console.log(api, init.body)

        if (init.body && typeof (init.body) == 'object') init.body = JSON.stringify(init.body);

        if (init.body && typeof (init.body) == 'string' && prePromptText) {
            // 替换${text} 表示从上一个节点传递来的text
            prePromptText = prePromptText.replaceAll('"', '')
            prePromptText = prePromptText.replaceAll("'", '')
            prePromptText = prePromptText.replace(/\n/ig, '')
            init.body = init.body.replaceAll('${text}', prePromptText)
        }

        sendMessageToBackground['api-run']({
            url, init, combo
        })
    }

    _agentQueryRun(queryObj: any, combo: any) {

        if (queryObj && queryObj.isQuery && queryObj.url && !this.props.agents) {
            // 如果是query，则开始调用网页代理 ,&& 避免代理页面也发起了新的agent

            this.updateChatBotStatus(false);

            let { url, query, isQuery } = queryObj;

            // 对url进行处理
            if (url && !url.match('//')) url = `https://${url}`
            if (url.match(/\?/)) {
                url = url + url.match(/\?/) ? '&ref=mix' : (url.endsWith('/') ? '?ref=mix' : '/?ref=mix')
            }

            const agentsJson = JSON.parse(JSON.stringify({
                type: 'query',
                url,
                query,
                combo: { ...combo } //用来传递combo数据
            }));


            // 需要把当前面板的状态停止
            this._promptControl({ cmd: 'stop-combo' });

            sendMessageToBackground['run-agents'](agentsJson)

        }
    }

    _agentSendToZsxqRun(url: string, text: string, combo: any) {

        if (url && !this.props.agents) {
            // 如果是query，则开始调用网页代理 ,&& 避免代理页面也发起了新的agent

            this.updateChatBotStatus(false);


            // 对url进行处理
            if (url && !url.match('//')) url = `https://${url}${url.match(/\?/) ? '&ref=mix' : (url.endsWith('/') ? '?ref=mix' : '/?ref=mix')}`

            // text = text.replaceAll('<br><br>', '\n\n')
            // console.log(text)
            const agentsJson = JSON.parse(JSON.stringify({
                type: 'send-to-zsxq',
                url,
                text,
                combo: { ...combo } //用来传递combo数据
            }));


            // 需要把当前面板的状态停止
            this._promptControl({ cmd: 'stop-combo' });

            sendMessageToBackground['run-agents'](agentsJson)

        }
    }

    _agentHighlightTextRun(text: string) {
        let success: any = false;

        let elements = extractDomElement();
        console.log(text, elements)
        success = highlightText(text, elements)

        if (success) message.info('成功执行')
    }


    /**
     * 'prompt' ||   'tasks'  
     * TODO:bug 用户输入的prompt ，
     */

    _llmRun(prompt: any, newTalk: boolean) {

        const { temperature, model, text, type } = prompt;

        let newText = text;

        if (type === 'tasks') {
            newText = promptBindTasks(text);
        } else {
            console.log('_llmRun:', type)
            newText = promptParse(text, type)
        }

        let chatBotType = this.state.chatBotType,
            style: any = temperature;

        if (this.state.chatBotStyle && this.state.chatBotStyle.value) style = this.state.chatBotStyle.value;

        // if (temperature > -1) style = temperature;
        if (model) chatBotType = model;

        // 增加一个Bing的转化
        if (model == "Bing" && typeof (temperature) == 'number' && temperature > -1) style = this._temperature2BingStyle(temperature);

        console.log(`sendMessageToBackground['chat-bot-talk']`, style, chatBotType, newText)

        sendMessageToBackground['chat-bot-talk']({
            prompt: newText,
            type: chatBotType,
            style,
            newTalk: !!newTalk
        })
    }

    //['user']
    // async _getPromptsData(keys = ['user']) {
    //     let prompts: any[] = [];
    //     const res: any = await chromeStorageGet(keys);
    //     for (const k of keys) {
    //         if (res && res[k]) {
    //             for (const combo of res[k]) {
    //                 prompts.push(combo);
    //             }
    //         }
    //     }
    //     return prompts;
    // }

    // TODO 需要放到某个监听里，来更新对话数据
    _updateChatBotTalksResult(items: any) {

        // 对话数据
        const talks: any = this.state.talks;
        // 更新到这里
        let nTalks = [...talks];

        let promptFromLocal = null;

        for (const data of items) {

            // 是否清楚思考状态
            let isCanClearThinking = false;


            // 如果是本地缓存
            if (data.from == 'local' && !promptFromLocal) {
                promptFromLocal = data.prompt;
                // console.log('对话状态关闭')
                isCanClearThinking = true;
                setTimeout(() => this.updateChatBotStatus(false), 100);
            }


            if (data.type == "start") {
                // 需补充此状态
                // 对话状态开启
                console.log('对话状态开启')
                this.updateChatBotStatus(true);

            } else if ((data.type == 'markdown' || data.type == 'done')) {
                // markdown 如果 data.from == 'local' 则isNew=true
                isCanClearThinking = !!data.markdown;

                // 检查talk的id，type，需要做对话原文的更新
                let isNew = true;
                for (let index = 0; index < talks.length; index++) {
                    let talk: any = talks[index];
                    if (talk.tId == data.tId && talk.type == 'markdown' && data.markdown) {
                        nTalks[index] = {
                            ...nTalks[index],
                            ...Talks.createTalkBubble(data.markdown)
                        }
                        isNew = false;
                    }
                }

                if ((isNew || data.from == 'local') && data.markdown) {
                    // 新对话
                    let d = {
                        ...data,
                        ...Talks.createTalkBubble(data.markdown),
                        export: data.export === undefined ? true : data.export
                    };
                    nTalks.push(d);
                    // 对话状态开启
                    // console.log('对话状态开启')
                    this.updateChatBotStatus(true);
                }

                if (data.type == 'done') {

                    let PromptIndex = this.state.PromptIndex;
                    console.log('done', this.state.currentPrompt.combo, PromptIndex)

                    // 上一个节点
                    let prePrompt = this.state.currentPrompt[`prompt${PromptIndex > 1 ? PromptIndex : ''}`]

                    // 无限循环功能
                    if (this.state.currentPrompt.combo && this.state.currentPrompt.isInfinite && this.state.currentPrompt.combo > 1) {
                        if (this.state.currentPrompt.combo <= PromptIndex) {
                            // 结束的时候，循环起来
                            prePrompt = this.state.currentPrompt[`prompt${this.state.currentPrompt.combo}`]
                            PromptIndex = 0;
                        }
                    }
                    // console.log('1无限循环功能', isNextUse, PromptIndex)

                    if (this.state.currentPrompt.combo > PromptIndex) {

                        PromptIndex = PromptIndex + 1;
                        const prompt = JSON.parse(JSON.stringify(this.state.currentPrompt[`prompt${PromptIndex > 1 ? PromptIndex : ''}`]));

                        // console.log('prompt', prompt,PromptIndex);
                        // 下一个节点
                        let data: any = {
                            prompt,
                            index: PromptIndex,
                            prePrompt,
                            newTalk: true,
                            from: 'combo'
                        }
                        if (prompt.queryObj && prompt.queryObj.isQuery) {
                            data['_combo'] = this.state.currentPrompt
                        }

                        this.setState(
                            {
                                PromptIndex: PromptIndex,
                                disabledAll: true
                            }
                        )

                        setTimeout(() => this._control({
                            cmd: 'send-talk',
                            data
                        }), 500)

                    } else {
                        // this._promptControl({ cmd: 'stop-combo' });
                        setTimeout(() => this._control({ cmd: 'stop-talk' }), 500)

                    }

                }

            } else if (data.type == "urls") {
                // console.log(data)

                nTalks.push(ChatBotConfig.createTalkData('urls', {
                    buttons: Array.from(data.urls, (url: any) => {
                        return {
                            from: url.from,
                            data: {
                                ...url
                            }
                        }
                    }),
                }))

                // 推荐的链接
                // {"tId":"434d59ee-3742-4172-8d31-67e0af0ec0c9","id":"434d59ee-3742-4172-8d31-67e0af0ec0c92","morePrompts":[{"tag":"谢谢你，这很有帮助。","prompt":"谢谢你，这很有帮助。","from":"Bing"},{"tag":"新必应有什么优势？","prompt":"新必应有什么优势？","from":"Bing"},{"tag":"新必应如何保护我的隐私？","prompt":"新必应如何保护我的隐私？","from":"Bing"}],"user":false,"type":"suggest","from":"ws"}
            } else if (data.type == "suggest") {
                // 提示词
                // console.log(data)

                nTalks.push(ChatBotConfig.createTalkData('more-prompts', {
                    buttons: Array.from(data.morePrompts, (prompt: any) => {
                        return {
                            from: prompt.from,
                            data: {
                                ...prompt
                            }
                        }
                    })
                }))


            } else if (data.type === 'images') {
                // 图像
                const talk = {
                    html: Array.from(data.images, url => `<img src='${url}' />`).join(''),
                    export: true
                }
                delete data.images;
                let d = { ...data, ...talk };
                nTalks.push(d);

            } else if (data.type == 'error') {
                const talk = Talks.createTalkBubble(data.markdown)
                talk.html = `<div class="chatbot-error">${talk.html}</div>`
                let d = { ...data, ...talk };
                nTalks.push(d);

                // 错误状态，把信息吐给用户
                isCanClearThinking = true;
                this.updateChatBotStatus(false);

            }

            // 清空type thinking 的状态
            if (isCanClearThinking) nTalks = Talks.clearThinking(nTalks)

        };

        if (promptFromLocal) {
            // 因为是从本地获取的数据,需要添加是否新建对话?

            nTalks.push(ChatBotConfig.createTalkData('send-talk-refresh', {
                data: {
                    tag: '刷新',
                    prompt: {
                        text: promptFromLocal,
                        type: 'prompt',
                    },
                    // 用来强制刷新获取新的对话
                    newTalk: true
                }
            }))
        }

        nTalks = nTalks.filter(t => t)

        this.setState({
            talks: nTalks  // 保存对话内容 一句话也可以是按钮
        });

        // 把对话内容保存到本地
        Talks.save(nTalks)
    }

    _chatBotSelect(res: any) {
        if (res.type == 'ChatGPT' || res.type == 'Bing') {
            const data = {
                chatBotType: res.type,
                chatBotStyle: res.style
            };
            this.setState({
                ...data
            });
            // console.log(data)
            localStorage.setItem('_chatBotSelect', JSON.stringify(data));
            // chromeStorageSet({'_chatBotSelect':JSON.stringify(data)});
        }
    }

    _temperature2BingStyle(temperature = 0.6) {
        let style = 'Balanced';
        if (temperature < 0.3) style = 'Creative'
        if (temperature > 0.7) style = 'Precise'
    }

    /*
   
    */
    async _control(event: any) {
        // 从ChatBotInput输入里返回的数据
        // cmd: new-talk、stop-talk、left-button-action、send-talk
        //    {cmd:'send-talk' ,data:{prompt,tag}}
        // console.log('_control:', event)
        if (event && event.cmd) {
            const { cmd, data } = event;
            // 对话数据
            const talks: any = this.state.talks;
            // 更新到这里
            let nTalks = [...talks].filter(t => t);

            console.log('_control:', nTalks, data)

            const sendTalk = async () => {
                let combo = data._combo ? data._combo.combo : -1;
                let { prompt, tag, lastTalk, newTalk, from, prePrompt } = data;
                // from : combo ,chatbot-input,getPromptPage

                prompt = JSON.parse(JSON.stringify(prompt))

                // 清空type thinking && suggest 的状态
                nTalks = nTalks.filter(n => n && (n.type == 'talk' || n.type == 'markdown' || n.type == 'done' || n.type == 'images'))
                this.updateChatBotStatus(true)
                if (tag) nTalks.push(ChatBotConfig.createTalkData('tag', { html: tag, user: true }));
                // 增加思考状态
                nTalks.push(ChatBotConfig.createTalkData('thinking', {}));

                this.setState({
                    userInput: {
                        prompt: '', tag: ''
                    },
                    chatbotInitPrompt: '',
                    openMyPrompts: false
                })

                // console.log(`prompt`, JSON.stringify(prompt, null, 2), JSON.stringify(prePrompt, null, 2), combo, prompt.input)

                // combo>0从comboor对话流里运行
                // combo==-1 用户对话框里的输入


                // input的处理
                if (prompt.input == 'bindCurrentPage') {
                    // 绑定全文
                    prompt.text = this._promptBindCurrentSite(prompt.text, 'text')
                } else if (prompt.input == 'bindCurrentPageHTML') {
                    // 绑定网页
                    prompt.text = this._promptBindCurrentSite(prompt.text, 'html')
                } else if (prompt.input == 'bindCurrentPageURL') {
                    // 绑定url
                    prompt.text = this._promptBindCurrentSite(prompt.text, 'url')
                } else if (prompt.input == 'userSelection') {
                    // 从用户划选
                    prompt.text = this._promptBindUserSelection(prompt.text)
                } else if (prompt.input == 'clipboard') {
                    // 从剪切板
                    prompt.text = await this._promptBindUserClipboard(prompt.text)
                }

                // output的处理
                if (prePrompt && prePrompt.output != 'default') {
                    let lastTalk = Talks.getLastTalk([...nTalks]);
                    prompt.text = this._promptOutput(prePrompt.output, prompt.text, lastTalk)
                }


                // 运行时
                console.log('prompt.type------', prompt.type, prompt.text, from)

                // 如果是用户输入的，from==chatbot-input
                if (from === "chatbot-input") {
                    prompt.model = this.state.chatBotType;
                    if (this.state.chatBotStyle && this.state.chatBotStyle.value) prompt.temperature = this.state.chatBotStyle.value;
                }

                if (['prompt',
                    'tasks',
                    'extract',
                    'json',
                    'list',
                    'markdown',
                    'translate-zh',
                    'translate-en'].includes(prompt.type)) this._llmRun(prompt, newTalk);

                if (prompt.type === 'highlight') {
                    this._agentHighlightTextRun(lastTalk)
                }

                // 标记当前执行状态，以及下一条
                const currentCombo = { ...data._combo, PromptIndex: cmd == 'combo' ? 1 : this.state.PromptIndex }

                if (prompt.type === 'query') this._agentQueryRun(prompt.queryObj, currentCombo);

                if (prompt.type == 'send-to-zsxq') this._agentSendToZsxqRun(prompt.queryObj.url, prompt.text, currentCombo)

                if (prompt.type === 'api') this._agentApiRun(prompt.api, prompt.text, currentCombo);

            }

            switch (cmd) {
                // 打开配置
                case "open-setup":
                    this.setState({
                        toggleSetup: true
                    });
                    return;
                case "close-setup":
                    this.setState({
                        toggleSetup: false
                    });
                    return
                case "copy-action":
                    // console.log(`copy success`)
                    message.info(`copy success`)
                    return;
                // 打开官网
                case "open-url":
                    sendMessageToBackground['open-url']({ url: data.url })
                    return;
                // 打开我的prompts
                case "left-button-action":
                    getPromptsData().then((prompts: any) => {
                        this.setState({
                            openMyPrompts: true,
                            myPrompts: prompts
                        });
                    })
                    return;
                case "chatbot-select":
                    this._chatBotSelect(data)
                    return;
                case "close-chatbot-panel":
                    this.show(!this.state.loading)
                    return;
                // case "toggle-fullscreen":
                //     this.setState({
                //         fullscreen: !this.state.fullscreen
                //     });
                //     return
                case "activate-chatbot":
                    console.log('activate-chatbot')
                    return
                case "show-combo-modal":
                    this._promptControl({ cmd, data })
                    return
                case "close-combo-editor":
                    this._promptControl({ cmd })
                    return
                case "Bing":
                    // urls,prompts
                    console.log('Bing:::', data)
                    if (data.url) {
                        sendMessageToBackground['open-url']({ url: data.url })
                    } else if (data.prompt) {

                    }
                    return;
                // 用户点击建议
                case "combo":
                    // console.log('combo:开始运行:', data)
                    this._promptControl({
                        cmd: 'update-prompt-for-combo',
                        data: { prompt: { ...data._combo }, from: "fromFlow" }
                    })
                    sendTalk()
                    break;
                // 用户发送对话
                case "send-talk":
                    if (data._combo) this._promptControl({
                        cmd: 'update-prompt-for-combo',
                        data: { prompt: data._combo, from: "fromFlow" }
                    })
                    sendTalk()
                    break;
                case "send-talk-refresh":
                    sendTalk()
                    break;
                // 终止对话
                case "stop-talk":
                    sendMessageToBackground['chat-bot-talk-stop']({ type: this.state.chatBotType });
                    this.updateChatBotStatus(false)
                    // 清空type thinking 的状态
                    nTalks = Talks.clearThinking(nTalks)
                    break;
                // 新建对话
                case "new-talk":
                    nTalks = []

                    let talk = await Talks.createShowInChatInterfaces()
                    if (talk) nTalks.push(talk);
                    Talks.clear();
                    sendMessageToBackground['chat-bot-talk-new']({ type: this.state.chatBotType, newTalk: true });

                    break;
                // case "input-change":
                //     this.setState({
                //         input: data.input
                //     })
                //     break;
                // case "output-change":
                //     this.setState({
                //         output: data.output
                //     })
                //     break;
                default:
                    console.log("default");
                // // 初始化bing
            }


            nTalks = nTalks.filter(t => t)

            this.setState({
                talks: nTalks  // 保存对话内容 一句话也可以是按钮
            });

            // 把对话内容保存到本地
            Talks.save(nTalks)

        }


    }


    /**
     * 
     * @param type add 、 delete
     * @param data { tag,checked,bind,owner,combo,prompt,prompt2... }
     */
    _promptUpdateUserData(type = "add", data: any) {
        const { id } = data;
        chromeStorageGet(['user']).then((items: any) => {
            const oldData = items.user || [];
            const newData = oldData.filter((od: any) => od.id != id);

            if (type === 'add') newData.push(data);

            if (newData.length > 5) {
                message.info('已达到最大存储数量')
                // message.error('已达到最大存储数量');
            };

            chromeStorageSet({ 'user': newData }).then(() => this._promptRefreshData())

        });
    }


    _promptRefreshData() {
        chromeStorageGet(['user', 'official']).then((res: any) => {
            let prompts: any = [];

            if (res.user) {
                prompts = [...res.user];
            }

            if (res.official) {
                prompts = [...prompts, ...res.official];
            }
            console.log('_promptRefreshData', prompts)
            this.setState({
                myPrompts: prompts,
                showEdit: false
            });

        })
    }



    /*
    bind: false,checked: true,combo:2,id:"187a3184aab",owner:"user",prompt: "1",prompt2: "2",tag:"test"
    */

    _promptControl = (event: any) => {
        const { cmd, data } = event;

        if (cmd == "update-prompt-for-combo") {
            const { prompt, from } = data;

            const d = {
                PromptIndex: prompt.PromptIndex != undefined ? prompt.PromptIndex : 1,
                currentPrompt: prompt,
                disabledAll: true
            }
            console.log('update-prompt-for-combo', prompt, from, d)
            this.setState(d)

        } else if (cmd == "show-combo-modal") {
            // console.log("show-combo-modal",data)
            const { prompt, from } = data;
            if (prompt) {
                this.setState({
                    showEdit: true,

                    openMyPrompts: true,
                    currentPrompt: prompt
                })
            }

        } else if (cmd == "edit-combo-finish") {
            console.log('edit-on-finish', data)
            const { prompt, from } = data;
            if (data) this._promptUpdateUserData('add', prompt);

        } else if (cmd == "edit-combo-cancel") {
            // 取消，关闭即可
            this.setState({
                showEdit: false,
                openMyPrompts: this.state.openMyPrompts
            })
        } else if (cmd == "delete-combo-confirm") {
            const { prompt, from } = data;
            // 删除
            this._promptUpdateUserData('delete', prompt);
        } else if (cmd == "close-combo-editor") {
            this.setState({
                showEdit: false,
                openMyPrompts: false
            })
        } else if (cmd == "stop-combo") {
            this.setState(
                {
                    PromptIndex: 0,
                    currentPrompt: null
                }
            )
            this.updateChatBotStatus(false)
        }
    }


    _doChatBotData() {

        let subjects = [{
            type: 'chatbot', text: '聊天', index: -1
        }];

        let activeIndex = -1;

        let talks: any = [...this.state.talks];

        // 聊天服务无效,补充提示
        if (!this.state.chatBotIsAvailable && activeIndex == -1) {
            talks = talks.filter((d: any) => d.type == 'markdown' || d.type == 'talk' || d.type == 'done' || d.type == 'images');
            talks.push(ChatBotConfig.createTalkData('chatbot-is-available-false', {
                hi: this.state.chatBotType
            }))
        }

        const datas = [talks]

        const tabList = Array.from(subjects, subject => {
            return {
                key: subject.text,
                tab: subject.text,
                index: subject.index
            }
        });

        return {
            tabList, datas, activeIndex
        }
    }

    render() {
        const { tabList, datas, activeIndex } = this._doChatBotData();
        return (<>
            <FlexColumn
                className={this.props.className}
                translate="no"
                display={
                    this.state.initIsOpen ?
                        (this.state.loading ? 'none' : 'flex')
                        : 'none'}
                // 修复qq邮箱里不显示的问题
                style={{
                    display: this.state.initIsOpen ?
                        (this.state.loading ? 'none' : 'flex')
                        : 'none',
                    position: 'fixed',
                    top: 0,
                    right: 0,
                    zIndex: 999,
                    background: 'white',
                    height: '100vh'
                }}
            >
                {/* <PDF name='pdf'/> */}
                {!this.state.showEdit && !this.state.loadingChatBot && this.state.openMyPrompts ?
                    <ComboEditor
                        myPrompts={this.state.myPrompts}
                        callback={(event: any) => this._control(event)}
                    /> : ''}

                {this.state.showEdit && <ComboModal
                    currentPrompt={this.state.currentPrompt}
                    callback={(e: any) => this._promptControl(e)}
                />}

                {
                    !this.state.showEdit && this.state.toggleSetup &&
                    <Setup callback={(event: any) => this._control(event)} />}

                {
                    !this.state.showEdit && !this.state.toggleSetup && !this.state.openMyPrompts ?
                        <ChatBotPanel
                            name={this.state.appName}
                            tabList={tabList}
                            activeIndex={activeIndex}
                            datas={datas}
                            fullscreen={this.state.fullscreen}
                            disabled={this.state.disabledAll}
                            callback={(e: any) => this._control(e)}
                            config={
                                Array.from(defaultChatbots, (c: any) => {
                                    c.checked = (c.type == this.state.chatBotType);
                                    return c
                                })}
                        />
                        : ''
                }
            </FlexColumn>

        </>
        )
    }
}


export default Main

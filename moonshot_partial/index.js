import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "moonshot_partial";
const defaultSettings = { 
    enabled: true,
    nameEnabled: false,
    nameValue: ""
};

// 初始化拓展配置
if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = defaultSettings;
}
const settings = extension_settings[extensionName];

// 兼容旧版本升级：如果存在旧配置但没有新字段，补全它们
if (settings.nameEnabled === undefined) settings.nameEnabled = defaultSettings.nameEnabled;
if (settings.nameValue === undefined) settings.nameValue = defaultSettings.nameValue;

// 拦截原生的 fetch 请求
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    const [resource, config] = args;
    
    // 拦截发往 ST 后端的聊天生成请求
    if (typeof resource === 'string' && resource.includes('/api/backends/chat-completions/generate') && config?.body) {
        try {
            let bodyObj = JSON.parse(config.body);
            let msgs = bodyObj.messages;
            
            // 确保最后一条是 assistant 时执行注入逻辑
            if (msgs && msgs.length > 0 && msgs.at(-1).role === 'assistant') {
                let isModified = false;
                let lastMsg = msgs.at(-1);
                let newLastMsg = {}; // 创建一个全新的对象来控制键的插入顺序
                
                // 1. 插入 partial
                if (settings.enabled) {
                    newLastMsg.partial = true;
                    isModified = true;
                }
                
                // 2. 插入 role
                newLastMsg.role = lastMsg.role;
                
                // 3. 插入 name
                if (settings.nameEnabled && settings.nameValue.trim() !== "") {
                    newLastMsg.name = settings.nameValue.trim();
                    isModified = true;
                } else if (lastMsg.name !== undefined) {
                    // 如果原消息本就带有 name，予以保留
                    newLastMsg.name = lastMsg.name;
                }
                
                // 4. 插入 content
                newLastMsg.content = lastMsg.content;
                
                // 5. 兜底：把原对象可能存在的其他未知字段原样复制过来
                for (let key in lastMsg) {
                    if (!['partial', 'role', 'name', 'content'].includes(key)) {
                        newLastMsg[key] = lastMsg[key];
                    }
                }
                
                // 如果启用了任何注入功能，则替换原对象并重新打包
                if (isModified) {
                    msgs[msgs.length - 1] = newLastMsg;
                    config.body = JSON.stringify(bodyObj);
                }
            }
        } catch (e) {
            console.error("Moonshot 拓展参数注入失败:", e);
        }
    }
    return originalFetch.apply(this, args);
};

// 构建 ST 拓展设置界面的 UI 组件
jQuery(async () => {
    const settingsHtml = `
        <div class="extension-settings" id="${extensionName}_settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Moonshot 参数注入</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content" style="display: none;">
                    
                    <!-- Partial 注入开关 -->
                    <label class="checkbox_label" title="开启后，将在发给 API 的最后一条消息中强制注入 partial: true">
                        <input id="${extensionName}_enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}/>
                        <b>启用 Kimi Partial 续写</b>
                    </label>
                    
                    <hr style="margin: 10px 0; border-color: var(--grey_color); opacity: 0.3;">
                    
                    <!-- Name 注入开关 -->
                    <label class="checkbox_label" title="开启后，将在发给 API 的最后一条消息中注入 name 参数">
                        <input id="${extensionName}_name_enabled" type="checkbox" ${settings.nameEnabled ? 'checked' : ''}/>
                        <b>启用 Name 参数注入</b>
                    </label>
                    
                    <!-- Name 输入框 -->
                    <div style="margin-top: 5px;">
                        <label for="${extensionName}_name_value" style="display:block; margin-bottom:5px; font-size: 0.9em; color: var(--grey_color);">Name 参数值:</label>
                        <input id="${extensionName}_name_value" class="text_pole" type="text" placeholder="输入 name 的值" value="${settings.nameValue || ''}" style="width: 100%; box-sizing: border-box;"/>
                    </div>

                </div>
            </div>
        </div>
    `;
    
    // 将 HTML 注入到 ST 的拓展设置面板中
    $("#extensions_settings").append(settingsHtml);
    
    // 监听开关的变化，并保存到 ST 的本地存储中
    $("#" + extensionName + "_enabled").on("change", function () {
        settings.enabled = $(this).is(":checked");
        saveSettingsDebounced();
    });
    
    $("#" + extensionName + "_name_enabled").on("change", function () {
        settings.nameEnabled = $(this).is(":checked");
        saveSettingsDebounced();
    });
    
    // 监听输入框的内容变化
    $("#" + extensionName + "_name_value").on("input", function () {
        settings.nameValue = $(this).val();
        saveSettingsDebounced();
    });
});
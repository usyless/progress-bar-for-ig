'use strict';

if (typeof browser === 'undefined') {
    var browser = chrome;
}

(() => {
    document.getElementById('versionDisplay').textContent += chrome?.runtime?.getManifest?.()?.version;

    const DIV = document.getElementById('settings');

    const options = {
        'Preferences': [
            {
                name: 'show_bar',
                description: 'Show a faint small progress bar when not hovering',
                category: 'preferences',
                default: true
            },
            {
                name: 'show_progress',
                description: 'Show the current video time when hovering over the progress bar',
                category: 'preferences',
                default: true
            },
            {
                name: 'prevent_extra_menus',
                description: 'Prevent the "liked by" menu appearing when clicking the likes number on reels',
                category: 'preferences',
                default: false
            },
            {
                name: 'custom_like_key',
                description: 'Custom reel like keybind (empty for disabled): ',
                category: 'preferences',
                default: '',
                type: 'text'
            }
        ],
        'Extras': [
            {
                name: 'reset_all_settings',
                description: '',
                type: 'button',
                button: 'Reset to DEFAULT settings',
                class: ['warning'],
                onclick: () => {
                    if (confirm('Are you sure you want to RESET this extensions settings?')) {
                        clearStorage();
                        window.location.reload();
                    }
                }
            }
        ]
    }

    const valuesToUpdate = [];
    const typeMap = {
        button: (e) => {
            const [outer, button] = get_generic_setting(e, 'button');
            button.textContent = e.button;
            button.addEventListener('click', e.onclick);
            return outer;
        },
        checkbox: (e) => {
            const [outer, checkbox] = get_generic_setting(e, 'input', true);
            checkbox.setAttribute('type', 'checkbox');
            valuesToUpdate.push({obj: e, func: (v) => checkbox.checked = v});
            checkbox.addEventListener('change', (ev) => update_value(ev, e, 'checked'));
            return outer;
        },
        text: (e) => {
            const [outer, input] = get_generic_setting(e, 'input');
            input.setAttribute('type', 'text');
            valuesToUpdate.push({obj: e, func: (v) => input.value = v});
            input.addEventListener('input', (ev) => {
                input.value = input.value.slice(-1);
                update_value(ev, e, 'value');
            });
            return outer;
        }
    }

    for (const section in options) {
        const outer = document.createElement('div'), h = document.createElement('h3');
        h.textContent = section;
        outer.appendChild(h);
        for (const inner in options[section]) outer.appendChild(create(options[section][inner]));
        DIV.appendChild(outer);
    }

    chrome.storage.local.get(valuesToUpdate.map(i => i.obj.category ?? i.obj.name), (s) => {
        for (const {obj, func} of valuesToUpdate) {
            if (obj.category != null) func(s[obj.category]?.[obj.name] ?? obj.default);
            else func(s[obj.name] ?? obj.default);
        }
        valuesToUpdate.length = 0;
    });

    function create(elem) {
        elem.init?.();
        return typeMap[elem.type ?? 'checkbox'](elem);
    }

    function get_generic_setting(e, element, flipOrder) {
        const outer = document.createElement('div'), label = document.createElement('label'), elem = document.createElement(element);
        label.textContent = e.description;
        label.setAttribute('for', e.name);
        elem.id = e.name;
        if (e.class) elem.classList.add(...e.class);
        if (flipOrder) outer.append(elem, label);
        else outer.append(label, elem);
        return [outer, elem];
    }

    function update_value(e, obj, property) {
        chrome.storage.local.get([obj.category ?? obj.name], (r) => {
            if (obj.category != null) {
                if (r[obj.category] == null) r[obj.category] = {};
                r[obj.category][obj.name] = e.target[property];
            } else {
                r[obj.name] = e.target[property];
            }
            setStorage(r);
        });
    }

    function setStorage(data) {
        chrome.storage.local.set(data); // potentially add little saved message with .then
    }

    function clearStorage() {
        chrome.storage.local.clear();
    }
})();
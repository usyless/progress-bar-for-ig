if (typeof browser === 'undefined') {
    var browser = chrome;
}

const DIV = document.getElementById('settings');

const options = {
    'Preferences': [
        {
            name: 'show_bar',
            description: 'Show faint small progress bar when not hovering',
            default: true
        },
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
const typeMap = {
    button: create_button,
}
let values;
for (const section in options) {
    const outer = document.createElement('div'), h = document.createElement('h3');
    h.textContent = section;
    outer.appendChild(h);
    for (const inner in options[section]) outer.appendChild(create(options[section][inner]));
    DIV.appendChild(outer);
}

function create(elem) {
    elem.init?.();
    return typeMap[elem.type]?.(elem) ?? create_checkbox(elem);
}

function create_checkbox(e) {
    const [outer, checkbox] = get_generic_setting(e, 'input', true);
    checkbox.setAttribute('type', 'checkbox');
    get_value(e.name, e.default).then(v => checkbox.checked = v);
    checkbox.addEventListener('change', toggle_value)
    return outer;
}

function create_button(e) {
    const [outer, button] = get_generic_setting(e, 'button');
    button.textContent = e.button;
    button.addEventListener('click', e.onclick);
    return outer;
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

async function get_value(value, def, refresh=false) {
    if (!values || refresh) values = await browser.storage.local.get();
    return values[value] ?? def;
}

function toggle_value(e) {
    const data = {};
    data[e.target.id] = e.target.checked;
    setStorage(data);
}

async function setStorage(data) {
    await chrome.storage.local.set(data);
}

function clearStorage() {
    chrome.storage.local.clear();
}
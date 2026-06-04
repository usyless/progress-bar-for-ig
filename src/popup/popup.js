(() => {
    'use strict';
    /** @type {typeof browser} */
    const extension = (Number((browser || chrome).runtime.getManifest().manifest_version) === 2) ? browser : (() => {
        return chrome;
    })();

    extension.tabs.create({url: extension.runtime.getURL('/settings/settings.html')}).then(() => {
        window.close();
    });
})();
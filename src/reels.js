(() => {
    'use strict';
    // set browser to chrome if not in firefox
    /** @type {typeof browser} */
    const extension = (Number((browser || chrome).runtime.getManifest().manifest_version) === 2) ? browser : (() => {
        return chrome;
    })();

    const Settings = {
        preferences: {
            show_bar: true,
            show_progress: true,
            show_bar_on_any_hover: false,
            show_volume: true,
            prevent_extra_menus: false,
            custom_like_key: ''
        },

        video_status: {
            volume: 1.0,
        },

        loadSettings: async (settings) => {
            const s = await extension.storage.local.get(settings);
            for (const setting of settings) {
                Settings[setting] = {...Settings[setting], ...s[setting]};
            }
        },

        loadAllSettings: () => Settings.loadSettings(['preferences', 'video_status']),

        updateVideoStatus: () => extension.storage.local.set({video_status: Settings.video_status}),
    };

    const formatTime = (time) => {
        time = parseInt(time);
        return `${Math.floor(time / 60).toString()}:${(time % 60).toString().padStart(2, '0')}`;
    };

    const inViewport = (e) => {
        const rect = e.getBoundingClientRect();
        return rect.top >= 0 && rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    };

    let onReels = location.pathname.includes('/reels/');

    /** @type {Set<HTMLElement>} */
    let progress_bar_containers = new Set();

    /**
     * @param {Event} e
     */
    const preventAll = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    };

    /**
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    const checkCenterHitTest = (element) => {
        const {left, top, width, height} = element.getBoundingClientRect();
        const topElement = document.elementFromPoint(left + width / 2, top + height / 2);
        return Boolean(topElement === element || element.contains(topElement));
    }

    const Video = {
        /** @param {HTMLElement} parent */
        addProgressBar: (parent) => {
            const holding_element = parent.querySelector('[data-instancekey]');
            const reel = parent.querySelector('video');

            if (!holding_element || !reel) return;

            for (const c of holding_element.querySelectorAll('.usy-progress-bar-container')) c.remove();
            let holding = false, duration;

            const barBoxContainer = document.createElement('div');
            barBoxContainer.classList.add('usy-progress-bar-container');

            const bar = document.createElement('div');
            bar.classList.add('usy-progress-bar');
            if (!Settings.preferences.show_bar) bar.classList.add('usy-progress-bar-hidden');
            if (!Settings.preferences.show_progress) barBoxContainer.classList.add('no-progress');
            barBoxContainer.appendChild(bar);
            const setWidth = () => bar.style.width = `${(reel.currentTime / duration) * 100}%`;
            holding_element.appendChild(barBoxContainer);
            progress_bar_containers.add(barBoxContainer);

            const init = () => {
                if (Settings.preferences.show_volume) reel.volume = Settings.video_status.volume;
                if (duration) {
                    barBoxContainer.style.setProperty('--time', `"${formatTime(reel.currentTime)}/${formatTime(duration)}"`);
                    if (!holding && !reel.paused) {
                        bar.style.setProperty('--remainingTime', `${duration - reel.currentTime}s`);
                        bar.style.width = '100%';
                    }
                }
            }

            const onPauseEnd = () => {
                bar.style.setProperty('--remainingTime', '0s');
                setWidth();
                void(bar.offsetHeight); // Reflow
            };

            {
                const initialiseDuration = () => {
                    duration = reel.duration;
                    setWidth();
                };
                if (reel.readyState >= 1) initialiseDuration();
                else reel.addEventListener('loadedmetadata', initialiseDuration, {once: true});
            }

            reel.addEventListener('ended', onPauseEnd);
            reel.addEventListener('play', init);
            reel.addEventListener('pause', onPauseEnd);
            reel.addEventListener('timeupdate', init);

            const updateBarFromMouse = (e) => {
                const box = barBoxContainer.getBoundingClientRect();
                reel.currentTime = Math.max(0, Math.min(((e.clientX - box.left) / box.width) * duration, duration));
                setWidth();
                if (!holding) bar.classList.remove('usy-holding');
            }

            let pauseTimeout = null;
            let paused = false;
            const pauseReel = reel.pause.bind(reel);
            const moveListener = (e) => {
                preventAll(e);
                updateBarFromMouse(e);
            }
            const stopHold = (e) => {
                preventAll(e);
                clearTimeout(pauseTimeout);
                document.removeEventListener('pointermove', moveListener);
                if (!paused) {
                    void reel.play();
                    if (!reel.paused) init();
                }
                holding = false;
                updateBarFromMouse(e);
            }
            barBoxContainer.addEventListener('pointerdown', (e) => {
                preventAll(e);
                document.removeEventListener('pointermove', moveListener);
                document.removeEventListener('pointerup', stopHold);
                paused = reel.paused;
                if (!paused) pauseTimeout = setTimeout(pauseReel, 150);
                bar.classList.add('usy-holding');
                holding = true;
                updateBarFromMouse(e);
                document.addEventListener('pointerup', stopHold, {once: true});
                document.addEventListener('pointermove', moveListener);
            });
            barBoxContainer.addEventListener('click', preventAll);

            barBoxContainer.__fix_progress_bar = () => {
                onPauseEnd();
                init();
            };
        },

        fixProgressBars: () => {
            for (const bar of progress_bar_containers) {
                if (bar.isConnected) bar.__fix_progress_bar?.();
                else progress_bar_containers.delete(bar);
            }
        },

        /** @param {HTMLElement} mute_button */
        addVolumeBar: (mute_button) => {
            for (const c of mute_button.parentElement.querySelectorAll('.usy-volume-bar-container')) c.remove();
            mute_button.classList.add('usy-volume-bar-button');

            const volumeBarContainer = document.createElement('div');
            volumeBarContainer.classList.add('usy-volume-bar-container');
            const volumeBar = document.createElement('div');
            volumeBar.classList.add('usy-volume-bar');
            volumeBarContainer.appendChild(volumeBar);
            volumeBar.style.width = `${Settings.video_status.volume * 100}%`;

            const updateVolume = (e) => {
                const {left, width} = volumeBarContainer.getBoundingClientRect();
                const volume = Math.max(0, Math.min((e.clientX - left) / width, 1.0));
                volumeBar.style.width = `${volume * 100}%`;
                Video.updateGlobalVolume(volume);
            }

            const moveListener = (e) => {
                e.preventDefault();
                updateVolume(e);
            }
            const stopHold = (e) => {
                e.preventDefault();
                document.removeEventListener('pointermove', moveListener);
                volumeBar.classList.remove('usy-holding');
            }

            volumeBarContainer.addEventListener('click', preventAll);

            volumeBarContainer.addEventListener('pointerdown', (e) => {
                if (!checkCenterHitTest(volumeBarContainer)) return;

                preventAll(e);

                volumeBar.classList.add('usy-holding');
                document.addEventListener('pointermove', moveListener);
                document.addEventListener('pointerup', stopHold, {once: true});
                updateVolume(e);
            });

            mute_button.prepend(volumeBarContainer);
        },

        /**
         * @type {(volume: Number) => void}
         */
        updateGlobalVolume: (() => {
            let latestVolume;
            let ticking = false;

            const cb = () => {
                const volume_attr = `${latestVolume * 100}%`;
                for (const elem of document.querySelectorAll('video, .usy-volume-bar')) {
                    if (elem.nodeName === 'VIDEO') elem.volume = latestVolume;
                    else elem.style.width = volume_attr;
                }
                if (Settings.video_status.volume !== latestVolume) {
                    Settings.video_status.volume = latestVolume;
                    void Settings.updateVideoStatus();
                }
                ticking = false;
            };

            return (volume) => {
                latestVolume = volume;
                if (ticking) return;
                ticking = true;
                setTimeout(cb, 200);
            };
        })(),

        /**
         * @param {HTMLElement} e
         * @returns {HTMLElement | null}
         */
        getClosestReelContainer: (e) => e.closest('div.x78zum5.xedcshv'),

        /**
         * @type {(reel: HTMLElement) => void}
         */
        preventExtraMenus: (() => {
            /**
             * @param {MouseEvent} e
             */
            const cb = (e) => {
                preventAll(e);

                e.currentTarget.parentElement.firstElementChild.firstElementChild.firstElementChild.click();
            };
            return (reel) => {
                Video.getClosestReelContainer(reel)?.nextElementSibling?.firstElementChild?.lastElementChild?.addEventListener?.('click', cb, {capture: true});
            }
        })(),

        likeVideo: (reel) => {
            Video.getClosestReelContainer(reel)?.nextElementSibling?.firstElementChild?.firstElementChild?.firstElementChild?.firstElementChild?.click?.();
        },

        addProgressBars: () => {
            if (Settings.preferences.show_bar_on_any_hover) {
                document.documentElement?.classList?.add?.('usy-show-bar-on-any-hover');
            } else {
                document.documentElement?.classList?.remove?.('usy-show-bar-on-any-hover');
            }

            for (const reel of document.body.querySelectorAll('*:has(> [data-instancekey]):has(video)')) {
                if (reel.querySelector('.usy-progress-bar-container')) continue;
                Video.addProgressBar(reel);
            }
            if (Settings.preferences.show_volume) {
                for (const volume of document.body.querySelectorAll('[aria-label^="Audio is "]')) {
                    if (volume.parentElement.querySelector('.usy-volume-bar-container')) continue;
                    Video.addVolumeBar(volume.parentElement);
                }
            }
            if (onReels && Settings.preferences.prevent_extra_menus) {
                for (const reel of document.body.querySelectorAll('video:not([usy-prevent-extra-menu])')) {
                    reel.setAttribute('usy-prevent-extra-menu', '');
                    Video.preventExtraMenus(reel);
                }
            }
        },

        ClearAll: async () => {
            for (const reel of document.body.querySelectorAll('video[usy-prevent-extra-menu]')) {
                reel.removeAttribute('usy-prevent-extra-menu');
            }
            for (const element of document.body.querySelectorAll('.usy-volume-bar-container, .usy-progress-bar-container')) {
                element.remove();
            }
        }
    };

    setInterval(Video.fixProgressBars, 1000);

    window.addEventListener('keydown', (e) => {
        if (onReels && e.key.toLowerCase() === Settings.preferences.custom_like_key.toLowerCase()) {
            for (const reel of document.querySelectorAll('video')) {
                if (inViewport(reel)) {
                    Video.likeVideo(reel);
                    break;
                }
            }
        }
    }, {capture: true});

    {
        Video.ClearAll().then(() => {
            const observerSettings = {subtree: true, childList: true};
            const cb = (_, o) => {
                o?.disconnect();
                onReels = location.pathname.includes('/reels/');
                Video.addProgressBars();
                o?.observe(document.body, observerSettings);
            }
            Settings.loadAllSettings().then(() => {
                cb();
                (new MutationObserver(cb)).observe(document.body, observerSettings);
            });
        });
    }

    browser.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace === 'local') {
            if (Object.hasOwn(changes, 'preferences')) {
                Settings.loadSettings(['preferences']).then(Video.ClearAll).then(Video.addProgressBars);
            }

            if (Object.hasOwn(changes, 'video_status')) {
                const current_volume = Settings.video_status.volume;
                Settings.loadSettings(['video_status']).then(() => {
                    if (!Settings.preferences.show_volume) return;
                    if (Settings.video_status.volume !== current_volume) Video.updateGlobalVolume(Settings.video_status.volume);
                });
            }
        }
    });
})();
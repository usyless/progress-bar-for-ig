(() => {
    'use strict';
    // set browser to chrome if not in firefox
    /** @type {typeof browser} */
    const extension = typeof browser !== 'undefined' ? browser : (() => {
        return chrome;
    })();

    const Settings = {
        preferences: {
            show_bar: true,
            show_progress: true,
            prevent_extra_menus: false,
            custom_like_key: ''
        },

        _video_status_data: {
            volume: 1.0,
        },

        loadSettings: async () => {
            const s = await extension.storage.local.get(['preferences', 'video_status']);
            for (const setting of ['preferences', ['video_status', '_video_status_data']]) {
                if (Array.isArray(setting)) {
                    Settings[setting[1]] = {...Settings[setting[1]], ...s[setting[0]]};
                } else {
                    Settings[setting] = {...Settings[setting], ...s[setting]};
                }
            }
            Settings._video_status_proxy = new Proxy(Settings._video_status_data, Settings._video_status_handler);
        },

        onVideoStatusChange: () => extension.storage.local.set({video_status: Settings._video_status_data}),

        get video_status() {
            return this._video_status_proxy;
        },

        set video_status(newData) {
            Object.assign(this._video_status_data, newData);
            Settings.onVideoStatusChange();
        },

        _video_status_handler: {
            set(target, prop, value) {
                target[prop] = value;
                Settings.onVideoStatusChange();
                return true;
            }
        },

        _video_status_proxy: null,
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
    }

    let onReels = location.pathname.includes('/reels/');

    const Video = {
        /** @param {HTMLVideoElement} reel */
        addProgressBar: (reel) => {
            let holding = false, duration;

            const barBoxContainer = document.createElement('div');
            barBoxContainer.classList.add('usy-progress-bar-container');

            const bar = document.createElement('div');
            bar.classList.add('usy-progress-bar');
            if (!Settings.preferences.show_bar) bar.classList.add('usy-progress-bar-hidden');
            if (!Settings.preferences.show_progress) barBoxContainer.classList.add('no-progress');
            barBoxContainer.appendChild(bar);
            const setWidth = () => bar.style.width = `${(reel.currentTime / duration) * 100}%`;
            reel.after(barBoxContainer);

            const init = () => {
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
                e.preventDefault();
                updateBarFromMouse(e);
            }
            const stopHold = (e) => {
                e.preventDefault();
                clearTimeout(pauseTimeout);
                document.removeEventListener('pointermove', moveListener);
                if (!paused) {
                    reel.play();
                    if (!reel.paused) init();
                }
                holding = false;
                updateBarFromMouse(e);
            }
            barBoxContainer.addEventListener('pointerdown', (e) => {
                e.preventDefault();
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
        },

        updateAllVideoVolume: (volume) => {
            volume ??= Settings.video_status.volume;
            for (const video of document.querySelectorAll('video')) {
                video.volume = volume;
                // instagram already handles mute sync
            }
        },

        /** @param {HTMLVideoElement} reel */
        addVolumeBar: (reel) => {
            const mute_button =
                reel.parentElement.querySelector('[aria-label^="Audio is "]')?.parentElement
                ?? reel.closest('div:not([class]):not([style])')?.parentElement?.querySelector('[aria-label^="Audio is "]')?.parentElement;
            if (mute_button) {
                mute_button.classList.add('usy-volume-bar-button');

                const volumeBarContainer = document.createElement('div');
                volumeBarContainer.classList.add('usy-volume-bar-container');
                const volumeBar = document.createElement('div');
                volumeBar.classList.add('usy-volume-bar');
                volumeBarContainer.appendChild(volumeBar);

                const updateVolume = (e) => {
                    const box = volumeBarContainer.getBoundingClientRect();
                    reel.volume = Math.max(0, Math.min((e.clientX - box.left) / box.width, 1.0));
                }

                const moveListener = (e) => {
                    e.preventDefault();
                    updateVolume(e);
                }
                const stopHold = (e) => {
                    e.preventDefault();
                    document.removeEventListener('pointermove', moveListener);
                    volumeBar.classList.remove('usy-holding');

                    Settings.video_status.volume = reel.volume;
                }

                volumeBarContainer.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                });

                volumeBarContainer.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    volumeBar.classList.add('usy-holding');
                    document.addEventListener('pointermove', moveListener);
                    document.addEventListener('pointerup', stopHold, {once: true});
                    updateVolume(e);
                });

                reel.addEventListener('volumechange', () => {
                    // wont react to external changes
                    volumeBar.style.width = `${reel.volume * 100}%`;
                });

                setTimeout(() => {
                    reel.volume = Settings.video_status.volume;
                }, 0);

                if (location.pathname.includes('/stories/')) {
                    volumeBarContainer.style.left = 'auto';
                    volumeBarContainer.style.right = `calc((var(--right-space) * 2) + ${mute_button.clientWidth}px)`;
                }

                mute_button.prepend(volumeBarContainer);
            }
        },

        getClosestReelContainer: (e) => e.closest('div.x78zum5.xedcshv'),

        preventExtraMenus: (reel) => {
            Video.getClosestReelContainer(reel)?.nextElementSibling?.firstElementChild?.lastElementChild?.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                e.currentTarget.parentElement.firstElementChild.firstElementChild.firstElementChild.click();
            }, {capture: true});
        },

        likeVideo: (reel) => {
            Video.getClosestReelContainer(reel)?.nextElementSibling?.firstElementChild?.firstElementChild?.firstElementChild?.firstElementChild?.click();
        },

        addProgressBars: () => {
            for (const reel of document.body.querySelectorAll('video:not([usy-progress-bar])')) {
                reel.setAttribute('usy-progress-bar', '');
                Video.addProgressBar(reel);
                Video.addVolumeBar(reel);

                if (onReels) {
                    if (Settings.preferences.prevent_extra_menus) Video.preventExtraMenus(reel);
                }
            }
        },

        ClearAll: async () => {
            for (const reel of document.body.querySelectorAll('video[usy-progress-bar]')) {
                reel.removeAttribute('usy-progress-bar');
            }
            for (const element of document.body.querySelectorAll('.usy-volume-bar-container, .usy-progress-bar-container')) {
                element.remove();
            }
        }
    };

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
            Settings.loadSettings().then(() => {
                cb();
                (new MutationObserver(cb)).observe(document.body, observerSettings);
            });
        });
    }

    browser.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace === 'local') {
            if (changes.hasOwnProperty('video_status')) {
                Video.updateAllVideoVolume();
            } else {
                Settings.loadSettings().then(Video.ClearAll).then(Video.addProgressBars);
            }
        }
    });
})();
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

    /**
     * @param {Event} e
     */
    const preventAll = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    };

    const Video = {
        /** @param {HTMLVideoElement} reel */
        addProgressBar: (reel) => {
            for (const c of reel.parentElement.querySelectorAll('.usy-progress-bar-container')) c.remove();
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
                reel.volume = Settings.video_status.volume;
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
            for (const bar of document.querySelectorAll('.usy-progress-bar-container')) {
                bar.__fix_progress_bar?.();
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
            let volumeTimer;
            return (volume) => {
                clearTimeout(volumeTimer);
                for (const video of document.querySelectorAll('video')) video.volume = volume;
                const volume_attr = `${volume * 100}%`;
                for (const bar of document.querySelectorAll('.usy-volume-bar')) bar.style.width = volume_attr;
                if (Settings.video_status.volume !== volume) {
                    volumeTimer = setTimeout(() => {
                        Settings.video_status.volume = volume;
                        void Settings.updateVideoStatus();
                    }, 100);
                }
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
            for (const reel of document.body.querySelectorAll('video:not([usy-progress-bar])')) {
                reel.setAttribute('usy-progress-bar', '');
                Video.addProgressBar(reel);
            }
            for (const volume of document.body.querySelectorAll('*:has(> [aria-label^="Audio is "]):not([usy-volume-bar])')) {
                volume.setAttribute('usy-volume-bar', '');
                Video.addVolumeBar(volume);
            }
            if (onReels && Settings.preferences.prevent_extra_menus) {
                for (const reel of document.body.querySelectorAll('video:not([usy-prevent-extra-menu])')) {
                    reel.setAttribute('usy-prevent-extra-menu', '');
                    Video.preventExtraMenus(reel);
                }
            }
        },

        ClearAll: async () => {
            for (const reel of document.body.querySelectorAll('video[usy-progress-bar], *:has(> [aria-label^="Audio is "])[usy-volume-bar], video[usy-prevent-extra-menu]')) {
                reel.removeAttribute('usy-progress-bar');
                reel.removeAttribute('usy-volume-bar');
                reel.removeAttribute('usy-prevent-extra-menu');
            }
            for (const element of document.body.querySelectorAll('.usy-volume-bar-container, .usy-progress-bar-container')) {
                element.remove();
            }
        }
    };

    document.addEventListener('click', () => {
        setTimeout(Video.fixProgressBars, 100);
    }, {capture: true});

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
                    if (Settings.video_status.volume !== current_volume) Video.updateGlobalVolume(Settings.video_status.volume);
                });
            }
        }
    });
})();
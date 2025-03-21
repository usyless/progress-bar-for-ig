'use strict';

(() => {
    const Settings = {
        preferences: {
            show_bar: true,
            show_progress: true,
            share_button_bug_fix: true,
            prevent_extra_menus: false,
            custom_like_key: ''
        },

        loadSettings: () => new Promise(resolve => {
            chrome.storage.local.get(['preferences'], (s) => {
                for (const setting of ['preferences']) Settings[setting] = {...Settings[setting], ...s[setting]};
                resolve();
            });
        }),
    };

    const formatTime = (time) => {
        time = parseInt(time);
        return `${Math.floor(time / 60).toString()}:${(time % 60).toString().padStart(2, '0')}`;
    };

    let onReels = location.pathname.includes('/reels/');

    const Video = {
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

            let pauseTimeout = null, paused = false;
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

        fixShareButtonBug: (reel) => {
            const shareButton = reel.closest('div.x78zum5.xedcshv')?.nextElementSibling;
            if (shareButton) {
                let scroll;
                shareButton.addEventListener('pointerdown', () => {
                    scroll = document.querySelector('main').firstElementChild.scrollTop;
                }, {capture: true});
                shareButton.addEventListener('click', () => {
                    document.querySelector('main').firstElementChild.scrollTop = scroll;
                    setTimeout(() => {
                        document.querySelector('main').firstElementChild.scrollTop = scroll;
                        document.querySelector('div.x1n2onr6.xzkaem6')?.addEventListener('click', (e) => {
                            setTimeout(() => {
                                document.querySelector('main').firstElementChild.scrollTop = scroll;
                            }, 100);
                        }, {capture: true});
                    }, 100);
                });
            }
        },

        preventExtraMenus: (reel) => {
            reel.closest('div.x78zum5.xedcshv')?.nextElementSibling?.firstElementChild?.lastElementChild?.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                e.currentTarget.parentElement.firstElementChild.firstElementChild.firstElementChild.click();
            }, {capture: true});
        },

        likeVideo: (reel) => {
            reel.closest('div.x78zum5.xedcshv')?.nextElementSibling?.firstElementChild?.click();
        },

        addProgressBars: () => {
            for (const reel of document.body.querySelectorAll('video:not([usy-progress-bar])')) {
                reel.setAttribute('usy-progress-bar', '');
                Video.addProgressBar(reel);

                // Bug fixes
                if (onReels) {
                    if (Settings.preferences.share_button_bug_fix) Video.fixShareButtonBug(reel);
                    if (Settings.preferences.prevent_extra_menus) Video.preventExtraMenus(reel);
                }
            }
        },

        ClearAll: () => {
            for (const reel of document.body.querySelectorAll('video[usy-progress-bar]')) {
                reel.parentElement.querySelector('div.usy-progress-bar-container')?.remove();
                reel.removeAttribute('usy-progress-bar');
            }
        }
    };

    window.addEventListener('keypress', (e) => {
        if (onReels && e.key === Settings.preferences.custom_like_key) {
            for (const reel of document.querySelectorAll('video')) {
                if (!reel.paused) {
                    Video.likeVideo(reel);
                    break;
                }
            }
        }
    }, {capture: true});

    {
        Video.ClearAll();
        const observerSettings = {subtree: true, childList: true};
        Settings.loadSettings().then(() => {
            (new MutationObserver((_, o) => {
                o.disconnect();
                onReels = location.pathname.includes('/reels/');
                Video.addProgressBars();
                o.observe(document.body, observerSettings);
            })).observe(document.body, observerSettings);
        });
    }

    chrome.storage.onChanged.addListener(async (_, namespace) => {
        if (namespace === 'local') {
            Settings.loadSettings().then(Video.ClearAll);
        }
    });
})();
'use strict';

(() => {
    const Settings = {
        preferences: {
            show_bar: true,
            show_progress: true,
            video_start_at_beginning_fix: false,
            share_button_bug_fix: false
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
            let holding = false;
            let previousTime = Infinity;
            let duration = reel.duration || 1, currentTime = 0;

            const barBoxContainer = document.createElement('div');
            barBoxContainer.classList.add('usy-progress-bar-container');

            const bar = document.createElement('div');
            bar.classList.add('usy-progress-bar');
            if (!Settings.preferences.show_bar) bar.classList.add('usy-progress-bar-hidden');
            if (!Settings.preferences.show_progress) barBoxContainer.classList.add('no-progress');
            barBoxContainer.appendChild(bar);
            const setWidth = () => bar.style.width = `${(currentTime / duration) * 100}%`;

            reel.after(barBoxContainer);

            const updateTime = () => {
                previousTime = currentTime;
                currentTime = reel.currentTime;
            };
            reel.addEventListener('timeupdate', updateTime);

            const updateTimeDisplay = () => {
                barBoxContainer.style.setProperty('--time', `"${formatTime(currentTime)}/${formatTime(duration)}"`);
            }

            const smoothBar = () => {
                if (previousTime > currentTime) {
                    bar.style.setProperty('--remainingTime', '0s');
                    bar.style.width = '0';
                    void(bar.offsetHeight); // Reflow
                } else {
                    bar.style.setProperty('--remainingTime', `${duration - currentTime}s`);
                    bar.style.width = '100%';
                }
            }

            const init = () => {
                updateTime();
                duration = reel.duration;
                updateTimeDisplay();
                if (!holding && !reel.paused) setTimeout(smoothBar);
            }

            reel.addEventListener('timeupdate', init);
            reel.addEventListener('pause', () => {
                bar.style.setProperty('--remainingTime', '0s');
                setTimeout(setWidth);
            });
            reel.addEventListener('play', init);

            const updateBarFromMouse = (e) => {
                reel.currentTime = Math.max(0, Math.min(((e.clientX - barBoxContainer.getBoundingClientRect().left) / barBoxContainer.offsetWidth) * duration, duration));
                updateTime();
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
            const shareButton = reel.closest('div.x78zum5.xedcshv').nextElementSibling;
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

        addProgressBars: () => {
            for (const reel of document.body.querySelectorAll('video:not([usy-progress-bar])')) {
                reel.setAttribute('usy-progress-bar', '');
                Video.addProgressBar(reel);

                // Bug fixes
                if (Settings.video_start_at_beginning_fix) reel.currentTime = 0;
                if (onReels && Settings.preferences.share_button_bug_fix) Video.fixShareButtonBug(reel);
            }
        },

        ClearAll: () => {
            for (const reel of document.body.querySelectorAll('video[usy-progress-bar]')) {
                reel.parentElement.querySelector('div.usy-progress-bar-container')?.remove();
                reel.removeAttribute('usy-progress-bar');
            }
        }
    };

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
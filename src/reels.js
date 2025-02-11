'use strict';

(() => {
    const Settings = {
        preferences: {
            show_bar: true,
            show_progress: true,
            restart_video_on_view: false
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

    const Video = {
        addProgressBar: (reel) => {
            if (Settings.restart_video_on_view) reel.currentTime = 0;

            let holding = false;
            let duration = reel.duration || 1, currentTime = 0;
            const updaters = [], update = () => {
                for (const u of updaters) u();
            }

            const barBoxContainer = document.createElement('div');
            barBoxContainer.classList.add('usy-progress-bar-container');

            const bar = document.createElement('div');
            bar.classList.add('usy-progress-bar');
            if (!Settings.preferences.show_bar) bar.classList.add('usy-progress-bar-hidden');
            if (!Settings.preferences.show_progress) barBoxContainer.classList.add('no-progress');
            barBoxContainer.appendChild(bar);
            updaters.push(() => bar.style.width = `${(currentTime / duration) * 100}%`);

            reel.after(barBoxContainer);

            const updateTime = () => currentTime = reel.currentTime;
            reel.addEventListener('timeupdate', updateTime);

            const updateTimeDisplay = () => {
                barBoxContainer.style.setProperty('--time', `"${formatTime(currentTime)}/${formatTime(duration)}"`);
            }

            const smoothBar = () => {
                const remaining = duration - currentTime;
                if (remaining < 0.4) {
                    bar.style.width = '0';
                    bar.offsetHeight; // Reflow
                } else {
                    bar.style.setProperty('--remainingTime', `${remaining}s`);
                    bar.style.width = '100%';
                }
            }

            const init = () => {
                updateTime();
                duration = reel.duration;
                updateTimeDisplay();
                if (!holding && !reel.paused) {
                    bar.style.removeProperty('--remainingTime');
                    update();
                    setTimeout(smoothBar);
                }
            }

            reel.addEventListener('timeupdate', init);
            reel.addEventListener('pause', () => {
                bar.style.removeProperty('--remainingTime');
                setTimeout(update);
            });
            reel.addEventListener('play', init);

            const updateBarFromMouse = (e) => {
                reel.currentTime = Math.max(0, Math.min(((e.clientX - barBoxContainer.getBoundingClientRect().left) / barBoxContainer.offsetWidth) * duration, duration));
                updateTime();
                update();
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

        addProgressBars: () => {
            for (const reel of document.body.querySelectorAll('video:not([usy-progress-bar])')) {
                reel.setAttribute('usy-progress-bar', '');
                Video.addProgressBar(reel);
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
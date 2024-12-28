'use strict';

(async () => {
    const Settings = await getSettings();

    class Video {
        static addProgressBar(reel) {
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
            barBoxContainer.appendChild(bar);
            updaters.push(() => bar.style.width = `${(currentTime / duration) * 100}%`);

            reel.after(barBoxContainer);

            const updateTime = () => currentTime = reel.currentTime;
            reel.addEventListener('timeupdate', updateTime);

            const smoothBar = () => {
                bar.style.setProperty('--remainingTime', `${duration - currentTime}s`);
                bar.style.width = '100%';
            }

            const init = () => {
                updateTime();
                duration = reel.duration;
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
        }

        static addProgressBars() {
            for (const reel of document.body.querySelectorAll('video:not([usy-progress-bar])')) {
                reel.setAttribute('usy-progress-bar', '');
                Video.addProgressBar(reel);
            }
        }

        static ClearAll() {
            for (const reel of document.body.querySelectorAll('video[usy-progress-bar]')) {
                reel.parentElement.querySelector('div.usy-progress-bar-container')?.remove();
                reel.removeAttribute('usy-progress-bar');
            }
        }
    }

    {
        Video.ClearAll();
        let lastUpdate = performance.now(), updateTimer = null;
        const updateFunc = Video.addProgressBars, updateTime = 500;
        const observerSettings = {subtree: true, childList: true};
        const observer = new MutationObserver((_, o) => {
            clearTimeout(updateTimer);
            if (performance.now() - lastUpdate > updateTime) {
                o.disconnect();
                updateFunc();
                o.observe(document.body, observerSettings);
            }
            else updateTimer = setTimeout(updateFunc, updateTime);
            lastUpdate = performance.now();
        });
        observer.observe(document.body, observerSettings);
    }

    chrome.storage.onChanged.addListener(async (_, namespace) => {
        if (namespace === 'local') {
            await Settings.loadSettings();
            Video.ClearAll();
        }
    });

    async function getSettings() { // Setting handling
        class Settings {
            preferences = {
                show_bar: true,
            }

            async loadSettings() {
                const data = await chrome.storage.local.get(), settings = ['preferences'];
                for (const setting of settings) for (const s in this[setting]) this[setting][s] = data[s] ?? this[setting][s];
            }
        }

        const set = new Settings();
        await set.loadSettings();
        return set;
    }
})();
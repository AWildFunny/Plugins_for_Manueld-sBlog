(function () {
    'use strict';

    var REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var SCROLL_PLAY_RATIO = 0.5;
    var RING_LEN = 2 * Math.PI * 46;
    var NOTICE_MS = 5000;
    var LONG_PRESS_MS = 600;

    function getVisibleRatio(el) {
        var rect = el.getBoundingClientRect();
        var viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        if (rect.bottom <= 0 || rect.top >= viewportHeight) {
            return 0;
        }

        var visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
        return visibleHeight / Math.max(rect.height, 1);
    }

    function setRingProgress(progressEl, ratio) {
        if (!progressEl) {
            return;
        }
        var r = Math.max(0, Math.min(1, ratio || 0));
        progressEl.style.strokeDasharray = String(RING_LEN);
        progressEl.style.strokeDashoffset = String(RING_LEN * (1 - r));
    }

    function buildMetingUrl(tpl, server, type, id) {
        return String(tpl || 'https://meting.mikus.ink/api?server=:server&type=:type&id=:id')
            .replace(':server', encodeURIComponent(server))
            .replace(':type', encodeURIComponent(type))
            .replace(':id', encodeURIComponent(id));
    }

    function angleRatioFromEvent(wrapEl, event) {
        var rect = wrapEl.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var clientX = event.clientX;
        var clientY = event.clientY;
        if (event.touches && event.touches[0]) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        }
        var dx = clientX - cx;
        var dy = clientY - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var radius = Math.min(rect.width, rect.height) / 2;
        // only seek when near the ring band
        if (dist < radius * 0.62 || dist > radius * 1.08) {
            return null;
        }
        var angle = Math.atan2(dy, dx); // -PI..PI, 0 at east
        var deg = (angle * 180) / Math.PI;
        // convert so 12 o'clock = 0, clockwise
        var progressDeg = (deg + 90 + 360) % 360;
        return progressDeg / 360;
    }

    function MusicPlayerManager() {
        this.audio = new Audio();
        this.audio.preload = 'metadata';

        this.players = new Map();
        this.scrollObservers = new Map();
        this.currentPlayer = null;
        this.dock = null;
        this.dockDisc = null;
        this.dockCover = null;
        this.dockProgress = null;

        this.noticeEl = null;
        this.noticeTimer = null;
        this.noticeHoldTimer = null;
        this.noticeDismissed = false;

        this.visibilityObserver = null;
        this.isSeeking = false;
        this.audioUnlocked = false;
        this.unlockBound = this.unlockAudio.bind(this);

        this.onTimeUpdate = this.onTimeUpdate.bind(this);
        this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
        this.onEnded = this.onEnded.bind(this);
        this.onPlayEvent = this.onPlayEvent.bind(this);
        this.onPauseEvent = this.onPauseEvent.bind(this);
        this.onVisibilityChange = this.onVisibilityChange.bind(this);
        this.onAudioError = this.onAudioError.bind(this);
        this.onDockClick = this.onDockClick.bind(this);

        this.audio.addEventListener('timeupdate', this.onTimeUpdate);
        this.audio.addEventListener('loadedmetadata', this.onLoadedMetadata);
        this.audio.addEventListener('ended', this.onEnded);
        this.audio.addEventListener('play', this.onPlayEvent);
        this.audio.addEventListener('pause', this.onPauseEvent);
        this.audio.addEventListener('error', this.onAudioError);

        document.addEventListener('click', this.unlockBound, true);
        document.addEventListener('touchstart', this.unlockBound, { capture: true, passive: true });
        document.addEventListener('keydown', this.unlockBound, true);

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', this.init.bind(this));
        } else {
            this.init();
        }

        if (typeof jQuery !== 'undefined') {
            jQuery(document).on('pjax:send', this.teardown.bind(this));
            jQuery(document).on('pjax:complete', this.init.bind(this));
        }
    }

    MusicPlayerManager.prototype.unlockAudio = function () {
        if (this.audioUnlocked) {
            return;
        }
        this.audioUnlocked = true;
        this.evaluateScrollPlayers();
    };

    MusicPlayerManager.prototype.init = function () {
        var nodes = document.querySelectorAll('.music-player:not([data-mp-init])');
        for (var i = 0; i < nodes.length; i++) {
            this.registerPlayer(nodes[i]);
        }
        this.ensureDock();
        if (this.currentPlayer) {
            this.observeCurrentPlayer();
        }
        this.evaluateScrollPlayers();
        this.maybeShowNotice();
    };

    MusicPlayerManager.prototype.teardown = function () {
        this.pauseAndReset();
        this.disconnectObservers();
        this.hideDock();
        this.destroyNotice();

        this.players.forEach(function (state) {
            delete state.el.dataset.mpInit;
        });
        this.players.clear();
        this.currentPlayer = null;
        this.noticeDismissed = false;

        if (this.dock && this.dock.parentNode) {
            this.dock.parentNode.removeChild(this.dock);
        }
        this.dock = null;
        this.dockDisc = null;
        this.dockCover = null;
        this.dockProgress = null;
        this.audioUnlocked = false;
    };

    MusicPlayerManager.prototype.registerPlayer = function (el) {
        if (!el || el.dataset.mpInit) {
            return;
        }

        var id = el.dataset.mpId || el.id;
        var toggle = el.querySelector('.music-player-disc-btn');
        var disc = el.querySelector('.music-player-disc');
        var progress = el.querySelector('.music-player-ring-progress');
        var wrap = el.querySelector('.music-player-vinyl-wrap');

        if (!toggle || !disc || !wrap) {
            return;
        }

        el.dataset.mpInit = '1';
        setRingProgress(progress, 0);

        var state = {
            el: el,
            toggle: toggle,
            disc: disc,
            wrap: wrap,
            progress: progress,
            mode: el.dataset.mode || 'click',
            notice: el.dataset.notice === '1',
            userPaused: false,
            seekPointerId: null
        };

        this.players.set(id, state);

        toggle.addEventListener('click', this.handleToggleClick.bind(this, state));
        this.bindRingSeek(state);

        if (state.mode === 'scroll') {
            this.attachScrollObserver(state);
        }

        this.hydratePlatformMeta(state);
    };

    MusicPlayerManager.prototype.hydratePlatformMeta = function (state) {
        var el = state.el;
        var server = el.dataset.mpServer || '';
        var songId = el.dataset.mpSong || '';
        if (!server || !songId) {
            return;
        }

        var title = (el.dataset.title || '').trim();
        var artistNode = el.querySelector('.music-player-artist');
        var hasArtist = !!(artistNode && artistNode.textContent.trim());
        var hasCover = !!(el.dataset.cover || '').trim();
        var needsTitle = !title || title === '未命名曲目';
        if (!needsTitle && hasArtist && hasCover) {
            return;
        }

        var url = buildMetingUrl(el.dataset.mpApi, server, 'song', songId);
        var self = this;
        fetch(url, { credentials: 'omit' }).then(function (res) {
            if (!res.ok) {
                throw new Error('meting');
            }
            return res.json();
        }).then(function (data) {
            var item = Array.isArray(data) ? data[0] : data;
            if (!item) {
                return;
            }
            var nextTitle = item.title || item.name || '';
            var nextArtist = item.author || item.artist || '';
            if (Array.isArray(nextArtist)) {
                nextArtist = nextArtist.join(' / ');
            }
            var nextCover = item.pic || item.cover || '';
            if (needsTitle && nextTitle) {
                el.dataset.title = nextTitle;
                var titleNode = el.querySelector('.music-player-title');
                if (titleNode) {
                    titleNode.textContent = nextTitle;
                }
                state.toggle.setAttribute('aria-label', '播放 ' + nextTitle);
            }
            if (!hasArtist && nextArtist) {
                if (artistNode) {
                    artistNode.textContent = nextArtist;
                } else {
                    var caption = el.querySelector('.music-player-meta');
                    var titleEl = el.querySelector('.music-player-title');
                    artistNode = document.createElement('p');
                    artistNode.className = 'music-player-artist';
                    artistNode.textContent = nextArtist;
                    if (caption && titleEl && titleEl.nextSibling) {
                        caption.insertBefore(artistNode, titleEl.nextSibling);
                    } else if (caption && titleEl) {
                        titleEl.insertAdjacentElement('afterend', artistNode);
                    }
                }
            }
            if (!hasCover && nextCover) {
                el.dataset.cover = nextCover;
                var disc = el.querySelector('.music-player-disc');
                var coverEl = disc ? disc.querySelector('.music-player-cover') : null;
                var label = el.dataset.title || nextTitle || '';
                if (coverEl && coverEl.tagName === 'IMG') {
                    coverEl.src = nextCover;
                    coverEl.alt = label;
                    coverEl.classList.remove('music-player-cover--placeholder');
                } else if (disc) {
                    var img = document.createElement('img');
                    img.className = 'music-player-cover';
                    img.src = nextCover;
                    img.alt = label;
                    img.loading = 'lazy';
                    if (coverEl) {
                        disc.replaceChild(img, coverEl);
                    } else {
                        disc.insertBefore(img, disc.firstChild);
                    }
                }
            }
            if (self.currentPlayer === state) {
                self.updateDockContent(state);
            }
        }).catch(function () {
            // keep placeholder
        });
    };

    MusicPlayerManager.prototype.bindRingSeek = function (state) {
        var self = this;
        var wrap = state.wrap;

        var onMove = function (event) {
            if (!self.isSeeking || self.currentPlayer !== state) {
                return;
            }
            if (event.cancelable) {
                event.preventDefault();
            }
            var ratio = angleRatioFromEvent(wrap, event);
            if (ratio === null || !self.audio.duration) {
                return;
            }
            self.audio.currentTime = ratio * self.audio.duration;
            self.updateProgressUI(state, ratio);
        };

        var onUp = function () {
            if (!self.isSeeking) {
                return;
            }
            self.isSeeking = false;
            wrap.classList.remove('is-seeking');
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);
        };

        var onDown = function (event) {
            var ratio = angleRatioFromEvent(wrap, event);
            if (ratio === null) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            self.audioUnlocked = true;

            if (self.currentPlayer !== state) {
                state.userPaused = false;
                self.play(state);
            }

            if (!self.audio.duration) {
                return;
            }

            self.isSeeking = true;
            wrap.classList.add('is-seeking');
            self.audio.currentTime = ratio * self.audio.duration;
            self.updateProgressUI(state, ratio);

            document.addEventListener('pointermove', onMove, { passive: false });
            document.addEventListener('pointerup', onUp);
            document.addEventListener('pointercancel', onUp);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onUp);
        };

        wrap.addEventListener('pointerdown', onDown);
        wrap.addEventListener('touchstart', onDown, { passive: false });
    };

    MusicPlayerManager.prototype.attachScrollObserver = function (state) {
        var id = state.el.dataset.mpId || state.el.id;
        if (this.scrollObservers.has(id)) {
            return;
        }

        var self = this;
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.target === state.el) {
                    self.onScrollModeChange(state, entry);
                }
            });
        }, {
            root: null,
            threshold: [0, 0.1, 0.25, 0.5, 0.75, 1]
        });

        observer.observe(state.el);
        this.scrollObservers.set(id, observer);
    };

    MusicPlayerManager.prototype.evaluateScrollPlayers = function () {
        var self = this;
        var bestState = null;
        var bestRatio = 0;

        this.players.forEach(function (state) {
            if (state.mode !== 'scroll' || state.userPaused) {
                return;
            }

            var ratio = getVisibleRatio(state.el);
            if (ratio >= SCROLL_PLAY_RATIO && ratio > bestRatio) {
                bestRatio = ratio;
                bestState = state;
            }
        });

        if (!bestState) {
            return;
        }

        if (this.currentPlayer !== bestState || this.audio.paused) {
            this.play(bestState, { fromScroll: true });
        }
    };

    MusicPlayerManager.prototype.ensureDock = function () {
        if (this.dock) {
            return;
        }

        var dock = document.createElement('button');
        dock.type = 'button';
        dock.className = 'music-player-dock';
        dock.setAttribute('aria-label', '返回正在播放的音乐');
        dock.hidden = true;

        var ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        ring.setAttribute('class', 'music-player-dock-ring');
        ring.setAttribute('viewBox', '0 0 100 100');
        ring.setAttribute('aria-hidden', 'true');

        var track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        track.setAttribute('class', 'music-player-dock-ring-track');
        track.setAttribute('cx', '50');
        track.setAttribute('cy', '50');
        track.setAttribute('r', '46');
        track.setAttribute('fill', 'none');

        var progress = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        progress.setAttribute('class', 'music-player-dock-ring-progress');
        progress.setAttribute('cx', '50');
        progress.setAttribute('cy', '50');
        progress.setAttribute('r', '46');
        progress.setAttribute('fill', 'none');
        setRingProgress(progress, 0);

        ring.appendChild(track);
        ring.appendChild(progress);

        var disc = document.createElement('div');
        disc.className = 'music-player-dock-disc';

        var cover = document.createElement('img');
        cover.className = 'music-player-dock-cover';
        cover.alt = '';
        cover.setAttribute('aria-hidden', 'true');

        var hole = document.createElement('span');
        hole.className = 'music-player-dock-hole';
        hole.setAttribute('aria-hidden', 'true');

        disc.appendChild(cover);
        disc.appendChild(hole);
        dock.appendChild(ring);
        dock.appendChild(disc);
        document.body.appendChild(dock);

        dock.addEventListener('click', this.onDockClick);

        this.dock = dock;
        this.dockDisc = disc;
        this.dockCover = cover;
        this.dockProgress = progress;
    };

    MusicPlayerManager.prototype.handleToggleClick = function (state, event) {
        // ignore synthetic clicks that follow a ring seek
        if (this.isSeeking) {
            return;
        }
        if (event && angleRatioFromEvent(state.wrap, event) !== null) {
            return;
        }

        this.audioUnlocked = true;
        if (this.currentPlayer === state && !this.audio.paused) {
            state.userPaused = true;
            this.audio.pause();
            return;
        }
        state.userPaused = false;
        this.play(state);
    };

    MusicPlayerManager.prototype.updateProgressUI = function (state, ratio) {
        setRingProgress(state.progress, ratio);
        if (this.currentPlayer === state) {
            setRingProgress(this.dockProgress, ratio);
        }
    };

    MusicPlayerManager.prototype.play = function (state, options) {
        var self = this;
        options = options || {};

        if (this.currentPlayer && this.currentPlayer !== state) {
            this.setPlayerPlaying(this.currentPlayer, false);
            setRingProgress(this.currentPlayer.progress, 0);
        }

        this.currentPlayer = state;
        var src = state.el.dataset.src;

        if (!src) {
            return;
        }

        if (this.audio.getAttribute('src') !== src) {
            this.audio.src = src;
        }

        this.observeCurrentPlayer();
        this.updateDockContent(state);
        state.el.classList.remove('is-autoplay-blocked');
        state.el.classList.remove('is-load-error');

        this.audio.play().then(function () {
            self.audioUnlocked = true;
            self.setPlayerPlaying(state, true);
            self.updateDockVisibility();
        }).catch(function () {
            self.setPlayerPlaying(state, false);
            if (options.fromScroll && !self.audioUnlocked) {
                state.el.classList.add('is-autoplay-blocked');
            }
        });
    };

    MusicPlayerManager.prototype.pauseAndReset = function () {
        this.audio.pause();
        if (this.currentPlayer) {
            this.setPlayerPlaying(this.currentPlayer, false);
        }
    };

    MusicPlayerManager.prototype.setPlayerPlaying = function (state, playing) {
        if (!state) {
            return;
        }
        state.el.classList.toggle('is-playing', playing);

        // Keep animation attached so pause preserves rotation angle
        if (!REDUCED_MOTION) {
            state.disc.classList.add('is-spinning');
            state.disc.classList.toggle('is-paused', !playing);
        } else {
            state.disc.classList.remove('is-spinning', 'is-paused');
        }

        if (this.dockDisc) {
            if (!REDUCED_MOTION && this.shouldShowDock()) {
                this.dockDisc.classList.add('is-spinning');
                this.dockDisc.classList.toggle('is-paused', !playing);
            } else if (!playing) {
                this.dockDisc.classList.add('is-paused');
            }
        }

        if (state.toggle) {
            state.toggle.setAttribute('aria-label', (playing ? '暂停 ' : '播放 ') + (state.el.dataset.title || ''));
        }
    };

    MusicPlayerManager.prototype.onTimeUpdate = function () {
        if (!this.currentPlayer || this.isSeeking) {
            return;
        }
        var state = this.currentPlayer;
        var duration = this.audio.duration;
        var current = this.audio.currentTime;
        if (!duration) {
            return;
        }
        this.updateProgressUI(state, current / duration);
    };

    MusicPlayerManager.prototype.onLoadedMetadata = function () {
        if (!this.currentPlayer) {
            return;
        }
        var duration = this.audio.duration;
        var current = this.audio.currentTime || 0;
        this.updateProgressUI(this.currentPlayer, duration ? current / duration : 0);
    };

    MusicPlayerManager.prototype.onEnded = function () {
        if (this.currentPlayer) {
            this.setPlayerPlaying(this.currentPlayer, false);
            // Reset spin angle only when track ends
            this.currentPlayer.disc.classList.remove('is-spinning', 'is-paused');
            setRingProgress(this.currentPlayer.progress, 0);
        }
        if (this.dockDisc) {
            this.dockDisc.classList.remove('is-spinning', 'is-paused');
        }
        setRingProgress(this.dockProgress, 0);
        this.hideDock();
    };

    MusicPlayerManager.prototype.onPlayEvent = function () {
        if (this.currentPlayer) {
            this.setPlayerPlaying(this.currentPlayer, true);
            this.currentPlayer.el.classList.remove('is-autoplay-blocked');
        }
        this.updateDockVisibility();
    };

    MusicPlayerManager.prototype.onPauseEvent = function () {
        if (this.currentPlayer) {
            this.setPlayerPlaying(this.currentPlayer, false);
        }
        this.hideDock();
    };

    MusicPlayerManager.prototype.onAudioError = function () {
        if (!this.currentPlayer) {
            return;
        }
        this.currentPlayer.el.classList.add('is-load-error');
        this.setPlayerPlaying(this.currentPlayer, false);
    };

    MusicPlayerManager.prototype.disconnectObservers = function () {
        if (this.visibilityObserver) {
            this.visibilityObserver.disconnect();
            this.visibilityObserver = null;
        }

        this.scrollObservers.forEach(function (observer) {
            observer.disconnect();
        });
        this.scrollObservers.clear();
    };

    MusicPlayerManager.prototype.observeCurrentPlayer = function () {
        if (this.visibilityObserver) {
            this.visibilityObserver.disconnect();
            this.visibilityObserver = null;
        }

        if (!this.currentPlayer) {
            return;
        }

        var el = this.currentPlayer.el;
        var self = this;

        this.visibilityObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.target === el) {
                    self.onVisibilityChange(entry);
                }
            });
        }, {
            root: null,
            threshold: [0, 0.01, 0.25, 0.5, 1]
        });
        this.visibilityObserver.observe(el);
    };

    MusicPlayerManager.prototype.onVisibilityChange = function (entry) {
        this.updateDockVisibility(entry);
    };

    MusicPlayerManager.prototype.shouldShowDock = function (entry) {
        if (!this.currentPlayer || this.audio.paused) {
            return false;
        }

        var rect = entry ? entry.boundingClientRect : this.currentPlayer.el.getBoundingClientRect();
        var viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        if (rect.top > viewportHeight) {
            return false;
        }

        return rect.bottom < 0;
    };

    MusicPlayerManager.prototype.updateDockVisibility = function (entry) {
        if (this.shouldShowDock(entry)) {
            this.showDock();
        } else {
            this.hideDock();
        }
    };

    MusicPlayerManager.prototype.onScrollModeChange = function (state, entry) {
        if (state.mode !== 'scroll') {
            return;
        }

        var visibleEnough = entry.isIntersecting && entry.intersectionRatio >= SCROLL_PLAY_RATIO;

        if (visibleEnough) {
            if (state.userPaused) {
                return;
            }
            if (this.currentPlayer !== state || this.audio.paused) {
                this.play(state, { fromScroll: true });
            }
            return;
        }

        if (entry.intersectionRatio <= 0.1 && this.currentPlayer === state && !this.audio.paused) {
            this.audio.pause();
        }
    };

    MusicPlayerManager.prototype.updateDockContent = function (state) {
        this.ensureDock();
        if (!this.dockCover) {
            return;
        }

        var cover = state.el.dataset.cover || '';
        var title = state.el.dataset.title || '';

        if (cover) {
            this.dockCover.src = cover;
            this.dockCover.classList.remove('music-player-dock-cover--placeholder');
            this.dockCover.style.display = '';
        } else {
            this.dockCover.removeAttribute('src');
            this.dockCover.classList.add('music-player-dock-cover--placeholder');
        }

        this.dock.setAttribute('aria-label', '返回正在播放：' + title);
    };

    MusicPlayerManager.prototype.showDock = function () {
        this.ensureDock();
        if (!this.dock) {
            return;
        }

        // avoid overlapping notice
        if (this.noticeEl && this.noticeEl.classList.contains('is-visible')) {
            return;
        }

        this.dock.hidden = false;
        this.dock.classList.add('is-visible');
        if (this.dockDisc && this.currentPlayer && !REDUCED_MOTION) {
            this.dockDisc.classList.add('is-spinning');
            this.dockDisc.classList.toggle('is-paused', this.audio.paused);
        }
    };

    MusicPlayerManager.prototype.hideDock = function () {
        if (!this.dock) {
            return;
        }

        this.dock.classList.remove('is-visible');
        this.dock.hidden = true;
        if (this.dockDisc) {
            this.dockDisc.classList.add('is-paused');
        }
    };

    MusicPlayerManager.prototype.onDockClick = function () {
        if (!this.currentPlayer) {
            return;
        }

        var el = this.currentPlayer.el;
        el.scrollIntoView({
            behavior: REDUCED_MOTION ? 'auto' : 'smooth',
            block: 'center'
        });
        this.hideDock();
    };

    /* ---- Entry notice ---- */

    MusicPlayerManager.prototype.findNoticePlayer = function () {
        var found = null;
        this.players.forEach(function (state) {
            if (!found && state.notice) {
                found = state;
            }
        });
        return found;
    };

    MusicPlayerManager.prototype.maybeShowNotice = function () {
        if (this.noticeDismissed) {
            return;
        }
        var state = this.findNoticePlayer();
        if (!state) {
            return;
        }
        this.showNotice(state);
    };

    MusicPlayerManager.prototype.showNotice = function (state) {
        var self = this;
        this.destroyNotice(false);

        var el = document.createElement('div');
        el.className = 'music-player-notice';
        el.setAttribute('role', 'status');

        var title = state.el.dataset.title || '背景音频';
        el.innerHTML =
            '<div class="music-player-notice-header">' +
            '<p class="music-player-notice-title">本页含BGM~请注意音量</p>' +
            '<button type="button" class="music-player-notice-close" aria-label="关闭">&times;</button>' +
            '</div>' +
            '<p class="music-player-notice-desc">点击跳转播放 长按取消</p>' +
            '<div class="music-player-notice-bar"><div class="music-player-notice-bar-inner"></div></div>';

        document.body.appendChild(el);
        this.noticeEl = el;
        this.noticeTarget = state;

        requestAnimationFrame(function () {
            el.classList.add('is-visible');
        });

        var closeBtn = el.querySelector('.music-player-notice-close');
        closeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.dismissNotice();
        });

        var holdStart = null;
        var holdFired = false;

        var clearHold = function () {
            if (self.noticeHoldTimer) {
                clearTimeout(self.noticeHoldTimer);
                self.noticeHoldTimer = null;
            }
            el.classList.remove('is-holding');
            holdStart = null;
        };

        var startHold = function (e) {
            if (e.target.closest('.music-player-notice-close')) {
                return;
            }
            holdFired = false;
            holdStart = Date.now();
            el.classList.add('is-holding');
            self.noticeHoldTimer = setTimeout(function () {
                holdFired = true;
                self.dismissNotice();
            }, LONG_PRESS_MS);
        };

        var endHold = function (e) {
            if (holdFired) {
                clearHold();
                return;
            }
            var held = holdStart ? Date.now() - holdStart : 0;
            clearHold();
            if (held >= LONG_PRESS_MS) {
                return;
            }
            if (e.target.closest('.music-player-notice-close')) {
                return;
            }
            self.activateNotice();
        };

        el.addEventListener('pointerdown', startHold);
        el.addEventListener('pointerup', endHold);
        el.addEventListener('pointerleave', clearHold);
        el.addEventListener('pointercancel', clearHold);
        el.addEventListener('touchstart', startHold, { passive: true });
        el.addEventListener('touchend', endHold);
        el.addEventListener('touchcancel', clearHold);

        this.noticeTimer = setTimeout(function () {
            self.dismissNotice(false);
        }, NOTICE_MS);
    };

    MusicPlayerManager.prototype.activateNotice = function () {
        var state = this.noticeTarget;
        this.dismissNotice(false);
        if (!state) {
            return;
        }
        this.audioUnlocked = true;
        state.userPaused = false;
        state.el.scrollIntoView({
            behavior: REDUCED_MOTION ? 'auto' : 'smooth',
            block: 'center'
        });
        this.play(state);
    };

    MusicPlayerManager.prototype.dismissNotice = function (permanent) {
        if (permanent !== false) {
            this.noticeDismissed = true;
        }
        this.destroyNotice(true);
    };

    MusicPlayerManager.prototype.destroyNotice = function (animate) {
        var self = this;
        if (this.noticeTimer) {
            clearTimeout(this.noticeTimer);
            this.noticeTimer = null;
        }
        if (this.noticeHoldTimer) {
            clearTimeout(this.noticeHoldTimer);
            this.noticeHoldTimer = null;
        }
        var el = this.noticeEl;
        this.noticeEl = null;
        this.noticeTarget = null;
        if (!el) {
            return;
        }
        el.classList.remove('is-visible');
        if (animate) {
            setTimeout(function () {
                if (el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            }, 280);
        } else if (el.parentNode) {
            el.parentNode.removeChild(el);
        }
    };

    window.MusicPlayerManager = new MusicPlayerManager();
})();

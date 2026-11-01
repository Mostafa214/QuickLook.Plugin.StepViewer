/**
 * Autonomous In-App Auto-Updater & Version Checker (v1.0.1 -> vX.Y.Z)
 * Future-Proof & Backward-Forward Compatible
 */
(function () {
  const APP_CURRENT_VERSION = '2.0.0';

  const AutoUpdater = {
    repo: 'Mostafa214/QuickLook.Plugin.StepViewer',
    currentVersion: APP_CURRENT_VERSION,
    checkIntervalMs: 12 * 60 * 60 * 1000, // 12 hours rate-limit guard
    latestRelease: null,
    updateState: 'idle', // 'idle' | 'available' | 'downloading' | 'completed' | 'restarting'
    highlightsVisible: false,

    isNewer(remoteVer, currentVer) {
      if (!remoteVer || !currentVer) return false;
      const clean = (v) => String(v).replace(/^[^\d]*/, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
      const r = clean(remoteVer);
      const c = clean(currentVer);
      const maxLen = Math.max(r.length, c.length);
      for (let i = 0; i < maxLen; i++) {
        const rPart = r[i] || 0;
        const cPart = c[i] || 0;
        if (rPart > cPart) return true;
        if (rPart < cPart) return false;
      }
      return false;
    },

    extractHighlights(release) {
      if (!release) return 'Performance improvements, multi-CAD support & bug fixes.';
      const body = release.body || '';

      const commentMatch = body.match(/<!--\s*(?:highlights?|summary)\s*:\s*([^\r\n>]+)-->/i);
      if (commentMatch && commentMatch[1].trim()) return commentMatch[1].trim();

      const lines = body.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        const m = line.match(/^(?:[\*_\-`#\s]*)(?:Highlights?|What'?s\s*New|Summary|Key\s*Features?)\s*:\s*([^\r\n]+)/i);
        if (m && m[1].trim()) {
          return m[1].replace(/[\*_`]+$/, '').trim();
        }
      }

      if (release.name && release.name.trim() && release.name.trim() !== release.tag_name) {
        return release.name.trim();
      }

      for (const rawLine of lines) {
        const line = rawLine.replace(/^[#\*\-\s>]+/, '').trim();
        if (line.length > 5 && !line.startsWith('![')) {
          return line;
        }
      }

      return 'Performance improvements, multi-CAD support & bug fixes.';
    },

    async checkForUpdates(force = false) {
      if (this.updateState === 'downloading' || this.updateState === 'restarting') return;
      const now = Date.now();
      const lastCheck = parseInt(localStorage.getItem('cad_last_update_check') || '0', 10);

      if (!force && (now - lastCheck < this.checkIntervalMs)) {
        const cached = localStorage.getItem('cad_cached_release_info');
        if (cached) {
          try {
            const release = JSON.parse(cached);
            if (this.isNewer(release.tag_name, this.currentVersion)) {
              this.latestRelease = release;
              this.showUpdateWidget(release);
            }
          } catch (e) {}
        }
        return;
      }

      if (force && typeof window.showToast === 'function') {
        window.showToast('Checking for updates on GitHub...');
      }

      try {
        const resp = await fetch(`https://api.github.com/repos/${this.repo}/releases/latest`, {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        if (!resp.ok) {
          if (force && typeof window.showToast === 'function') {
            window.showToast('Unable to connect to GitHub server.');
          }
          return;
        }

        const release = await resp.json();
        localStorage.setItem('cad_last_update_check', String(now));
        localStorage.setItem('cad_cached_release_info', JSON.stringify(release));

        if (this.isNewer(release.tag_name, this.currentVersion)) {
          this.latestRelease = release;
          this.showUpdateWidget(release);
          if (force && typeof window.showToast === 'function') {
            window.showToast(`New version ${release.tag_name} is available!`);
          }
        } else {
          if (force && typeof window.showToast === 'function') {
            window.showToast(`StepViewer is up to date (${this.currentVersion}).`);
          }
        }
      } catch (err) {
        console.warn('AutoUpdate check failed:', err);
        if (force && typeof window.showToast === 'function') {
          window.showToast('Error checking for updates.');
        }
      }
    },

    showUpdateWidget(release) {
      const widget = document.getElementById('update-compact-container');
      if (!widget) return;

      this.updateState = 'available';
      const btnText = document.getElementById('btn-update-text');
      if (btnText) btnText.innerText = `Update to ${release.tag_name || 'latest'}`;

      const highlightsText = document.getElementById('update-highlights-text');
      if (highlightsText) {
        highlightsText.innerText = this.extractHighlights(release);
      }

      widget.style.display = 'flex';
    },

    toggleHighlights() {
      const drawer = document.getElementById('update-highlights-drawer');
      const infoBtn = document.getElementById('btn-update-info');
      if (!drawer) return;
      this.highlightsVisible = !this.highlightsVisible;
      drawer.style.display = this.highlightsVisible ? 'flex' : 'none';
      if (infoBtn) {
        infoBtn.classList.toggle('active', this.highlightsVisible);
      }
    },

    dismiss() {
      const widget = document.getElementById('update-compact-container');
      if (widget) widget.style.display = 'none';
      const drawer = document.getElementById('update-highlights-drawer');
      if (drawer) drawer.style.display = 'none';
      this.highlightsVisible = false;
    },

    handleButtonClick() {
      if (this.updateState === 'available') {
        this.startDownload();
      } else if (this.updateState === 'completed') {
        this.applyRestart();
      }
    },

    startDownload() {
      if (!this.latestRelease) return;
      this.updateState = 'downloading';

      let downloadUrl = null;
      if (this.latestRelease.assets && this.latestRelease.assets.length > 0) {
        const qlAsset = this.latestRelease.assets.find(a => a.name && a.name.toLowerCase().endsWith('.qlplugin'));
        if (qlAsset) downloadUrl = qlAsset.browser_download_url;
      }
      if (!downloadUrl && this.latestRelease.html_url) {
        downloadUrl = this.latestRelease.html_url;
      }

      const btn = document.getElementById('btn-update-action');
      const btnText = document.getElementById('btn-update-text');
      const pFill = document.getElementById('btn-update-progress-fill');

      if (btn) {
        btn.classList.add('is-downloading');
        btn.style.cursor = 'wait';
      }
      if (pFill) pFill.style.width = '0%';
      if (btnText) btnText.innerText = 'Downloading 0%';

      const notify = window.notifyHost || function (o) {
        if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(o);
      };
      notify({
        action: 'START_UPDATE_DOWNLOAD',
        downloadUrl: downloadUrl,
        version: this.latestRelease.tag_name
      });
    },

    applyRestart() {
      this.updateState = 'restarting';
      const btn = document.getElementById('btn-update-action');
      const btnText = document.getElementById('btn-update-text');
      if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.9';
        btn.style.cursor = 'wait';
      }
      if (btnText) {
        btnText.innerHTML = '<span class="spinner" style="display:inline-block;width:11px;height:11px;margin-inline-end:5px;"></span> Restarting...';
      }

      const notify = window.notifyHost || function (o) {
        if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(o);
      };
      notify({
        action: 'APPLY_UPDATE_AND_RESTART'
      });
    },

    setupUI() {
      document.getElementById('btn-update-action')?.addEventListener('click', () => this.handleButtonClick());
      document.getElementById('btn-update-info')?.addEventListener('click', () => this.toggleHighlights());
      document.getElementById('btn-update-dismiss')?.addEventListener('click', () => this.dismiss());
      document.getElementById('btn-check-update')?.addEventListener('click', () => this.checkForUpdates(true));
    }
  };

  window.AutoUpdater = AutoUpdater;

  window.onUpdateDownloadProgress = function (percent, receivedBytes, totalBytes) {
    const pFill = document.getElementById('btn-update-progress-fill');
    const btnText = document.getElementById('btn-update-text');
    if (pFill) pFill.style.width = percent + '%';
    if (btnText) {
      if (totalBytes && totalBytes > 0) {
        const recMb = (receivedBytes / (1024 * 1024)).toFixed(1);
        const totMb = (totalBytes / (1024 * 1024)).toFixed(1);
        btnText.innerText = `Downloading ${percent}% (${recMb}/${totMb} MB)`;
      } else {
        btnText.innerText = `Downloading ${percent}%`;
      }
    }
  };

  window.onUpdateDownloadCompleted = function () {
    AutoUpdater.updateState = 'completed';
    const btn = document.getElementById('btn-update-action');
    const btnText = document.getElementById('btn-update-text');
    const pFill = document.getElementById('btn-update-progress-fill');

    if (pFill) pFill.style.width = '100%';
    if (btn) {
      btn.classList.remove('is-downloading');
      btn.classList.add('is-completed');
      btn.style.cursor = 'pointer';
    }
    if (btnText) {
      btnText.innerHTML = `
        <svg class="lucide" width="13" height="13" viewBox="0 0 24 24">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
        </svg>
        <span>Restart QuickLook</span>
      `;
    }
    if (typeof window.showToast === 'function') {
      window.showToast('Download complete. Click Restart QuickLook to apply.');
    }
  };

  window.onUpdateError = function (errorMsg) {
    AutoUpdater.updateState = 'available';
    const btn = document.getElementById('btn-update-action');
    const btnText = document.getElementById('btn-update-text');
    const pFill = document.getElementById('btn-update-progress-fill');
    if (btn) {
      btn.classList.remove('is-downloading');
      btn.style.cursor = 'pointer';
    }
    if (pFill) pFill.style.width = '0%';
    if (btnText) btnText.innerText = 'Retry Update';
    if (typeof window.showToast === 'function') {
      window.showToast('Update failed: ' + errorMsg);
    }
  };
})();

/**
 * Engineering Snapshot & High-DPI CAD Export Engine
 * Generates supersampled CAD screenshots with ISO/IEC 18004 QR Title Blocks and C# host IPC integration.
 */
(function () {
  let isSnapshotActive = false;
  let snapExportMode = 'transparent'; // 'transparent' | 'white' | 'dark'
  let snapExportScale = 2; // 1 | 2 | 4
  let snapTitleBlockMode = 'full'; // 'full' | 'badge' | 'none'
  let snapExportIncludeQR = true;
  let snapExportIncludeMat = true;
  let snapExportIncludeShadow = true;
  let snapExportIncludeDims = true;

  // Kazuhiko Arase QR Code Generator (ISO/IEC 18004 Reference Engine)
  var qrcode=function(){function i(t,r){function a(t,r){g=function(t){for(var r=new Array(t),e=0;e<t;e+=1){r[e]=new Array(t);for(var n=0;n<t;n+=1)r[e][n]=null}return r}(l=4*u+17),e(0,0),e(l-7,0),e(0,l-7),i(),o(),v(t,r),7<=u&&h(t),null==n&&(n=w(u,f,c)),d(n,r)}var u=t,f=y[r],g=null,l=0,n=null,c=[],s={},e=function(t,r){for(var e=-1;e<=7;e+=1)if(!(t+e<=-1||l<=t+e))for(var n=-1;n<=7;n+=1)r+n<=-1||l<=r+n||(g[t+e][r+n]=0<=e&&e<=6&&(0==n||6==n)||0<=n&&n<=6&&(0==e||6==e)||2<=e&&e<=4&&2<=n&&n<=4)},o=function(){for(var t=8;t<l-8;t+=1)null==g[t][6]&&(g[t][6]=t%2==0);for(var r=8;r<l-8;r+=1)null==g[6][r]&&(g[6][r]=r%2==0)},i=function(){for(var t=B.getPatternPosition(u),r=0;r<t.length;r+=1)for(var e=0;e<t.length;e+=1){var n=t[r],o=t[e];if(null==g[n][o])for(var i=-2;i<=2;i+=1)for(var a=-2;a<=2;a+=1)g[n+i][o+a]=-2==i||2==i||-2==a||2==a||0==i&&0==a}},h=function(t){for(var r=B.getBCHTypeNumber(u),e=0;e<18;e+=1){var n=!t&&1==(r>>e&1);g[Math.floor(e/3)][e%3+l-8-3]=n}for(e=0;e<18;e+=1){n=!t&&1==(r>>e&1);g[e%3+l-8-3][Math.floor(e/3)]=n}},v=function(t,r){for(var e=f<<3|r,n=B.getBCHTypeInfo(e),o=0;o<15;o+=1){var i=!t&&1==(n>>o&1);o<6?g[o][8]=i:o<8?g[o+1][8]=i:g[l-15+o][8]=i}for(o=0;o<15;o+=1){i=!t&&1==(n>>o&1);o<8?g[8][l-o-1]=i:o<9?g[8][15-o-1+1]=i:g[8][15-o-1]=i}g[l-8][8]=!t},d=function(t,r){for(var e=-1,n=l-1,o=7,i=0,a=B.getMaskFunction(r),u=l-1;0<u;u-=2)for(6==u&&(u-=1);;){for(var f=0;f<2;f+=1)if(null==g[n][u-f]){var c=!1;i<t.length&&(c=1==(t[i]>>>o&1)),a(n,u-f)&&(c=!c),g[n][u-f]=c,-1==(o-=1)&&(i+=1,o=7)}if((n+=e)<0||l<=n){n-=e,e=-e;break}}},w=function(t,r,e){for(var n=b.getRSBlocks(t,r),o=M(),i=0;i<e.length;i+=1){var a=e[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var u=0;for(i=0;i<n.length;i+=1)u+=n[i].dataCount;if(o.getLengthInBits()>8*u)throw"code length overflow. ("+o.getLengthInBits()+">"+8*u+")";for(o.getLengthInBits()+4<=8*u&&o.put(0,4);o.getLengthInBits()%8!=0;)o.putBit(!1);for(;!(o.getLengthInBits()>=8*u||(o.put(236,8),o.getLengthInBits()>=8*u));)o.put(17,8);return function(t,r){for(var e=0,n=0,o=0,i=new Array(r.length),a=new Array(r.length),u=0;u<r.length;u+=1){var f=r[u].dataCount,c=r[u].totalCount-f;n=Math.max(n,f),o=Math.max(o,c),i[u]=new Array(f);for(var g=0;g<i[u].length;g+=1)i[u][g]=255&t.getBuffer()[g+e];e+=f;var l=B.getErrorCorrectPolynomial(c),h=C(i[u],l.getLength()-1).mod(l);a[u]=new Array(l.getLength()-1);for(g=0;g<a[u].length;g+=1){var s=g+h.getLength()-a[u].length;a[u][g]=0<=s?h.getAt(s):0}}var v=0;for(g=0;g<r.length;g+=1)v+=r[g].totalCount;var d=new Array(v),w=0;for(g=0;g<n;g+=1)for(u=0;u<r.length;u+=1)g<i[u].length&&(d[w]=i[u][g],w+=1);for(g=0;g<o;g+=1)for(u=0;u<r.length;u+=1)g<a[u].length&&(d[w]=a[u][g],w+=1);return d}(o,n)};s.addData=function(t,r){var e=null;switch(r=r||"Byte"){case"Numeric":e=x(t);break;case"Alphanumeric":e=m(t);break;case"Byte":e=L(t);break;case"Kanji":e=D(t);break;default:throw"mode:"+r}c.push(e),n=null},s.isDark=function(t,r){if(t<0||l<=t||r<0||l<=r)throw t+","+r;return g[t][r]},s.getModuleCount=function(){return l},s.make=function(){if(u<1){for(var t=1;t<40;t++){for(var r=b.getRSBlocks(t,f),e=M(),n=0;n<c.length;n++){var o=c[n];e.put(o.getMode(),4),e.put(o.getLength(),B.getLengthInBits(o.getMode(),t)),o.write(e)}var i=0;for(n=0;n<r.length;n++)i+=r[n].dataCount;if(e.getLengthInBits()<=8*i)break}u=t}a(!1,function(){for(var t=0,r=0,e=0;e<8;e+=1){a(!0,e);var n=B.getLostPoint(s);(0==e||n<t)&&(t=n,r=e)}return r}())};return s}i.stringToBytes=(i.stringToBytesFuncs={default:function(t){for(var r=[],e=0;e<t.length;e+=1)r.push(255&t.charCodeAt(e));return r}}).default;var r,t,a=1,u=2,o=4,f=8,y={L:1,M:0,Q:3,H:2},e=0,n=1,c=2,g=3,l=4,h=5,s=6,v=7,B=(r=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],(t={}).getBCHTypeInfo=function(t){for(var r=t<<10;0<=d(r)-d(1335);)r^=1335<<d(r)-d(1335);return 21522^(t<<10|r)},t.getBCHTypeNumber=function(t){for(var r=t<<12;0<=d(r)-d(7973);)r^=7973<<d(r)-d(7973);return t<<12|r},t.getPatternPosition=function(t){return r[t-1]},t.getMaskFunction=function(t){switch(t){case e:return function(t,r){return(t+r)%2==0};case n:return function(t,r){return t%2==0};case c:return function(t,r){return r%3==0};case g:return function(t,r){return(t+r)%3==0};case l:return function(t,r){return(Math.floor(t/2)+Math.floor(r/3))%2==0};case h:return function(t,r){return t*r%2+t*r%3==0};case s:return function(t,r){return(t*r%2+t*r%3)%2==0};case v:return function(t,r){return(t*r%3+(t+r)%2)%2==0};default:throw"bad maskPattern:"+t}},t.getErrorCorrectPolynomial=function(t){for(var r=C([1],0),e=0;e<t;e+=1)r=r.multiply(C([1,w.gexp(e)],0));return r},t.getLengthInBits=function(t,r){if(1<=r&&r<10)switch(t){case a:return 10;case u:return 9;case o:case f:return 8;default:throw"mode:"+t}else if(r<27)switch(t){case a:return 12;case u:return 11;case o:return 16;case f:return 10;default:throw"mode:"+t}else{if(!(r<41))throw"type:"+r;switch(t){case a:return 14;case u:return 13;case o:return 16;case f:return 12;default:throw"mode:"+t}}},t.getLostPoint=function(t){for(var r=t.getModuleCount(),e=0,n=0;n<r;n+=1)for(var o=0;o<r;o+=1){for(var i=0,a=t.isDark(n,o),u=-1;u<=1;u+=1)if(!(n+u<0||r<=n+u))for(var f=-1;f<=1;f+=1)o+f<0||r<=o+f||0==u&&0==f||a==t.isDark(n+u,o+f)&&(i+=1);5<i&&(e+=3+i-5)}for(n=0;n<r-1;n+=1)for(o=0;o<r-1;o+=1){var c=0;t.isDark(n,o)&&(c+=1),t.isDark(n+1,o)&&(c+=1),t.isDark(n,o+1)&&(c+=1),t.isDark(n+1,o+1)&&(c+=1),0!=c&&4!=c||(e+=3)}for(n=0;n<r;n+=1)for(o=0;o<r-6;o+=1)t.isDark(n,o)&&!t.isDark(n,o+1)&&t.isDark(n,o+2)&&t.isDark(n,o+3)&&t.isDark(n,o+4)&&!t.isDark(n,o+5)&&t.isDark(n,o+6)&&(e+=40);for(o=0;o<r;o+=1)for(n=0;n<r-6;n+=1)t.isDark(n,o)&&!t.isDark(n+1,o)&&t.isDark(n+2,o)&&t.isDark(n+3,o)&&t.isDark(n+4,o)&&!t.isDark(n+5,o)&&t.isDark(n+6,o)&&(e+=40);var g=0;for(o=0;o<r;o+=1)for(n=0;n<r;n+=1)t.isDark(n,o)&&(g+=1);return e+=Math.abs(100*g/r/r-50)/5*10},t);function d(t){for(var r=0;0!=t;)r+=1,t>>>=1;return r}var w=function(){for(var r=new Array(256),e=new Array(256),t=0;t<8;t+=1)r[t]=1<<t;for(t=8;t<256;t+=1)r[t]=r[t-4]^r[t-5]^r[t-6]^r[t-8];for(t=0;t<255;t+=1)e[r[t]]=t;return{glog:function(t){if(t<1)throw"glog("+t+")";return e[t]},gexp:function(t){for(;t<0;)t+=255;for(;256<=t;)t-=255;return r[t]}}}();function C(n,o){if(void 0===n.length)throw n.length+"/"+o;var r=function(){for(var t=0;t<n.length&&0==n[t];)t+=1;for(var r=new Array(n.length-t+o),e=0;e<n.length-t;e+=1)r[e]=n[e+t];return r}(),i={getAt:function(t){return r[t]},getLength:function(){return r.length},multiply:function(t){for(var r=new Array(i.getLength()+t.getLength()-1),e=0;e<i.getLength();e+=1)for(var n=0;n<t.getLength();n+=1)r[e+n]^=w.gexp(w.glog(i.getAt(e))+w.glog(t.getAt(n)));return C(r,0)},mod:function(t){if(i.getLength()-t.getLength()<0)return i;for(var r=w.glog(i.getAt(0))-w.glog(t.getAt(0)),e=new Array(i.getLength()),n=0;n<i.getLength();n+=1)e[n]=i.getAt(n);for(n=0;n<t.getLength();n+=1)e[n]^=w.gexp(w.glog(t.getAt(n))+r);return C(e,0).mod(t)}};return i}var k,A,b=(k=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13]],(A={}).getRSBlocks=function(t,r){var e=function(t,r){switch(r){case y.L:return k[4*(t-1)+0];case y.M:return k[4*(t-1)+1];case y.Q:return k[4*(t-1)+2];case y.H:return k[4*(t-1)+3];default:return}}(t,r);if(void 0===e)throw"bad rs block @ typeNumber:"+t;for(var n,o,i=e.length/3,a=[],u=0;u<i;u+=1)for(var f=e[3*u+0],c=e[3*u+1],g=e[3*u+2],l=0;l<f;l+=1)a.push((n=g,o=void 0,(o={}).totalCount=c,o.dataCount=n,o));return a},A),M=function(){var e=[],n=0,o={getBuffer:function(){return e},getAt:function(t){var r=Math.floor(t/8);return 1==(e[r]>>>7-t%8&1)},put:function(t,r){for(var e=0;e<r;e+=1)o.putBit(1==(t>>>r-e-1&1))},getLengthInBits:function(){return n},putBit:function(t){var r=Math.floor(n/8);e.length<=r&&e.push(0),t&&(e[r]|=128>>>n%8),n+=1}};return o},L=function(t){var r=o,e=i.stringToBytes(t);return{getMode:function(){return r},getLength:function(){return e.length},write:function(t){for(var r=0;r<e.length;r+=1)t.put(e[r],8)}}};return i}();

  function generateQRCode(text) {
    try {
      const qr = qrcode(0, 'M'); qr.addData(text); qr.make(); return qr;
    } catch (e) {
      const qr = qrcode(0, 'L'); qr.addData(text); qr.make(); return qr;
    }
  }

  function drawQRCodeOnCanvas(ctx, qr, x, y, size, fgCol = '#000000', bgCol = '#ffffff') {
    const count = qr.getModuleCount(), margin = 4, totalCount = count + margin * 2, cellSize = size / totalCount;
    ctx.fillStyle = bgCol; ctx.fillRect(x, y, size, size);
    ctx.fillStyle = fgCol;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(Math.round(x + (c + margin) * cellSize), Math.round(y + (r + margin) * cellSize), Math.ceil(cellSize), Math.ceil(cellSize));
      }
    }
  }

  function initSnapshotSystem() {
    try {
      snapExportMode = localStorage.getItem('stepviewer_snap_mode') || 'transparent';
      snapExportScale = parseInt(localStorage.getItem('stepviewer_snap_scale'), 10) || 2;
      snapTitleBlockMode = localStorage.getItem('stepviewer_snap_tb') || 'full';
      if (localStorage.getItem('stepviewer_snap_qr') !== null) snapExportIncludeQR = localStorage.getItem('stepviewer_snap_qr') === 'true';
      if (localStorage.getItem('stepviewer_snap_mat') !== null) snapExportIncludeMat = localStorage.getItem('stepviewer_snap_mat') === 'true';
      if (localStorage.getItem('stepviewer_snap_shadow') !== null) snapExportIncludeShadow = localStorage.getItem('stepviewer_snap_shadow') === 'true';
      if (localStorage.getItem('stepviewer_snap_dims') !== null) snapExportIncludeDims = localStorage.getItem('stepviewer_snap_dims') === 'true';
    } catch (e) {}
    updateSnapshotUIFromState();
  }

  function updateSnapshotUIFromState() {
    document.querySelectorAll('.snap-mode-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-mode') === snapExportMode));
    document.querySelectorAll('.snap-res-btn').forEach(btn => btn.classList.toggle('active', parseInt(btn.getAttribute('data-scale'), 10) === snapExportScale));
    document.querySelectorAll('.snap-tb-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-tb') === snapTitleBlockMode));

    const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
    setChk('snap-opt-qr', snapExportIncludeQR); setChk('snap-opt-mat', snapExportIncludeMat);
    setChk('snap-opt-shadow', snapExportIncludeShadow); setChk('snap-opt-dims', snapExportIncludeDims);

    const rowQR = document.getElementById('row-opt-qr'); if (rowQR) rowQR.style.display = (snapTitleBlockMode === 'full') ? 'flex' : 'none';
    const cQR = document.getElementById('snap-qr-custom-container');
    if (cQR) cQR.style.display = (snapTitleBlockMode === 'badge' || (snapTitleBlockMode === 'full' && snapExportIncludeQR)) ? 'flex' : 'none';
  }

  function toggleSnapshotModal(enable) {
    isSnapshotActive = (enable !== undefined) ? enable : !isSnapshotActive;
    const panel = document.getElementById('snapshot-panel'), btn = document.getElementById('btn-snapshot');
    if (isSnapshotActive) {
      initSnapshotSystem();
      if (panel) panel.style.display = 'flex';
      if (btn) btn.classList.add('active');
      if (typeof window.togglePropsModal === 'function') window.togglePropsModal(false);
    } else {
      if (panel) panel.style.display = 'none';
      if (btn) btn.classList.remove('active');
    }
  }

  function drawEngineeringTitleBlock(ctx, targetW, targetH, mode) {
    if (!ctx || snapTitleBlockMode === 'none') return;
    const uiScale = Math.max(targetW / 1200, 1.0);
    const rawName = window.pendingFileName || 'CAD_Model';
    const cleanName = rawName.length > 30 ? rawName.slice(0, 28) + '...' : rawName;
    const dateStr = new Date().toISOString().slice(0, 10);

    let dimStr = 'Bounding: -';
    if (window.modelPhysicalProps?.bbox) {
      const bb = window.modelPhysicalProps.bbox, unit = window.currentUnit || 'mm';
      const dx = unit === 'mm' ? bb.x.toFixed(1) : (bb.x / 25.4).toFixed(2);
      const dy = unit === 'mm' ? bb.y.toFixed(1) : (bb.y / 25.4).toFixed(2);
      const dz = unit === 'mm' ? bb.z.toFixed(1) : (bb.z / 25.4).toFixed(2);
      dimStr = `${dx} × ${dy} × ${dz} ${unit}`;
    }

    const partCount = (window.modelBodies && window.modelBodies.length > 0) ? `${window.modelBodies.length} Part${window.modelBodies.length > 1 ? 's' : ''}` : '1 Solid';
    const triNum = window.modelPhysicalProps?.triangles ? Math.round(window.modelPhysicalProps.triangles).toLocaleString() : '0';

    let matLine = '', activeMatName = '', activeMatMass = '';
    if (snapExportIncludeMat && window.modelBodies) {
      const matBody = window.modelBodies.find(b => b.materialPreset);
      if (matBody) {
        activeMatName = matBody.materialPreset;
        const volMm3 = matBody.data?.volumeMm3 || 0;
        if (volMm3 > 0) {
          activeMatMass = `${(volMm3 / 1000.0 * matBody.materialDensity).toFixed(1)} g`;
          matLine = `Material: ${matBody.materialPreset} (${matBody.materialDensity} g/cm³) • Mass: ${activeMatMass}`;
        }
      }
    }

    let qr = null;
    if (snapTitleBlockMode === 'badge' || (snapTitleBlockMode === 'full' && snapExportIncludeQR)) {
      try {
        const customNote = (document.getElementById('snap-qr-note')?.value || '').trim();
        const matTag = activeMatName ? ` | Mat: ${activeMatName} (${activeMatMass})` : '';
        const formatTag = window.activeCadFormat === 'IGES' ? 'USAF IGES 5.3' : 'ISO 10303-21';
        const passport = customNote.startsWith('http') ? customNote : `CAD Passport: ${rawName}\nDim: ${dimStr}\nBodies: ${partCount}${matTag}\n${formatTag}`;
        qr = generateQRCode(passport);
      } catch (e) {}
    }

    const bgCol = mode === 'white' ? 'rgba(248, 250, 252, 0.96)' : 'rgba(15, 23, 42, 0.90)';
    const borderCol = mode === 'white' ? '#cbd5e1' : 'rgba(56, 189, 248, 0.45)';
    const titleCol = mode === 'white' ? '#0f172a' : '#f8fafc';
    const dimCol = mode === 'white' ? '#475569' : '#94a3b8';
    const badgeCol = mode === 'white' ? '#0284c7' : '#38bdf8';

    ctx.save();
    if (snapTitleBlockMode === 'badge') {
      const badgeSize = Math.round(112 * uiScale), pad = Math.round(24 * uiScale);
      const bx = targetW - badgeSize - pad, by = targetH - badgeSize - pad, r = Math.round(10 * uiScale);
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = Math.round(14 * uiScale); ctx.shadowOffsetY = Math.round(4 * uiScale);
      ctx.fillStyle = bgCol; ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, badgeSize, badgeSize, r); else ctx.rect(bx, by, badgeSize, badgeSize);
      ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = Math.max(1, Math.round(1.5 * uiScale)); ctx.strokeStyle = borderCol; ctx.stroke();
      if (qr) {
        const qSize = Math.round(82 * uiScale);
        drawQRCodeOnCanvas(ctx, qr, bx + Math.round((badgeSize - qSize) / 2), by + Math.round(8 * uiScale), qSize, '#0f172a', '#ffffff');
        ctx.fillStyle = badgeCol; ctx.font = `bold ${Math.round(8.5 * uiScale)}px system-ui, sans-serif`; ctx.textAlign = 'center';
        ctx.fillText('CAD PASSPORT', bx + Math.round(badgeSize / 2), by + Math.round(8 * uiScale) + qSize + Math.round(4 * uiScale));
      }
      ctx.restore(); return;
    }

    const hasQR = Boolean(qr && snapExportIncludeQR), hasMat = Boolean(matLine);
    const boxW = Math.round((hasQR ? 470 : 370) * uiScale), boxH = Math.round((hasMat ? 104 : 88) * uiScale);
    const pad = Math.round(24 * uiScale), x0 = targetW - boxW - pad, y0 = targetH - boxH - pad, r = Math.round(10 * uiScale);

    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = Math.round(14 * uiScale); ctx.shadowOffsetY = Math.round(4 * uiScale);
    ctx.fillStyle = bgCol; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, boxW, boxH, r); else ctx.rect(x0, y0, boxW, boxH);
    ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = Math.max(1, Math.round(1.5 * uiScale)); ctx.strokeStyle = borderCol; ctx.stroke();

    ctx.fillStyle = badgeCol;
    ctx.fillRect(x0 + Math.round(12 * uiScale), y0 + Math.round(14 * uiScale), Math.round(3.5 * uiScale), boxH - Math.round(28 * uiScale));

    const textX = x0 + Math.round(24 * uiScale);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = titleCol; ctx.font = `bold ${Math.round(13 * uiScale)}px system-ui, sans-serif`;
    ctx.fillText(cleanName, textX, y0 + Math.round(13 * uiScale));

    ctx.fillStyle = dimCol; ctx.font = `${Math.round(10 * uiScale)}px system-ui, sans-serif`;
    ctx.fillText(`${dimStr} • ${partCount} • ${triNum} Tri`, textX, y0 + Math.round(34 * uiScale));

    let curY = y0 + Math.round(52 * uiScale);
    if (hasMat) {
      ctx.fillStyle = badgeCol; ctx.font = `600 ${Math.round(9.5 * uiScale)}px system-ui, sans-serif`;
      ctx.fillText(matLine, textX, curY); curY += Math.round(18 * uiScale);
    }

    const formatTag = window.activeCadFormat === 'IGES' ? 'USAF IGES 5.3' : 'ISO 10303-21';
    ctx.fillStyle = hasMat ? dimCol : badgeCol; ctx.font = `600 ${Math.round(9 * uiScale)}px system-ui, sans-serif`;
    ctx.fillText(`${formatTag} • ${dateStr} • QuickLook CAD`, textX, curY);

    if (hasQR) {
      const qSize = Math.round(72 * uiScale), qx = x0 + boxW - qSize - Math.round(14 * uiScale), qy = y0 + Math.round((boxH - qSize) / 2);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(qx, qy, qSize, qSize);
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.strokeRect(qx, qy, qSize, qSize);
      drawQRCodeOnCanvas(ctx, qr, qx, qy, qSize, '#0f172a', '#ffffff');
      ctx.fillStyle = badgeCol; ctx.font = `bold ${Math.round(7.5 * uiScale)}px system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('SCAN SPECS', qx + Math.round(qSize / 2), qy + qSize + Math.round(2 * uiScale));
    }
    ctx.restore();
  }

  async function executeEngineeringExport(destination = 'clipboard', targetPath = '') {
    const copyLabel = document.getElementById('snap-copy-label');
    const origCopyText = copyLabel ? copyLabel.innerText : 'Copy Image';
    if (destination === 'clipboard' && copyLabel) copyLabel.innerText = 'Rendering...';
    await new Promise(r => setTimeout(r, 20));

    try {
      let targetW = Math.round(window.innerWidth * snapExportScale), targetH = Math.round(window.innerHeight * snapExportScale);
      if (targetW > 4096 || targetH > 4096) {
        const ratio = 4096 / Math.max(targetW, targetH);
        targetW = Math.round(targetW * ratio); targetH = Math.round(targetH * ratio);
      }

      const prevBg = window.scene.background;
      const prevGrid = window.gridHelper?.visible || false;
      const prevMeasure = window.measureGroup?.visible || false;
      const prevShadow = window.contactShadowMesh?.visible || false;
      const prevShadowOp = window.contactShadowMaterial?.opacity || 0.45;

      if (window.gridHelper) window.gridHelper.visible = false;
      if (window.measureGroup) window.measureGroup.visible = snapExportIncludeDims;
      if (window.contactShadowMesh && window.contactShadowMaterial) {
        window.contactShadowMesh.visible = snapExportIncludeShadow;
        if (snapExportIncludeShadow) {
          window.contactShadowMaterial.opacity = snapExportMode === 'white' ? 0.28 : (snapExportMode === 'dark' ? 0.65 : 0.38);
        }
      }

      if (snapExportMode === 'transparent') window.scene.background = null;
      else if (snapExportMode === 'white') window.scene.background = new THREE.Color(0xffffff);
      else window.scene.background = new THREE.Color(0x181a20);

      window.renderer.setPixelRatio(1);
      window.renderer.setSize(targetW, targetH, false);
      window.camera.aspect = targetW / targetH;
      window.camera.updateProjectionMatrix();

      if (typeof window.updateScreenSpaceAnnotations === 'function' && snapExportIncludeDims) window.updateScreenSpaceAnnotations();
      window.renderer.render(window.scene, window.camera);

      const compCanvas = document.createElement('canvas'); compCanvas.width = targetW; compCanvas.height = targetH;
      const ctx = compCanvas.getContext('2d');
      ctx.drawImage(window.renderer.domElement, 0, 0, targetW, targetH);
      if (snapTitleBlockMode !== 'none') drawEngineeringTitleBlock(ctx, targetW, targetH, snapExportMode);

      window.scene.background = prevBg;
      if (window.gridHelper) window.gridHelper.visible = prevGrid;
      if (window.measureGroup) window.measureGroup.visible = prevMeasure;
      if (window.contactShadowMesh && window.contactShadowMaterial) {
        window.contactShadowMesh.visible = prevShadow; window.contactShadowMaterial.opacity = prevShadowOp;
      }

      window.renderer.setPixelRatio(window.devicePixelRatio || 1);
      window.renderer.setSize(window.innerWidth, window.innerHeight);
      window.camera.aspect = window.innerWidth / window.innerHeight;
      window.camera.updateProjectionMatrix();
      if (typeof window.updateScreenSpaceAnnotations === 'function') window.updateScreenSpaceAnnotations();
      window.renderer.render(window.scene, window.camera);

      const baseName = (window.pendingFileName || 'CAD_Model').replace(/\.[^/.]+$/, "");
      const dateStr = new Date().toISOString().slice(0, 10);
      const defaultName = `${baseName}_${snapExportMode}_${targetW}x${targetH}_${dateStr}.png`;
      const dataUrl = compCanvas.toDataURL('image/png');

      if (destination === 'clipboard') {
        if (window.chrome?.webview) {
          window.chrome.webview.postMessage({ type: 'COPY_SNAPSHOT_CLIPBOARD', action: 'COPY_SNAPSHOT_CLIPBOARD', data: dataUrl });
        }
        compCanvas.toBlob(blob => {
          if (blob && navigator.clipboard?.write) navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {});
        }, 'image/png');

        if (typeof window.showToast === 'function') window.showToast(`Copied ${targetW}×${targetH} CAD Export to Clipboard ✓`);
        if (copyLabel) copyLabel.innerText = 'Copied! ✓';
        setTimeout(() => { if (copyLabel) copyLabel.innerText = origCopyText; }, 1800);
      } else if (destination !== 'test' && destination !== 'memory') {
        if (window.chrome?.webview) {
          window.chrome.webview.postMessage({ type: 'SAVE_SNAPSHOT', action: 'SAVE_SNAPSHOT', data: dataUrl, defaultName, targetPath: targetPath || '' });
        } else {
          const a = document.createElement('a'); a.href = dataUrl; a.download = defaultName;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          if (typeof window.showToast === 'function') window.showToast('Saved: ' + defaultName);
        }
      }
      return dataUrl;
    } catch (err) {
      if (typeof window.showToast === 'function') window.showToast('Export error: ' + err.message);
      if (copyLabel) copyLabel.innerText = origCopyText;
    }
  }

  function setupUI() {
    document.querySelectorAll('.snap-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        snapExportMode = btn.getAttribute('data-mode'); localStorage.setItem('stepviewer_snap_mode', snapExportMode);
        updateSnapshotUIFromState();
      });
    });
    document.querySelectorAll('.snap-res-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        snapExportScale = parseInt(btn.getAttribute('data-scale'), 10) || 2; localStorage.setItem('stepviewer_snap_scale', snapExportScale);
        updateSnapshotUIFromState();
      });
    });
    document.querySelectorAll('.snap-tb-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        snapTitleBlockMode = btn.getAttribute('data-tb'); localStorage.setItem('stepviewer_snap_tb', snapTitleBlockMode);
        updateSnapshotUIFromState();
      });
    });

    const bindChk = (id, key, setter) => {
      document.getElementById(id)?.addEventListener('change', e => {
        setter(e.target.checked); localStorage.setItem(key, e.target.checked ? 'true' : 'false');
        updateSnapshotUIFromState();
      });
    };
    bindChk('snap-opt-qr', 'stepviewer_snap_qr', v => { snapExportIncludeQR = v; });
    bindChk('snap-opt-mat', 'stepviewer_snap_mat', v => { snapExportIncludeMat = v; });
    bindChk('snap-opt-shadow', 'stepviewer_snap_shadow', v => { snapExportIncludeShadow = v; });
    bindChk('snap-opt-dims', 'stepviewer_snap_dims', v => { snapExportIncludeDims = v; });

    document.getElementById('snap-btn-copy')?.addEventListener('click', () => executeEngineeringExport('clipboard'));
    document.getElementById('snap-btn-save')?.addEventListener('click', () => executeEngineeringExport('file'));
    document.getElementById('btn-snapshot')?.addEventListener('click', () => toggleSnapshotModal());
    document.getElementById('btn-close-snapshot')?.addEventListener('click', () => toggleSnapshotModal(false));
  }

  const SnapshotEngine = {
    toggleSnapshotModal, executeEngineeringExport, initSnapshotSystem, setupUI,
    isActive: () => isSnapshotActive, getExportMode: () => snapExportMode, getScale: () => snapExportScale
  };

  Object.assign(window, { SnapshotEngine, executeEngineeringExport, toggleSnapshotModal, initSnapshotSystem });
})();

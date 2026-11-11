/**
 * Engineering Snapshot & High-DPI CAD Export Engine (v2.0.0 - Full Restored)
 * Pure offline ISO/IEC 18004 QR Code generator, engineering Title Block, 1x/2x/4K supersampling.
 */
    // Engineering Snapshot & High-DPI CAD Export Engine
    // =============================================================
    // Engineering Snapshot & High-DPI CAD Export Engine
    // =============================================================
    let isSnapshotActive = false;
    let snapExportMode = 'transparent'; // 'transparent' | 'white' | 'dark'
    let snapExportScale = 2; // 1 | 2 | 4
    let snapTitleBlockMode = 'full'; // 'full' | 'badge' | 'none'
    let snapExportIncludeQR = true;
    let snapExportIncludeMat = true;
    let snapExportIncludeShadow = true;
    let snapExportIncludeDims = true;

    // -------------------------------------------------------------
    // Pure Offline ISO/IEC 18004 QR Code Generator (Kazuhiko Arase Reference Engine)
    // -------------------------------------------------------------
    var qrcode=function(){function i(t,r){function a(t,r){g=function(t){for(var r=new Array(t),e=0;e<t;e+=1){r[e]=new Array(t);for(var n=0;n<t;n+=1)r[e][n]=null}return r}(l=4*u+17),e(0,0),e(l-7,0),e(0,l-7),i(),o(),v(t,r),7<=u&&h(t),null==n&&(n=w(u,f,c)),d(n,r)}var u=t,f=y[r],g=null,l=0,n=null,c=[],s={},e=function(t,r){for(var e=-1;e<=7;e+=1)if(!(t+e<=-1||l<=t+e))for(var n=-1;n<=7;n+=1)r+n<=-1||l<=r+n||(g[t+e][r+n]=0<=e&&e<=6&&(0==n||6==n)||0<=n&&n<=6&&(0==e||6==e)||2<=e&&e<=4&&2<=n&&n<=4)},o=function(){for(var t=8;t<l-8;t+=1)null==g[t][6]&&(g[t][6]=t%2==0);for(var r=8;r<l-8;r+=1)null==g[6][r]&&(g[6][r]=r%2==0)},i=function(){for(var t=B.getPatternPosition(u),r=0;r<t.length;r+=1)for(var e=0;e<t.length;e+=1){var n=t[r],o=t[e];if(null==g[n][o])for(var i=-2;i<=2;i+=1)for(var a=-2;a<=2;a+=1)g[n+i][o+a]=-2==i||2==i||-2==a||2==a||0==i&&0==a}},h=function(t){for(var r=B.getBCHTypeNumber(u),e=0;e<18;e+=1){var n=!t&&1==(r>>e&1);g[Math.floor(e/3)][e%3+l-8-3]=n}for(e=0;e<18;e+=1){n=!t&&1==(r>>e&1);g[e%3+l-8-3][Math.floor(e/3)]=n}},v=function(t,r){for(var e=f<<3|r,n=B.getBCHTypeInfo(e),o=0;o<15;o+=1){var i=!t&&1==(n>>o&1);o<6?g[o][8]=i:o<8?g[o+1][8]=i:g[l-15+o][8]=i}for(o=0;o<15;o+=1){i=!t&&1==(n>>o&1);o<8?g[8][l-o-1]=i:o<9?g[8][15-o-1+1]=i:g[8][15-o-1]=i}g[l-8][8]=!t},d=function(t,r){for(var e=-1,n=l-1,o=7,i=0,a=B.getMaskFunction(r),u=l-1;0<u;u-=2)for(6==u&&(u-=1);;){for(var f=0;f<2;f+=1)if(null==g[n][u-f]){var c=!1;i<t.length&&(c=1==(t[i]>>>o&1)),a(n,u-f)&&(c=!c),g[n][u-f]=c,-1==(o-=1)&&(i+=1,o=7)}if((n+=e)<0||l<=n){n-=e,e=-e;break}}},w=function(t,r,e){for(var n=b.getRSBlocks(t,r),o=M(),i=0;i<e.length;i+=1){var a=e[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var u=0;for(i=0;i<n.length;i+=1)u+=n[i].dataCount;if(o.getLengthInBits()>8*u)throw"code length overflow. ("+o.getLengthInBits()+">"+8*u+")";for(o.getLengthInBits()+4<=8*u&&o.put(0,4);o.getLengthInBits()%8!=0;)o.putBit(!1);for(;!(o.getLengthInBits()>=8*u||(o.put(236,8),o.getLengthInBits()>=8*u));)o.put(17,8);return function(t,r){for(var e=0,n=0,o=0,i=new Array(r.length),a=new Array(r.length),u=0;u<r.length;u+=1){var f=r[u].dataCount,c=r[u].totalCount-f;n=Math.max(n,f),o=Math.max(o,c),i[u]=new Array(f);for(var g=0;g<i[u].length;g+=1)i[u][g]=255&t.getBuffer()[g+e];e+=f;var l=B.getErrorCorrectPolynomial(c),h=C(i[u],l.getLength()-1).mod(l);a[u]=new Array(l.getLength()-1);for(g=0;g<a[u].length;g+=1){var s=g+h.getLength()-a[u].length;a[u][g]=0<=s?h.getAt(s):0}}var v=0;for(g=0;g<r.length;g+=1)v+=r[g].totalCount;var d=new Array(v),w=0;for(g=0;g<n;g+=1)for(u=0;u<r.length;u+=1)g<i[u].length&&(d[w]=i[u][g],w+=1);for(g=0;g<o;g+=1)for(u=0;u<r.length;u+=1)g<a[u].length&&(d[w]=a[u][g],w+=1);return d}(o,n)};s.addData=function(t,r){var e=null;switch(r=r||"Byte"){case"Numeric":e=x(t);break;case"Alphanumeric":e=m(t);break;case"Byte":e=L(t);break;case"Kanji":e=D(t);break;default:throw"mode:"+r}c.push(e),n=null},s.isDark=function(t,r){if(t<0||l<=t||r<0||l<=r)throw t+","+r;return g[t][r]},s.getModuleCount=function(){return l},s.make=function(){if(u<1){for(var t=1;t<40;t++){for(var r=b.getRSBlocks(t,f),e=M(),n=0;n<c.length;n++){var o=c[n];e.put(o.getMode(),4),e.put(o.getLength(),B.getLengthInBits(o.getMode(),t)),o.write(e)}var i=0;for(n=0;n<r.length;n++)i+=r[n].dataCount;if(e.getLengthInBits()<=8*i)break}u=t}a(!1,function(){for(var t=0,r=0,e=0;e<8;e+=1){a(!0,e);var n=B.getLostPoint(s);(0==e||n<t)&&(t=n,r=e)}return r}())},s.createTableTag=function(t,r){t=t||2;var e="";e+='<table style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: "+(r=void 0===r?4*t:r)+"px;",e+='">',e+="<tbody>";for(var n=0;n<s.getModuleCount();n+=1){e+="<tr>";for(var o=0;o<s.getModuleCount();o+=1)e+='<td style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: 0px;",e+=" width: "+t+"px;",e+=" height: "+t+"px;",e+=" background-color: ",e+=s.isDark(n,o)?"#000000":"#ffffff",e+=";",e+='"/>';e+="</tr>"}return e+="</tbody>",e+="</table>"},s.createSvgTag=function(t,r,e,n){var o={};"object"==typeof t&&(t=(o=t).cellSize,r=o.margin,e=o.alt,n=o.title),t=t||2,r=void 0===r?4*t:r,(e="string"==typeof e?{text:e}:e||{}).text=e.text||null,e.id=e.text?e.id||"qrcode-description":null,(n="string"==typeof n?{text:n}:n||{}).text=n.text||null,n.id=n.text?n.id||"qrcode-title":null;var i,a,u,f,c=s.getModuleCount()*t+2*r,g="";for(f="l"+t+",0 0,"+t+" -"+t+",0 0,-"+t+"z ",g+='<svg version="1.1" xmlns="http://www.w3.org/2000/svg"',g+=o.scalable?"":' width="'+c+'px" height="'+c+'px"',g+=' viewBox="0 0 '+c+" "+c+'" ',g+=' preserveAspectRatio="xMinYMin meet"',g+=n.text||e.text?' role="img" aria-labelledby="'+p([n.id,e.id].join(" ").trim())+'"':"",g+=">",g+=n.text?'<title id="'+p(n.id)+'">'+p(n.text)+"</title>":"",g+=e.text?'<description id="'+p(e.id)+'">'+p(e.text)+"</description>":"",g+='<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>',g+='<path d="',a=0;a<s.getModuleCount();a+=1)for(u=a*t+r,i=0;i<s.getModuleCount();i+=1)s.isDark(a,i)&&(g+="M"+(i*t+r)+","+u+f);return g+='" stroke="transparent" fill="black"/>',g+="</svg>"},s.createDataURL=function(o,t){o=o||2,t=void 0===t?4*o:t;var r=s.getModuleCount()*o+2*t,i=t,a=r-t;return I(r,r,function(t,r){if(i<=t&&t<a&&i<=r&&r<a){var e=Math.floor((t-i)/o),n=Math.floor((r-i)/o);return s.isDark(n,e)?0:1}return 1})},s.createImgTag=function(t,r,e){t=t||2,r=void 0===r?4*t:r;var n=s.getModuleCount()*t+2*r,o="";return o+="<img",o+=' src="',o+=s.createDataURL(t,r),o+='"',o+=' width="',o+=n,o+='"',o+=' height="',o+=n,o+='"',e&&(o+=' alt="',o+=p(e),o+='"'),o+="/>"};var p=function(t){for(var r="",e=0;e<t.length;e+=1){var n=t.charAt(e);switch(n){case"<":r+="&lt;";break;case">":r+="&gt;";break;case"&":r+="&amp;";break;case'"':r+="&quot;";break;default:r+=n}}return r};return s.createASCII=function(t,r){if((t=t||1)<2)return function(t){t=void 0===t?2:t;var r,e,n,o,i,a=1*s.getModuleCount()+2*t,u=t,f=a-t,c={"██":"█","█ ":"▀"," █":"▄","  ":" "},g={"██":"▀","█ ":"▀"," █":" ","  ":" "},l="";for(r=0;r<a;r+=2){for(n=Math.floor((r-u)/1),o=Math.floor((r+1-u)/1),e=0;e<a;e+=1)i="█",u<=e&&e<f&&u<=r&&r<f&&s.isDark(n,Math.floor((e-u)/1))&&(i=" "),u<=e&&e<f&&u<=r+1&&r+1<f&&s.isDark(o,Math.floor((e-u)/1))?i+=" ":i+="█",l+=t<1&&f<=r+1?g[i]:c[i];l+="\n"}return a%2&&0<t?l.substring(0,l.length-a-1)+Array(1+a).join("▀"):l.substring(0,l.length-1)}(r);t-=1,r=void 0===r?2*t:r;var e,n,o,i,a=s.getModuleCount()*t+2*r,u=r,f=a-r,c=Array(t+1).join("██"),g=Array(t+1).join("  "),l="",h="";for(e=0;e<a;e+=1){for(o=Math.floor((e-u)/t),h="",n=0;n<a;n+=1)i=1,u<=n&&n<f&&u<=e&&e<f&&s.isDark(o,Math.floor((n-u)/t))&&(i=0),h+=i?c:g;for(o=0;o<t;o+=1)l+=h+"\n"}return l.substring(0,l.length-1)},s.renderTo2dContext=function(t,r){r=r||2;for(var e=s.getModuleCount(),n=0;n<e;n++)for(var o=0;o<e;o++)t.fillStyle=s.isDark(n,o)?"black":"white",t.fillRect(n*r,o*r,r,r)},s}i.stringToBytes=(i.stringToBytesFuncs={default:function(t){for(var r=[],e=0;e<t.length;e+=1){var n=t.charCodeAt(e);r.push(255&n)}return r}}).default,i.createStringToBytes=function(u,f){var i=function(){function t(){var t=r.read();if(-1==t)throw"eof";return t}for(var r=S(u),e=0,n={};;){var o=r.read();if(-1==o)break;var i=t(),a=t()<<8|t();n[String.fromCharCode(o<<8|i)]=a,e+=1}if(e!=f)throw e+" != "+f;return n}(),a="?".charCodeAt(0);return function(t){for(var r=[],e=0;e<t.length;e+=1){var n=t.charCodeAt(e);if(n<128)r.push(n);else{var o=i[t.charAt(e)];"number"==typeof o?(255&o)==o?r.push(o):(r.push(o>>>8),r.push(255&o)):r.push(a)}}return r}};var r,t,a=1,u=2,o=4,f=8,y={L:1,M:0,Q:3,H:2},e=0,n=1,c=2,g=3,l=4,h=5,s=6,v=7,B=(r=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],(t={}).getBCHTypeInfo=function(t){for(var r=t<<10;0<=d(r)-d(1335);)r^=1335<<d(r)-d(1335);return 21522^(t<<10|r)},t.getBCHTypeNumber=function(t){for(var r=t<<12;0<=d(r)-d(7973);)r^=7973<<d(r)-d(7973);return t<<12|r},t.getPatternPosition=function(t){return r[t-1]},t.getMaskFunction=function(t){switch(t){case e:return function(t,r){return(t+r)%2==0};case n:return function(t,r){return t%2==0};case c:return function(t,r){return r%3==0};case g:return function(t,r){return(t+r)%3==0};case l:return function(t,r){return(Math.floor(t/2)+Math.floor(r/3))%2==0};case h:return function(t,r){return t*r%2+t*r%3==0};case s:return function(t,r){return(t*r%2+t*r%3)%2==0};case v:return function(t,r){return(t*r%3+(t+r)%2)%2==0};default:throw"bad maskPattern:"+t}},t.getErrorCorrectPolynomial=function(t){for(var r=C([1],0),e=0;e<t;e+=1)r=r.multiply(C([1,w.gexp(e)],0));return r},t.getLengthInBits=function(t,r){if(1<=r&&r<10)switch(t){case a:return 10;case u:return 9;case o:case f:return 8;default:throw"mode:"+t}else if(r<27)switch(t){case a:return 12;case u:return 11;case o:return 16;case f:return 10;default:throw"mode:"+t}else{if(!(r<41))throw"type:"+r;switch(t){case a:return 14;case u:return 13;case o:return 16;case f:return 12;default:throw"mode:"+t}}},t.getLostPoint=function(t){for(var r=t.getModuleCount(),e=0,n=0;n<r;n+=1)for(var o=0;o<r;o+=1){for(var i=0,a=t.isDark(n,o),u=-1;u<=1;u+=1)if(!(n+u<0||r<=n+u))for(var f=-1;f<=1;f+=1)o+f<0||r<=o+f||0==u&&0==f||a==t.isDark(n+u,o+f)&&(i+=1);5<i&&(e+=3+i-5)}for(n=0;n<r-1;n+=1)for(o=0;o<r-1;o+=1){var c=0;t.isDark(n,o)&&(c+=1),t.isDark(n+1,o)&&(c+=1),t.isDark(n,o+1)&&(c+=1),t.isDark(n+1,o+1)&&(c+=1),0!=c&&4!=c||(e+=3)}for(n=0;n<r;n+=1)for(o=0;o<r-6;o+=1)t.isDark(n,o)&&!t.isDark(n,o+1)&&t.isDark(n,o+2)&&t.isDark(n,o+3)&&t.isDark(n,o+4)&&!t.isDark(n,o+5)&&t.isDark(n,o+6)&&(e+=40);for(o=0;o<r;o+=1)for(n=0;n<r-6;n+=1)t.isDark(n,o)&&!t.isDark(n+1,o)&&t.isDark(n+2,o)&&t.isDark(n+3,o)&&t.isDark(n+4,o)&&!t.isDark(n+5,o)&&t.isDark(n+6,o)&&(e+=40);var g=0;for(o=0;o<r;o+=1)for(n=0;n<r;n+=1)t.isDark(n,o)&&(g+=1);return e+=Math.abs(100*g/r/r-50)/5*10},t);function d(t){for(var r=0;0!=t;)r+=1,t>>>=1;return r}var w=function(){for(var r=new Array(256),e=new Array(256),t=0;t<8;t+=1)r[t]=1<<t;for(t=8;t<256;t+=1)r[t]=r[t-4]^r[t-5]^r[t-6]^r[t-8];for(t=0;t<255;t+=1)e[r[t]]=t;var n={glog:function(t){if(t<1)throw"glog("+t+")";return e[t]},gexp:function(t){for(;t<0;)t+=255;for(;256<=t;)t-=255;return r[t]}};return n}();function C(n,o){if(void 0===n.length)throw n.length+"/"+o;var r=function(){for(var t=0;t<n.length&&0==n[t];)t+=1;for(var r=new Array(n.length-t+o),e=0;e<n.length-t;e+=1)r[e]=n[e+t];return r}(),i={getAt:function(t){return r[t]},getLength:function(){return r.length},multiply:function(t){for(var r=new Array(i.getLength()+t.getLength()-1),e=0;e<i.getLength();e+=1)for(var n=0;n<t.getLength();n+=1)r[e+n]^=w.gexp(w.glog(i.getAt(e))+w.glog(t.getAt(n)));return C(r,0)},mod:function(t){if(i.getLength()-t.getLength()<0)return i;for(var r=w.glog(i.getAt(0))-w.glog(t.getAt(0)),e=new Array(i.getLength()),n=0;n<i.getLength();n+=1)e[n]=i.getAt(n);for(n=0;n<t.getLength();n+=1)e[n]^=w.gexp(w.glog(t.getAt(n))+r);return C(e,0).mod(t)}};return i}function p(){var e=[],o={writeByte:function(t){e.push(255&t)},writeShort:function(t){o.writeByte(t),o.writeByte(t>>>8)},writeBytes:function(t,r,e){r=r||0,e=e||t.length;for(var n=0;n<e;n+=1)o.writeByte(t[n+r])},writeString:function(t){for(var r=0;r<t.length;r+=1)o.writeByte(t.charCodeAt(r))},toByteArray:function(){return e},toString:function(){var t="";t+="[";for(var r=0;r<e.length;r+=1)0<r&&(t+=","),t+=e[r];return t+="]"}};return o}var k,A,b=(k=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],(A={}).getRSBlocks=function(t,r){var e=function(t,r){switch(r){case y.L:return k[4*(t-1)+0];case y.M:return k[4*(t-1)+1];case y.Q:return k[4*(t-1)+2];case y.H:return k[4*(t-1)+3];default:return}}(t,r);if(void 0===e)throw"bad rs block @ typeNumber:"+t+"/errorCorrectionLevel:"+r;for(var n,o,i=e.length/3,a=[],u=0;u<i;u+=1)for(var f=e[3*u+0],c=e[3*u+1],g=e[3*u+2],l=0;l<f;l+=1)a.push((n=g,o=void 0,(o={}).totalCount=c,o.dataCount=n,o));return a},A),M=function(){var e=[],n=0,o={getBuffer:function(){return e},getAt:function(t){var r=Math.floor(t/8);return 1==(e[r]>>>7-t%8&1)},put:function(t,r){for(var e=0;e<r;e+=1)o.putBit(1==(t>>>r-e-1&1))},getLengthInBits:function(){return n},putBit:function(t){var r=Math.floor(n/8);e.length<=r&&e.push(0),t&&(e[r]|=128>>>n%8),n+=1}};return o},x=function(t){var r=a,n=t,e={getMode:function(){return r},getLength:function(t){return n.length},write:function(t){for(var r=n,e=0;e+2<r.length;)t.put(o(r.substring(e,e+3)),10),e+=3;e<r.length&&(r.length-e==1?t.put(o(r.substring(e,e+1)),4):r.length-e==2&&t.put(o(r.substring(e,e+2)),7))}},o=function(t){for(var r=0,e=0;e<t.length;e+=1)r=10*r+i(t.charAt(e));return r},i=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);throw"illegal char :"+t};return e},m=function(t){var r=u,n=t,e={getMode:function(){return r},getLength:function(t){return n.length},write:function(t){for(var r=n,e=0;e+1<r.length;)t.put(45*o(r.charAt(e))+o(r.charAt(e+1)),11),e+=2;e<r.length&&t.put(o(r.charAt(e)),6)}},o=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);if("A"<=t&&t<="Z")return t.charCodeAt(0)-"A".charCodeAt(0)+10;switch(t){case" ":return 36;case"$":return 37;case"%":return 38;case"*":return 39;case"+":return 40;case"-":return 41;case".":return 42;case"/":return 43;case":":return 44;default:throw"illegal char :"+t}};return e},L=function(t){var r=o,e=i.stringToBytes(t),n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=0;r<e.length;r+=1)t.put(e[r],8)}};return n},D=function(t){var r=f,e=i.stringToBytesFuncs.SJIS;if(!e)throw"sjis not supported.";!function(){var t=e("友");if(2!=t.length||38726!=(t[0]<<8|t[1]))throw"sjis not supported."}();var o=e(t),n={getMode:function(){return r},getLength:function(t){return~~(o.length/2)},write:function(t){for(var r=o,e=0;e+1<r.length;){var n=(255&r[e])<<8|255&r[e+1];if(33088<=n&&n<=40956)n-=33088;else{if(!(57408<=n&&n<=60351))throw"illegal char at "+(e+1)+"/"+n;n-=49472}n=192*(n>>>8&255)+(255&n),t.put(n,13),e+=2}if(e<r.length)throw"illegal char at "+(e+1)}};return n},S=function(t){var e=t,n=0,o=0,i=0,r={read:function(){for(;i<8;){if(n>=e.length){if(0==i)return-1;throw"unexpected end of file./"+i}var t=e.charAt(n);if(n+=1,"="==t)return i=0,-1;t.match(/^\s$/)||(o=o<<6|a(t.charCodeAt(0)),i+=6)}var r=o>>>i-8&255;return i-=8,r}},a=function(t){if(65<=t&&t<=90)return t-65;if(97<=t&&t<=122)return t-97+26;if(48<=t&&t<=57)return t-48+52;if(43==t)return 62;if(47==t)return 63;throw"c:"+t};return r},I=function(t,r,e){for(var n=function(t,r){var n=t,o=r,l=new Array(t*r),e={setPixel:function(t,r,e){l[r*n+t]=e},write:function(t){t.writeString("GIF87a"),t.writeShort(n),t.writeShort(o),t.writeByte(128),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(255),t.writeByte(255),t.writeByte(255),t.writeString(","),t.writeShort(0),t.writeShort(0),t.writeShort(n),t.writeShort(o),t.writeByte(0);var r=i(2);t.writeByte(2);for(var e=0;255<r.length-e;)t.writeByte(255),t.writeBytes(r,e,255),e+=255;t.writeByte(r.length-e),t.writeBytes(r,e,r.length-e),t.writeByte(0),t.writeString(";")}},i=function(t){for(var r=1<<t,e=1+(1<<t),n=t+1,o=h(),i=0;i<r;i+=1)o.add(String.fromCharCode(i));o.add(String.fromCharCode(r)),o.add(String.fromCharCode(e));var a=p(),u=function(t){var e=t,n=0,o=0,r={write:function(t,r){if(t>>>r!=0)throw"length over";for(;8<=n+r;)e.writeByte(255&(t<<n|o)),r-=8-n,t>>>=8-n,n=o=0;o|=t<<n,n+=r},flush:function(){0<n&&e.writeByte(o)}};return r}(a);u.write(r,n);var f=0,c=String.fromCharCode(l[f]);for(f+=1;f<l.length;){var g=String.fromCharCode(l[f]);f+=1,o.contains(c+g)?c+=g:(u.write(o.indexOf(c),n),o.size()<4095&&(o.size()==1<<n&&(n+=1),o.add(c+g)),c=g)}return u.write(o.indexOf(c),n),u.write(e,n),u.flush(),a.toByteArray()},h=function(){var r={},e=0,n={add:function(t){if(n.contains(t))throw"dup key:"+t;r[t]=e,e+=1},size:function(){return e},indexOf:function(t){return r[t]},contains:function(t){return void 0!==r[t]}};return n};return e}(t,r),o=0;o<r;o+=1)for(var i=0;i<t;i+=1)n.setPixel(i,o,e(i,o));var a=p();n.write(a);for(var u=function(){function e(t){a+=String.fromCharCode(r(63&t))}var n=0,o=0,i=0,a="",t={},r=function(t){if(t<0);else{if(t<26)return 65+t;if(t<52)return t-26+97;if(t<62)return t-52+48;if(62==t)return 43;if(63==t)return 47}throw"n:"+t};return t.writeByte=function(t){for(n=n<<8|255&t,o+=8,i+=1;6<=o;)e(n>>>o-6),o-=6},t.flush=function(){if(0<o&&(e(n<<6-o),o=n=0),i%3!=0)for(var t=3-i%3,r=0;r<t;r+=1)a+="="},t.toString=function(){return a},t}(),f=a.toByteArray(),c=0;c<f.length;c+=1)u.writeByte(f[c]);return u.flush(),"data:image/gif;base64,"+u};return i}();qrcode.stringToBytesFuncs["UTF-8"]=function(t){return function(t){for(var r=[],e=0;e<t.length;e++){var n=t.charCodeAt(e);n<128?r.push(n):n<2048?r.push(192|n>>6,128|63&n):n<55296||57344<=n?r.push(224|n>>12,128|n>>6&63,128|63&n):(e++,n=65536+((1023&n)<<10|1023&t.charCodeAt(e)),r.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|63&n))}return r}(t)},function(t){"function"==typeof define&&define.amd?define([],t):"object"==typeof exports&&(module.exports=t())}(function(){return qrcode});

    function generateQRCode(text) {
      try {
        // Auto-detect optimal QR Version (0), Error Correction Level M (15% redundancy)
        const qr = qrcode(0, 'M');
        qr.addData(text);
        qr.make();
        return qr;
      } catch (e) {
        console.warn('QR Code generation fallback with Level L:', e);
        const qr = qrcode(0, 'L');
        qr.addData(text);
        qr.make();
        return qr;
      }
    }

    function drawQRCodeOnCanvas(ctx, qr, x, y, size, fgCol = '#000000', bgCol = '#ffffff') {
      const count = qr.getModuleCount();
      const margin = 4; // Strict ISO/IEC 18004 4-module quiet zone
      const totalCount = count + margin * 2;
      const cellSize = size / totalCount;

      ctx.fillStyle = bgCol;
      ctx.fillRect(x, y, size, size);

      ctx.fillStyle = fgCol;
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            const cellX = Math.round(x + (c + margin) * cellSize);
            const cellY = Math.round(y + (r + margin) * cellSize);
            const cellW = Math.ceil(cellSize);
            const cellH = Math.ceil(cellSize);
            ctx.fillRect(cellX, cellY, cellW, cellH);
          }
        }
      }
    }

    function initSnapshotSystem() {
      try {
        const savedMode = localStorage.getItem('stepviewer_snap_mode');
        if (savedMode) snapExportMode = savedMode;
        const savedScale = localStorage.getItem('stepviewer_snap_scale');
        if (savedScale) snapExportScale = parseInt(savedScale, 10) || 2;
        const savedTb = localStorage.getItem('stepviewer_snap_tb');
        if (savedTb) snapTitleBlockMode = savedTb;
        const savedQR = localStorage.getItem('stepviewer_snap_qr');
        if (savedQR !== null) snapExportIncludeQR = (savedQR === 'true');
        const savedMat = localStorage.getItem('stepviewer_snap_mat');
        if (savedMat !== null) snapExportIncludeMat = (savedMat === 'true');
        const savedShadow = localStorage.getItem('stepviewer_snap_shadow');
        if (savedShadow !== null) snapExportIncludeShadow = (savedShadow === 'true');
        const savedDims = localStorage.getItem('stepviewer_snap_dims');
        if (savedDims !== null) snapExportIncludeDims = (savedDims === 'true');
      } catch (e) {}

      updateSnapshotUIFromState();
    }

    function updateSnapshotUIFromState() {
      document.querySelectorAll('.snap-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-mode') === snapExportMode);
      });
      document.querySelectorAll('.snap-res-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.getAttribute('data-scale'), 10) === snapExportScale);
      });
      document.querySelectorAll('.snap-tb-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tb') === snapTitleBlockMode);
      });

      const qrBox = document.getElementById('snap-opt-qr');
      if (qrBox) qrBox.checked = snapExportIncludeQR;
      const matBox = document.getElementById('snap-opt-mat');
      if (matBox) matBox.checked = snapExportIncludeMat;
      const shadowBox = document.getElementById('snap-opt-shadow');
      if (shadowBox) shadowBox.checked = snapExportIncludeShadow;
      const dimsBox = document.getElementById('snap-opt-dims');
      if (dimsBox) dimsBox.checked = snapExportIncludeDims;

      const rowQR = document.getElementById('row-opt-qr');
      if (rowQR) rowQR.style.display = (snapTitleBlockMode === 'full') ? 'flex' : 'none';

      const customQRContainer = document.getElementById('snap-qr-custom-container');
      if (customQRContainer) {
        const showQR = (snapTitleBlockMode === 'badge') || (snapTitleBlockMode === 'full' && snapExportIncludeQR);
        customQRContainer.style.display = showQR ? 'flex' : 'none';
      }
    }

    function toggleSnapshotModal(enable) {
      if (window.WorkbenchUI && typeof window.WorkbenchUI.toggleDrawer === 'function') {
        if (enable === true) {
          window.WorkbenchUI.openDrawer('export');
        } else if (enable === false) {
          if (window.WorkbenchUI.getActiveTab?.() === 'export') {
            window.WorkbenchUI.closeDrawer();
          }
        } else {
          window.WorkbenchUI.toggleDrawer('export');
        }
        return;
      }
      isSnapshotActive = (enable !== undefined) ? enable : !isSnapshotActive;
      const panel = document.getElementById('snapshot-panel');
      const btn = document.getElementById('btn-snapshot');
      if (isSnapshotActive) {
        initSnapshotSystem();
        if (panel) panel.style.display = 'flex';
        if (btn) btn.classList.add('active');
        if (typeof togglePropsModal === 'function') togglePropsModal(false);
      } else {
        if (panel) panel.style.display = 'none';
        if (btn) btn.classList.remove('active');
      }
    }

    function drawEngineeringTitleBlock(ctx, targetW, targetH, mode) {
      if (!ctx || snapTitleBlockMode === 'none') return;
      const uiScale = Math.max(targetW / 1200, 1.0);

      const rawName = pendingFileName || 'CAD_Model';
      const cleanName = rawName.length > 30 ? rawName.slice(0, 28) + '...' : rawName;
      const dateStr = new Date().toISOString().slice(0, 10);

      let dimStr = '';
      if (modelPhysicalProps && modelPhysicalProps.bbox) {
        const bb = modelPhysicalProps.bbox;
        const dx = currentUnit === 'mm' ? bb.x.toFixed(1) : (bb.x / 25.4).toFixed(2);
        const dy = currentUnit === 'mm' ? bb.y.toFixed(1) : (bb.y / 25.4).toFixed(2);
        const dz = currentUnit === 'mm' ? bb.z.toFixed(1) : (bb.z / 25.4).toFixed(2);
        dimStr = `${dx} × ${dy} × ${dz} ${currentUnit}`;
      } else {
        dimStr = 'Bounding: -';
      }

      const partCount = (typeof modelBodies !== 'undefined' && modelBodies && modelBodies.length > 0) ?
        `${modelBodies.length} Part${modelBodies.length > 1 ? 's' : ''}` : '1 Solid';
      const triNum = (modelPhysicalProps && modelPhysicalProps.triangles) ?
        Math.round(modelPhysicalProps.triangles).toLocaleString() : '0';

      // Material information if enabled
      let matLine = '';
      let activeMatName = '';
      let activeMatMass = '';
      if (snapExportIncludeMat && typeof modelBodies !== 'undefined' && modelBodies) {
        const matBody = modelBodies.find(b => b.materialPreset);
        if (matBody) {
          activeMatName = matBody.materialPreset;
          const volMm3 = matBody.data.volumeMm3 || 0;
          if (volMm3 > 0) {
            const massG = (volMm3 / 1000.0 * matBody.materialDensity).toFixed(1);
            activeMatMass = `${massG} g`;
            if (matBody.materialPreset === 'UV Resin') {
              matLine = `Material: ${matBody.materialPreset} (${matBody.materialDensity} g/cm³)  •  ${activeMatMass}`;
            } else {
              const filM = (volMm3 / 2405.28).toFixed(2);
              matLine = `Material: ${matBody.materialPreset} (${matBody.materialDensity} g/cm³)  •  Mass: ${activeMatMass}  •  Filament: ${filM} m`;
            }
          } else {
            matLine = `Material: ${matBody.materialPreset} (${matBody.materialDensity} g/cm³)`;
          }
        }
      }

      // Generate QR Code data
      let qr = null;
      const shouldDrawQR = (snapTitleBlockMode === 'badge') || (snapTitleBlockMode === 'full' && snapExportIncludeQR);
      if (shouldDrawQR) {
        try {
          const customNote = (document.getElementById('snap-qr-note')?.value || '').trim();
          let passportText = '';
          const matTag = activeMatName ? ` | Mat: ${activeMatName} (${activeMatMass})` : '';

          const formatTag = activeCadFormat === 'IGES' ? 'USAF IGES 5.3' : (activeCadFormat === 'BREP' ? 'OpenCASCADE B-Rep' : 'ISO 10303-21');
          if (customNote.startsWith('http://') || customNote.startsWith('https://')) {
            // Direct pure URL allows instant 1-tap browser pill popup on all phone cameras
            passportText = customNote;
          } else if (customNote.length > 0) {
            passportText = `CAD Passport: ${rawName}\nNote: ${customNote}\nDim: ${dimStr}\nBodies: ${partCount}${matTag}\n${formatTag} • QuickLook CAD`;
          } else {
            passportText = `CAD Passport: ${rawName}\nDim: ${dimStr}\nBodies: ${partCount}${matTag}\n${formatTag} • QuickLook CAD`;
          }
          qr = generateQRCode(passportText);
        } catch (e) {
          console.warn('QR Code generation skipped:', e);
        }
      }

      let bgCol, borderCol, titleCol, dimCol, badgeCol, barCol;
      if (mode === 'white') {
        bgCol = 'rgba(248, 250, 252, 0.96)';
        borderCol = '#cbd5e1';
        titleCol = '#0f172a';
        dimCol = '#475569';
        badgeCol = '#0284c7';
        barCol = '#0284c7';
      } else {
        bgCol = 'rgba(15, 23, 42, 0.90)';
        borderCol = 'rgba(56, 189, 248, 0.45)';
        titleCol = '#f8fafc';
        dimCol = '#94a3b8';
        badgeCol = '#38bdf8';
        barCol = '#38bdf8';
      }

      ctx.save();

      // Mode 1: QR Badge Only (Minimalist corner seal)
      if (snapTitleBlockMode === 'badge') {
        const badgeSize = Math.round(112 * uiScale);
        const pad = Math.round(24 * uiScale);
        const bx = targetW - badgeSize - pad;
        const by = targetH - badgeSize - pad;
        const r = Math.round(10 * uiScale);

        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = Math.round(14 * uiScale);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = Math.round(4 * uiScale);

        ctx.fillStyle = bgCol;
        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.lineTo(bx + badgeSize - r, by);
        ctx.quadraticCurveTo(bx + badgeSize, by, bx + badgeSize, by + r);
        ctx.lineTo(bx + badgeSize, by + badgeSize - r);
        ctx.quadraticCurveTo(bx + badgeSize, by + badgeSize, bx + badgeSize - r, by + badgeSize);
        ctx.lineTo(bx + r, by + badgeSize);
        ctx.quadraticCurveTo(bx, by + badgeSize, bx, by + badgeSize - r);
        ctx.lineTo(bx, by + r);
        ctx.quadraticCurveTo(bx, by, bx + r, by);
        ctx.closePath();
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.lineWidth = Math.max(1, Math.round(1.5 * uiScale));
        ctx.strokeStyle = borderCol;
        ctx.stroke();

        if (qr) {
          const qrSize = Math.round(82 * uiScale);
          const qx = bx + Math.round((badgeSize - qrSize) / 2);
          const qy = by + Math.round(8 * uiScale);
          drawQRCodeOnCanvas(ctx, qr, qx, qy, qrSize, '#0f172a', '#ffffff');

          ctx.fillStyle = badgeCol;
          ctx.font = `bold ${Math.round(8.5 * uiScale)}px system-ui, -apple-system, Segoe UI, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText('CAD PASSPORT', bx + Math.round(badgeSize / 2), qy + qrSize + Math.round(4 * uiScale));
        }

        ctx.restore();
        return;
      }

      // Mode 2: Full Title Block + Optional QR
      const hasQR = Boolean(qr && snapExportIncludeQR);
      const hasMat = Boolean(matLine);

      const boxW = Math.round((hasQR ? 470 : 370) * uiScale);
      const boxH = Math.round((hasMat ? 104 : 88) * uiScale);
      const pad = Math.round(24 * uiScale);
      const x0 = targetW - boxW - pad;
      const y0 = targetH - boxH - pad;
      const x1 = x0 + boxW;
      const y1 = y0 + boxH;
      const r = Math.round(10 * uiScale);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = Math.round(14 * uiScale);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.round(4 * uiScale);

      ctx.fillStyle = bgCol;
      ctx.beginPath();
      ctx.moveTo(x0 + r, y0);
      ctx.lineTo(x1 - r, y0);
      ctx.quadraticCurveTo(x1, y0, x1, y0 + r);
      ctx.lineTo(x1, y1 - r);
      ctx.quadraticCurveTo(x1, y1, x1 - r, y1);
      ctx.lineTo(x0 + r, y1);
      ctx.quadraticCurveTo(x0, y1, x0, y1 - r);
      ctx.lineTo(x0, y0 + r);
      ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
      ctx.closePath();
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.lineWidth = Math.max(1, Math.round(1.5 * uiScale));
      ctx.strokeStyle = borderCol;
      ctx.stroke();

      // Left vertical accent bar
      ctx.fillStyle = barCol;
      const barX = x0 + Math.round(12 * uiScale);
      const barY = y0 + Math.round(14 * uiScale);
      const barW = Math.round(3.5 * uiScale);
      const barH = boxH - Math.round(28 * uiScale);
      ctx.fillRect(barX, barY, barW, barH);

      const textX = x0 + Math.round(24 * uiScale);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';

      // Line 1: Model Name
      ctx.fillStyle = titleCol;
      ctx.font = `bold ${Math.round(13 * uiScale)}px system-ui, -apple-system, Segoe UI, sans-serif`;
      ctx.fillText(cleanName, textX, y0 + Math.round(13 * uiScale));

      // Line 2: Bounding Dimensions & Bodies
      const metaLine = `${dimStr}  •  ${partCount}  •  ${triNum} Tri`;
      ctx.fillStyle = dimCol;
      ctx.font = `${Math.round(10 * uiScale)}px system-ui, -apple-system, Segoe UI, sans-serif`;
      ctx.fillText(metaLine, textX, y0 + Math.round(34 * uiScale));

      let curY = y0 + Math.round(52 * uiScale);

      // Line 3: Material & Mass (if active)
      if (hasMat) {
        ctx.fillStyle = badgeCol;
        ctx.font = `600 ${Math.round(9.5 * uiScale)}px system-ui, -apple-system, Segoe UI, sans-serif`;
        ctx.fillText(matLine, textX, curY);
        curY += Math.round(18 * uiScale);
      }

      // Line 4: Standard, Date & Branding
      const formatTag = activeCadFormat === 'IGES' ? 'USAF IGES 5.3' : (activeCadFormat === 'BREP' ? 'OpenCASCADE B-Rep' : 'ISO 10303-21');
      const specLine = `${formatTag}  •  ${dateStr}  •  QuickLook CAD`;
      ctx.fillStyle = hasMat ? dimCol : badgeCol;
      ctx.font = `600 ${Math.round(9 * uiScale)}px system-ui, -apple-system, Segoe UI, sans-serif`;
      ctx.fillText(specLine, textX, curY);

      // Right column: QR Code box
      if (hasQR) {
        const qrSize = Math.round(72 * uiScale);
        const qx = x1 - qrSize - Math.round(14 * uiScale);
        const qy = y0 + Math.round((boxH - qrSize) / 2) - (uiScale > 1.2 ? 4 : 0);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(qx, qy, qrSize, qrSize);
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = Math.max(1, Math.round(1 * uiScale));
        ctx.strokeRect(qx, qy, qrSize, qrSize);

        drawQRCodeOnCanvas(ctx, qr, qx, qy, qrSize, '#0f172a', '#ffffff');

        ctx.fillStyle = badgeCol;
        ctx.font = `bold ${Math.round(7.5 * uiScale)}px system-ui, -apple-system, Segoe UI, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('SCAN SPECS', qx + Math.round(qrSize / 2), qy + qrSize + Math.round(2 * uiScale));
      }

      ctx.restore();
    }

    async function executeEngineeringExport(destination = 'clipboard', targetPath = '') {
      const copyLabel = document.getElementById('snap-copy-label');
      const origCopyText = copyLabel ? copyLabel.innerText : 'Copy Image';
      if (destination === 'clipboard' && copyLabel) {
        copyLabel.innerText = 'Rendering...';
      }

      await new Promise(r => setTimeout(r, 20));

      try {
        const baseW = window.innerWidth;
        const baseH = window.innerHeight;
        let targetW = Math.round(baseW * snapExportScale);
        let targetH = Math.round(baseH * snapExportScale);

        // Cap to 4096 to prevent WebGL buffer overflow
        if (targetW > 4096 || targetH > 4096) {
          const maxDim = Math.max(targetW, targetH);
          const ratio = 4096 / maxDim;
          targetW = Math.round(targetW * ratio);
          targetH = Math.round(targetH * ratio);
        }

        // 1. Backup state
        const prevBg = scene.background;
        const prevGrid = gridHelper ? gridHelper.visible : false;
        const prevSnap = snapIndicator ? snapIndicator.visible : false;
        const prevHover = hoverEdgeMesh ? hoverEdgeMesh.visible : false;
        const prevMeasureVisible = measureGroup ? measureGroup.visible : false;
        const prevShadowVisible = contactShadowMesh ? contactShadowMesh.visible : false;
        const prevShadowOpacity = contactShadowMaterial ? contactShadowMaterial.opacity : 0.45;
        const prevClearColor = new THREE.Color();
        renderer.getClearColor(prevClearColor);
        const prevClearAlpha = renderer.getClearAlpha();

        // 2. Configure scene for clean engineering shot
        if (gridHelper) gridHelper.visible = false;
        if (snapIndicator) snapIndicator.visible = false;
        if (hoverEdgeMesh) hoverEdgeMesh.visible = false;
        if (measureGroup) {
          measureGroup.visible = snapExportIncludeDims;
        }

        if (contactShadowMesh && contactShadowMaterial) {
          if (!snapExportIncludeShadow || snapExportMode === 'transparent') {
            contactShadowMesh.visible = false;
          } else {
            contactShadowMesh.visible = true;
            if (snapExportMode === 'white') {
              contactShadowMaterial.opacity = 0.28;
            } else if (snapExportMode === 'dark') {
              contactShadowMaterial.opacity = 0.65;
            } else {
              contactShadowMaterial.opacity = 0.38;
            }
          }
        }

        if (snapExportMode === 'transparent') {
          scene.background = null;
          renderer.setClearColor(0x000000, 0);
        } else if (snapExportMode === 'white') {
          scene.background = new THREE.Color(0xffffff);
          renderer.setClearColor(0xffffff, 1);
        } else {
          scene.background = new THREE.Color(0x181a20);
          renderer.setClearColor(0x181a20, 1);
        }

        // 3. Render off-screen supersampled frame
        renderer.setPixelRatio(1);
        renderer.setSize(targetW, targetH, false);
        camera.aspect = targetW / targetH;
        camera.updateProjectionMatrix();

        if (typeof updateScreenSpaceAnnotations === 'function' && snapExportIncludeDims) {
          updateScreenSpaceAnnotations();
        }

        renderer.render(scene, camera);

        // 4. Composite onto 2D canvas with title block
        const compCanvas = document.createElement('canvas');
        compCanvas.width = targetW;
        compCanvas.height = targetH;
        const ctx = compCanvas.getContext('2d');

        ctx.drawImage(renderer.domElement, 0, 0, targetW, targetH);

        if (snapTitleBlockMode !== 'none') {
          drawEngineeringTitleBlock(ctx, targetW, targetH, snapExportMode);
        }

        // 5. Restore scene & viewport immediately
        scene.background = prevBg;
        renderer.setClearColor(prevClearColor, prevClearAlpha);
        if (gridHelper) gridHelper.visible = prevGrid;
        if (snapIndicator) snapIndicator.visible = prevSnap;
        if (hoverEdgeMesh) hoverEdgeMesh.visible = prevHover;
        if (measureGroup) measureGroup.visible = prevMeasureVisible;
        if (contactShadowMesh && contactShadowMaterial) {
          contactShadowMesh.visible = prevShadowVisible;
          contactShadowMaterial.opacity = prevShadowOpacity;
        }

        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        if (typeof updateScreenSpaceAnnotations === 'function') {
          updateScreenSpaceAnnotations();
        }
        renderer.render(scene, camera);

        // 6. Output destination
        const baseName = (pendingFileName || 'CAD_Model').replace(/\.[^/.]+$/, "");
        const dateStr = new Date().toISOString().slice(0, 10);
        const defaultName = `${baseName}_${snapExportMode}_${targetW}x${targetH}_${dateStr}.png`;
        const dataUrl = compCanvas.toDataURL('image/png');

        if (destination === 'clipboard') {
          // Send to C# host for native Windows Clipboard copy
          if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage({
              type: 'COPY_SNAPSHOT_CLIPBOARD',
              action: 'COPY_SNAPSHOT_CLIPBOARD',
              data: dataUrl
            });
          }

          // Also execute browser clipboard write
          compCanvas.toBlob(blob => {
            if (blob && navigator.clipboard && navigator.clipboard.write) {
              navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {});
            }
          }, 'image/png');

          showToast(`Copied ${targetW}×${targetH} CAD Export to Clipboard ✓`);
          if (copyLabel) copyLabel.innerText = 'Copied! ✓';
          setTimeout(() => {
            if (copyLabel) copyLabel.innerText = origCopyText;
          }, 1800);
        } else if (destination === 'test' || destination === 'memory') {
          // In-memory or automated test run - return dataUrl immediately without modal dialog
        } else {
          // File destination
          if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage({
              type: 'SAVE_SNAPSHOT',
              action: 'SAVE_SNAPSHOT',
              data: dataUrl,
              defaultName: defaultName,
              targetPath: targetPath || ''
            });
          } else {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = defaultName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showToast('Saved: ' + defaultName);
          }
        }
        return dataUrl;
      } catch (err) {
        console.error('Snapshot export error:', err);
        showToast('Export error: ' + err.message);
        if (copyLabel) copyLabel.innerText = origCopyText;
      }
    }
    window.executeEngineeringExport = executeEngineeringExport;
    window.toggleSnapshotModal = toggleSnapshotModal;
    window.initSnapshotSystem = initSnapshotSystem;

    function toggleUnits() {
      currentUnit = (currentUnit === 'mm') ? 'in' : 'mm';
      const btn = document.getElementById('btn-units');
      if (btn) {
        const span = btn.querySelector('span');
        if (span) {
          span.innerText = currentUnit;
          span.style.color = currentUnit === 'mm' ? '#38bdf8' : '#f59e0b';
        }
      }
      updateBoundingBoxBadge();
      updatePhysicalPropertiesCard();
      if (selectedCadEntities.length > 0) {
        const ents = [...selectedCadEntities];
        clearMeasurement(false);
        ents.forEach(e => handleUnifiedClick(e));
      }
      if (isSectionActive) {
        updateSectionPlane();
      }
    }

    // =============================================================

// Snapshot Event Listeners
function setupSnapshotListeners() {
      // =============================================================
      // Engineering Snapshot & High-DPI CAD Export Engine
      // =============================================================
      // Note: #btn-snapshot toolbar click is managed centrally by WorkbenchUI

      const btnCloseSnap = document.getElementById('btn-close-snapshot');
      if (btnCloseSnap) {
        btnCloseSnap.addEventListener('click', () => {
          if (window.WorkbenchUI?.closeDrawer) window.WorkbenchUI.closeDrawer();
          else toggleSnapshotModal(false);
        });
      }

      // Mode Selector buttons
      document.querySelectorAll('.snap-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-mode');
          if (mode) {
            snapExportMode = mode;
            try { localStorage.setItem('stepviewer_snap_mode', mode); } catch (e) {}
            updateSnapshotUIFromState();
          }
        });
      });

      // Resolution buttons
      document.querySelectorAll('.snap-res-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const sc = parseInt(btn.getAttribute('data-scale'), 10);
          if (sc) {
            snapExportScale = sc;
            try { localStorage.setItem('stepviewer_snap_scale', sc.toString()); } catch (e) {}
            updateSnapshotUIFromState();
          }
        });
      });

      // Camera Angle Quick Framing buttons
      document.querySelectorAll('.snap-angle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const angle = btn.getAttribute('data-angle');
          const viewId = 'btn-view-' + angle;
          if (viewActions[viewId]) {
            viewActions[viewId](false);

            document.querySelectorAll('.snap-angle-btn').forEach(b => {
              b.classList.toggle('active', b === btn);
            });

            Object.keys(viewActions).forEach(id => {
              const b = document.getElementById(id);
              if (b) {
                b.classList.toggle('active', id === viewId);
                viewStates[id] = 0;
              }
            });
            setBtnLabel('btn-view-top', 'Top');
            setBtnLabel('btn-view-front', 'Front');
            setBtnLabel('btn-view-right', 'Right');
            setBtnLabel('btn-view-iso', 'Iso');
          }
        });
      });

      // Title Block & QR Mode buttons
      document.querySelectorAll('.snap-tb-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const tb = btn.getAttribute('data-tb');
          if (tb) {
            snapTitleBlockMode = tb;
            try { localStorage.setItem('stepviewer_snap_tb', tb); } catch (e) {}
            updateSnapshotUIFromState();
          }
        });
      });

      // Overlay toggles
      const optQR = document.getElementById('snap-opt-qr');
      if (optQR) {
        optQR.addEventListener('change', () => {
          snapExportIncludeQR = optQR.checked;
          try { localStorage.setItem('stepviewer_snap_qr', optQR.checked.toString()); } catch (e) {}
          updateSnapshotUIFromState();
        });
      }

      const optMat = document.getElementById('snap-opt-mat');
      if (optMat) {
        optMat.addEventListener('change', () => {
          snapExportIncludeMat = optMat.checked;
          try { localStorage.setItem('stepviewer_snap_mat', optMat.checked.toString()); } catch (e) {}
        });
      }

      const optShadow = document.getElementById('snap-opt-shadow');
      if (optShadow) {
        optShadow.addEventListener('change', () => {
          snapExportIncludeShadow = optShadow.checked;
          try { localStorage.setItem('stepviewer_snap_shadow', optShadow.checked.toString()); } catch (e) {}
          if (contactShadowMesh) {
            contactShadowMesh.visible = snapExportIncludeShadow;
          }
        });
      }

      const optDims = document.getElementById('snap-opt-dims');
      if (optDims) {
        optDims.addEventListener('change', () => {
          snapExportIncludeDims = optDims.checked;
          try { localStorage.setItem('stepviewer_snap_dims', optDims.checked.toString()); } catch (e) {}
        });
      }

      // Custom QR Note / URL Input
      const qrNoteInput = document.getElementById('snap-qr-note');
      if (qrNoteInput) {
        try {
          const savedNote = localStorage.getItem('stepviewer_snap_note');
          if (savedNote) qrNoteInput.value = savedNote;
        } catch (e) {}
        qrNoteInput.addEventListener('input', () => {
          try { localStorage.setItem('stepviewer_snap_note', qrNoteInput.value); } catch (e) {}
        });
      }

      // Export Actions
      const btnSnapCopy = document.getElementById('snap-btn-copy');
      if (btnSnapCopy) {
        btnSnapCopy.addEventListener('click', () => {
          executeEngineeringExport('clipboard');
        });
      }

      const btnSnapSave = document.getElementById('snap-btn-save');
      if (btnSnapSave) {
        btnSnapSave.addEventListener('click', () => {
          executeEngineeringExport('file');
        });
      }

      initSnapshotSystem();
}

// Window exports
window.drawEngineeringTitleBlock = drawEngineeringTitleBlock;
window.executeEngineeringExport = executeEngineeringExport;
window.toggleSnapshotPanel = toggleSnapshotModal;
window.toggleSnapshotModal = toggleSnapshotModal;
window.setupSnapshotListeners = setupSnapshotListeners;

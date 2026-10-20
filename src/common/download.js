/* Local download helper. Blob URL + anchor, no chrome.downloads permission needed. */
(function () {
  'use strict';

  const AICE = (window.AICE = window.AICE || {});

  AICE.downloadFile = function (content, filename, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  };
})();

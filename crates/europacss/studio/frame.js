'use strict';

const EuropaFrame = (() => {
  const byId = id => document.getElementById(id);
  const image = byId('frame-image'), page = byId('frame-page');
  const view = byId('frame-view'), stage = byId('frame-stage');
  let width = 1440;

  function layout(designWidth = width) {
    width = designWidth;
    const height = image.naturalWidth ? width * image.naturalHeight / image.naturalWidth : 900;
    const scale = Math.min(1, view.clientWidth / width);
    stage.style.width = width + 'px';
    stage.style.height = height + 'px';
    stage.style.transform = 'scale(' + scale + ')';
    view.style.height = height * scale + 'px';
  }

  byId('frame-form').addEventListener('submit', event => {
    event.preventDefault();
    const url = new URL(byId('frame-url').value);
    if (!['https:', 'http:'].includes(url.protocol)) {
      byId('frame-status').textContent = 'Enter an HTTP or HTTPS page URL.';
      return;
    }
    page.src = url.href;
    byId('frame-status').textContent = 'If the site blocks embedding, use europa compare with the same frame.';
  });
  byId('frame-file').addEventListener('change', event => {
    if (image.src) URL.revokeObjectURL(image.src);
    image.hidden = true;
    const file = event.target.files[0];
    if (file) image.src = URL.createObjectURL(file);
    else image.removeAttribute('src');
  });
  image.addEventListener('load', () => {
    image.hidden = false;
    byId('frame-status').textContent = 'Frame loaded at ' + width + ' CSS pixels wide.';
    layout();
  });
  image.addEventListener('error', () => { byId('frame-status').textContent = 'Could not read the design image.'; });
  byId('frame-opacity').addEventListener('input', event => {
    image.style.opacity = event.target.value / 100;
    byId('frame-percent').textContent = event.target.value + '%';
  });
  byId('frame-difference').addEventListener('change', event => {
    image.style.mixBlendMode = event.target.checked ? 'difference' : 'normal';
  });
  new ResizeObserver(() => { if (view.clientWidth) layout(); }).observe(view);
  return {layout};
})();

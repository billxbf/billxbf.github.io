(() => {
  const wrap = document.querySelector('.hero-photo-wrap');
  if (!wrap) return;

  const PALETTE = { K: '#2e2118', B: '#6b4a2f', D: '#4e3523', T: '#a47b4f', W: '#f3ece0', G: '#8fbf4a', H: '#ffffff', P: '#e59a9a', R: '#efb0a1' };
  const WALK_0 = [
    '.KK.......................',
    'KBBK......................',
    'KBDBK..........K.......K..',
    'KBBDK.........KBK.....KBK.',
    'KBDBK.........KBTKKKKKTBK.',
    '.KBBK..KKKKKKKKBDTDTDTDBK.',
    '..KBBKKBBDBBDBKTTTTTTTTTK.',
    '..KBBBBDBBDBBDKTHKTTTHKTK.',
    '...KBDBBDBBDBBKTKGTTTKGTK.',
    '...KBBDBBDBBDBKRTTWPWTTRK.',
    '..KBDBBDBBDBBDBKTTWWWTTK..',
    '..KBBBBBBBBBBBBBKKKKKKKK..',
    '..KBBBBBBBBBBBBBBTWWWTBK..',
    '..KTBBTBBTBBTBBTBBTWTBK...',
    '..KTTTTTTTTTTTTTTBBTBK....',
    '.KTTKTTKTTKTTKTTKTTKK.....',
    '..KKKKKKKKKKKKKKKKKK......',
  ];
  const WALK_1 = [
    '..........................',
    '..KK......................',
    '.KBBK.....................',
    'KBDBK...........K.......K.',
    'KBBDK..........KBK.....KBK',
    'KBDBK..KKKKKKKKKBTKKKKKTBK',
    '.KBBKKKBBDBBDBBKBDTDTDTDBK',
    '..KBBBBDBBDBBDBKTTTTTTTTTK',
    '..KBBDBBDBBDBBDKTHKTTTHKTK',
    '...KBBDBBDBBDBBKTKGTTTKGTK',
    '..KBDBBDBBDBBDBKRTTWPWTTRK',
    '..KBBBBBBBBBBBBBKTTWWWTTK.',
    '..KBBBBBBBBBBBBBBKKKKKKKK.',
    '..KTBBTBBTBBTBBTBBBTWTBK..',
    '..KTTTTTTTTTTTTTTBBBTBK...',
    '.KTKTTKTTKTTKTTKTTKTTK....',
    '..KKKKKKKKKKKKKKKKKKK.....',
  ];
  const SIT = [
    '..............K.......K...',
    '.............KBK.....KBK..',
    '.............KBTKKKKKTBK..',
    '.............KBDTDTDTDBK..',
    '.............KTTTTTTTTTK..',
    '.............KTHKTTTHKTK..',
    '.............KTKGTTTKGTK..',
    '..........KKKKRTTWPWTTRK..',
    '..KK....KKBDBBKTTWWWTTK...',
    '.KBBK..KBDBBDBKBKKKKKKK...',
    '.KBDK.KBDBBDBBKBTWWWTBK...',
    '.KBBKKBBDBBDBBKBBTWTBBK...',
    '.KBDKKBDBBDBBDKBDBTBDBK...',
    '.KBBKBBBBBBBBBKBBBBBBBK...',
    '..KBKBBBBBBBBBKBBKBKBBK...',
    '....KTKTTKTTKTKWWKBKWWK...',
    '....KKKKKKKKKKKKKKKKKKK...',
  ];
  const FRONT = [
    '........K.......K.........',
    '.......KBK.....KBK........',
    '.......KBTKKKKKTBK........',
    '.......KBDTDTDTDBK........',
    '.......KTTTTTTTTTK........',
    '.......KTHKTTTHKTK........',
    '.......KTKGTTTKGTK........',
    '.......KRTTWPWTTRK........',
    '........KTTWWWTTK.........',
    '........KKKKKKKKK.........',
    '.......KBBBTWTBBBK..KK....',
    '......KBDBBTWTBBDBK.BBK...',
    '......KBBDBBTBBDBBK.DBK...',
    '.....KBDBBBKBKBBBDBKDBK...',
    '.....KBBBBKBBBKBBBBKBBK...',
    '.....KTTBBKWKWKBBTTKBK....',
    '.....KKKKKKKKKKKKKKK......',
  ];
  const BLINK = SIT.map((r, i) => ({ 5: '.............KTTTTTTTTTK..', 6: '.............KTKKTTTKKTK..' })[i] ?? r);
  const SPRITES = { walk0: WALK_0, walk1: WALK_1, sit: SIT, blink: BLINK, front: FRONT };

  const SCALE = 3, W = SIT[0].length, H = SIT.length, SPEED = 18;
  const cat = document.createElement('div');
  cat.className = 'kobu';
  cat.title = 'Kobu';
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.width = `${W * SCALE}px`; canvas.style.height = `${H * SCALE}px`;
  const bubble = document.createElement('span');
  bubble.className = 'kobu-bubble';
  cat.append(bubble, canvas);
  wrap.append(cat);

  const ctx = canvas.getContext('2d');
  let shown;
  const show = name => {
    if (name === shown) return;
    shown = name;
    ctx.clearRect(0, 0, W, H);
    SPRITES[name].forEach((row, y) => [...row].forEach((c, x) => {
      if (PALETTE[c]) { ctx.fillStyle = PALETTE[c]; ctx.fillRect(x, y, 1, 1); }
    }));
  };
  const face = dir => { facing = dir; canvas.style.transform = dir < 0 ? 'scaleX(-1)' : ''; };

  // walk -> sit (4-7s) -> [front 0.24s -> flip -> sit 2s, if the target is behind] -> walk
  const maxX = () => wrap.clientWidth - W * SCALE;
  let x = Math.random() * maxX(), target = x, facing = 1, state = 'sit', timer = 1, walkT = 0, blinkT = 2, last = performance.now();

  const pickTarget = () => {
    do target = Math.random() * maxX(); while (Math.abs(target - x) < maxX() / 3);
    if (Math.sign(target - x) === facing) { state = 'walk'; return; }
    state = 'turn'; timer = 0.24; show('front');
  };

  const tick = now => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const m = maxX();  // layout can change after load (late CSS, viewport resize, rotation)
    x = Math.min(Math.max(x, 0), m); target = Math.min(Math.max(target, 0), m);
    if (state === 'walk') {
      const d = target - x, step = SPEED * dt;
      if (Math.abs(d) <= step) { x = target; state = 'sit'; timer = 4 + Math.random() * 3; }
      else {
        x += Math.sign(d) * step;
        if ((walkT += dt) > 0.7) walkT = 0;
        show(walkT > 0.35 ? 'walk1' : 'walk0');
      }
    } else if (state === 'turn') {
      if ((timer -= dt) <= 0) { face(-facing); state = 'turned'; timer = 2; }
    } else {
      blinkT -= dt;
      show(blinkT < 0.15 ? 'blink' : 'sit');
      if (blinkT < 0) blinkT = 2 + Math.random() * 3;
      if ((timer -= dt) <= 0) { if (state === 'turned') state = 'walk'; else pickTarget(); }
    }
    cat.style.left = `${x}px`;
    requestAnimationFrame(tick);
  };

  let clicks = 0, hideTimer;
  cat.addEventListener('click', () => {
    clicks++;
    bubble.textContent = clicks < 3 ? 'meow?' : clicks === 3 ? 'stop it!' : 'meow~';
    bubble.classList.add('show');
    if (state === 'walk') { state = 'sit'; timer = 2; }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => bubble.classList.remove('show'), 1400);
  });

  show('sit');
  requestAnimationFrame(tick);
})();

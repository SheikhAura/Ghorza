const $ = (id) => document.getElementById(id);

const hexOf = (c) => '#' + c.toString(16).padStart(6, '0');

/* =========================================================
   واجهة اللعبة (DOM)
   ========================================================= */
export class UI {
  constructor(game) {
    this.game = game;
    this.el = {
      loading: $('loading'),
      menu: $('menu'),
      hud: $('hud'),
      pause: $('pause'),
      results: $('results'),
      howto: $('howto'),
      best: $('best-val'),
      carList: $('car-list'),
      carStats: $('car-stats'),
      diffList: $('diff-list'),
      timeList: $('time-list'),
      optList: $('opt-list'),
      pauseOpt: $('pause-opt-list'),
      touch: $('touch'),
      dist: $('dist-val'),
      score: $('score-val'),
      pass: $('pass-val'),
      dmgFill: $('dmg-fill'),
      dmgLabel: $('dmg-label'),
      crash: $('crash-val'),
      speed: $('speed-val'),
      arc: $('speed-arc'),
      toast: $('toast'),
      warning: $('warning'),
      recover: $('btn-recover'),
      garage: $('garage'),
      garageCash: $('garage-cash'),
      garageDmg: $('garage-dmg'),
      garageGlass: $('garage-glass'),
      garageTop: $('garage-top'),
      garageItems: $('garage-items'),
      cash: $('cash-val'),
    };
    this.toastTimer = 0;
    this._bindStatic();
  }

  _bindStatic() {
    $('btn-start').onclick = () => this.game.startRun();
    $('btn-how').onclick = () => this.show('howto');
    $('btn-how-close').onclick = () => this.hide('howto');
    $('btn-pause').onclick = () => this.game.pause();
    $('btn-resume').onclick = () => this.game.resume();
    $('btn-restart').onclick = () => this.game.startRun();
    $('btn-quit').onclick = () => this.game.toMenu();
    $('btn-again').onclick = () => this.game.startRun();
    $('btn-home').onclick = () => this.game.toMenu();
    this.el.recover.onclick = () => this.game.recover();
    $('btn-garage-close').onclick = () => this.game.closeGarage();

    // أزرار اللمس
    document.querySelectorAll('#touch .tbtn[data-act]').forEach((b) => {
      const act = b.dataset.act;
      const down = (e) => {
        e.preventDefault();
        b.classList.add('on');
        this.game.input.touch[act] = true;
        if (act === 'horn') this.game.audio.horn(true);
      };
      const up = (e) => {
        if (e) e.preventDefault();
        b.classList.remove('on');
        this.game.input.touch[act] = false;
        if (act === 'horn') this.game.audio.horn(false);
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    });
  }

  show(name) {
    const map = { menu: 'menu', hud: 'hud', pause: 'pause', results: 'results', howto: 'howto', garage: 'garage' };
    Object.entries(map).forEach(([k, id]) => {
      this.el[k].classList.toggle('hidden', k !== name);
    });
    if (name === 'hud') this.el.hud.classList.remove('hidden');
  }

  hide(name) {
    this.el[name].classList.add('hidden');
  }

  hideLoading() { this.el.loading.classList.add('hidden'); }

  /* ---------- ورشة الصيانة ---------- */
  renderGarage({ cash, damage, glass, topSpeed, items }) {
    this.el.garageCash.textContent = Math.round(cash);
    this.el.garageDmg.textContent = damage < 1 ? 'تمام ✨' : `${Math.round(damage)}%`;
    this.el.garageDmg.style.color = damage > 60 ? 'var(--red)' : damage > 25 ? 'var(--amber)' : 'var(--green)';
    this.el.garageGlass.textContent = glass ? 'مكسور 💥' : 'سليم ✅';
    this.el.garageGlass.style.color = glass ? 'var(--red)' : 'var(--green)';
    this.el.garageTop.textContent = `${Math.round(topSpeed)} كم/س`;

    this.el.garageItems.innerHTML = '';
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'g-item';
      const lvl = it.level !== undefined
        ? `<div class="g-lvl">${[0, 1, 2].map((i) => `<i class="${i < it.level ? 'on' : ''}"></i>`).join('')}</div>`
        : '';
      const disabled = it.price === null || it.price > cash;
      const label = it.max ? 'أقصى حاجة' : it.price === null ? 'مش محتاج' : `${Math.round(it.price)} جنيه`;
      row.innerHTML = `
        <div class="g-icon">${it.icon}</div>
        <div class="g-txt"><b>${it.title}</b><span>${it.desc}</span>${lvl}</div>
        <button class="g-buy${it.max ? ' max' : ''}" ${disabled ? 'disabled' : ''}>${label}</button>`;
      const btn = row.querySelector('button');
      if (!disabled) btn.onclick = () => this.game.buyGarageItem(it.id);
      this.el.garageItems.appendChild(row);
    }
    this.show('garage');
  }

  updateCash(cash) {
    if (this.el.cash) this.el.cash.textContent = Math.round(cash);
  }

  /* ---------- المنيو ---------- */
  buildMenu({ defs, selectedCar, difficulty, night, sound, camera, shadows }) {
    // كروت العربيات
    this.el.carList.innerHTML = '';
    Object.entries(defs).forEach(([id, def]) => {
      const card = document.createElement('button');
      card.className = 'car-card' + (id === selectedCar ? ' active' : '');
      card.innerHTML = `<div class="swatch" style="background:${hexOf(def.color)}"></div>
        <div class="nm">${def.name}</div>`;
      card.onclick = () => this.game.selectCar(id);
      card.dataset.id = id;
      this.el.carList.appendChild(card);
    });
    this.renderStats(defs[selectedCar]);

    // صعوبة
    const diffs = ['هادي', 'زحمة', 'مدعكة'];
    this.el.diffList.innerHTML = diffs.map((d, i) =>
      `<button class="chip${i === difficulty ? ' active' : ''}" data-diff="${i}">${d}</button>`).join('');
    this.el.diffList.querySelectorAll('[data-diff]').forEach((b) => {
      b.onclick = () => this.game.setDifficulty(+b.dataset.diff);
    });

    // وقت
    const times = ['نهار', 'ليل'];
    this.el.timeList.innerHTML = times.map((t, i) =>
      `<button class="chip${(i === 1) === night ? ' active' : ''}" data-time="${i}">${t}</button>`).join('');
    this.el.timeList.querySelectorAll('[data-time]').forEach((b) => {
      b.onclick = () => this.game.setNight(b.dataset.time === '1');
    });

    // إعدادات
    this.renderOptions();
  }

  renderOptions() {
    const g = this.game;
    const cams = [['قريبة', 'near'], ['عادية', 'normal'], ['بعيدة', 'far'], ['من جوه', 'hood']];
    const html = `
      <button class="chip${g.soundOn ? ' active' : ''}" data-opt="sound">${g.soundOn ? '🔊 الصوت شغال' : '🔇 الصوت مقفول'}</button>
      <button class="chip${g.shadows ? ' active' : ''}" data-opt="shadow">${g.shadows ? '✨ جودة عالية' : '🍃 جودة خفيفة'}</button>
      ${cams.map(([label, key]) => `<button class="chip${g.cameraMode === key ? ' active' : ''}" data-cam="${key}">📷 ${label}</button>`).join('')}
    `;
    this.el.optList.innerHTML = html;
    this.el.pauseOpt.innerHTML = html;
    for (const list of [this.el.optList, this.el.pauseOpt]) {
      list.querySelectorAll('[data-opt]').forEach((b) => { b.onclick = () => g.toggleOption(b.dataset.opt); });
      list.querySelectorAll('[data-cam]').forEach((b) => { b.onclick = () => g.setCamera(b.dataset.cam); });
    }
  }

  renderStats(def) {
    if (!def) return;
    const p = def.perf;
    const bar = (label, v) => `<div class="stat"><span>${label}</span>
      <div class="track"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></div></div>`;
    this.el.carStats.innerHTML =
      bar('سرعة', p.top / 240) + bar('سحب', p.power / 1.5) + bar('تحكم', p.grip / 1.25) +
      `<div class="stat"><span>الوزن</span><b style="color:#fff">${p.mass} كجم</b></div>`;
  }

  /** v بالمتر — بنعرضها بالكيلومتر */
  setBest(v) { this.el.best.textContent = (v / 1000).toFixed(2); }

  /* ---------- HUD ---------- */
  updateHUD(s) {
    this.el.dist.textContent = s.dist.toFixed(2);
    this.el.score.textContent = s.score;
    this.el.pass.textContent = s.passes;
    this.el.crash.textContent = s.crashes;
    this.el.speed.textContent = Math.round(s.speed);
    this.el.arc.style.strokeDashoffset = String(327 - 327 * Math.min(1, s.speed / 220));
    const dmg = s.damage;
    this.el.dmgFill.style.width = Math.max(0, 100 - dmg) + '%';
    this.el.dmgLabel.textContent = dmg < 15 ? 'تمام' : dmg < 40 ? 'متخبطش' : dmg < 70 ? 'متعور' : dmg < 95 ? 'هتقع' : 'خربانة';
    this.el.dmgLabel.style.color = dmg < 40 ? '#39d98a' : dmg < 75 ? '#ffb43c' : '#ff5566';
  }

  toast(text, ms = 1200) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), ms);
  }

  warning(text) {
    if (!text) { this.el.warning.classList.add('hidden'); return; }
    this.el.warning.textContent = text;
    this.el.warning.classList.remove('hidden');
  }

  setRecoverVisible(v) { this.el.recover.classList.toggle('hidden', !v); }

  showResults({ distance, time, topSpeed, crashes, passes, score, wrecked }) {
    $('res-title').textContent = wrecked ? 'العربية باظت 😵' : 'وصلت!';
    $('res-dist').textContent = distance.toFixed(2) + ' كم';
    $('res-time').textContent = time;
    $('res-top').textContent = Math.round(topSpeed) + ' كم/س';
    $('res-crash').textContent = crashes;
    $('res-pass').textContent = passes;
    $('res-score').textContent = score;
    this.show('results');
  }

  showTouch(show) { this.el.touch.classList.toggle('hidden', !show); }
}

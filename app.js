/* لعبة المافيا - إعادة بناء ويب أوفلاين مستوحاة من بنية ونصوص APK المرفوع */
(() => {
  'use strict';
  const STORAGE_KEY = 'mafia-pass-play-state-v1';
  const ROLE_INFO = {
    godfather: { name: 'شيخ المافيا', icon: '♛', team: 'mafia', desc: 'قائد المافيا. يختار هدف الاغتيال الليلي من فريق الصالحين بالتنسيق مع العصابة.', short: 'يحدد هدف المافيا كل ليلة.' },
    mafia: { name: 'عضو مافيا', icon: '♟', team: 'mafia', desc: 'عضو في المافيا يتآمر مع باقي العصابة، ويشارك في كتابة الرسائل السرية وتضليل المواطنين.', short: 'يعرف شركاءه ويتواصل معهم سراً.' },
    silencer: { name: 'مافيا التسكيت', icon: '◈', team: 'mafia', desc: 'عضو مافيا يختار لاعباً في الليل لتسكـيته. لا يستطيع ذلك اللاعب النقاش أو الدفاع عن نفسه في النهار التالي، لكنه يستطيع التصويت وتنفيذ مهمته.', short: 'يسكت لاعباً واحداً في اليوم التالي.' },
    mayor: { name: 'عمدة الصالحين', icon: '⚖', team: 'town', desc: 'قائد الصالحين السري. إذا صوّت اللاعبون لإقصائه تنكشف هويته ولا يخرج، ويُعاد التصويت ويصبح صوته بصوتين.', short: 'لا يُقصى بالتصويت، وبعد كشفه صوته بصوتين.' },
    doctor: { name: 'إسعاف الصالحين (الطبيب)', icon: '✚', team: 'town', desc: 'يستطيع حماية شخص واحد كل ليلة، بما في ذلك نفسه، من استهداف المافيا.', short: 'يحمي لاعباً واحداً كل ليلة.' },
    detective: { name: 'المحقق الصالح', icon: '⌕', team: 'town', desc: 'يستيقظ كل ليلة ليتحقق من هوية شخص واحد، ويعرف سراً إن كان من الصالحين أم المافيا.', short: 'يكشف انتماء لاعب واحد كل ليلة.' },
    goodboy: { name: 'الولد الصالح', icon: '✦', team: 'town', desc: 'مواطن شجاع. إذا صوّت اللاعبون لإقصائه، يختار فوراً لاعباً آخر ليخرج معه من اللعبة.', short: 'ينتقم باختيار لاعب عند إقصائه نهاراً.' },
    guardian: { name: 'حارس الصالحين', icon: '⛨', team: 'town', desc: 'يمتلك قدرة حماية إضافية واحدة طوال المباراة. يمكنك استخدامها في ليلة تختارها لحماية لاعب، أو الاحتفاظ بها لجولة لاحقة.', short: 'حماية إضافية واحدة طوال المباراة.' },
    citizen: { name: 'مواطن صالح', icon: '●', team: 'town', desc: 'مواطن بريء لا يملك قدرة ليلية خاصة. قوته فطنته في النقاش والتحليل والتصويت بالنهار.', short: 'حلّل وناقش وصوّت لاكتشاف المافيا.' }
  };
  const ROLE_ORDER = ['godfather','mafia','silencer','doctor','detective','mayor','goodboy','guardian'];
  const app = document.getElementById('app');
  let game = defaultState();
  let resumeAvailable = false;
  let toastTimer = null;

  function defaultState() {
    return {
      phase: 'home', round: 0, settings: { playerCount: 8, names: [] }, roleCounts: autoRoles(8), players: [],
      revealed: false, revealIndex: 0, firstIndex: 0, nightIndex: 0, dayIndex: 0, voterIndex: 0, changeIndex: 0,
      votes: {}, tieOnly: null, accusedId: null, mayorRevealed: false, guardianSpent: false,
      nightAction: {}, nightReport: [], silencedToday: null, mafiaMessages: [], gameLog: [],
      firstDiscussionDone: false, selectedTarget: null, detectiveResult: null
    };
  }
  function autoRoles(n) {
    const mafia = n >= 13 ? 4 : n >= 10 ? 3 : n >= 7 ? 2 : 1;
    return {
      godfather: 1,
      mafia: Math.max(0, mafia - 1 - (n >= 10 ? 1 : 0)),
      silencer: n >= 10 ? 1 : 0,
      doctor: n >= 5 ? 1 : 0,
      detective: n >= 6 ? 1 : 0,
      mayor: n >= 8 ? 1 : 0,
      goodboy: n >= 10 ? 1 : 0,
      guardian: n >= 12 ? 1 : 0
    };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.settings && parsed.phase && Array.isArray(parsed.players)) {
        game = { ...defaultState(), ...parsed };
        resumeAvailable = game.phase !== 'home' && game.players.length > 0;
        if (resumeAvailable) game._resumePhase = game.phase;
        game.phase = 'home';
        game.revealed = false;
      }
    } catch (_) { /* تجاهل ملف حفظ تالف */ }
  }
  function save() {
    try { const copy = { ...game }; if (copy.phase === 'home' && copy._resumePhase) copy.phase = copy._resumePhase; delete copy._resumePhase; localStorage.setItem(STORAGE_KEY, JSON.stringify(copy)); } catch (_) {}
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function roleCountTotal(counts = game.roleCounts) { return Object.values(counts).reduce((a,b) => a + Number(b || 0), 0); }
  function mafiaCount(counts = game.roleCounts) { return ['godfather','mafia','silencer'].reduce((a,k)=>a+(Number(counts[k])||0),0); }
  function citizenCount() { return game.settings.playerCount - roleCountTotal(); }
  function alive() { return game.players.filter(p=>p.alive); }
  function player(id) { return game.players.find(p=>p.id===id); }
  function currentAliveAt(index) { return alive()[index] || null; }
  function currentRevealPlayer() { return game.players[game.revealIndex] || null; }
  function currentNightPlayer() { return currentAliveAt(game.nightIndex); }
  function currentDaySpeaker() { const order=alive().filter(p=>p.id!==game.silencedToday); return order[game.dayIndex] || null; }
  function currentVoter() { return currentAliveAt(game.voterIndex); }
  function isMafia(p) { return p && ROLE_INFO[p.role]?.team === 'mafia'; }
  function roleCard(p) {
    const info = ROLE_INFO[p.role] || ROLE_INFO.citizen;
    return `<div class="role-card ${info.team}"><div class="role-icon">${info.icon}</div><div class="eyebrow">${info.team==='mafia'?'فريق المافيا':'فريق الصالحين'}</div><h2>${esc(info.name)}</h2><p>${esc(info.desc)}</p></div>`;
  }
  function topbar(actions = '') {
    return `<header class="topbar"><div class="brand"><div class="brand-mark">م</div><div><div class="brand-name">لعبة المافيا</div><div class="brand-sub">PASS & PLAY · OFFLINE</div></div></div><div class="top-actions">${actions}</div></header>`;
  }
  function iconButton(label, action, icon='?') { return `<button class="icon-btn" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}">${icon}</button>`; }
  function shell(content, actions='') { app.innerHTML = `${topbar(actions)}<main class="screen">${content}</main>`; }
  function primary(label, action, disabled=false, extra='') { return `<button class="btn btn-primary" data-action="${action}" ${disabled?'disabled':''} ${extra}>${label}</button>`; }
  function secondary(label, action, extra='') {
    const classMatch = extra.match(/\bclass="([^"]*)"/);
    const extraClasses = classMatch ? classMatch[1].split(/\s+/).filter(c => c && c !== 'btn' && c !== 'btn-secondary') : [];
    const attributes = extra.replace(/\bclass="[^"]*"/, '').trim();
    const className = ['btn', 'btn-secondary', ...extraClasses].join(' ');
    return `<button class="${className}" data-action="${action}" ${attributes}>${label}</button>`;
  }
  function danger(label, action) { return `<button class="btn btn-danger" data-action="${action}">${label}</button>`; }
  function showToast(msg) {
    let el = document.querySelector('.toast'); if (!el) { el=document.createElement('div');el.className='toast';document.body.appendChild(el); }
    el.textContent=msg;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),2600);
  }
  function roleBalanceStatus() {
    const total=roleCountTotal(); const mafia=mafiaCount(); const n=game.settings.playerCount;
    return { total, mafia, citizens:n-total, valid: total<=n && mafia>=1 && mafia<n };
  }
  function renderHome() {
    const saved = resumeAvailable && game.players.length;
    const content = `<section class="hero"><div class="hero-emblem"><span>م</span></div><div class="eyebrow">THE CITY NEVER SLEEPS</div><h1>لعبة المافيا</h1><p>صراع خفي بين الصالحين والمافيا. مرّر الهاتف، اكشف الأسرار، واكتشف من يخدع المدينة.</p></section>
      <section class="panel"><div class="panel-title"><h2>ابدأ سهرتك</h2><span class="pill good">● أوفلاين بعد أول تحميل</span></div><div class="button-stack">${primary('＋  لعبة جديدة','new-game')}${saved?`<button class="btn btn-secondary" data-action="resume">▶  استكمال الجولة المحفوظة</button>`:''}${secondary('📜  دليل اللعبة والأدوار','rules')}</div><div class="stat-row"><div class="stat"><strong>4–16</strong><span>لاعباً</span></div><div class="stat"><strong>9</strong><span>أدوار مختلفة</span></div><div class="stat"><strong>0</strong><span>إنترنت أثناء اللعب</span></div></div></section>
      <div class="footer-note">اللعبة مصممة لجهاز واحد بنظام تمرير الهاتف بين اللاعبين.<br>بعد فتحها وتثبيتها على الشاشة الرئيسية، يمكن تشغيلها دون اتصال.</div>`;
    shell(content, iconButton('دليل اللعبة','rules','?'));
  }
  function renderSetup() {
    const n=game.settings.playerCount; const status=roleBalanceStatus();
    const roleRows=ROLE_ORDER.map(id=>{
      const r=ROLE_INFO[id], count=game.roleCounts[id]||0;
      const locked=id==='godfather';
      return `<div class="role-row"><div class="role-info"><div class="role-icon">${r.icon}</div><div><div class="role-name">${esc(r.name)}</div><div class="role-desc">${esc(r.short)}</div></div></div><div class="role-controls">${locked?`<span class="pill">أساسي</span>`:`<button data-action="role-minus" data-role="${id}">−</button>`}<strong>${count}</strong>${locked?'':`<button data-action="role-plus" data-role="${id}">＋</button>`}</div></div>`;
    }).join('');
    const names=Array.from({length:n},(_,i)=>`<label class="name-field"><span class="name-index">${i+1}</span><input class="field name-input" data-index="${i}" maxlength="22" placeholder="اسم اللاعب ${i+1}" value="${esc(game.settings.names[i]||'')}"></label>`).join('');
    const content=`<div class="section-head"><div class="eyebrow">NEW MATCH</div><h1>إعداد لعبة المافيا</h1><p>أدخل أسماء اللاعبين واضبط توزيع الأدوار قبل بدء تمرير الهاتف.</p></div>
      <section class="panel"><div class="player-count"><div><div class="field-label">عدد اللاعبين (من 4 إلى 16)</div><div class="subtle">كل لاعب سيكشف دوره بنفسه على نفس الجهاز.</div></div><div class="stepper"><button data-action="count-minus">−</button><strong>${n}</strong><button data-action="count-plus">＋</button></div></div><div class="divider"></div><div class="panel-title"><h3>أسماء اللاعبين</h3><span class="pill">${n} مقاعد</span></div><div class="name-list">${names}</div></section>
      <section class="panel"><div class="panel-title"><div><h3>تشكيلة الأدوار</h3><div class="subtle">اضغط موازنة تلقائية أو اضبط الأدوار يدوياً.</div></div>${secondary('موازنة تلقائية','auto-roles','class="btn btn-secondary btn-small"')}</div>${roleRows}<div class="divider"></div><div class="grid-two"><div class="stat"><strong>${status.total}</strong><span>أدوار خاصة</span></div><div class="stat"><strong>${status.citizens}</strong><span>مواطنون تلقائياً</span></div></div><div class="notice ${status.valid?'':'red'}">${status.valid?`التوزيع مضبوط: ${status.mafia} من المافيا والباقي من الصالحين.`:`التوزيع غير صالح. يجب وجود مافيا واحدة على الأقل، وأن يكون عدد الأدوار مناسباً لعدد اللاعبين.`}</div></section>
      <div class="button-stack">${primary('ابدأ توزيع الأدوار ←','start-game',!status.valid)}${secondary('العودة للرئيسية','go-home')}</div>`;
    shell(content, iconButton('دليل اللعبة','rules','?'));
  }
  function renderPassHeader(title, subtitle, index, total) {
    const pct=total?Math.min(100,Math.round(index/total*100)):0;
    return `<div class="section-head"><div class="eyebrow">PRIVATE PASS & PLAY</div><h1>${title}</h1><p>${subtitle}</p></div><div class="progress"><span style="width:${pct}%"></span></div><div class="big-number">الخطوة ${Math.min(index+1,total)} من ${total}</div>`;
  }
  function renderReveal() {
    const p=currentRevealPlayer(); if(!p) { game.phase='firstDiscussion';game.firstIndex=0;return render(); }
    let body='';
    if(!game.revealed) body=`<div class="secret-cover"><div class="lock">🔒</div><h2>مرّر الهاتف إلى ${esc(p.name)}</h2><p>أمسك الهاتف بمفردك وتأكد من عدم نظر أي شخص إلى الشاشة قبل كشف دورك.</p>${primary('اكشف دوري السري','reveal-role')}</div>`;
    else body=`<div class="center"><div class="player-chip" style="justify-content:center"><div class="avatar">${esc(p.name.slice(0,1))}</div><strong>${esc(p.name)}</strong></div></div>${roleCard(p)}${isMafia(p)?`<div class="notice red">شركاؤك الأحياء في المافيا: ${game.players.filter(x=>x.id!==p.id&&x.alive&&isMafia(x)).map(x=>esc(x.name)).join('، ')||'أنت وحدك الآن.'}</div>`:''}<div class="notice">تذكّر دورك وقدرتك، ولا تكشفها لبقية اللاعبين. اضغط للتمرير إلى اللاعب التالي.</div>${primary('فهمت دوري - إخفاء وتمرير للتالي  →','next-reveal')}`;
    shell(`${renderPassHeader('توزيع الأدوار','كل لاعب يكشف بطاقته على انفراد. لا تترك الشاشة ظاهرة بعد الانتهاء.',game.revealIndex,game.players.length)}${body}`,iconButton('إنهاء الجولة','quit','×'));
  }
  function renderFirstDiscussion() {
    const living=alive(); const p=living[game.firstIndex];
    if(!p) { game.phase='night';game.round=0;return startNight(true); }
    shell(`${renderPassHeader('النقاش الأول قبل الليل','بعد معرفة الأدوار، يتحدث كل لاعب بدوره قبل بدء المهام الليلية.',game.firstIndex,living.length)}<div class="panel"><div class="notice">🎙️ تحدث الآن أمام الطاولة وقدم نفسك قبل أن يبدأ الليل.</div><div class="player-chip"><div class="avatar">${esc(p.name.slice(0,1))}</div><strong>${esc(p.name)}</strong><span class="pill warn">دور الحديث</span></div><div class="button-stack">${primary('أنهيت حديثي - تمرير للاعب التالي  →','next-first-talk')}${secondary('تخطّي النقاش وابدأ الليل','skip-first-talk')}</div></div>`,iconButton('إنهاء الجولة','quit','×'));
  }
  function targetsList(targets, selected, action) {
    if(!targets.length) return `<div class="notice">لا يوجد لاعب متاح للاختيار.</div>`;
    return `<div class="player-select-list">${targets.map(p=>`<button class="select-player ${selected===p.id?'selected':''}" data-action="${action}" data-target="${p.id}"><strong>${esc(p.name)}</strong><span>${selected===p.id?'✓ محدد':'اختيار'}</span></button>`).join('')}</div>`;
  }
  function mafiaNotes() {
    const messages=game.mafiaMessages.slice(-8);
    return `<div class="panel" style="margin-top:12px"><div class="panel-title"><h3>✉️ دفتر الرسائل السرية بين المافيا</h3><span class="pill bad">للعصابة فقط</span></div>${messages.length?messages.map(m=>`<div class="result-line"><span class="result-dot red"></span><div><strong>${esc(m.from)}</strong><div class="subtle">${esc(m.text)}</div></div></div>`).join(''):`<p class="subtle">لا توجد رسائل سرية بعد. اكتب رسالة لشركائك بالأسفل!</p>`}<label class="field-label" for="mafia-msg">رسالة سرية لشركائك</label><textarea id="mafia-msg" class="field" rows="2" maxlength="180" placeholder="اكتب رسالة سرية لشركائك بالمافيا..."></textarea><div style="margin-top:8px">${secondary('إرسال الرسالة','send-mafia-message','class="btn btn-secondary btn-small"')}</div></div>`;
  }
  function renderNightAction(p) {
    const allAlive=alive(); const nonMafia=allAlive.filter(x=>!isMafia(x));
    if(p.role==='godfather' || (p.role==='mafia' && !allAlive.some(x=>x.role==='godfather'))) {
      return `<div class="notice red">اختر هدف الاغتيال من الصالحين فقط. يمكن لأعضاء المافيا كتابة رسائل سرية لبعضهم.</div><div class="field-label">هدف الاغتيال المحدد هذه الليلة</div>${targetsList(nonMafia,game.nightAction.mafiaTarget,'night-mafia-target')}${mafiaNotes()}`;
    }
    if(p.role==='mafia') return `<div class="notice red">أنت عضو في المافيا. راجع رسائل شركائك واكتب لهم ملاحظاتك السرية.</div>${mafiaNotes()}`;
    if(p.role==='silencer') return `<div class="notice red">اختر لاعباً من الصالحين لتمنعه من النقاش والدفاع عن نفسه بالنهار. سيظل قادراً على التصويت وتنفيذ مهمته.</div><div class="field-label">من سيتم تسكيته غداً؟</div>${targetsList(nonMafia.filter(x=>x.id!==p.id),game.nightAction.silencedTarget,'night-silence-target')}`;
    if(p.role==='doctor') return `<div class="notice green">الشخص المحمي سينجو إذا استهدفه استهداف المافيا هذه الليلة. يمكنك حماية نفسك.</div><div class="field-label">اختر من تريد حمايته</div>${targetsList(allAlive,game.nightAction.doctorTarget,'night-doctor-target')}`;
    if(p.role==='detective') {
      const chosen=player(game.nightAction.detectiveTarget);
      return `<div class="notice">افحص هوية لاعب واحد في سرية. ستظهر لك النتيجة على هذه الشاشة فقط.</div><div class="field-label">اختر شخصاً للتحقق من هويته</div>${targetsList(allAlive.filter(x=>x.id!==p.id),game.nightAction.detectiveTarget,'night-detective-target')}${chosen?primary('تأكيد الفحص','confirm-detective',false):''}${game.detectiveResult?`<div class="notice ${game.detectiveResult.team==='mafia'?'red':'green'}">نتيجة التحري عن ${esc(game.detectiveResult.name)}: ${game.detectiveResult.team==='mafia'?'ينتمي إلى المافيا':'من فريق الصالحين'}.</div>`:''}`;
    }
    if(p.role==='guardian') {
      if(game.guardianSpent) return `<div class="notice">لقد استخدمت الحماية الإضافية الوحيدة في ليلة سابقة.</div>`;
      return `<div class="notice green">لديك حماية إضافية واحدة طوال المباراة. اختر لاعباً لحمايته هذه الليلة أو احتفظ بها لجولة لاحقة.</div><div class="field-label">اختر من تريد حمايته</div>${targetsList(allAlive,game.nightAction.guardianTarget,'night-guardian-target')}<div class="button-stack">${primary('تأكيد الحماية الليلة','confirm-guardian',!game.nightAction.guardianTarget)}${secondary('الاحتفاظ بالحماية','hold-guardian')}</div>`;
    }
    if(p.role==='mayor') return `<div class="notice">هويتك القيادية سرية. إذا صوّت اللاعبون لإقصائك ستنكشف هويتك، لكنك لن تخرج، وسيصبح صوتك بصوتين.</div><p class="subtle">لا توجد مهمة ليلية. تذكّر أن تحافظ على سريّة هويتك.</p>`;
    if(p.role==='goodboy') return `<div class="notice">قدرتك خاصة بمرحلة التصويت: إذا أجمع اللاعبون على إقصائك، ستختار لاعباً ليخرج معك فوراً.</div><p class="subtle">لا توجد مهمة ليلية.</p>`;
    return `<div class="notice">أنت مواطن صالح نائم في منزلك. لا توجد مهام ليلية سرية لك هذه الليلة.</div>`;
  }
  function renderNight() {
    const p=currentNightPlayer(); if(!p) return resolveNight();
    let body='';
    if(!game.revealed) body=`<div class="secret-cover"><div class="lock">🌙</div><h2>مرّر الهاتف إلى ${esc(p.name)}</h2><p>أغمضوا أعينكم جميعاً. أمسك الهاتف بمفردك واضغط لكشف مهمتك الليلية.</p>${primary('أنا وحدي الآن.. اكشف الشاشة','reveal-night')}</div>`;
    else body=`<div class="player-chip"><div class="avatar">${esc(p.name.slice(0,1))}</div><strong>${esc(p.name)}</strong><span class="pill warn">الدور ${game.nightIndex+1}</span></div>${roleCard(p)}${renderNightAction(p)}<div class="button-stack">${primary('أنهيت دوري - إخفاء وتمرير للتالي  →','next-night')}</div>`;
    shell(`${renderPassHeader(`الليلة ${game.round}: مهام اللاعبين`,'سيمر الهاتف على جميع اللاعبين الأحياء. لكل لاعب شاشة سرية ومهمة خاصة حسب دوره.',game.nightIndex,alive().length)}${body}`,iconButton('إنهاء الجولة','quit','×'));
  }
  function renderNightResults() {
    const items=game.nightReport.length?game.nightReport.map(r=>`<div class="result-line"><span class="result-dot ${r.type==='bad'?'red':r.type==='good'?'green':''}"></span><div>${esc(r.text)}</div></div>`).join(''):`<div class="notice green">✨ كانت ليلة هادئة، لم يحدث اغتيال من المافيا.</div>`;
    shell(`<div class="section-head"><div class="eyebrow">DAWN · ROUND ${game.round}</div><h1>أشرق الصباح على المدينة</h1><p>استيقظ سكان المدينة على أخبار الليلة الماضية.</p></div><section class="panel">${items}${game.silencedToday?`<div class="notice red">تم تسكيت ${esc(player(game.silencedToday)?.name||'لاعب')} لهذا اليوم. لا يستطيع النقاش أو الدفاع عن نفسه، لكنه يستطيع التصويت وتنفيذ مهمته.</div>`:''}</section><div class="button-stack">${primary('بدء نقاش النهار  ☀️','start-day-discussion')}</div>`,iconButton('إنهاء الجولة','quit','×'));
  }
  function renderDayDiscussion() {
    const p=currentDaySpeaker();
    if(!p) return startVoting();
    const order=alive().filter(x=>x.id!==game.silencedToday);
    shell(`${renderPassHeader('نقاش النهار بنظام التمرير','يتحدث كل لاعب حي مرة واحدة فقط. اللاعب المسكت لا يتحدث، لكنه يحتفظ بحق التصويت.',game.dayIndex,order.length)}<section class="panel"><div class="player-chip"><div class="avatar">${esc(p.name.slice(0,1))}</div><strong>${esc(p.name)}</strong><span class="pill warn">يتحدث الآن</span></div><div class="notice">تحدث الآن، دافع عن موقفك وناقش شكوكك مع باقي اللاعبين.</div><div class="button-stack">${primary('أنهيت حديثي - تمرير للتالي  →','next-day-speaker')}${secondary('إنهاء النقاش وبدء التصويت','skip-day-discussion')}</div></section>`,iconButton('إنهاء الجولة','quit','×'));
  }
  function tallyVotes() {
    const counts={};
    for (const voter of alive()) {
      const target=game.votes[voter.id]; if(!target || !player(target)?.alive) continue;
      counts[target]=(counts[target]||0)+(game.mayorRevealed&&voter.role==='mayor'?2:1);
    }
    const entries=Object.entries(counts); if(!entries.length) return {top:[],counts};
    const max=Math.max(...entries.map(([,v])=>v));
    return {top:entries.filter(([,v])=>v===max).map(([id])=>id),counts,max};
  }
  function currentAllowedTargets() {
    const all=alive(); return game.tieOnly?all.filter(p=>game.tieOnly.includes(p.id)):all;
  }
  function renderVoting() {
    const voter=currentVoter(); if(!voter) { finishVoting();return render(); }
    const allowed=currentAllowedTargets();
    shell(`${renderPassHeader(game.tieOnly?'إعادة التصويت لكسر التعادل':'التصويت الفردي الإجباري','مرّر الهاتف سراً إلى اللاعب الحالي. اختر شخصاً واحداً تشك فيه، ولا يمكن تخطي التصويت.',game.voterIndex,alive().length)}<section class="panel"><div class="notice">⚖️ اختر اسمك لتمرير الهاتف إليك في سرية. لا تعرض اختيارك على بقية اللاعبين.</div><div class="player-chip"><div class="avatar">${esc(voter.name.slice(0,1))}</div><strong>${esc(voter.name)}</strong><span class="pill warn">يصوّت الآن</span></div><div class="divider"></div><div class="field-label">اختر الشخص الذي تريد التصويت عليه</div>${targetsList(allowed,game.selectedTarget,'choose-vote-target')}${game.selectedTarget?`<div class="notice">سيُسجّل صوتك لـ ${esc(player(game.selectedTarget)?.name)} بشكل سري.</div>`:''}<div class="button-stack">${primary('تأكيد التصويت','submit-vote',!game.selectedTarget)} </div></section>`,iconButton('إنهاء الجولة','quit','×'));
  }
  function renderMayorReveal() {
    const p=player(game.accusedId);
    const title=game._mayorWasAlreadyRevealed?'العمدة لا يخرج بالتصويت':'انكشفت هوية العمدة!';
    const detail=game._mayorWasAlreadyRevealed?'تكرر حصول العمدة على أعلى الأصوات، لكنه يظل محمياً من الإقصاء بالتصويت.':'لم يخرج العمدة من المباراة، وانكشفت هويته أمام الجميع.';
    shell(`<div class="section-head"><div class="eyebrow">SPECIAL ROLE REVEALED</div><h1>${title}</h1><p>${detail}</p></div><section class="panel">${roleCard(p)}<div class="notice">عمدة الصالحين لا يخرج بالتصويت. يُعاد التصويت ويُحتسب صوته بصوتين.</div>${primary('إعادة التصويت بصوت العمدة المزدوج','restart-after-mayor')}</section>`,iconButton('إنهاء الجولة','quit','×'));
  }
  function renderDefense() {
    const p=player(game.accusedId); const tally=tallyVotes();
    shell(`<div class="section-head"><div class="eyebrow">THE LAST WORD</div><h1>مرحلة الدفاع والحكم</h1><p>صاحب أعلى الأصوات يحصل على فرصة للدفاع عن نفسه قبل القرار النهائي.</p></div><section class="panel"><div class="notice red">⚖️ الحاصل على أعلى الأصوات: ${esc(p?.name||'غير محدد')} (${tally.counts[game.accusedId]||0} صوت)</div><div class="player-chip"><div class="avatar">${esc((p?.name||'?').slice(0,1))}</div><strong>${esc(p?.name||'')}</strong><span class="pill bad">المتهم</span></div><p class="subtle" style="margin-top:14px">حاول إقناع اللاعبين ببراءتك. بعد انتهاء الدفاع، يستطيع كل لاعب تثبيت صوته أو تغييره مرة واحدة.</p><div class="button-stack">${primary('انتهاء الدفاع والسماح بتغيير الأصوات','begin-change-votes')}</div></section>`,iconButton('إنهاء الجولة','quit','×'));
  }
  function renderChangeVotes() {
    const voter=currentVoter();
    if(!voter) { finalizeChangeVotes();return render(); }
    const previous=game.votes[voter.id]; const targets=alive();
    shell(`${renderPassHeader('تعديل التصويت','مرّر الهاتف سراً لكل لاعب. يمكنه تثبيت صوته السابق أو تغييره بعد سماع الدفاع.',game.changeIndex,alive().length)}<section class="panel"><div class="player-chip"><div class="avatar">${esc(voter.name.slice(0,1))}</div><strong>${esc(voter.name)}</strong><span class="pill warn">تعديل الصوت</span></div><div class="notice">صوتك الحالي: ${esc(player(previous)?.name||'لم يُسجّل')}</div><div class="field-label">اختر صوتاً جديداً أو ثبّت صوتك الحالي</div>${targetsList(targets,game.selectedTarget,'choose-change-target')}<div class="button-stack">${secondary('تثبيت صوتي السابق','keep-change-vote')}${primary('تأكيد تغيير الصوت','submit-change-vote',!game.selectedTarget)}</div></section>`,iconButton('إنهاء الجولة','quit','×'));
  }
  function renderFinalDecision() {
    const p=player(game.accusedId); const tally=tallyVotes();
    shell(`<div class="section-head"><div class="eyebrow">FINAL DECISION</div><h1>القرار النهائي</h1><p>انتهى الدفاع وتعديل الأصوات. هذه نتيجة التصويت الحالية.</p></div><section class="panel"><div class="role-card"><div class="role-icon">⚖</div><div class="eyebrow">أعلى الأصوات</div><h2>${esc(p?.name||'')}</h2><p>${tally.counts[game.accusedId]||0} صوت</p></div><div class="notice red">هل قررتم إقصاء هذا اللاعب من الجولة؟</div><div class="button-stack">${primary('تأكيد الإقصاء','execute-elimination')}${secondary('إعادة التصويت على الجميع','restart-voting')}</div></section>`,iconButton('إنهاء الجولة','quit','×'));
  }
  function renderRevenge() {
    const p=player(game.accusedId); const targets=alive().filter(x=>x.id!==p.id);
    shell(`<div class="section-head"><div class="eyebrow">LAST STAND</div><h1>انتقام الولد الصالح!</h1><p>تم إقصاؤك بالتصويت. اختر لاعباً آخر ليخرج معك فوراً من اللعبة.</p></div><section class="panel"><div class="notice">⚡ قدرة الولد الصالح الانتقامية تفعلت. اختيارك قد يقلب موازين المباراة.</div><div class="field-label">اختر اللاعب الذي سيخرج معك</div>${targetsList(targets,game.selectedTarget,'choose-revenge-target')}<div class="button-stack">${primary('تأكيد الانتقام وإخراجه معي فوراً','confirm-revenge',!game.selectedTarget)}</div></section>`,iconButton('إنهاء الجولة','quit','×'));
  }
  function renderGameOver() {
    const mafiaWon=game.winner==='mafia'; const aliveCount=alive().length;
    const all=game.players.map(p=>`<div class="role-row"><div class="role-info"><div class="role-icon">${ROLE_INFO[p.role].icon}</div><div><div class="role-name">${esc(p.name)} ${p.alive?'':'· خرج من اللعبة'}</div><div class="role-desc">${esc(ROLE_INFO[p.role].name)}</div></div></div>`).join('');
    shell(`<section class="hero" style="padding:20px 8px"><div class="hero-emblem"><span>${mafiaWon?'♛':'☀'}</span></div><div class="eyebrow">GAME OVER · ROUND ${game.round}</div><h1>${mafiaWon?'انتصار عصابة المافيا!':'انتصار الصالحين!'}</h1><p>${mafiaWon?'سيطرت المافيا على المدينة وأحكمت قبضتها عليها.':'نجح الصالحون في كشف أفراد المافيا والقضاء على نفوذهم. أشرقت شمس المدينة!'}</p></section><section class="panel"><div class="panel-title"><h2>كشف هويات وأدوار جميع اللاعبين</h2><span class="pill">${aliveCount} باقون</span></div>${all}</section><div class="button-stack">${primary('لعبة جديدة بنفس الإعدادات','new-same')}${secondary('العودة للرئيسية','go-home')}</div>`,iconButton('دليل اللعبة','rules','?'));
  }
  function render() {
    save();
    switch(game.phase) {
      case 'home': renderHome(); break;
      case 'setup': renderSetup(); break;
      case 'reveal': renderReveal(); break;
      case 'firstDiscussion': renderFirstDiscussion(); break;
      case 'night': renderNight(); break;
      case 'nightResults': renderNightResults(); break;
      case 'dayDiscussion': renderDayDiscussion(); break;
      case 'voting': case 'tieVote': renderVoting(); break;
      case 'tieResults': renderTieResults(); break;
      case 'mayorReveal': renderMayorReveal(); break;
      case 'defense': renderDefense(); break;
      case 'changeVotes': renderChangeVotes(); break;
      case 'finalDecision': renderFinalDecision(); break;
      case 'revenge': renderRevenge(); break;
      case 'gameOver': renderGameOver(); break;
      default: game.phase='home';renderHome();
    }
  }
  function beginSetup() {
    const oldNames=game.settings.names||[]; game=defaultState(); game.phase='setup'; game.settings.playerCount=8; game.settings.names=oldNames.slice(0,8);game.roleCounts=autoRoles(8);render();
  }
  function setCount(delta) {
    const old=game.settings.playerCount; const n=Math.max(4,Math.min(16,old+delta));
    if(n===old)return;
    game.settings.playerCount=n; game.settings.names=Array.from({length:n},(_,i)=>game.settings.names[i]||''); game.roleCounts=autoRoles(n);render();
  }
  function adjustRole(id, delta) {
    const next={...game.roleCounts}; const current=Number(next[id]||0); const newVal=Math.max(0,current+delta);
    if(id==='godfather' && newVal===0) { showToast('لازم يكون في شيخ مافيا واحد على الأقل في التشكيلة الحالية.');return; }
    next[id]=newVal;
    if(roleCountTotal(next)>game.settings.playerCount) { showToast('عدد الأدوار تجاوز عدد اللاعبين.');return; }
    if(mafiaCount(next)<1 || mafiaCount(next)>=game.settings.playerCount) { showToast('لازم يكون عدد المافيا أقل من عدد اللاعبين.');return; }
    game.roleCounts=next;render();
  }
  function startGame() {
    const n=game.settings.playerCount; const status=roleBalanceStatus();
    if(!status.valid){showToast('راجع توزيع الأدوار أولاً.');return;}
    const names=Array.from({length:n},(_,i)=>(game.settings.names[i]||'').trim()||`لاعب ${i+1}`);
    if(new Set(names.map(s=>s.toLocaleLowerCase())).size!==names.length){showToast('يفضل استخدام اسم مختلف لكل لاعب.');return;}
    const deck=[];
    for(const [role,count] of Object.entries(game.roleCounts)) for(let i=0;i<count;i++) deck.push(role);
    for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
    while(deck.length<n) deck.push('citizen');
    for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
    game.players=names.map((name,i)=>({id:`p${Date.now().toString(36)}${i}`,name,role:deck[i]||'citizen',alive:true}));
    game.phase='reveal';game.revealIndex=0;game.revealed=false;game.round=0;game.mafiaMessages=[];game.gameLog=[];game.guardianSpent=false;game.mayorRevealed=false;game.winner=null;game.settings.names=names;game._resumePhase='reveal';resumeAvailable=true;render();
  }
  function continueReveal() {
    game.revealed=false;
    if(game.revealIndex+1<game.players.length){game.revealIndex++;}
    else {game.phase='firstDiscussion';game.firstIndex=0;}
    render();
  }
  function startNight(first=false) {
    game.phase='night';game.revealed=false;game.nightIndex=0;game._guardianConfirmed=false;game.nightAction={mafiaTarget:null,doctorTarget:null,silencedTarget:null,guardianTarget:null,detectiveTarget:null};game.detectiveResult=null;game.nightReport=[];game.silencedToday=null;
    if(!first) game.round++;
    else game.round=1;
    if(checkWinner()) return render();
    render();
  }
  function finishNightTurn() {
    const active=currentNightPlayer();
    if(active?.role==='guardian' && game.nightAction.guardianTarget && !game._guardianConfirmed) { showToast('أكد الحماية أو اختر الاحتفاظ بها قبل تمرير الهاتف.'); return; }
    game.revealed=false;game.detectiveResult=null;
    if(game.nightIndex+1<alive().length){game.nightIndex++;render();}
    else resolveNight();
  }
  function resolveNight() {
    const a=game.nightAction||{}; const events=[];
    const protectedIds=[a.doctorTarget, game._guardianConfirmed ? a.guardianTarget : null].filter(Boolean);
    const isProtected = id => protectedIds.includes(id);
    if(a.mafiaTarget && player(a.mafiaTarget)?.alive) {
      if(isProtected(a.mafiaTarget)) events.push({type:'good',text:`الحماية السرية في اللحظة الحاسمة أنقذت ${player(a.mafiaTarget).name} من استهداف المافيا.`});
      else {player(a.mafiaTarget).alive=false;events.push({type:'bad',text:`استيقظت المدينة على خبر اغتيال ${player(a.mafiaTarget).name}.`});}
    } else events.push({type:'good',text:'كانت ليلة هادئة، لم يحدث اغتيال من المافيا.'});
    if(game._guardianConfirmed && a.guardianTarget) {
      game.guardianSpent=true;
      if(a.guardianTarget===a.mafiaTarget) events.push({type:'good',text:`الحماية الإضافية أنقذت ${player(a.guardianTarget)?.name||'لاعباً'} من استهداف المافيا.`});
    }
    if(a.silencedTarget && player(a.silencedTarget)?.alive) {
      game.silencedToday=a.silencedTarget;events.push({type:'bad',text:`تم تسكيت ${player(a.silencedTarget).name}. لن يستطيع النقاش أو الدفاع عن نفسه اليوم، لكنه يستطيع التصويت وتنفيذ مهمته.`});
    }
    game.nightReport=events;
    game.gameLog.push({round:game.round,events:events.map(e=>e.text)});
    if(checkWinner()) {render();return;}
    game.phase='nightResults';game.revealed=false;render();
  }
  function startDayDiscussion() {
    game.phase='dayDiscussion';game.dayIndex=0;
    if(!alive().some(p=>p.id!==game.silencedToday)) return startVoting();
    render();
  }
  function startVoting(tieOnly=null) {
    game.phase=tieOnly?'tieVote':'voting';game.tieOnly=tieOnly;game.votes={};game.voterIndex=0;game.selectedTarget=null;render();
  }
  function finishVoting() {
    const tally=tallyVotes();
    if(!tally.top.length) {startNight();return;}
    if(tally.top.length>1) {
      if(!game.tieOnly) { game.tieOnly=tally.top;game.phase='tieVote';game.votes={};game.voterIndex=0;game.selectedTarget=null;render(); }
      else {game.phase='tieResults';game.tieCandidates=tally.top;renderTieResults();}
      return;
    }
    const target=player(tally.top[0]);
    if(target?.role==='mayor') {triggerMayor(target.id);return;}
    game.accusedId=target?.id||null;game.phase='defense';render();
  }
  function triggerMayor(id) { game._mayorWasAlreadyRevealed=!!game.mayorRevealed;game.accusedId=id;game.mayorRevealed=true;game.phase='mayorReveal';game.votes={};game.tieOnly=null;game.selectedTarget=null;render(); }
  function restartAfterMayor() { startVoting(null); }
  function renderTieResults() {
    const names=(game.tieCandidates||[]).map(id=>player(id)?.name).filter(Boolean).join('، ');
    shell(`<div class="section-head"><div class="eyebrow">VOTE TIE</div><h1>تعادل في الأصوات</h1><p>لم يتفق التصويت على لاعب واحد.</p></div><section class="panel"><div class="notice">تعادل أعلى الأصوات بين: ${esc(names)}. لا يتم إقصاء أحد هذه الجولة.</div>${primary('الانتقال إلى الليل التالي','next-round')}</section>`,iconButton('إنهاء الجولة','quit','×'));
  }
  function beginChangeVotes() { game.phase='changeVotes';game.changeIndex=0;game.selectedTarget=null;render(); }
  function finalizeChangeVotes() {
    const tally=tallyVotes();
    if(!tally.top.length){startNight();return;}
    if(tally.top.length>1){startVoting(tally.top);return;}
    const target=player(tally.top[0]);
    if(target?.role==='mayor'){triggerMayor(target.id);return;}
    game.accusedId=target.id;game.phase='finalDecision';render();
  }
  function executeElimination() {
    const p=player(game.accusedId); if(!p||!p.alive){startNight();return;}
    if(p.role==='goodboy'){game.phase='revenge';game.selectedTarget=null;render();return;}
    p.alive=false;
    if(checkWinner()) {render();return;}
    startNight();
  }
  function confirmRevenge() {
    const p=player(game.accusedId), target=player(game.selectedTarget);
    if(!p||!target||!target.alive||target.id===p.id){showToast('اختر لاعباً آخر صالحاً.');return;}
    p.alive=false;target.alive=false;game.gameLog.push({round:game.round,events:[`${p.name} أخذ ${target.name} معه بقدرة الولد الصالح.`]});
    if(checkWinner()){render();return;}startNight();
  }
  function checkWinner() {
    const living=alive(); const mafia=living.filter(isMafia).length; const town=living.length-mafia;
    if(mafia===0){game.winner='town';game.phase='gameOver';resumeAvailable=true;return true;}
    if(mafia>=town){game.winner='mafia';game.phase='gameOver';resumeAvailable=true;return true;}
    return false;
  }
  function nextRound() { startNight(); }
  function resumeGame() { game.phase=game._resumePhase||'reveal';delete game._resumePhase;game.revealed=false;render(); }
  function goHome() { const oldPhase=game.phase; if(oldPhase!=='home') game._resumePhase=oldPhase; game.phase='home';game.revealed=false;resumeAvailable=game.players.length>0;render(); }
  function newSame() {
    const names=game.settings.names.slice(); const count=game.settings.playerCount; const counts={...game.roleCounts};
    game={...defaultState(),phase:'setup',settings:{playerCount:count,names},roleCounts:counts};render();
  }
  function confirmQuit() {
    if(!confirm('هل أنت متأكد من رغبتك في إنهاء الجولة الحالية والعودة لشاشة البداية؟')) return;
    game._resumePhase=game.phase;game.phase='home';game.revealed=false;resumeAvailable=game.players.length>0;render();
  }
  function renderRules() {
    const body=`<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true"><div class="panel-title"><h2>دليل لعبة المافيا والأدوار</h2><button class="icon-btn" data-action="close-modal">×</button></div><h3>فكرة اللعبة</h3><p>صراع خفي بين فريقين: الصالحين، وهم الأغلبية التي تحاول اكتشاف المافيا، والمافيا، وهم الأقلية المنظمة التي تعمل في الخفاء. تُلعب على نفس الجهاز بتمريره بين اللاعبين في سرية.</p><h3>تعاقب الليل والنهار</h3><ol><li>النقاش الأول: بعد معرفة كل لاعب لدوره، يبدأ نقاش تعارفي قبل الليلة الأولى.</li><li>الليل: يستيقظ كل لاعب بالاسم في سرية تامة لينفذ مهامه.</li><li>الصباح: تعلن اللعبة نتائج الليل، ومن تم استهدافه أو إنقاذه أو تسكيته.</li><li>نقاش النهار: يتحدث كل لاعب حي بدوره، ولا يمكن الرجوع لمتحدث سابق. المسكت لا يتناقش لكنه يصوّت وينفذ مهمته.</li><li>التصويت الفردي الإجباري: يصوّت كل لاعب سراً على مشتبه به، ولا يوجد تخطٍّ.</li><li>الدفاع وتعديل الأصوات: يحصل صاحب أعلى الأصوات على فرصة للدفاع، ثم يمكن للاعبين تثبيت أصواتهم أو تغييرها.</li></ol><h3>الأدوار والقدرات</h3>${ROLE_ORDER.concat('citizen').map(id=>`<div class="result-line"><span class="result-dot ${ROLE_INFO[id].team==='mafia'?'red':'green'}"></span><div><strong>${esc(ROLE_INFO[id].name)}</strong><div class="subtle">${esc(ROLE_INFO[id].desc)}</div></div></div>`).join('')}<h3>الفوز</h3><p>يفوز الصالحون عند خروج جميع أفراد المافيا. وتفوز المافيا عندما يصبح عددها مساوياً لعدد الصالحين الأحياء أو أكبر منه.</p><div class="button-stack"><button class="btn btn-primary" data-action="close-modal">فهمت القواعد، فلنلعب!</button></div></section></div>`;
    document.body.insertAdjacentHTML('beforeend',body);
  }
  function updateCurrentInput(input) {
    if(input.classList.contains('name-input')) {
      const i=Number(input.dataset.index);game.settings.names[i]=input.value;save();
    }
  }

  app.addEventListener('input', e=>updateCurrentInput(e.target));
  document.addEventListener('click', e=>{
    const btn=e.target.closest('[data-action]'); if(!btn)return;
    const action=btn.dataset.action; const target=btn.dataset.target; const role=btn.dataset.role;
    switch(action) {
      case 'rules': renderRules();break;
      case 'close-modal': e.target.closest('.modal-backdrop')?.remove();break;
      case 'new-game': beginSetup();break;
      case 'resume': resumeGame();break;
      case 'go-home': goHome();break;
      case 'count-minus': setCount(-1);break;
      case 'count-plus': setCount(1);break;
      case 'auto-roles': game.roleCounts=autoRoles(game.settings.playerCount);render();showToast('تمت موازنة الأدوار تلقائياً.');break;
      case 'role-minus': adjustRole(role,-1);break;
      case 'role-plus': adjustRole(role,1);break;
      case 'start-game': startGame();break;
      case 'reveal-role': game.revealed=true;render();break;
      case 'next-reveal': continueReveal();break;
      case 'next-first-talk': game.firstIndex++;render();break;
      case 'skip-first-talk': startNight(true);break;
      case 'reveal-night': game.revealed=true;render();break;
      case 'next-night': finishNightTurn();break;
      case 'night-mafia-target': game.nightAction.mafiaTarget=target;render();break;
      case 'night-silence-target': game.nightAction.silencedTarget=target;render();break;
      case 'night-doctor-target': game.nightAction.doctorTarget=target;render();break;
      case 'night-detective-target': game.nightAction.detectiveTarget=target;game.detectiveResult=null;render();break;
      case 'confirm-detective': {const p=player(game.nightAction.detectiveTarget);if(p){game.detectiveResult={name:p.name,team:isMafia(p)?'mafia':'town'};render();}break;}
      case 'night-guardian-target': game.nightAction.guardianTarget=target;game._guardianConfirmed=false;render();break;
      case 'confirm-guardian': if(game.nightAction.guardianTarget){game._guardianConfirmed=true;showToast('تم تسجيل الحماية. اضغط إنهاء دورك للتمرير.');render();}break;
      case 'hold-guardian': game.nightAction.guardianTarget=null;game._guardianConfirmed=false;showToast('احتفظت بالحماية لليلة قادمة.');render();break;
      case 'send-mafia-message': {const box=document.getElementById('mafia-msg');const text=(box?.value||'').trim();const p=currentNightPlayer();if(!text){showToast('اكتب الرسالة أولاً.');break;}game.mafiaMessages.push({from:p?.name||'المافيا',text,round:game.round});render();showToast('تم إرسال الرسالة السرية.');break;}
      case 'start-day-discussion': startDayDiscussion();break;
      case 'next-day-speaker': game.dayIndex++;render();break;
      case 'skip-day-discussion': startVoting();break;
      case 'choose-vote-target': game.selectedTarget=target;render();break;
      case 'submit-vote': {const voter=currentVoter();if(!voter||!game.selectedTarget)break;game.votes[voter.id]=game.selectedTarget;game.selectedTarget=null;game.voterIndex++;if(game.voterIndex>=alive().length)finishVoting();else render();break;}
      case 'restart-after-mayor': restartAfterMayor();break;
      case 'begin-change-votes': beginChangeVotes();break;
      case 'choose-change-target': game.selectedTarget=target;render();break;
      case 'keep-change-vote': {const voter=currentVoter();if(!voter)break;game.changeIndex++;game.selectedTarget=null;if(game.changeIndex>=alive().length)finalizeChangeVotes();else render();break;}
      case 'submit-change-vote': {const voter=currentVoter();if(!voter||!game.selectedTarget)break;game.votes[voter.id]=game.selectedTarget;game.changeIndex++;game.selectedTarget=null;if(game.changeIndex>=alive().length)finalizeChangeVotes();else render();break;}
      case 'execute-elimination': executeElimination();break;
      case 'restart-voting': startVoting(null);break;
      case 'choose-revenge-target': game.selectedTarget=target;render();break;
      case 'confirm-revenge': confirmRevenge();break;
      case 'next-round': nextRound();break;
      case 'new-same': newSame();break;
      case 'quit': confirmQuit();break;
    }
    save();
  });

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && game.revealed) { game.revealed=false;render();save(); }
  });
  window.addEventListener('pagehide',()=>{ if(game.revealed) game.revealed=false; save(); });
  loadState();
  render();
  if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')) {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
})();

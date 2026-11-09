/* VN Studio 1.0.0 · SillyTavern 미연시(비주얼 노벨) 팝업
 * - 채팅 연동: 캐릭터 응답 끝의 [VN] 블록(장소·표정·의상·호감도·선택지·이벤트)을 읽어 화면을 연출해요.
 * - 일상 모드: 채팅과 별개로 모델이 하루 단위 이벤트를 만들어 줘요.
 * - 이미지/영상 생성은 Scene Studio 확장의 Gemini / Agent Platform / Veo 호출부를 가져왔어요.
 */
(() => {
  'use strict';
  const MODULE = 'vnstudio';
  const KEY = 'vnstudio_inject';
  const ctx = () => SillyTavern.getContext();
  const toastr = new Proxy({}, { get: (_, k) => (m, ...a) => window.toastr[k](trMsg(m), ...a) });   // 영어 모드면 알림도 번역
  const confirm = (m) => window.confirm(trMsg(m)), alert = (m) => window.alert(trMsg(m));
  const L2 = (ko, en) => (S().lang === 'en' ? en : ko);

  /* ================= 상수 ================= */
  const EMOS = ['admiration', 'amusement', 'anger', 'annoyance', 'approval', 'caring', 'confusion', 'curiosity', 'desire', 'disappointment', 'disapproval', 'disgust', 'embarrassment', 'excitement', 'fear', 'gratitude', 'grief', 'joy', 'love', 'nervousness', 'optimism', 'pride', 'realization', 'relief', 'remorse', 'sadness', 'surprise', 'neutral'];
  const EMO_SYN = {
    happy: 'joy', glad: 'joy', smile: 'joy', laugh: 'amusement', sad: 'sadness', cry: 'sadness', angry: 'anger', mad: 'anger', shy: 'embarrassment', blush: 'embarrassment', flustered: 'embarrassment',
    scared: 'fear', shock: 'surprise', shocked: 'surprise', excited: 'excitement', worried: 'nervousness', anxious: 'nervousness', tsundere: 'annoyance', pout: 'annoyance', thinking: 'curiosity', calm: 'neutral',
    기쁨: 'joy', 행복: 'joy', 웃음: 'amusement', 슬픔: 'sadness', 분노: 'anger', 화남: 'anger', 짜증: 'annoyance', 부끄: 'embarrassment', 부끄러움: 'embarrassment', 당황: 'embarrassment', 놀람: 'surprise',
    두려움: 'fear', 무서움: 'fear', 설렘: 'excitement', 사랑: 'love', 걱정: 'nervousness', 긴장: 'nervousness', 호기심: 'curiosity', 평온: 'neutral', 무표정: 'neutral', 감사: 'gratitude', 실망: 'disappointment',
  };
  const SLOTS = ['아침', '점심', '오후', '저녁', '밤'];
  /* ----- 언어 (한국어/English): 화면 문구와 모델 출력 언어를 함께 바꾼다 ----- */
  const LANGS = {
    ko: { name: 'Korean', slots: ['아침', '점심', '오후', '저녁', '밤'], aff: ['적대', '불편', '낯섦', '친근', '호감', '두근두근', '연인'], std: ['나이', '생일', '직업', '좋아하는 것', '싫어하는 것', '취미', '말버릇', '고민', '비밀'],
      heart: ['가까워진 순간', '마음이 흔들리는 순간', '고백 직전', '연인의 시작', '영원한 약속'],
      acts: { free: '자유', meet: '캐릭터와 만남', study: '공부', job: '아르바이트', exercise: '운동', read: '독서', hobby: '취미', walk: '산책', rest: '휴식' } },
    en: { name: 'English', slots: ['Morning', 'Noon', 'Afternoon', 'Evening', 'Night'], aff: ['Hostile', 'Uneasy', 'Strangers', 'Friendly', 'Fond', 'Heart-fluttering', 'Lovers'], std: ['Age', 'Birthday', 'Job', 'Likes', 'Dislikes', 'Hobby', 'Verbal tic', 'Worry', 'Secret'],
      heart: ['Growing closer', 'Heart wavering', 'On the verge of a confession', 'Lovers begin', 'Eternal promise'],
      acts: { free: 'Free', meet: 'Meet character', study: 'Study', job: 'Part-time job', exercise: 'Exercise', read: 'Read', hobby: 'Hobby', walk: 'Walk', rest: 'Rest' } },
  };
  const CHOICE_DEF = {
    ko: [
      '{{user}}의 페르소나(성격·말투·배경)에 가장 잘 맞는, 이 순간 가장 자연스러운 말이나 행동. 감정과 속뜻이 느껴지게 쓴다.',
      '{{char}}의 마음을 헤아리거나 관계를 한 걸음 앞으로 옮기는 다정하고 진심 어린 선택. 상황에 맞게 구체적인 행동을 곁들인다.',
      '대담하고 위험한 승부수. {{char}}의 성격에 따라 크게 먹힐 수도, 역효과가 날 수도 있는 도발·장난·직진.',
      'CYOA식 엉뚱한 변칙. 정신 나간 듯 황당하거나 웃기고 예측 불가능하지만, 이 장면 안에서 실제로 할 수 있는 행동.',
    ],
    en: [
      "The most natural thing {{user}} would say or do here, true to {{user}}'s persona (personality, voice, background), with real feeling and subtext.",
      "A warm, sincere move that reads {{char}}'s feelings or pushes the relationship one step forward, with a concrete action attached.",
      "A bold, risky gambit: provocation, teasing or a straight charge that could land big or backfire depending on {{char}}'s personality.",
      'A CYOA-style wild card: absurd, unhinged, funny and unpredictable, yet something that could really be done inside this scene.',
    ],
  };
  const DLN = () => OUTN() || LANGN();
  const choiceProms = () => [1, 2, 3, 4].map((i) => (String(S()['choiceP' + i] || '').trim() || CHOICE_DEF[langKey()][i - 1]));
  let inLang = '';
  /* 내가 쓴 글의 언어: 한글이 있으면 ko, 영문뿐이면 en, 너무 짧으면 판단 보류 */
  const detectLangOf = (s) => { s = String(s || ''); const ko = (s.match(/[가-힣]/g) || []).length, en = (s.match(/[A-Za-z]/g) || []).length; if (ko >= 2 && ko * 2 >= en) return 'ko'; if (en >= 5 && en > ko * 4) return 'en'; return null; };
  const lastInputLang = () => { const ch = ctx().chat || []; for (let i = ch.length - 1; i >= 0 && i > ch.length - 14; i--) { const m = ch[i]; if (m?.is_user && m.mes) { const d = detectLangOf(m.mes); if (d) { inLang = d; break; } } } return inLang; };
  const outLangKey = () => { const v = S().outLang; return v === 'ko' || v === 'en' ? v : (v === 'chat' ? 'chat' : (v === 'input' ? (lastInputLang() || langKey()) : langKey())); };
  const OUTN = () => { const k = outLangKey(); return k === 'chat' ? '' : LANGS[k].name; };
  const langKey = () => (S().lang === 'en' ? 'en' : 'ko');
  const LANGN = () => LANGS[langKey()].name;
  function applyLang() {
    const L = LANGS[langKey()];
    SLOTS.splice(0, SLOTS.length, ...L.slots);
    AFF_LEVELS.forEach((a, i) => { a[1] = L.aff[i]; });
    STD_FACTS.splice(0, STD_FACTS.length, ...L.std);
    HEART_STEPS.forEach((h, i) => { h[1] = L.heart[i]; });
    ACTS.forEach((a) => { a.n = L.acts[a.id] + (a.id === 'free' ? (langKey() === 'en' ? ' (AI decides)' : ' (AI가 정함)') : ''); });
  }
  const AFF_LEVELS = [[-101, '적대'], [-40, '불편'], [-10, '낯섦'], [10, '친근'], [40, '호감'], [70, '두근두근'], [90, '연인']];
  const DEFAULT_SEEDS = '우연히 같은 시간에 같은 가게에 들른다\n갑작스러운 소나기, 우산이 하나뿐이다\n한가한 오후, 같이 산책하자는 제안을 받는다\n사소한 오해로 어색해진 분위기\n축제나 시장 구경을 같이 가게 된다\n피곤해 보이는 상대를 챙겨 주게 된다\n상대의 몰랐던 취미나 비밀을 알게 된다\n늦은 밤, 잠이 안 와서 마주친다';

  const DEFAULT_ENC = '길 잃은 고양이를 발견한다\n우연히 옛 친구(또는 라이벌)와 마주친다\n갑자기 쏟아지는 소나기\n지갑이나 소지품을 잃어버린 사람을 돕는다\n수상한 쪽지나 초대장을 줍는다\n가게 주인이 이벤트 경품에 당첨됐다고 말한다\n길에서 낯선 사람에게 길을 묻는 일을 당한다\n정전이나 지하철 지연 같은 사소한 사고';
  const DEFAULT_SEEDS_EN = 'Running into each other at the same shop\nA sudden shower, with only one umbrella\nA lazy afternoon walk together\nAn awkward mood after a small misunderstanding\nA festival or street market outing\nLooking after someone who seems exhausted\nLearning a hidden hobby or secret\nMeeting late at night because neither can sleep';
  const DEFAULT_ENC_EN = 'Finding a lost cat\nBumping into an old friend or a rival\nA sudden downpour\nHelping someone who lost their wallet\nPicking up a mysterious note or invitation\nA shopkeeper says you won a prize\nSomeone asks for directions\nA small accident like a blackout or a delayed train';
  const defaults = {
    outLang: 'ui', translateInput: false, keepLen: true, keepLenText: '',
    choiceCount: 4, choiceLen: 70, choiceP1: '', choiceP2: '', choiceP3: '', choiceP4: '', choiceExtra: '',
    useSSLook: true, lookModel: 'gemini-3.1-flash', lookVision: false, stylePreset: 'ss', stylePresets: [], negative: '',
    analyzePlaces: false, bgBlank: false, bgBlankColor: '#ffffff', bgBlankAuto: true, textH: 0, lpWidth: 0, fabPos: null, htmlPos: null, fabShow: true, theme: 'sakura', spriteScale: 100, spriteY: 0, evText: true, followCount: 3, llmTimeout: 150, deleteFiles: true, hideInChat: false, htmlAuto: false, lang: 'ko', devMode: false, hideBlocks: true, hideYaml: true, hideRegex: '', cutout: true, cutTol: 34, emosDefault: ['neutral', 'joy', 'sadness', 'anger', 'surprise', 'embarrassment'], enabled: true, fab: true, autoOpen: false, inject: true, choicesMode: 'both', eventEvery: 4,
    useST: true, classify: true, useAvatars: true, autoSprite: true, npcAutoImg: false, npcStyleRef: false, cutOrig: {}, choiceFs: 90, choiceFsMin: 78, minTextH: 150, npcGap: 26, npcScale: 100, npcY: 0, npcFirst: 'R', npcFace: true, spriteCap: 6, useSS: true, autoAnalyze: true, hideTags: '',
    autoBg: true, autoEventImg: true, autoEventVid: false, videoConfirm: true,
    style: 'visual novel background art, soft anime painterly style, clean lines, rich atmosphere, high detail',
    cgStyle: 'visual novel event CG, anime illustration, cinematic composition, emotional lighting, high detail',
    typeSpeed: 16, textSize: 100, boxOpacity: 82, imgGapSec: 6, fadeMs: 700, eventSrc: 'ss', logSide: 'right', usage: { text: 0, image: 0, video: 0, r429: 0 }, llmProfile: '',
    imgProvider: 'vertex', vertexProject: '', vertexLocation: 'global', geminiKey: '', geminiModel: 'gemini-3.1-flash-image',
    videoProvider: 'auto', videoKey: '', videoProject: '', videoLocation: 'us-central1', videoToken: '',
    videoModel: 'veo-3.1-fast-generate-preview', videoSeconds: '4', videoRes: '720p', videoAudio: false,
    videoPrompt: 'Bring this visual novel event scene to life with subtle, natural cinematic motion: slow gentle camera push-in, soft breathing, hair and clothing moving slightly, ambient atmosphere. Keep the composition, characters, outfits and art style exactly as in the image. No text, no subtitles, no new characters.',
    dailySeeds: DEFAULT_SEEDS, encSeeds: DEFAULT_ENC, encCount: 2,
    places: {}, placesBy: {}, placesMigrated: false,   // 장소 이미지는 캐릭터별로 저장: placesBy[캐릭터][key] = {name, url, desc, user}
    chars: {},    // 캐릭터별 의상: { avatar: {look, def, outfits:{이름:{desc, base, emo:{label:url}}}} }
  };

  /* ================= 저장소/유틸 ================= */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const uid = () => 'v' + Math.random().toString(36).slice(2, 9);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $q = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function S() {
    const { extensionSettings } = ctx();
    if (!extensionSettings[MODULE]) extensionSettings[MODULE] = structuredClone(defaults);
    const s = extensionSettings[MODULE];
    for (const k of Object.keys(defaults)) if (s[k] === undefined) s[k] = structuredClone(defaults[k]);
    if (!s.m16) { s.m16 = true; if (s.choicesMode === 'choice') s.choicesMode = 'both'; if (s.lookModel === 'gemini-2.5-flash') s.lookModel = 'gemini-3.1-flash'; }      // 1.7: 선택지 아래에 직접 입력칸, 외형 추출 모델 3.1
    if (!s.m15) { s.m15 = true; s.autoOpen = false; s.lookVision = false; }   // 1.5: SillyTavern 채팅 중에 팝업이 저절로 뜨지 않게, 외형 추출은 장면 생성기 방식으로
    return s;
  }
  const saveSettings = () => ctx().saveSettingsDebounced();
  const tmpMeta = {
    aff: {}, day: 1, slot: 0, outfit: {}, loc: '', gallery: [], log: [], lastEvent: -99, mode: 'chat', hist: [], applied: {},
    startDate: '', ms: {}, chatEvents: [], sched: {}, cal: {}, annivs: [], npcs: [], arc: '', weather: '', time: '', usedSS: [], lastSS: 0,
    dossier: {}, analyzed: {}, heartDone: {}, milestone: {}, plans: {}, nodes: {}, wish: '', mapHist: [],
  };
  function M() {
    const m = ctx().chatMetadata;
    if (!m) return tmpMeta;
    if (!m[MODULE]) m[MODULE] = structuredClone(tmpMeta);
    const x = m[MODULE];
    for (const [k, v] of Object.entries(tmpMeta)) if (x[k] === undefined) x[k] = structuredClone(v);
    return x;
  }
  const saveMeta = () => { const c = ctx(); (c.saveMetadataDebounced || c.saveMetadata)?.(); };

  /* ================= 캐릭터/호감도/의상 데이터 ================= */
  function castList() {
    const c = ctx(), list = [];
    if (c.groupId) {
      const g = c.groups?.find((x) => x.id == c.groupId);
      g?.members?.forEach((av) => { const ch = c.characters.find((x) => x.avatar === av); if (ch) list.push(ch); });
    } else if (c.characterId != null && c.characters?.[c.characterId]) list.push(c.characters[c.characterId]);
    return list;
  }
  const castByName = (name) => {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    return castList().find((ch) => ch.name.toLowerCase() === n) || castList().find((ch) => n.length >= 2 && (ch.name.toLowerCase().includes(n) || n.includes(ch.name.toLowerCase()))) || null;
  };
  function activeChar() {
    const last = [...(ctx().chat || [])].reverse().find((m) => m && !m.is_user && !m.is_system);
    return castByName(last?.name) || castList()[0] || null;
  }
  const chKey = (ch) => ch?._key || ch?.avatar || ch?.name || '';
  /* 한 카드에 여러 인물이 있을 때: 카드 안의 다른 인물을 '하위 인물'로 등록해 외형·표정·의상을 따로 관리한다 */
  const subsOf = (card) => (cdata(card).subs ||= []);
  const subChar = (card, name) => Object.assign({}, card, { name, _key: `${card.avatar || card.name}#${name}`, _parent: card });
  const castAll = () => castList().flatMap((c) => [c, ...subsOf(c).map((n) => subChar(c, n))]);
  /* 장소 이미지는 캐릭터(그룹)별로 따로 저장한다. 예전 버전의 공용 데이터는 처음 열린 캐릭터로 옮긴다. */
  const placeScope = () => { const c = ctx(); return c.groupId ? 'g:' + c.groupId : (chKey(activeChar()) || 'none'); };
  function placesOf() {
    const s = S(); s.placesBy ||= {};
    const k = placeScope();
    if (!s.placesMigrated) { if (s.places && Object.keys(s.places).length) { s.placesBy[k] = { ...s.places }; s.places = {}; } s.placesMigrated = true; }
    return (s.placesBy[k] ||= {});
  }
  function cdata(ch) {
    const s = S(), k = chKey(ch);
    if (!k) return { look: '', def: '', outfits: { 기본: { base: '', emo: {} } } };
    if (!s.chars[k]) s.chars[k] = { look: '', def: '', outfits: {} };
    const c = s.chars[k]; c.outfits ||= {}; c.suggest ||= {}; c.outfits['기본'] ||= { base: '', emo: {}, auto: true };
    return c;
  }
  const affOf = (name) => M().aff[name] ?? 0;
  const affLevel = (v) => { let out = AFF_LEVELS[0][1]; for (const [t, n] of AFF_LEVELS) if (v >= t) out = n; return out; };
  function outfitOf(ch) {
    const cd = cdata(ch), cur = M().outfit[ch?.name];
    if (cur && cd.outfits[cur]) return cur;
    return cd.def && cd.outfits[cd.def] ? cd.def : '기본';
  }
  function matchOutfit(ch, name) {
    if (!name) return null;
    const n = name.trim().toLowerCase(), cd = cdata(ch);
    if (['기본', 'default', 'base', 'casual'].includes(n)) return '기본';
    return Object.keys(cd.outfits).find((o) => o.toLowerCase() === n) || Object.keys(cd.outfits).find((o) => n.includes(o.toLowerCase()) || o.toLowerCase().includes(n)) || null;
  }

  /* ================= SillyTavern 표정 스프라이트 ================= */
  const spriteCache = {};
  async function stSprites(ch) {
    const k = chKey(ch);
    if (!k) return {};
    if (spriteCache[k]) return spriteCache[k];
    const names = (ch._parent ? [ch.name] : [ch.name, String(ch.avatar || '').replace(/\.[^.]+$/, '')]).filter(Boolean);
    let map = {};
    for (const n of names) {
      try {
        const r = await fetch('/api/sprites/get?name=' + encodeURIComponent(n), { headers: ctx().getRequestHeaders?.() || {} });
        if (!r.ok) continue;
        const j = await r.json();
        if (Array.isArray(j) && j.length) {
          for (const it of j) if (it?.label && it?.path) (map[String(it.label).toLowerCase()] ||= []).push(it.path);
          break;
        }
      } catch { /* 다음 이름 */ }
    }
    spriteCache[k] = map;
    return map;
  }
  const availEmos = (ch) => { const m = spriteCache[chKey(ch)]; const ks = m ? Object.keys(m) : []; return ks.length ? ks : EMOS; };
  function normEmo(e, avail) {
    let x = String(e || '').trim().toLowerCase().replace(/[^a-z가-힣_-]/g, '');
    if (!x) return null;
    if (avail.includes(x)) return x;
    if (EMO_SYN[x] && avail.includes(EMO_SYN[x])) return EMO_SYN[x];
    if (EMO_SYN[x] && EMOS.includes(EMO_SYN[x])) return EMO_SYN[x];
    return EMOS.includes(x) ? x : null;
  }
  async function classify(text) {
    const s = S();
    if (!s.classify) return null;
    try {
      const r = await fetch('/api/extra/classify', { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify({ text: text.slice(0, 1500) }) });
      if (!r.ok) return null;
      const j = await r.json();
      return j?.classification?.[0]?.label || null;
    } catch { return null; }
  }
  function guessEmo(t) {
    const rules = [[/하하|ㅎㅎ|웃|기쁘|좋아|신나/, 'joy'], [/흑|눈물|슬프|울/, 'sadness'], [/화가|짜증|분노|닥쳐|꺼져/, 'anger'], [/부끄|붉어|빨개|얼굴이 (뜨|달)/, 'embarrassment'], [/\?!|!\?|깜짝|헉|뭐\?/, 'surprise'], [/무서|떨리|벌벌/, 'fear'], [/사랑|좋아해|두근/, 'love'], [/\?/, 'curiosity']];
    return (rules.find(([re]) => re.test(t)) || [0, 'neutral'])[1];
  }
  /* 표정 28종을 이미지 생성이 현실적인 10종으로 묶는다 (이미지 비용·일관성 때문) */
  const CORE = ['neutral', 'joy', 'sadness', 'anger', 'surprise', 'embarrassment', 'nervousness', 'annoyance', 'love', 'curiosity'];
  const CORE_MAP = { admiration: 'joy', amusement: 'joy', approval: 'joy', excitement: 'joy', optimism: 'joy', pride: 'joy', relief: 'joy', gratitude: 'joy', joy: 'joy', caring: 'love', desire: 'love', love: 'love', anger: 'anger', disgust: 'annoyance', annoyance: 'annoyance', disapproval: 'annoyance', disappointment: 'sadness', grief: 'sadness', remorse: 'sadness', sadness: 'sadness', fear: 'nervousness', nervousness: 'nervousness', embarrassment: 'embarrassment', surprise: 'surprise', realization: 'surprise', confusion: 'curiosity', curiosity: 'curiosity', neutral: 'neutral' };
  const coreEmo = (e) => CORE_MAP[e] || 'neutral';
  const EMO_DESC = {
    neutral: 'relaxed natural standing pose, weight on one leg, arms relaxed, slight three-quarter body turn, soft calm face',
    joy: 'laughing happily, leaning slightly forward, hands clasped near the chest, bright smile',
    sadness: 'head lowered, hugging their own arm, teary eyes, drooping shoulders',
    anger: 'arms crossed, sharp glare, one foot forward, furrowed brows',
    surprise: 'startled, both hands raised near the chest, leaning back, wide eyes and open mouth',
    embarrassment: 'blushing, looking away, one hand touching hair or cheek, fidgeting',
    nervousness: 'fidgeting with fingers, tense shoulders, uneasy sideways glance',
    annoyance: 'pouting, one hand on hip, half-lidded eyes, head turned slightly away',
    love: 'one hand on chest, soft loving gaze, gentle smile, slight blush, head tilted',
    curiosity: 'head tilted, leaning toward the viewer, one hand near the chin, interested eyes',
    admiration: 'eyes sparkling, hands pressed together near the chin, looking up with awe',
    amusement: 'trying not to laugh, hand covering the mouth, shoulders shaking, playful eyes',
    approval: 'confident nod, small satisfied smile, one thumb up or a hand on hip',
    caring: 'gentle concerned look, one hand reaching out slightly, soft warm smile',
    confusion: 'puzzled frown, head tilted, one hand scratching the head, eyebrows raised',
    desire: 'half-lidded alluring gaze, slight blush, lip bitten lightly, leaning in a little',
    disappointment: 'deflated posture, downcast eyes, a small sigh, arms hanging loosely',
    disapproval: 'stern look, arms crossed, one eyebrow raised, chin slightly lifted',
    disgust: 'wrinkled nose, leaning away, one hand raised as if pushing something off',
    excitement: 'bouncing with energy, both fists clenched near the chest, wide sparkling eyes, big grin',
    fear: 'frightened, shrinking back, hands held close to the chest, wide trembling eyes',
    gratitude: 'warm smile, hands held over the heart, a slight bow of the head',
    grief: 'overwhelmed with sorrow, face half hidden by a hand, tears running, slumped shoulders',
    optimism: 'looking up and forward with a hopeful smile, chest open, one fist lightly raised',
    pride: 'chin lifted, hands on hips, confident smirk, chest out',
    realization: 'sudden realization, eyes widening, one finger raised, mouth slightly open',
    relief: 'letting out a breath, shoulders relaxing, soft smile with eyes closed',
    remorse: 'guilty look, head bowed, hands clasped in front, avoiding eye contact',
  };
  const ALL_EMOS = Object.keys(EMO_DESC);
  const SET6 = ['neutral', 'joy', 'sadness', 'anger', 'surprise', 'embarrassment'];
  const portraitSet = new Set();
  const isPortrait = (u) => /vngen_/.test(u || '') || portraitSet.has(u);
  const stHas = (ch, emo) => { const m = spriteCache[chKey(ch)] || {}; return !!(m[emo]?.[0] || m[coreEmo(emo)]?.[0]); };
  /* 정확히 이 의상+표정에 맞는 이미지가 있는지 (대표 이미지 대체는 '정확'으로 치지 않는다) */
  function exactSprite(ch, emo, outfit) {
    const of = cdata(ch).outfits[outfit];
    return of?.emo?.[emo] || of?.emo?.[coreEmo(emo)] || null;
  }
  /* 의상 이미지 → (기본 의상이면) ST 표정 스프라이트 → 대표 이미지 → 아무 ST 스프라이트 → 카드 이미지 */
  async function spriteFor(ch, emo, outfit) {
    const of = cdata(ch).outfits[outfit], kind = (u) => ({ url: u, kind: isPortrait(u) ? 'portrait' : 'sprite' });
    const ex = exactSprite(ch, emo, outfit);
    if (ex) return kind(ex);
    const sp = S().useST ? await stSprites(ch) : {}, pick = (l) => sp[l]?.[0];
    if (outfit === '기본' || !of) { const u = pick(emo) || pick(coreEmo(emo)); if (u) return kind(u); }
    if (of?.base) return kind(of.base);
    const u = pick(emo) || pick(coreEmo(emo)) || pick('neutral') || Object.values(sp)[0]?.[0];
    if (u) return kind(u);
    if (ch?.avatar) return { url: '/characters/' + encodeURIComponent(ch.avatar), kind: 'avatar' };
    return { url: '', kind: 'none' };
  }

  /* ================= 응답 파싱 ================= */
  const RE_BLOCK = /\[VN\]([\s\S]*?)\[\/VN\]/i;
  const RE_BLOCK_ALL = /\[VN\][\s\S]*?(\[\/VN\]|$)/gi;
  const COT_TAGS = ['think', 'thinking', 'thought', 'thoughts', 'reasoning', 'reason', 'cot', 'analysis', 'scratchpad', 'reflection', 'planning', 'details', 'inner_thoughts', 'thinking_process', 'thinkingprocess', 'status', 'statusblock', 'status_block', 'statuswindow', 'status_window', 'infoblock', 'info_block', 'uiblock', 'hud', 'panel', 'character_status', '상태창', '상태', '스탯', '정보창', 'style', 'script', 'facts', 'fact', 'infobox', 'charinfo', 'memo', 'tracker'];
  /* 프리셋의 CoT/생각 블록은 연출에서 빼고 본문만 남긴다 */
  /* 같은 이름의 태그가 중첩돼 있어도 짝을 맞춰 통째로 지운다 (<div><div></div></div>). 닫는 태그가 없으면 여는 태그만 지운다 */
  function removeElements(text, names) {
    let t = String(text || '');
    for (const n of names) {
      const re = new RegExp(`<${n}\\b[^>]*>|</${n}\\s*>`, 'gi'); let out = '', i = 0, depth = 0, start = -1, m;
      while ((m = re.exec(t))) {
        if (m[0][1] !== '/') { if (depth === 0) start = m.index; depth++; }
        else if (depth > 0) { depth--; if (depth === 0) { out += t.slice(i, start); i = m.index + m[0].length; start = -1; } }
      }
      out += depth > 0 && start >= 0 ? t.slice(i, start) + t.slice(start).replace(new RegExp(`<${n}\\b[^>]*>`, 'i'), '') : t.slice(i);
      t = out;
    }
    return t;
  }
  function stripCot(text) {
    const vnKeep = []; let t = String(text || '').replace(RE_BLOCK_ALL, (m) => { vnKeep.push(m); return `\u0000VN${vnKeep.length - 1}\u0000`; });   // [VN] 블록은 YAML 숨기기에 걸리지 않게 먼저 빼 둔다
    const extra = String(S().hideTags || '').split(',').map((x) => x.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
    const names = [...new Set([...COT_TAGS, ...extra])];
    if (S().hideBlocks !== false) {   // 상태창으로 쓰이는 코드블록 / HTML 블록 / [STATUS] 블록을 통째로 숨긴다
      t = t.replace(/```[\s\S]*?(```|$)/g, '').replace(/~~~[\s\S]*?(~~~|$)/g, '');
      t = removeElements(t, ['div', 'table', 'section', 'aside', 'pre', 'details', 'center', 'fieldset', 'ul', 'svg', 'canvas']);
      t = t.replace(/\[(status|state|stats?|info|상태창?|스탯)\][\s\S]*?\[\/\1\]/gi, '');
    }
    if (S().hideYaml !== false) {      // key: value 줄이 3줄 이상 이어지는 YAML형 상태창을 숨긴다
      const L = t.split('\n'), keep = [], isY = (l) => /^\s*(-\s+)?[\w가-힣 ._\-/]{1,28}:\s*\S/.test(l) || /^\s*-\s+\S/.test(l);
      for (let i = 0; i < L.length;) { let j = i; while (j < L.length && isY(L[j])) j++; if (j - i >= 3) { i = j; continue; } if (j > i) { keep.push(...L.slice(i, j)); i = j; } else { keep.push(L[i]); i++; } }
      t = keep.join('\n');
    }
    for (const line of String(S().hideRegex || '').split('\n').map((x) => x.trim()).filter(Boolean)) { try { t = t.replace(new RegExp(line, 'gim'), ''); } catch { /* 잘못된 정규식은 무시 */ } }
    for (const n of names) {
      t = t.replace(new RegExp(`<${n}\\b[^>]*>[\\s\\S]*?</${n}\\s*>`, 'gi'), '');
      t = t.replace(new RegExp(`^[\\s\\S]*?</${n}\\s*>`, 'i'), '');      // 여는 태그가 잘려 나간 경우
      t = t.replace(new RegExp(`<${n}\\b[^>]*>[\\s\\S]*$`, 'i'), '');     // 닫는 태그가 없는 경우
    }
    return t.replace(/\u0000VN(\d+)\u0000/g, (m, i) => vnKeep[+i] || '');
  }
  const unwrapQuotes = (s) => { const m = String(s).match(/^(["“「])([\s\S]*)(["”」])$/); return m && !/["“”「」]/.test(m[2]) ? m[2].trim() : String(s); };   // 전체를 감싼 한 쌍일 때만 벗긴다
  const plainOf = (s) => String(s || '').replace(/<\/?[a-zA-Z][^>]*>/g, '').replace(/&lt;\/?[a-zA-Z][^&]*?&gt;/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  function parseBlock(mes) {
    const clean = stripCot(mes);
    const out = { text: plainOf(clean.replace(RE_BLOCK_ALL, '').replace(/\[LOC:[^\]]*\]/gi, '')), choices: [], info: [] };
    const m = clean.match(RE_BLOCK);
    if (!m) return out;
    for (const raw of m[1].split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const ch = line.match(/^(\d)\s*[:.):]\s*(.+)$/);
      if (ch) { out.choices.push(unwrapQuotes(ch[2].trim())); continue; }
      const kv = line.match(/^([a-z_]+)\s*[:=]\s*(.*)$/i);
      if (!kv) continue;
      const k = kv[1].toLowerCase(), v = kv[2].trim();
      if (k === 'aff') { const n = parseInt(v.replace(/[^\d+-]/g, ''), 10); if (Number.isFinite(n)) out.aff = clamp(n, -8, 8); }
      else if (k === 'info') { const i = v.search(/[:：]/); if (i > 0) { const label = v.slice(0, i).trim().slice(0, 14), val = v.slice(i + 1).trim().slice(0, 90); if (label && val) out.info.push({ label, val }); } }
      else if (['loc', 'emo', 'outfit', 'event', 'who', 'time', 'weather'].includes(k) && v && !/^(none|-|없음|n\/a)$/i.test(v)) out[k] = v;
    }
    if (out.emo) { out.emoSeq = out.emo.split(/[,>→/]+/).map((x) => x.trim()).filter(Boolean).slice(0, 4); out.emo = out.emoSeq[0] || out.emo; }
    return out;
  }
  function chunk(t, max = 120) {
    if (t.length <= max) return [t];
    const out = [], parts = t.split(/(?<=[.!?…。！？])\s+/);
    let cur = '';
    for (const p of parts) { if ((cur + ' ' + p).trim().length > max && cur) { out.push(cur.trim()); cur = p; } else cur = (cur + ' ' + p).trim(); }
    if (cur) out.push(cur.trim());
    return out;
  }
  function splitLines(raw) {
    const t = String(raw || '').replace(/<[^>]+>/g, '').replace(/\r/g, '');
    const out = [], push = (k, s) => { s = s.replace(/\s+/g, ' ').trim(); if (s) chunk(s).forEach((c) => out.push({ k, t: c })); };
    const hasQuote = /["“「][^"“”」\n]+["”」]/.test(t), hasStar = /\*[^*\n]+\*/.test(t);
    for (const para of t.split(/\n+/)) {
      if (hasQuote) para.split(/(["“][^"“”\n]+["”]|「[^」\n]+」)/).forEach((seg) => { if (!seg) return; if (/^["“「]/.test(seg)) push('say', seg.replace(/^["“「]|["”」]$/g, '')); else push('narr', seg.replace(/[*_]/g, '')); });
      else if (hasStar) para.split(/(\*[^*\n]+\*)/).forEach((seg) => { if (/^\*.*\*$/.test(seg)) push('narr', seg.slice(1, -1)); else push('say', seg.replace(/[*_]/g, '')); });
      else push('say', para.replace(/[*_]/g, ''));
    }
    return out;
  }
  function parseJSON(text) {
    const t = String(text).replace(/```json|```/g, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < a) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  }

  /* ================= 모델 지시문 주입 ================= */
  const HEART_STEPS = [[20, '가까워진 순간'], [40, '마음이 흔들리는 순간'], [60, '고백 직전'], [80, '연인의 시작'], [95, '영원한 약속']];
  const dossierOf = (name) => (M().dossier[name] ||= { facts: {}, summary: '' });
  function injectText() {
    const s = S();
    if (!s.enabled || !s.inject) return '';
    const c = ctx(), ch = activeChar(), name = ch?.name || 'the character', user = c.name1 || 'the player';
    const cd = ch ? cdata(ch) : { outfits: { 기본: {} } };
    const outfits = Object.keys(cd.outfits);
    const places = [...new Set([...Object.values(placesOf()).map((p) => p.name), ...ssPlaces().map((p) => p.name)])].slice(0, 30);
    const aff = affOf(name), emos = availEmos(ch).join(', '), dos = ch ? dossierOf(name) : { facts: {}, summary: '' };
    const nCh = clamp(+s.choiceCount || 4, 2, 4), prom = choiceProms().map((x) => x.replace(/\{\{user\}\}/g, user).replace(/\{\{char\}\}/g, name));
    const choiceRule = s.choicesMode === 'free' ? '' : '\n' + Array.from({ length: nCh }, (_, i) => `${i + 1}: <option ${i + 1}>`).join('\n');
    const OLK = outLangKey() === 'en' ? 'en' : 'ko';
    const subs = ch ? subsOf(ch) : [];
    const whoLine = subs.length ? `who: <the character the camera focuses on or who speaks most in this reply: exactly one of ${[name, ...subs].join(', ')}. emo, outfit and aff then refer to that character>\n` : '';
    const subOutfits = subs.length ? `\nOutfits by character: ${[name, ...subs].map((n) => `${n}: ${Object.keys((n === name ? cd : cdata(subChar(ch, n))).outfits).join(', ')}`).join(' / ')}.` : '';
    const ms = ch && M().milestone[name];
    return `[Visual Novel Mode]
The reply is shown in a visual novel UI. After the story text, end EVERY reply with exactly one status block in this format (it is hidden from the player; never mention it):
[VN]
loc: <current location name, short and consistent${places.length ? `; known places: ${places.join(', ')}` : ''}>
${whoLine}emo: <${name}'s expression, one of: ${emos}. If the expression changes during the reply, list up to 3 in order separated by commas (e.g. embarrassment, joy)>
outfit: <what ${name} wears now; choose from: ${outfits.join(', ')}. Change it only when the story clearly changes their clothes (sleepwear at night, swimwear at the beach). Propose a new name only if none of these fits>
time: <time of day, e.g. ${OLK === 'en' ? 'Morning 8:00, Evening 7:30' : '아침 8:00, 저녁 7:30'}>
weather: <weather, e.g. ${OLK === 'en' ? 'Sunny, Cloudy, Rain, Snow' : '맑음, 흐림, 비, 눈'}>
aff: <integer from -8 to +8: how ${name}'s feelings toward ${user} changed because of ${user}'s latest message/action. 0 is very common>
info: <Label>: <value>   (only when this reply newly reveals a concrete fact about ${name} that ${user} now knows: age, birthday, job, likes, dislikes, hobby, habit, worry, secret. Short label in ${OUTN() || LANGN()}. Up to 2 such lines. Omit if nothing new)
event: <ONLY at a truly memorable, cinematic moment: one English sentence describing the CG. Otherwise omit this line>${choiceRule}
[/VN]
${subOutfits}\nAffinity rules: ${name}'s current closeness to ${user} is ${aff} on a -100..100 scale (${affLevel(aff)}).${dos.summary ? ` Relationship so far: ${dos.summary}` : ''} Decide "aff" ONLY from ${name}'s own personality, background, tastes and current feelings, never from general etiquette. The same action can delight one character and upset another (a shy character may dislike boldness, a bold or teasing one may enjoy it, a proud one may be impressed by confidence, a cold one may stay indifferent). Rude or kind behavior is NOT automatically bad or good: ask what THIS character would feel. Many replies should be 0 or ±1; use larger values only when something really matters to this character. The story text must show the same reaction.${s.choicesMode === 'free' ? '' : `\nChoices (CYOA style): write exactly ${nCh} options for ${user}. Each option is a vivid line of 1-2 sentences (roughly up to ${+s.choiceLen || 70} characters) in first person that combines a concrete action and/or spoken words, never meta text. Make them genuinely different in intent, tone and consequence, following this brief by number: ${prom.slice(0, nCh).map((x, i) => `[${i + 1}] ${x}`).join(' ')}${String(s.choiceExtra || '').trim() ? ` Extra instructions: ${String(s.choiceExtra).trim()}` : ''} Whether each option helps or hurts depends on ${name}'s personality; do not hint which is best.`}
Event rule: emit "event:" at most once every ${s.eventEvery} replies.${ms ? `\nMilestone: closeness just reached "${ms[1]}". If the scene allows, make the next scene a special memorable moment and include an "event:" line.` : ''}
${s.keepLen ? `\nLength and quality rule: keep every reply at least as long, detailed and vivid as your earlier replies in this chat, no matter how short or simple ${user}'s last message or chosen option was. Expand a brief action into rich scene detail (senses, surroundings, ${name}'s inner reactions, other people), never mirror the shortness of the input and never let replies shrink over time.${String(s.keepLenText || '').trim() ? ` ${String(s.keepLenText).trim()}` : ''}` : ''}
${OUTN() ? `Write the story text, the status block values and ALL choices in ${OUTN()}, even if earlier messages in this chat are in another language.` : 'Write the story text normally and in the same language as before.'} Put dialogue in quotation marks.`;
  }
  function refreshInject(type, _p, dry) {
    try {
      const c = ctx();
      const text = (type === 'quiet' || dry) ? '' : injectText();
      c.setExtensionPrompt?.(KEY, text, 1, 0, false, 0);
    } catch (e) { console.warn('[VN] 주입 실패', e); }
  }

  /* ================= 호출 기록 (어디서 몇 번 나가는지 보이게) ================= */
  const usageLog = [];
  const estTok = (s) => { s = String(s || ''); let h = 0; for (const c of s) if (c >= '가' && c <= '힣') h++; return Math.ceil(h * 1.2 + (s.length - h) / 4); };
  function logUsage(kind, label, status, tok = null, err = '') {
    const u = (S().usage ||= { text: 0, image: 0, video: 0, r429: 0 });
    if (status === 'ok') u[kind] = (u[kind] || 0) + 1;
    if (status === '429') u.r429 = (u.r429 || 0) + 1;
    if (tok && status === 'ok') {
      if (kind === 'text') { u.tin = (u.tin || 0) + (tok.in || 0); u.tout = (u.tout || 0) + (tok.out || 0); }
      else { u.iin = (u.iin || 0) + (tok.in || 0); u.iout = (u.iout || 0) + (tok.out || 0); }
    }
    usageLog.unshift({ t: Date.now(), kind, label, status, tok, err: String(err || '').slice(0, 200) }); if (usageLog.length > 60) usageLog.pop();
    saveSettings(); try { ui.usagePill?.(); } catch { /* UI 아직 없음 */ }
  }

  /* ================= 텍스트 모델 호출 (일상 모드·분석·외형 추출) ================= */
  const profileList = () => { const cm = ctx().extensionSettings?.connectionManager; return Array.isArray(cm?.profiles) ? cm.profiles : []; };
  async function llm(prompt, maxTok = 2048, label = '텍스트') {
    const s = S(), c = ctx();
    const prof = s.llmProfile ? profileList().find((p) => p.id === s.llmProfile) : null;
    const limit = s.fastLlm ? 0.3 : Math.max(20, +s.llmTimeout || 150);   // fastLlm은 테스트용 숨김 옵션
    const run = async () => {
      let out = '';
      if (prof && c.ConnectionManagerRequestService?.sendRequest) {
        try {
          const r = await c.ConnectionManagerRequestService.sendRequest(prof.id, [{ role: 'user', content: prompt }], maxTok, { stream: false, extractData: true }, {});
          out = typeof r === 'string' ? r : (r?.content ?? '');
        } catch (e) { console.warn('[VN] 연결 프로필 실패', e); }
      }
      if (!String(out).trim() && c.generateRaw) {   // 채팅 기록을 섞지 않는 호출 (일상이 채팅과 독립되도록)
        try { const r = await c.generateRaw({ prompt, systemPrompt: '' }); if (typeof r === 'string') out = r; } catch (e) { console.warn('[VN] generateRaw 실패', e); }
      }
      if (!String(out).trim()) out = await c.generateQuietPrompt(prompt, false, false);
      if (typeof out !== 'string' || !out.trim()) throw new Error('모델 응답이 비어 있어요');
      return out;
    };
    let timer, out;
    try {
      out = await Promise.race([run(), new Promise((_, no) => { timer = setTimeout(() => no(new Error(`모델이 ${limit}초 안에 답하지 않았어요. 연결 프로필·모델 상태를 확인하고 다시 시도해 주세요`)), limit * 1000); })]);
    } catch (e) { logUsage('text', label, 'fail', null, e.message || e); throw e; }
    finally { clearTimeout(timer); }
    logUsage('text', label, 'ok', { in: estTok(prompt), out: estTok(out), est: true });
    return out;
  }

  /* ================= 이미지 생성 (Scene Studio에서 가져옴) ================= */
  async function urlToInline(url) {
    const r = await fetch(url), b = await r.blob();
    const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(b); });
    return { inlineData: { mimeType: b.type || 'image/png', data } };
  }
  async function saveImage(b64, mime, prefix = 'vn_') {
    const fmt = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
    try {
      const r = await fetch('/api/images/upload', { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify({ image: b64, format: fmt, ch_name: 'vnstudio', filename: prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 6) }) });
      if (!r.ok) throw new Error(r.status);
      return '/' + String((await r.json()).path).replace(/^\\+|^\/+/, '');
    } catch (e) {
      console.warn('[VN] 이미지 서버 저장 실패, 임시 표시만 합니다', e);
      return `data:${mime};base64,${b64}`;
    }
  }
  function apiUrl(action, model) {
    const s = S(), m = encodeURIComponent((model || s.geminiModel).trim());
    if (s.imgProvider !== 'vertex') return `https://generativelanguage.googleapis.com/v1beta/models/${m}:${action}`;
    const proj = s.vertexProject.trim(), loc = (s.vertexLocation || 'global').trim();
    if (!proj) return `https://aiplatform.googleapis.com/v1/publishers/google/models/${m}:${action}`;
    const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
    return `https://${host}/v1/projects/${encodeURIComponent(proj)}/locations/${loc}/publishers/google/models/${m}:${action}`;
  }
  /* 이미지 요청은 한 번에 하나씩, 간격을 두고 보낸다. 429/503이면 기다렸다가 다시 시도한다. */
  let imgChain = Promise.resolve(), imgLast = 0, ctxTok = null;
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
  function imgQueue(label, fn) {
    const run = async () => {
      const gap = Math.max(0, (+S().imgGapSec || 0) * 1000), waitMs = imgLast + gap - Date.now();
      if (waitMs > 0) await sleepMs(waitMs);
      const delays = S().fast429 ? [0.05, 0.1, 0.1] : [20, 45, 90];   // fast429는 테스트용 숨김 옵션
      for (let a = 0; a <= delays.length; a++) {
        try { ctxTok = null; const r = await fn(); imgLast = Date.now(); logUsage('image', label, 'ok', ctxTok); return r; }
        catch (e) {
          imgLast = Date.now();
          if ((e.status === 429 || e.status === 503) && a < delays.length) {
            logUsage('image', label, '429');
            const d = Math.max(e.retryAfter || 0, delays[a]);
            for (let s = d; s > 0; s--) { ui.status?.(`요청이 몰려 ${s}초 뒤 다시 시도해요 (${label})`); await sleepMs(1000); }
            ui.status?.(''); continue;
          }
          logUsage('image', label, 'fail', null, e.message || e); throw e;
        }
      }
    };
    const p = imgChain.then(run, run); imgChain = p.catch(() => {}); return p;
  }
  async function geminiGenerate(prompt, refs = [], aspect = '16:9', prefix = 'vn_', label = '이미지') {
    const s = S();
    if (!s.geminiKey.trim()) throw new Error('설정에 이미지 API 키를 입력해 주세요 (확장 프로그램 → VN Studio)');
    const parts = [];
    for (const u of refs) {
      if (u && typeof u === 'object') { parts.push(u); continue; }
      try { parts.push(await urlToInline(u)); } catch (e) { console.warn('[VN] 참조 이미지 로드 실패', e); }
    }
    parts.push({ text: prompt });
    const endpoint = apiUrl('generateContent');
    const call = async (withCfg) => {
      const body = { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } };
      if (withCfg) body.generationConfig.imageConfig = { aspectRatio: aspect };
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey.trim() }, body: JSON.stringify(body) });
      return { r, j: await r.json().catch(() => ({})) };
    };
    return imgQueue(label, async () => {
      let { r, j } = await call(true);
      if (r.status === 400 && /imageConfig|aspect/i.test(JSON.stringify(j))) ({ r, j } = await call(false));
      if (!r.ok) {
        const e = new Error(`${s.imgProvider === 'vertex' ? 'Agent Platform' : 'Gemini'} ${r.status}: ${j?.error?.message || '요청 실패'}`);
        e.status = r.status;
        const ra = Number(r.headers?.get?.('retry-after')) || parseFloat(String(j?.error?.details?.find((d) => d.retryDelay)?.retryDelay || '').replace('s', ''));
        if (ra) e.retryAfter = Math.min(120, ra);
        throw e;
      }
      const cand = j.candidates?.[0];
      const img = cand?.content?.parts?.map((p) => p.inlineData || p.inline_data).find(Boolean);
      if (!img?.data) {
        if (j.promptFeedback?.blockReason) throw new Error(`요청이 차단됐어요 (${j.promptFeedback.blockReason})`);
        throw new Error(cand?.finishReason ? `이미지가 생성되지 않았어요 (${cand.finishReason}). 안전 필터에 걸렸을 수 있어요.` : '응답에 이미지가 없어요');
      }
      const um = j.usageMetadata || {}; ctxTok = { in: um.promptTokenCount || 0, out: um.candidatesTokenCount || um.totalTokenCount || 0 };
      const saved = await saveImage(img.data, img.mimeType || img.mime_type || 'image/png', prefix);
      if (prefix === 'vngen_') portraitSet.add(saved);
      return saved;
    });
  }
  async function testGemini() {
    const s = S();
    if (!s.geminiKey.trim()) { toastr.warning('API 키를 먼저 입력해 주세요.'); return; }
    try {
      const h = { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey.trim() };
      const r = s.imgProvider === 'vertex'
        ? await fetch(apiUrl('countTokens'), { method: 'POST', headers: h, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }) })
        : await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.geminiModel.trim())}`, { headers: h });
      const j = await r.json().catch(() => ({}));
      if (r.ok) toastr.success(`연결 성공: ${s.geminiModel}`); else toastr.error(`${r.status}: ${j?.error?.message || '실패'}`);
    } catch (e) { toastr.error('요청 실패 (네트워크/CORS): ' + (e.message || e)); }
  }
  /* 아바타/스프라이트를 줄여서 참조 이미지로 (투명 PNG는 흰 배경으로 합성) */
  const refCache = {};
  async function refInline(url, max = 768) {
    if (!url) return null;
    if (refCache[url]) return refCache[url];
    let out = null;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      const blob = await r.blob(), obj = URL.createObjectURL(blob);
      try {
        const img = await new Promise((ok, no) => { const i = new Image(); const t = setTimeout(() => no(new Error('timeout')), 5000); i.onload = () => { clearTimeout(t); ok(i); }; i.onerror = (e) => { clearTimeout(t); no(e); }; i.src = obj; });
        const k = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
        out = { inlineData: { mimeType: 'image/jpeg', data: cv.toDataURL('image/jpeg', 0.88).split(',')[1] } };
      } finally { URL.revokeObjectURL(obj); }
    } catch { out = null; }
    if (out) refCache[url] = out;
    return out;
  }
  const personaFile = () => { const c = ctx(); return c.userAvatar || c.user_avatar || document.querySelector('#user_avatar_block .avatar-container.selected')?.getAttribute('data-avatar-id') || ''; };
  async function personaRef() {
    const f = personaFile();
    if (!f) return null;
    return (await refInline('/User Avatars/' + encodeURIComponent(f))) || (await refInline('/thumbnail?type=persona&file=' + encodeURIComponent(f)));
  }

  /* ---------- 장면 생성기(Scene Studio) 연동 ---------- */
  const ssSet = () => ctx().extensionSettings?.minimap || null;
  const ssWorld = () => ctx().chatMetadata?.minimap?.world || null;
  const ssPlaces = () => (S().useSS ? ssWorld()?.places || [] : []);
  const ssKeys = (p) => [p.name, ...(p.aliases || [])].map(pk).filter((k) => k.length >= 2);
  function ssFind(name) {
    const k = pk(name); if (!k) return null;
    const ps = ssPlaces();
    return ps.find((p) => ssKeys(p).includes(k)) || ps.find((p) => ssKeys(p).some((x) => x.length >= 3 && (x.includes(k) || k.includes(x)))) || null;
  }
  /* 장면 생성기가 이미 만들어 둔 그 장소의 이미지 (가장 최근 것) */
  function ssImage(p) {
    const w = ssWorld(); if (!w || !p) return null;
    const g = [...(w.gallery || [])].reverse().find((e) => e.placeId === p.id && e.kind !== 'video' && e.url && !String(e.url).startsWith('blob:'));
    return g ? g.url : null;      // 장면 생성기 갤러리에 실제로 있는 이미지만 쓴다 (지운 이미지는 따라서 사라진다)
  }
  const ssStyleText = () => (S().useSS && ssSet()?.styleText?.trim()) || '';
  /* 화풍: 'ss' = 장면 생성기와 동일(연동), 'custom' = 직접 입력, 그 외 = 저장한 프리셋. 장면 생성기에 화풍이 없으면 직접 입력 값을 쓴다 */
  const styleMain = () => { const s = S(), neg = String(s.negative || '').trim(); const base = (s.stylePreset === 'ss' && ssStyleText()) || String(s.cgStyle || '').trim(); return base + (neg ? `. Avoid: ${neg}` : ''); };
  const styleBg = () => { const s = S(), neg = String(s.negative || '').trim(); const base = (s.stylePreset === 'ss' && ssStyleText()) || String(s.style || '').trim() || String(s.cgStyle || '').trim(); return base + (neg ? `. Avoid: ${neg}` : ''); };
  const ssLookTag = (ch) => (S().useSS && S().useSSLook && String(ssSet()?.appearance?.[ch?.name]?.t || '').trim()) || '';

  /* ---------- 장소 배경 ---------- */
  const pk = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
  function findPlace(name) {
    const k = pk(name), ps = placesOf();
    if (!k) return null;
    if (ps[k]) return ps[k];
    const hit = Object.entries(ps).find(([key]) => key.length >= 2 && k.length >= 2 && (key.includes(k) || k.includes(key)));
    return hit ? hit[1] : null;
  }
  /* 배경 해석 순서: 직접 올린/이미 만든 이미지 → 장면 생성기 이미지 → (없으면) 새로 생성. 한 번 만든 건 다시 부르지 않는다. */
  function bgFor(name) {
    const mine = findPlace(name);
    if (mine?.url) return { url: mine.url, name: mine.name, from: mine.user ? 'user' : 'vn' };
    const sp = ssFind(name), u = sp && ssImage(sp);
    if (u) return { url: u, name: sp.name, from: 'ss' };
    return null;
  }
  let keyHinted = false;
  const hasImgKey = () => {
    if (S().geminiKey.trim()) return true;
    if (!keyHinted) { keyHinted = true; toastr.info('이미지 API 키가 없어서 자동 생성은 건너뛰어요. 확장 프로그램 → VN Studio에서 키를 넣어 주세요.'); }
    return false;
  };
  const loreCache = {};
  async function loreNames() {
    const c = ctx(), set = new Set();
    if (c.chatMetadata?.world_info) set.add(c.chatMetadata.world_info);
    const cw = c.characters?.[c.characterId]?.data?.extensions?.world;
    if (cw) set.add(cw);
    document.querySelectorAll('#world_info option:checked').forEach((o) => set.add(o.textContent.trim()));
    return [...set];
  }
  async function loreDesc(name) {
    const k = pk(name);
    if (!k) return '';
    const names = await loreNames(), found = [];
    for (const n of names) {
      try {
        if (!loreCache[n]) {
          const r = await fetch('/api/worldinfo/get', { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify({ name: n }) });
          if (!r.ok) continue;
          loreCache[n] = await r.json();
        }
        for (const e of Object.values(loreCache[n].entries || {})) {
          if (e.disable) continue;
          const keys = [e.comment, ...(e.key || [])].map(pk).filter((x) => x.length >= 2);
          if (keys.some((x) => x.includes(k) || k.includes(x))) found.push(String(e.content || '').replace(/\s+/g, ' ').slice(0, 450));
        }
      } catch (e) { console.warn('[VN] 로어북', n, e); }
    }
    return found.slice(0, 2).join(' ');
  }
  const bgBusy = new Set(), bgFailed = new Set();
  async function generatePlace(name, force = false) {
    const k = pk(name);
    if (!k || bgBusy.has(k)) return null;
    if (!force && bgFailed.has(k)) return null;
    bgBusy.add(k); ui.status('배경을 그리는 중… ' + name, !!st.genBusy);
    try {
      const s = S(), existing = findPlace(name), sp = ssFind(name);
      const desc = existing?.desc || sp?.visual || sp?.desc || await loreDesc(name);
      const style = styleBg();
      const prompt = `Generate one image. ${style}. Wide establishing background illustration of "${name}" for a visual novel.${desc ? ` Details: ${desc}.` : ''} Neutral time of day, no people, no characters, no text, no UI, no watermark.`;
      const url = await geminiGenerate(prompt, [], '16:9');
      placesOf()[k] = { ...(existing || {}), name: existing?.name || sp?.name || name, url, desc: existing?.desc || '', user: false };
      saveSettings(); bgFailed.delete(k);
      return url;
    } catch (e) { bgFailed.add(k); toastr.error('배경 생성 실패: ' + (e.message || e)); return null; }
    finally { bgBusy.delete(k); ui.status(''); }
  }

  /* ---------- 업로드 ---------- */
  async function uploadImage(file, maxH = 1400) {
    const obj = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = obj; });
      const k = Math.min(1, maxH / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const png = !/jpe?g/i.test(file.type);
      const data = cv.toDataURL(png ? 'image/png' : 'image/jpeg', 0.92);
      return saveImage(data.split(',')[1], png ? 'image/png' : 'image/jpeg');
    } finally { URL.revokeObjectURL(obj); }
  }

  /* ---------- 이벤트 CG ---------- */
  async function lookOf(ch) {
    const ssl = ssLookTag(ch); if (ssl) return ssl.slice(0, 600);              // ① 장면 생성기에 저장된 외형 태그(연동 켬)
    const cd = cdata(ch); if (cd.look?.trim()) return cd.look.trim();          // ② 내가 저장한 태그
    const text = [ch.description, ch.personality].filter(Boolean).join('\n');  // ③ 카드 설명
    return text ? text.replace(/\s+/g, ' ').slice(0, 350) : '';
  }
  /* 모델 답변에서 외형 태그 한 줄만 깨끗하게 뽑는다 (**tags:** 같은 머리말, 마크다운, 짧은 조각 제거) */
  function cleanLook(raw) {
    let s = stripCot(String(raw || ''));
    const j = parseJSON(s); if (j) { const v = j.tags || j.appearance || j.look || Object.values(j)[0]; if (v) s = Array.isArray(v) ? v.join(', ') : String(v); }
    const lines = s.split('\n').map((l) => l.replace(/[*_`#>]/g, '').replace(/^\s*[-•\d.)]+\s+/, '').trim()).filter(Boolean)
      .map((l) => l.replace(/^[^,:]{0,48}\b(tags?|appearance|description|visual)\b[^:]{0,40}:\s*/i, '').trim())
      .filter((l) => !/^(here|sure|okay|output|note|below)\b/i.test(l));
    let best = '', bestScore = 0;
    for (const l of lines) { const sc = (l.match(/,/g) || []).length * 10 + l.length / 10; if (sc > bestScore) { best = l; bestScore = sc; } }
    best = best.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
    return (best.length >= 25 && (best.match(/,/g) || []).length >= 3) ? best.slice(0, 700) : '';
  }
  /* Gemini에 이미지(카드 PNG)와 설명을 함께 보내 외형 태그를 뽑는다. PNG가 우선이고 설명은 빈틈을 채운다 */
  async function geminiText(prompt, parts = [], label = '텍스트 (Gemini)') {
    const s = S(); if (!s.geminiKey.trim()) throw new Error('이미지 API 키가 없어요');
    const body = { contents: [{ role: 'user', parts: [...parts, { text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } };
    const call = (m) => fetch(apiUrl('generateContent', m), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey.trim() }, body: JSON.stringify(body) });
    let r = await call(s.lookModel || 'gemini-3.1-flash'), j = await r.json().catch(() => ({}));
    if (!r.ok && (r.status === 404 || r.status === 400) && /not found|not supported|invalid model|unknown model/i.test(JSON.stringify(j)) && s.lookModel !== 'gemini-2.5-flash') { toastr.info(`외형 추출 모델 '${s.lookModel}'을 쓸 수 없어 gemini-2.5-flash로 대신 시도해요.`); r = await call('gemini-2.5-flash'); j = await r.json().catch(() => ({})); }
    if (!r.ok) { logUsage('text', label, 'fail'); throw new Error(`${r.status}: ${j?.error?.message || '요청 실패'}`); }
    const out = (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
    logUsage('text', label, 'ok', { in: j.usageMetadata?.promptTokenCount || estTok(prompt), out: j.usageMetadata?.candidatesTokenCount || estTok(out) });
    return out;
  }
  async function extractLook(ch) {
    const text = [ch.description, ch.personality].filter(Boolean).join('\n');
    const only = ch._parent ? `\nThe description may cover several people. Describe ONLY the person named "${ch.name}".` : '';
    if (S().lookVision && S().geminiKey.trim() && ch.avatar) {      // 선택: 카드 PNG를 보고 뽑기 (기본은 꺼짐)
      try {
        const img = await refInline('/characters/' + encodeURIComponent((ch._parent || ch).avatar), 1024);
        if (img) {
          const out = cleanLook(await geminiText(`The attached image is the character card portrait. Trust the image first; use the description only to fill what the image cannot show.${only}\nWrite ONE line of comma-separated English visual tags describing only the physical appearance and outfit (age impression, hair, eyes, skin, build, clothing, accessories). No names, no personality. Output only that line.\n\n${text.slice(0, 2500)}`, [img], '외형 태그 추출 (이미지)'));
          if (out) return out;
        }
      } catch (e) { console.warn('[VN] 이미지 기반 외형 추출 실패, 장면 생성기 방식으로 대체', e); }
    }
    if (!text.trim()) return '';
    // 장면 생성기(Scene Studio)와 같은 프롬프트: 설명 텍스트 3000자, 한 줄, 영어 태그
    const prompt = `Do NOT roleplay. From the description below, write ONE line of comma-separated English visual tags describing only the physical appearance and outfit (age impression, hair, eyes, skin, build, clothing, armor, accessories). No names, no personality, under 45 words. Output only that line.${only}\n\n${text.slice(0, 3000)}`;
    for (let i = 0; i < 2; i++) {
      const raw = await llm(prompt, 1024, i ? '외형 태그 추출 (재시도)' : '외형 태그 추출');
      const one = cleanLook(raw) || String(raw).trim().replace(/\s*\n+\s*/g, ' ').slice(0, 600);
      if (one && one.length >= 20 && (one.match(/,/g) || []).length >= 3) return one.slice(0, 600);
    }
    return '';
  }
  /* 이미지마다 외형이 달라지지 않도록, 처음 한 번 영어 외형 태그를 뽑아 저장해 두고 모든 생성에 똑같이 쓴다 */
  async function ensureLook(ch) {
    const ssl = ssLookTag(ch); if (ssl) return ssl.slice(0, 600);
    const cd = cdata(ch);
    if (cd.look?.trim()) return cd.look.trim();
    try { const v = await extractLook(ch); if (v) { cd.look = v; saveSettings(); return v; } } catch (e) { console.warn('[VN] 외형 추출 실패', e); }
    return [ch.description, ch.personality].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 300);   // 저장하지 않는 임시 대체
  }

  /* 캐릭터 기준 이미지: 이 의상의 neutral → 대표 → 다른 의상 neutral → 카드 이미지. 모든 생성이 같은 기준을 보게 해서 외형 흔들림을 줄인다 */
  async function charRefs(ch, outfit, max = 2) {
    const cd = cdata(ch), refs = [], notes = [];
    const of = cd.outfits[outfit] || {};
    const own = of.emo?.neutral || of.base || Object.values(of.emo || {})[0];
    const other = Object.entries(cd.outfits).map(([, o]) => o.emo?.neutral || o.base).find(Boolean);
    const first = own || other;
    if (first) { const r = await refInline(first, 1024); if (r) { refs.push(r); notes.push(`Reference image ${refs.length} is the established look of "${ch.name}"${own ? ' in this outfit' : ' (outfit may differ)'}. Keep EXACTLY the same face, hair color and style, eye color, skin tone, body proportions and art style.`); } }
    if (ch.avatar && refs.length < max) { const r = await refInline('/characters/' + encodeURIComponent(ch.avatar), 1024); if (r) { refs.push(r); notes.push(ch._parent ? `Reference image ${refs.length} is the character card image; it may show several people. The target is ONLY "${ch.name}". Match that person's face, hair and eyes.` : `Reference image ${refs.length} is the character card image of "${ch.name}". Match face, hair and eyes.`); } }
    return { refs, notes };
  }
  /* 이벤트 장면 이미지: ① 장면 생성기가 이미 만든 새 장면 ② 없으면 일관된 참조로 새로 생성 */
  function ssPickEvent(turn) {
    const w = ssWorld(), meta = M(); if (!S().useSS || !w) return null;
    const used = new Set(meta.usedSS || []);
    const g = [...(w.gallery || [])].filter((e) => e.kind !== 'video' && e.url && !String(e.url).startsWith('blob:') && !used.has(e.id) && (e.t || 0) > (meta.lastSS || 0))
      .sort((a, b) => (b.t || 0) - (a.t || 0));
    const sp = ssFind(turn.loc), pick = (sp && g.find((e) => e.placeId === sp.id)) || g[0];
    if (!pick) return null;
    const v = [...w.gallery].reverse().find((e) => e.kind === 'video' && e.src === pick.url && e.url && !String(e.url).startsWith('blob:'));
    (meta.usedSS ||= []).push(pick.id); if (meta.usedSS.length > 120) meta.usedSS.shift(); meta.lastSS = pick.t || Date.now(); saveMeta();
    return { url: pick.url, video: v?.url || '', moment: pick.moment || '' };
  }
  async function makeEventCG(turn) {
    const s = S(), bg = bgFor(turn.loc);
    const npc = turn.noChar && turn.npcName ? (npcByName(turn.npcName) || { name: turn.npcName, role: '', desc: '' }) : null;
    const ch = turn.noChar ? null : turn.ch;                 // 캐릭터가 그 장소에 없으면(NPC·혼자) 캐릭터를 그리지 않는다
    const look = ch ? await ensureLook(ch) : '';
    const refs = [], notes = [];
    if (s.useAvatars) {
      if (ch) { const r = await charRefs(ch, turn.outfit || outfitOf(ch)); refs.push(...r.refs); notes.push(...r.notes); }
      if (npc?.img) { const r = await refInline(npc.img, 1024); if (r) { refs.push(r); notes.push(`Reference image ${refs.length} is the NPC "${npc.name}". Match face, hair and outfit.`); } }
      if (!turn.charSolo) { const pr = await personaRef(); if (pr) { refs.push(pr); notes.push(`Reference image ${refs.length} is the player character "${ctx().name1}" (may appear from behind or in profile).`); } }
    }
    if (bg?.url && !bg.url.startsWith('data:')) { const pr2 = await refInline(bg.url); if (pr2) { refs.push(pr2); notes.push(`Reference image ${refs.length} is the location "${bg.name}". Keep the setting consistent.`); } }
    const sp2 = ssFind(turn.loc), pdesc = findPlace(turn.loc)?.desc || sp2?.visual || sp2?.desc || '';
    const style = styleMain();
    const focus = ch ? `${ch.name} (${look || 'as in the reference'}) is the focus, outfit: ${turn.outfit || outfitOf(ch)}.`
      : npc ? `The focus is the NPC ${npc.name}${npc.role ? `, ${npc.role}` : ''}${npc.desc ? ` (${npc.desc})` : ''}. ${turn.ch?.name || 'The main character'} is NOT in this scene.`
      : `The player character is alone; ${turn.ch?.name || 'the main character'} is NOT in this scene.`;
    const prompt = `${notes.join(' ')}\nGenerate one image. ${style}. Visual novel event CG moment: ${turn.event}. ${turn.loc ? `Location: ${turn.loc}.` : ''}${pdesc ? ` ${pdesc}.` : ''} ${focus} Natural candid body language, characters interact with each other and the scene. Emotional, cinematic framing, no text, no UI.`;
    return geminiGenerate(prompt, refs, '16:9', 'vn_', '이벤트 CG');
  }

  /* 배경 제거: 가장자리에서 시작해 '배경색과 비슷한 영역'만 투명하게 만든다 (균일한 배경에서 잘 동작) */
  function cutoutPixels(d, w, h, tol = 34) {
    const idx = (x, y) => (y * w + x) * 4, med = (arr) => arr.sort((a, b) => a - b)[arr.length >> 1];
    const rs = [], gs = [], bs = [];
    const pushPx = (x, y) => { const i = idx(x, y); rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); };
    for (let x = 0; x < w; x += 2) { pushPx(x, 0); pushPx(x, h - 1); }
    for (let y = 0; y < h; y += 2) { pushPx(0, y); pushPx(w - 1, y); }
    const bg = [med(rs), med(gs), med(bs)];
    const dist = (i) => { const a = d[i] - bg[0], b = d[i + 1] - bg[1], c = d[i + 2] - bg[2]; return Math.sqrt(a * a + b * b + c * c); };
    const mark = new Uint8Array(w * h), stack = [];
    const tryPush = (x, y) => { const p = y * w + x; if (!mark[p] && dist(p * 4) < tol) { mark[p] = 1; stack.push(p); } };
    for (let x = 0; x < w; x++) { tryPush(x, 0); tryPush(x, h - 1); }
    for (let y = 0; y < h; y++) { tryPush(0, y); tryPush(w - 1, y); }
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      if (x > 0) tryPush(x - 1, y); if (x < w - 1) tryPush(x + 1, y); if (y > 0) tryPush(x, y - 1); if (y < h - 1) tryPush(x, y + 1);
    }
    let cnt = 0; for (let p = 0; p < mark.length; p++) if (mark[p]) cnt++;
    const ratio = cnt / (w * h);
    if (ratio < 0.08 || ratio > 0.88) return { ok: false, ratio };   // 배경이 균일하지 않거나 인물까지 지워질 위험
    for (let p = 0; p < mark.length; p++) {
      const i = p * 4;
      if (mark[p]) { d[i + 3] = 0; continue; }
      const x = p % w, y = (p / w) | 0; let near = 0;      // 배경과 맞닿은 1~2픽셀은 부드럽게 (테두리 흰 띠 제거)
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && mark[yy * w + xx]) { near = Math.max(Math.abs(dx), Math.abs(dy)); break; } }
      if (near) { const k = clamp((dist(i) - tol * 0.5) / (tol * 1.2), 0, 1); d[i + 3] = Math.round(255 * (near === 1 ? Math.min(k, 0.75) : k)); }
    }
    return { ok: true, ratio };
  }
  async function cutoutImage(url, tol = S().cutTol || 34) {
    const r = await fetch(url); if (!r.ok) throw new Error('이미지를 불러오지 못했어요');
    const obj = URL.createObjectURL(await r.blob());
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = obj; });
      const k = Math.min(1, 1600 / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h);
      const data = g.getImageData(0, 0, w, h), res = cutoutPixels(data.data, w, h, tol);
      if (!res.ok) return { url: null, ratio: res.ratio };
      g.putImageData(data, 0, 0);
      return { url: await saveImage(cv.toDataURL('image/png').split(',')[1], 'image/png', 'vncut_'), ratio: res.ratio };
    } finally { URL.revokeObjectURL(obj); }
  }

  /* ---------- 표정/의상 이미지 생성 ---------- */
  const spriteBusy = new Set(), spriteFailed = new Set();
  let spriteGenCount = 0;
  const enabledEmos = (ch) => { const cd = cdata(ch); if (!Array.isArray(cd.emos)) cd.emos = [...(S().emosDefault || SET6)]; return cd.emos; };
  async function genSpriteImage(ch, outfit, emoKey) {
    const s = S(), cd = cdata(ch), of = (cd.outfits[outfit] ||= { base: '', emo: {} }), look = await ensureLook(ch);
    const { refs, notes } = await charRefs(ch, outfit);
    const outfitText = of.desc?.trim() || (outfit === '기본' ? "the character's signature default outfit (as in the reference)" : outfit);
    const style = styleMain();
    const prompt = `${notes.join(' ')}\nGenerate one image: a visual novel character sprite, waist-up portrait of "${ch.name}" (${look || 'as in the reference'}). Outfit: ${outfitText}. Hands empty and relaxed: do NOT draw bags, shoulder straps, backpacks, handbags or any carried or held object, even if the reference image shows one, unless the outfit text explicitly mentions it. Expression and pose: ${EMO_DESC[emoKey] || emoKey}. Natural, expressive, candid body language and a slight three-quarter angle, NOT a stiff straight-on attention stance. Rendering style: ${style}. Match EXACTLY the rendering style, level of realism, lighting and color grading of the reference image (if the reference is photorealistic, make this photorealistic too, NOT anime or illustration). Background: plain flat solid pure white, no floor, no shadow, no gradient, no props behind. Single character, no text, no UI, no watermark.${ch._parent ? ` The reference card image may show several people: draw ONLY ${ch.name}.` : ''}`;
    let url = await geminiGenerate(prompt, refs, '3:4', 'vngen_', `표정 ${ch.name}·${outfit}·${emoKey}`);
    if (s.cutout) {
      try { const c = await cutoutImage(url); if (c.url) { const orig = url; url = c.url; dropImage(orig); } else toastr.info(`배경 제거를 건너뛰었어요 (배경이 균일하지 않아요, 인식 ${(c.ratio * 100).toFixed(0)}%). 이미지는 원본으로 저장했어요.`); }
      catch (e) { console.warn('[VN] 배경 제거 실패', e); }
    }
    return url;
  }
  async function ensureSprite(ch, outfit, emo) {
    const key = `${chKey(ch)}|${outfit}|${emo}`;
    if (spriteBusy.has(key) || spriteFailed.has(key)) return null;
    if (spriteGenCount >= S().spriteCap) { if (spriteGenCount === S().spriteCap) { spriteGenCount++; toastr.info(`표정 자동 생성은 접속당 ${S().spriteCap}장까지만 해요. 표정·의상 탭에서 직접 더 만들 수 있어요.`); } return null; }
    spriteBusy.add(key); spriteGenCount++;
    try {
      const url = await genSpriteImage(ch, outfit, emo), of = cdata(ch).outfits[outfit];
      (of.emo ||= {})[emo] = url; if (!of.base && emo === 'neutral') of.base = url;
      saveSettings(); return url;
    } catch (e) { spriteFailed.add(key); toastr.warning(`표정 이미지 생성 실패 (${ch.name} · ${outfit} · ${emo}): ${e.message || e}`); return null; }
    finally { spriteBusy.delete(key); }
  }
  /* 한 의상의 표정 세트 (neutral을 먼저 만들어 기준으로 삼고, 요청은 큐로 천천히 보낸다) */
  async function genSet(ch, outfit, list, onProg, shouldStop) {
    const cd = cdata(ch), of = (cd.outfits[outfit] ||= { base: '', emo: {} });
    const todo = [...new Set(['neutral', ...list])].filter((e) => !of.emo?.[e]);
    let n = 0, made = 0;
    for (const e of todo) {
      if (shouldStop?.()) break;
      onProg?.(++n, todo.length, e);
      spriteFailed.delete(`${chKey(ch)}|${outfit}|${e}`);
      try {
        const url = await genSpriteImage(ch, outfit, e);
        (of.emo ||= {})[e] = url; if (!of.base && e === 'neutral') of.base = url; of.auto = true; saveSettings(); made++;
      } catch (err) { toastr.error(`${e} 생성 실패: ${err.message || err}`); if (e === 'neutral') break; }
    }
    return made;
  }

  /* ================= 영상 (Veo) ================= */
  const abortErr = () => Object.assign(new Error('취소됨'), { name: 'AbortError' });
  const sleepAbortable = (ms, signal) => new Promise((ok, no) => {
    if (signal?.aborted) return no(abortErr());
    const onAbort = () => { clearTimeout(t); no(abortErr()); };
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); ok(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  const veoRate = (model, res) => { const m = String(model).toLowerCase(); if (m.includes('lite')) return res === '1080p' ? 0.08 : 0.05; if (m.includes('fast')) return res === '1080p' ? 0.12 : 0.10; return 0.40; };
  const blobToBase64 = (blob) => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = no; fr.readAsDataURL(blob); });
  const b64ToBlob = (b64, mime) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime }); };
  function veoCfg() {
    const s = S();
    let vp = s.videoProvider === 'auto' ? s.imgProvider : s.videoProvider;
    return { vp, key: (s.videoKey || s.geminiKey).trim(), token: s.videoToken.trim() };
  }
  function veoUrl(action, model, vp) {
    const s = S(), m = encodeURIComponent(model);
    if (vp !== 'vertex') return `https://generativelanguage.googleapis.com/v1beta/models/${m}:${action}`;
    const proj = (s.videoProject || s.vertexProject).trim();
    if (!proj) throw new Error('Agent Platform의 Veo는 프로젝트 ID가 꼭 필요해요. 설정의 영상 항목에 넣어 주세요.');
    const loc = (s.videoLocation || 'us-central1').trim();
    const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
    return `https://${host}/v1/projects/${encodeURIComponent(proj)}/locations/${loc}/publishers/google/models/${m}:${action}`;
  }
  function veoErr(r, j, fb, vp) {
    const reason = j?.error?.details?.find((x) => x.reason)?.reason;
    let msg = `${r.status}: ${j?.error?.message || fb}${reason ? ` [${reason}]` : ''}`;
    if (vp === 'vertex' && (r.status === 401 || r.status === 403)) msg += ' → 영상 전용 키/액세스 토큰을 넣거나 Gemini Developer API 방식을 써 보세요.';
    return new Error(msg);
  }
  async function extractVideoBlob(resp, vertex, key, signal) {
    if (vertex && !resp?.generateVideoResponse) {
      const v = resp?.videos?.[0];
      if (v?.bytesBase64Encoded) return b64ToBlob(v.bytesBase64Encoded, v.mimeType || 'video/mp4');
      const why = (resp?.raiMediaFilteredReasons || []).join(', ');
      throw new Error(why ? `안전 필터로 차단됐어요: ${why}` : '응답에 영상이 없어요');
    }
    const gv = resp?.generateVideoResponse, uri = gv?.generatedSamples?.[0]?.video?.uri;
    if (!uri) { const why = (gv?.raiMediaFilteredReasons || []).join(', '); throw new Error(why ? `안전 필터로 차단됐어요: ${why}` : '응답에 영상 주소가 없어요'); }
    let r = await fetch(uri, { headers: { 'x-goog-api-key': key }, signal }).catch(() => null);
    if (!r || !r.ok) r = await fetch(uri + (uri.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key), { signal }).catch(() => null);
    if (!r || !r.ok) throw new Error('영상을 내려받지 못했어요 (브라우저 CORS 차단일 수 있어요)');
    return r.blob();
  }
  async function veoGenerate(imageUrl, prompt, sec, resolution, signal) {
    const s = S(), { vp, key, token } = veoCfg();
    if (!key && !token) throw new Error('설정에 API 키를 입력해 주세요');
    const vertex = vp === 'vertex';
    const model = vertex ? String(s.videoModel).trim().replace(/-generate-preview$/, '-generate-001') : s.videoModel.trim();
    const inl = (await urlToInline(imageUrl)).inlineData;
    const parameters = vertex
      ? { aspectRatio: '16:9', durationSeconds: sec, resolution, sampleCount: 1, generateAudio: !!s.videoAudio, personGeneration: 'allow_adult' }
      : { aspectRatio: '16:9', durationSeconds: String(sec), resolution, personGeneration: 'allow_adult' };
    const instance = vertex ? { prompt, image: { bytesBase64Encoded: inl.data, mimeType: inl.mimeType } } : { prompt, image: { inlineData: inl } };
    const headers = { 'Content-Type': 'application/json' };
    if (vertex && token) headers.Authorization = `Bearer ${token}`; else headers['x-goog-api-key'] = key;
    let r = await fetch(veoUrl('predictLongRunning', model, vp), { method: 'POST', headers, body: JSON.stringify({ instances: [instance], parameters }), signal });
    let j = await r.json().catch(() => ({}));
    if (!r.ok) throw veoErr(r, j, '영상 요청 실패', vp);
    const opName = j.name;
    if (!opName) throw new Error('작업 이름을 받지 못했어요');
    const t0 = Date.now();
    while (Date.now() - t0 < 10 * 60 * 1000) {
      await sleepAbortable(8000, signal);
      r = vertex
        ? await fetch(veoUrl('fetchPredictOperation', model, vp), { method: 'POST', headers, body: JSON.stringify({ operationName: opName }), signal })
        : await fetch(`https://generativelanguage.googleapis.com/v1beta/${opName}`, { headers: { 'x-goog-api-key': key }, signal });
      j = await r.json().catch(() => ({}));
      if (!r.ok) throw veoErr(r, j, '상태 확인 실패', vp);
      if (j.done) break;
    }
    if (!j.done) throw new Error('10분이 지나도 끝나지 않아 중단했어요');
    if (j.error) throw new Error(j.error.message || '영상 생성 실패');
    const vb = await extractVideoBlob(j.response, vertex, key, signal); logUsage('video', '이벤트 영상', 'ok'); return vb;
  }
  async function saveVideo(blob) {
    const b64 = await blobToBase64(blob), name = 'vn_scene_' + Date.now();
    for (const [ep, body] of [['/api/images/upload', { image: b64, format: 'mp4', ch_name: 'vnstudio', filename: name }], ['/api/files/upload', { name: name + '.mp4', data: b64 }]]) {
      try {
        const r = await fetch(ep, { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify(body) });
        if (r.ok) { const j = await r.json(); if (j?.path) return '/' + String(j.path).replace(/^\/+/, ''); }
      } catch { /* 다음 방법 */ }
    }
    return null;
  }
  const vid = { busy: false, abort: null };
  async function makeVideo(entry, { confirmFirst = true } = {}) {
    const s = S();
    if (!entry?.url) return null;
    if (vid.busy) { toastr.info('이미 영상을 만드는 중이에요.'); return null; }
    const res = s.videoRes, sec = res === '1080p' ? 8 : (+s.videoSeconds || 4), est = (sec * veoRate(s.videoModel, res)).toFixed(2);
    if (confirmFirst && s.videoConfirm && !confirm(`이 장면을 ${sec}초 영상으로 만들까요?\n모델: ${s.videoModel}\n예상 요금: 약 $${est} (참고용이에요)\n수십 초~몇 분 걸려요.`)) return null;
    vid.busy = true; vid.abort = new AbortController(); ui.status('영상을 만드는 중… (수십 초~몇 분)', true);
    try {
      const blob = await veoGenerate(entry.url, `${s.videoPrompt.trim()}\nAction in this moment: ${entry.caption || entry.title || ''}`.slice(0, 1100), sec, res, vid.abort.signal);
      const url = await saveVideo(blob);
      const vurl = url || URL.createObjectURL(blob);
      if (!url) toastr.warning('서버에 영상 저장이 안 돼서 이번 세션에서만 볼 수 있어요.');
      entry.video = vurl; saveMeta();
      return vurl;
    } catch (e) {
      if (e?.name === 'AbortError') toastr.info('영상 생성을 취소했어요. 이미 시작된 작업은 Google 쪽에서 계속돼 요금이 나올 수 있어요.');
      else toastr.error('영상 생성 실패: ' + (e.message || e));
      return null;
    } finally { vid.busy = false; vid.abort = null; ui.status(''); }
  }

  /* ================= 화면 상태 ================= */
  const ACTS = [
    { id: 'free', n: '자유 (AI가 정함)' }, { id: 'meet', n: '캐릭터 만나러 가기' }, { id: 'study', n: '공부' }, { id: 'job', n: '아르바이트' },
    { id: 'exercise', n: '운동' }, { id: 'read', n: '독서' }, { id: 'hobby', n: '취미 활동' }, { id: 'walk', n: '산책' }, { id: 'rest', n: '휴식' },
  ];
  const SLOT_TIMES = ['08:00', '12:30', '15:30', '19:00', '22:30'];
  const actOf = (id) => ACTS.find((a) => a.id === id) || ACTS[0];
  const STD_FACTS = ['나이', '생일', '직업', '좋아하는 것', '싫어하는 것', '취미', '말버릇', '고민', '비밀'];

  const st = { open: false, turn: null, nvl: null, waiting: false, evt: null, pendingEvt: null, lastSprite: null, selChar: '', tab: 'dossier', viewEvt: null, evtResolve: null, calMonth: '', calSel: null, schedDay: 0, mapScope: 'world', mapSel: '', slotAff: 0, slotInfo: null, pendingUser: '', processing: false, firstPick: false, curImg: null, curKey: '', curEmo: '', lpTab: 'log', genStop: false, stick: true, reqId: 0, sceneLines: [], waitTimer: 0, waitStart: 0, evtLog: [], lastRaw: null, npcSel: '' };

  const tpl = `
<div class="vn-stage" id="vn-stage">
  <div class="vn-bgwrap"><img class="vn-bg vn-bg-a" alt=""><img class="vn-bg vn-bg-b" alt=""></div>
  <div class="vn-ph"><span class="vn-ph-t"></span></div>
  <div class="vn-sprites"><img class="vn-sp vn-sp-prev" alt=""></div>
  <div class="vn-top">
    <div class="vn-left">
      <div class="vn-chips"><span class="vn-chip" id="vn-loc"></span><span class="vn-chip vn-chip-day" id="vn-day"></span><span class="vn-chip vn-chip-time" id="vn-time"></span></div>
      <div class="vn-aff" id="vn-aff" data-act="dos" title="공략집 열기"><span class="vn-aff-who"></span><div class="vn-aff-bar"><i></i></div><span class="vn-aff-l"></span></div>
      <button class="vn-usage" id="vn-usage" data-act="usage" title="API 호출 현황"></button>
    </div>
    <div class="vn-tools">
      <button data-act="dos" title="공략집" aria-label="공략집"><i class="fa-solid fa-heart"></i></button>
      <button data-act="sched" title="일정·캘린더" aria-label="일정과 캘린더"><i class="fa-solid fa-calendar-days"></i></button>
      <button data-act="log" title="기록 (대화 읽기)" aria-label="기록"><i class="fa-solid fa-scroll"></i></button>
      <button data-act="html" class="vn-rich-btn" title="HTML/CSS 효과 보기" aria-label="HTML/CSS 효과"><i class="fa-solid fa-code"></i></button>
      <button data-act="spr" title="캐릭터 크기·위치" aria-label="캐릭터 크기와 위치"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>
      <button data-act="hide" title="화면 숨기기 (H)" aria-label="UI 숨기기"><i class="fa-solid fa-eye-slash"></i></button>
      <button data-act="modal" title="메뉴" aria-label="메뉴"><i class="fa-solid fa-bars"></i></button>
      <button data-act="mode" title="채팅 연동 ↔ 일상 모드" aria-label="모드 전환"><i class="fa-solid fa-book-open"></i><span class="vn-tl">채팅</span></button>
      <button data-act="close" title="닫기 (Esc)" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
    </div>
  </div>
  <div class="vn-float" id="vn-float" aria-hidden="true"></div>
  <div class="vn-status" id="vn-status" role="status"><span></span><button data-act="cancel-vid">취소</button></div>
  <div class="vn-box" id="vn-box">
    <div class="vn-resize" id="vn-resize" title="끌어서 글상자 높이 조절 (더블클릭: 자동)" aria-label="글상자 높이 조절"><i></i></div>
    <div class="vn-name" id="vn-name"></div>
    <div class="vn-scrollbtns"><button data-act="txt-up" title="위로" aria-label="위로 스크롤"><i class="fa-solid fa-chevron-up"></i></button><button data-act="txt-down" title="아래로" aria-label="아래로 스크롤"><i class="fa-solid fa-chevron-down"></i></button><button data-act="txt-end" title="맨 아래로" aria-label="맨 아래로"><i class="fa-solid fa-angles-down"></i></button></div>
    <div class="vn-text" id="vn-text"></div>
    <button class="vn-collapse" data-act="collapse" title="글상자 접기/펼치기" aria-label="글상자 접기"><i class="fa-solid fa-chevron-down"></i></button>
    <span class="vn-next" aria-hidden="true">▾</span>
    <div class="vn-end" id="vn-end">
      <div class="vn-choices" id="vn-choices"></div>
      <div class="vn-endbtns" id="vn-endbtns"></div>
      <div class="vn-input" id="vn-input"><input type="text" id="vn-in" autocomplete="off" placeholder="직접 말을 건네 보세요"><button data-act="send">보내기</button></div>
    </div>
  </div>
  <div class="vn-sprpop vn-off" id="vn-sprpop"><label><span>캐릭터 크기</span><input type="range" min="40" max="170" data-vk="spriteScale"><output></output></label><label><span>캐릭터 위치</span><input type="range" min="-30" max="30" data-vk="spriteY"><output></output></label><label><span>NPC 간격</span><input type="range" min="8" max="46" data-vk="npcGap"><output></output></label><label><span>NPC 크기</span><input type="range" min="50" max="150" step="5" data-vk="npcScale"><output></output></label><label><span>NPC 높이</span><input type="range" min="-30" max="30" data-vk="npcY"><output></output></label><label><span>글상자 높이</span><input type="range" min="0" max="700" step="10" data-vk="textH"><output></output></label><label><span>접힘 높이</span><input type="range" min="70" max="500" step="10" data-vk="minTextH"><output></output></label><label><span>선택지 글씨</span><input type="range" min="50" max="130" step="5" data-vk="choiceFs"><output></output></label><label><span>접힘 글씨</span><input type="range" min="50" max="120" step="5" data-vk="choiceFsMin"><output></output></label><div class="vn-prow"><button data-act="spr-reset">초기화</button><button data-act="spr-close">닫기</button></div></div>
  <div class="vn-event vn-off" id="vn-event"></div>
  <div class="vn-fade" id="vn-fade"><span></span></div>
  <div class="vn-htmlpanel vn-off" id="vn-htmlpanel" role="dialog" aria-label="HTML/CSS 효과">
    <div class="vn-hp-ctl"><button class="vn-hp-drag" data-act="html-drag" title="끌어서 옮기기" aria-label="옮기기"><i class="fa-solid fa-up-down-left-right"></i></button><button data-act="html-close" title="닫기" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></div>
    <iframe id="vn-hp-frame" sandbox="" referrerpolicy="no-referrer" title="HTML/CSS 효과"></iframe>
  </div>
  <aside class="vn-logpanel vn-off" id="vn-logpanel" aria-label="기록">
    <div class="vn-lp-resize" id="vn-lp-resize" title="끌어서 너비 조절 (더블클릭: 기본)" aria-label="기록 패널 너비 조절"></div>
    <header><div class="vn-lp-tabs"><button data-lp="log" class="on">연출 기록</button><button data-lp="chat">채팅 전체</button></div><span class="grow"></span><button data-act="logside" title="왼쪽/오른쪽 이동" aria-label="위치 이동"><i class="fa-solid fa-arrow-right-arrow-left"></i></button><button data-act="log" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></header>
    <div class="vn-lp-body" id="vn-lp-body"></div>
  </aside>
</div>
<div class="vn-lightbox vn-off" id="vn-lightbox"><img alt=""></div>
<div class="vn-modal vn-off" id="vn-modal">
  <div class="vn-modal-card">
    <div class="vn-mtabs" id="vn-mtabs">
      <button data-tab="dossier">공략집</button><button data-tab="npc">NPC</button><button data-tab="cal">일정·캘린더</button><button data-tab="map">지도</button><button data-tab="outfit">표정·의상</button><button data-tab="place">배경</button><button data-tab="gallery">이벤트</button><button data-tab="usage">호출</button><button data-tab="set">설정</button><button data-tab="dev" class="vn-devtab">개발자</button>
      <button class="vn-mclose" data-act="modal-close" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="vn-mbody" id="vn-mbody"></div>
  </div>
</div>`;

  const ui = {
    root: null,
    build() {
      if (this.root) return;
      const r = document.createElement('div');
      r.id = 'vn-root'; r.className = 'vn-off'; r.setAttribute('role', 'dialog'); r.setAttribute('aria-label', 'VN Studio 비주얼 노벨');
      r.innerHTML = tpl; document.body.appendChild(r); this.root = r;
      this.applyLook();
    },
    applyLook() {
      if (!this.root) return;
      const s = S();
      this.root.style.setProperty('--vn-fs', (s.textSize / 100).toFixed(2));
      this.root.style.setProperty('--vn-box', (s.boxOpacity / 100).toFixed(2));
      this.root.style.setProperty('--vn-fade', (Math.max(100, s.fadeMs || 700) / 1000).toFixed(2) + 's');
      this.root.classList.toggle('lp-left', s.logSide === 'left');
      this.root.classList.toggle('dev-on', !!s.devMode);
      if (s.textH > 0) { this.root.style.setProperty('--vn-th', Math.round(s.textH) + 'px'); this.root.dataset.th = '1'; } else { this.root.style.removeProperty('--vn-th'); delete this.root.dataset.th; }
      if (s.lpWidth > 0) this.root.style.setProperty('--lpw', Math.round(s.lpWidth) + 'px'); else this.root.style.removeProperty('--lpw');
      this.root.dataset.theme = s.theme || 'sakura'; document.getElementById('vn-fab')?.setAttribute('data-theme', s.theme || 'sakura');
      this.root.style.setProperty('--spr-s', ((+s.spriteScale || 100) / 100).toFixed(2)); this.root.style.setProperty('--spr-y', String(+s.spriteY || 0));
      this.root.classList.toggle('bg-blank', !!s.bgBlank); this.root.style.setProperty('--vn-blank', s.bgBlankColor || '#ffffff');
      const pf = (v, d) => (v !== '' && v != null && Number.isFinite(+v) ? +v : d);
      this.root.style.setProperty('--vn-cfs', (pf(s.choiceFs, 90) / 100).toFixed(2));
      this.root.style.setProperty('--vn-cfs-min', (pf(s.choiceFsMin, 78) / 100).toFixed(2));
      this.root.style.setProperty('--vn-mh', Math.round(pf(s.minTextH, 150)) + 'px');
      this.root.style.setProperty('--npc-gap', String(pf(s.npcGap, 26)));
      this.root.style.setProperty('--npc-s', (pf(s.npcScale, 100) / 100).toFixed(2));
      this.root.style.setProperty('--npc-y', String(pf(s.npcY, 0)));
    },
    q: (sel) => $q(sel, ui.root),
    status(msg, cancel = false) {
      const el = ui.q('#vn-status'); if (!el) return;
      el.firstElementChild.textContent = msg || '';
      el.classList.toggle('on', !!msg);
      el.querySelector('button').style.display = cancel ? '' : 'none';
    },
    setBg(url, name) {
      const a = ui.q('.vn-bg-a'), b = ui.q('.vn-bg-b'), ph = ui.q('.vn-ph');
      ui.q('.vn-ph-t').textContent = name || '';
      if (!url) { ph.classList.remove('hide'); a.classList.remove('on'); b.classList.remove('on'); return; }
      const front = a.classList.contains('on') ? a : b, back = front === a ? b : a;
      if (front.getAttribute('src') === url) return;
      const im = new Image();
      im.onload = () => { back.src = url; back.classList.add('on'); front.classList.remove('on'); ph.classList.add('hide'); };
      im.onerror = () => { a.classList.remove('on'); b.classList.remove('on'); a.removeAttribute('src'); b.removeAttribute('src'); ph.classList.remove('hide'); };
      im.src = url;
    },
    npcSide: { R: null, L: null },
    /* 마주친 NPC를 주인공 옆(오른쪽 → 왼쪽 순서)에 추가로 띄운다. 주인공 이미지는 그대로 둔다 */
    /* 이미지가 보는 방향(faces)이 주인공 쪽이 아니면 좌우 반전: 오른쪽 NPC는 왼쪽(주인공)을, 왼쪽 NPC는 오른쪽을 보게 한다 */
    npcFlip(npc, k) { const f = npc?.faces; if (S().npcFace === false || (f !== 'left' && f !== 'right')) return false; return f !== (k === 'R' ? 'left' : 'right'); },
    showNpcSide(npc) {
      if (!npc?.img || !ui.root) return;
      const wrap = ui.q('.vn-sprites'), side = ui.npcSide, fade = (S().fadeMs || 700) + 120;
      let k = ['R', 'L'].find((x) => side[x] && side[x].name === npc.name);
      if (k && side[k].url === npc.img) { side[k].el.style.setProperty('--flip', ui.npcFlip(npc, k) ? -1 : 1); return; }
      if (!k) { const first = S().npcFirst === 'L' ? 'L' : 'R', second = first === 'R' ? 'L' : 'R'; k = !side[first] ? first : second; }
      if (side[k]) { const o = side[k].el; o.classList.remove('on'); setTimeout(() => o.remove(), fade); }
      const img = document.createElement('img'); img.alt = ''; img.className = 'vn-sp vn-sp-npc' + (k === 'L' ? ' left' : '') + (npcIsAnimal(npc) ? ' animal' : ''); img.src = npc.img;
      img.style.setProperty('--flip', ui.npcFlip(npc, k) ? -1 : 1);
      wrap.appendChild(img); void img.offsetWidth; img.classList.add('on');
      side[k] = { name: npc.name, url: npc.img, el: img };
    },
    refreshNpcFlip() { for (const k of ['R', 'L']) { const s = ui.npcSide[k]; if (s) s.el.style.setProperty('--flip', ui.npcFlip(npcByName(s.name), k) ? -1 : 1); } },
    npcTalk(name) { for (const k of ['R', 'L']) ui.npcSide[k]?.el.classList.toggle('talk', !!name && ui.npcSide[k].name === name); },
    hideNpcSide() {
      const fade = (S().fadeMs || 700) + 120;
      for (const k of ['R', 'L']) { const s = ui.npcSide[k]; if (s) { s.el.classList.remove('on'); setTimeout(() => s.el.remove(), fade); } ui.npcSide[k] = null; }
    },
    hideSprites() {
      ui.hideNpcSide();
      const old = st.curImg; if (old) { old.classList.remove('on'); setTimeout(() => old.remove(), (S().fadeMs || 700) + 100); }
      st.curImg = null; st.curKey = ''; ui.q('.vn-sp-prev')?.classList.remove('on');
    },
    /* 표정/의상이 바뀔 때 이전 이미지가 서서히 사라지고 새 이미지가 서서히 나타난다 (디졸브) */
    async setSprite(ch, emo, outfit) {
      if (!ch) { ui.hideSprites(); return; }
      const sp = await spriteFor(ch, emo || 'neutral', outfit);
      lazyGen(ch, emo || 'neutral', outfit);
      if (!sp.url) { ui.hideSprites(); return; }
      return ui.showSpriteUrl(chKey(ch), sp.url, sp.kind);
    },
    async showSpriteUrl(key, url, kind) {
      const wrap = ui.q('.vn-sprites'), prev = ui.q('.vn-sp-prev'), k = key + '|' + url;
      if (st.curKey === k && st.curImg) { st.curImg.classList.remove('dim'); return; }
      const cls = (kd) => (kd === 'avatar' ? 'is-avatar' : kd === 'portrait' ? 'is-portrait' : '');
      const isNpc = (x) => String(x).startsWith('npc|');
      if (st.lastSprite && st.lastSprite.key !== key && st.lastSprite.url && !isNpc(key) && !isNpc(st.lastSprite.key)) {   // 그룹 채팅: 직전 화자는 옆으로 물러남
        prev.src = st.lastSprite.url; prev.className = 'vn-sp vn-sp-prev on ' + cls(st.lastSprite.kind);
      } else if (st.lastSprite && st.lastSprite.key === key) prev.classList.remove('on');
      await new Promise((ok) => { const im = new Image(); im.onload = ok; im.onerror = ok; im.src = url; });
      const img = document.createElement('img'); img.alt = ''; img.src = url; img.className = 'vn-sp cur ' + cls(kind);
      wrap.appendChild(img); void img.offsetWidth; img.classList.add('on');
      const old = st.curImg; if (old) { old.classList.remove('on'); setTimeout(() => old.remove(), (S().fadeMs || 700) + 120); }
      st.curImg = img; st.curKey = k; st.lastSprite = { key, url, kind };
      matchBlank(url, kind);
    },
    hud(turn) {
      const meta = M(), ch = turn?.ch || activeChar();
      ui.q('#vn-loc').textContent = meta.loc ? '📍 ' + meta.loc : '';
      ui.q('#vn-loc').style.display = meta.loc ? '' : 'none';
      const day = ui.q('#vn-day'); day.style.display = meta.mode === 'daily' ? '' : 'none'; day.textContent = `${meta.day}일째 · ${SLOTS[meta.slot % SLOTS.length]}`;
      const tm = ui.q('#vn-time'), parts = [];
      if (meta.time) parts.push('🕓 ' + meta.time);
      if (meta.weather) parts.push(weatherIcon(meta.weather) + ' ' + meta.weather);
      tm.textContent = parts.join('  '); tm.style.display = parts.length ? '' : 'none';
      const modeBtn = ui.q('[data-act="mode"] .vn-tl'); if (modeBtn) modeBtn.textContent = meta.mode === 'daily' ? '일상' : '채팅';
      ui.usagePill();
      const aff = ui.q('#vn-aff');
      if (!ch) { aff.style.display = 'none'; return; }
      aff.style.display = '';
      const v = affOf(ch.name);
      aff.querySelector('.vn-aff-who').textContent = ch.name;
      aff.querySelector('.vn-aff-l').textContent = affLevel(v);
      const bar = aff.querySelector('.vn-aff-bar i');
      bar.style.width = Math.abs(v) / 2 + '%'; bar.style.left = v >= 0 ? '50%' : 50 - Math.abs(v) / 2 + '%';
      bar.className = v >= 0 ? 'up' : 'down';
    },
    usagePill() {
      const u = S().usage || {}, el = ui.root && ui.q('#vn-usage'); if (!el) return;
      el.textContent = `API 텍스트 ${u.text || 0} · 이미지 ${u.image || 0}${u.video ? ` · 영상 ${u.video}` : ''}${u.r429 ? ` · 429×${u.r429}` : ''}`;
    },
    floatAff(d) {
      if (!d) return;
      const el = document.createElement('div'); el.className = 'vn-fl ' + (d > 0 ? 'up' : 'down');
      el.textContent = d > 0 ? '♥'.repeat(d >= 4 ? 3 : d >= 2 ? 2 : 1) : '💔';
      ui.q('#vn-float').appendChild(el); setTimeout(() => el.remove(), 2200);
    },
    clearEnd() {
      ui.q('#vn-box').classList.remove('end'); ui.q('#vn-choices').innerHTML = ''; ui.q('#vn-choices').classList.remove('on'); ui.q('#vn-endbtns').innerHTML = ''; ui.q('.vn-evmini-wrap')?.remove();
    },
    open() { ui.build(); ui.root.classList.remove('vn-off'); st.open = true; document.body.classList.add('vn-open'); ui.fit?.(); requestAnimationFrame(() => ui.fit?.()); setTimeout(() => ui.fit?.(), 150); },
    close() { ui.root?.classList.add('vn-off'); st.open = false; document.body.classList.remove('vn-open'); finishText(true); },
  };

  /* 배경 없음 모드: 캐릭터 이미지에 남은 배경색(팔 사이 같은 곳)과 같은 색으로 채워 투명처럼 보이게 한다 */
  const cornerCache = {};
  async function sampleCorner(url) {
    if (url in cornerCache) return cornerCache[url];
    let out = null;
    try {
      const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
      const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16; const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, 0, 0, 16, 16); const d = g.getImageData(0, 0, 16, 16).data; let r = 0, gg = 0, b = 0, n = 0, al = 0;
      for (const [x, y] of [[0, 0], [15, 0], [0, 15], [15, 15], [1, 1], [14, 1], [1, 14], [14, 14]]) { const i = (y * 16 + x) * 4; r += d[i]; gg += d[i + 1]; b += d[i + 2]; al += d[i + 3]; n++; }
      if (al / n > 250) out = `rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)})`;
    } catch { out = null; }
    cornerCache[url] = out; return out;
  }
  function matchBlank(url, kind) {
    const s = S(); if (!ui.root || !s.bgBlank) return;
    const base = s.bgBlankColor || '#ffffff';
    if (s.bgBlankAuto && kind === 'portrait' && url) sampleCorner(url).then((c) => ui.root.style.setProperty('--vn-blank', c || base)); else ui.root.style.setProperty('--vn-blank', base);
  }

  /* 필요한 이미지가 없을 때 한 장만 백그라운드로 만든다. 단, 비용 폭주를 막기 위해
     · 의상 이미지가 전혀 없는 의상 → 기준 이미지(neutral) 1장만
     · 표정 단위 자동 생성은 '기본 의상'과, 세트를 직접 만들어 둔 의상에만 적용 */
  function lazyGen(ch, emo, outfit) {
    const s = S();
    if (!s.autoSprite || !s.geminiKey.trim() || !ch) return;
    const of = cdata(ch).outfits[outfit]; if (!of) return;
    if (exactSprite(ch, emo, outfit)) return;
    if (outfit === '기본' && stHas(ch, emo)) return;
    const en = new Set(enabledEmos(ch)), hasAny = !!(of.base || Object.keys(of.emo || {}).length);
    let target = null;
    if (!hasAny) target = 'neutral';
    else if (outfit === '기본' || of.auto) target = en.has(emo) ? emo : (en.has(coreEmo(emo)) ? coreEmo(emo) : null);   // 쓰기로 고른 표정만 자동 생성
    if (!target) return;
    const run = async () => {
      if (!of.emo?.neutral && target !== 'neutral') await ensureSprite(ch, outfit, 'neutral');
      return ensureSprite(ch, outfit, target);
    };
    run().then((u) => { if (u && st.turn?.ch && chKey(st.turn.ch) === chKey(ch) && outfitOf(ch) === outfit) ui.setSprite(ch, st.curEmo || st.turn.emo, outfit); }).catch(() => {});
  }

  /* ================= 텍스트: 글상자에 차곡차곡 채워 올라가는 방식 ================= */
  function mkPara(line, turn) {
    const p = document.createElement('p'); p.className = 'k-' + line.k;
    const who = line.k === 'say' ? (line.who || turn.who || turn.ch?.name || '') : line.k === 'user' ? (ctx().name1 || '나') : '';
    if (who) { const b = document.createElement('b'); b.className = 'who'; b.textContent = who; p.appendChild(b); }
    const tx = document.createElement('span'); tx.className = 'tx'; p.appendChild(tx);
    return { p, tx, who };
  }
  function scrollText(force = false) {
    const t = ui.q('#vn-text'); if (!t) return;
    if (force) st.stick = true;
    if (st.stick) t.scrollTop = t.scrollHeight;
    t.classList.toggle('scrolled', t.scrollTop > 6);
    ui.q('#vn-box')?.classList.toggle('can-scroll', t.scrollHeight > t.clientHeight + 6);
  }
  function logLine(turn, i, who) {
    turn._logged ||= new Set();
    if (turn._logged.has(i)) return; turn._logged.add(i);
    const meta = M(), e = { who, k: turn.lines[i].k, t: turn.lines[i].t, m: meta.mode, d: meta.day, s: meta.slot };
    meta.log.push(e); if (meta.log.length > 1200) meta.log.splice(0, meta.log.length - 1200);
    if (meta.mode === 'daily') { st.sceneLines.push({ k: e.k, who, t: e.t }); if (st.sceneLines.length > 60) st.sceneLines.shift(); }
    saveMeta(); lpAppend(e);
  }
  const npcByName = (name) => M().npcs.find((n) => n.name === name) || null;
  const isNpcLine = (line, turn) => line.k === 'say' && line.who && line.who !== turn.ch?.name;
  /* NPC 이름 매칭: 이름 + 별칭 (한글 세 글자 이름은 이름만 부르는 경우도 포함) */
  const npcKeys = (n) => {
    const nm = String(n.name || '').trim(), ks = [nm, ...(n.aliases || [])].map((x) => String(x || '').trim()).filter((x) => x.length >= 2);
    if (/^[가-힣]{3}$/.test(nm)) ks.push(nm.slice(1));
    return [...new Set(ks)];
  };
  const npcFind = (name) => { const k = String(name || '').trim().toLowerCase(); if (!k) return null; return M().npcs.find((n) => npcKeys(n).some((x) => x.toLowerCase() === k)) || null; };
  const npcsIn = (text) => { const tx = String(text || '').toLowerCase(); return tx ? M().npcs.filter((n) => npcKeys(n).some((x) => tx.includes(x.toLowerCase()))) : []; };
  const npcGenBusy = new Set();
  async function lazyNpcImg(n) {
    const s = S(); if (!s.npcAutoImg || !s.geminiKey.trim() || !n || n.img || n.noAuto || npcGenBusy.has(n.name) || npcGenBusy.size >= 1) return;
    npcGenBusy.add(n.name);
    try {
      n.img = await genNpcImage(n, activeChar()); n.imgAi = true; saveMeta();
      if (st.open && st.turn?.ch && !st.turn.noChar) ui.showNpcSide(n);
    } catch (e) { n.noAuto = true; saveMeta(); console.warn('[VN] NPC 이미지 자동 생성 실패', e); }
    finally { npcGenBusy.delete(n.name); }
  }
  /* 한 줄이 나올 때: NPC가 말하거나 서술에 이름이 나오면 그 NPC를 주인공 옆에 띄운다 (이미 떠 있으면 그대로) */
  function npcCue(line, turn) {
    if (!turn?.ch || turn.noChar || !line) return null;
    const speaker = line.k === 'say' && line.who && line.who !== turn.ch.name ? npcFind(line.who) : null;
    const found = speaker ? [speaker] : (line.k === 'narr' ? npcsIn(line.t) : []);
    for (const nn of found.slice(0, 2)) { if (nn.img) ui.showNpcSide(nn); else lazyNpcImg(nn); }
    const talking = speaker?.img ? speaker.name : null;
    ui.npcTalk(talking); return talking;
  }
  function lineEmo(turn, i) {
    const avail = turn.ch ? availEmos(turn.ch) : EMOS, l = turn.lines[i];
    if (l?.emo) return normEmo(l.emo, avail) || turn.emo;
    if (turn.emoSeq?.length > 1) { const k = Math.min(turn.emoSeq.length - 1, Math.floor((i / Math.max(1, turn.lines.length)) * turn.emoSeq.length)); return normEmo(turn.emoSeq[k], avail) || turn.emo; }
    return turn.emo;
  }
  function playText(turn) {
    const box = ui.q('#vn-text');
    if (!turn.append) box.innerHTML = ''; else if (turn.append !== 'cont' && box.childNodes.length) box.insertAdjacentHTML('beforeend', '<hr class="vn-sep">');
    st.nvl = { turn, i: 0, timer: 0, cur: null }; st.stick = true;
    ui.q('#vn-box').classList.add('typing');
    nvlNext();
  }
  function nvlNext() {
    const n = st.nvl; if (!n) return;
    const line = n.turn.lines[n.i];
    if (!line) return nvlDone();
    const { p, tx, who } = mkPara(line, n.turn);
    ui.q('#vn-text').appendChild(p); scrollText(); logLine(n.turn, n.i, who);
    const nm = ui.q('#vn-name'); nm.textContent = who; nm.style.visibility = who ? 'visible' : 'hidden'; nm.className = 'vn-name' + (line.k === 'user' ? ' is-user' : '');
    const npc = isNpcLine(line, n.turn), npcData = (npc || (n.turn.noChar && line.k === 'say' && n.turn.npcName)) ? npcFind(line.who || n.turn.npcName) : null;
    npcCue(line, n.turn);   // 마주친 NPC는 주인공 옆에 추가로 띄운다 (주인공 이미지는 그대로)
    if (npcData?.img && n.turn.noChar) { ui.showSpriteUrl('npc|' + npcData.name, npcData.img, 'sprite'); }   // 주인공 없이 NPC만 나오는 장면은 가운데
    else if (n.turn.ch && !n.turn.noChar) {   // 대사마다 표정이 바뀌면 천천히 디졸브
      const e = npc ? st.curEmo : lineEmo(n.turn, n.i);
      if (!npc && String(st.curKey).startsWith('npc|')) { st.curKey = ''; ui.setSprite(n.turn.ch, e || st.curEmo, outfitOf(n.turn.ch)); }
      else if (e && e !== st.curEmo) { st.curEmo = e; ui.setSprite(n.turn.ch, e, outfitOf(n.turn.ch)); }
      st.curImg?.classList.toggle('dim', npc);
    }
    st.curImg?.classList.toggle('talk', line.k === 'say' && !npc);
    const sp = S().typeSpeed;
    if (sp <= 0) { tx.textContent = line.t; n.i++; return nvlNext(); }
    let c = 0; n.cur = { tx, text: line.t };
    n.timer = setInterval(() => {
      c++; tx.textContent = line.t.slice(0, c); scrollText();
      if (c >= line.t.length) { clearInterval(n.timer); n.cur = null; n.i++; n.timer = setTimeout(nvlNext, 320); }
    }, sp);
  }
  function finishText(silent = false) {
    const n = st.nvl; if (!n) return false;
    clearInterval(n.timer); clearTimeout(n.timer);
    if (n.cur) { n.cur.tx.textContent = n.cur.text; n.cur = null; n.i++; }
    while (n.i < n.turn.lines.length) { const { p, tx, who } = mkPara(n.turn.lines[n.i], n.turn); tx.textContent = n.turn.lines[n.i].t; ui.q('#vn-text').appendChild(p); logLine(n.turn, n.i, who); npcCue(n.turn.lines[n.i], n.turn); n.i++; }
    scrollText();
    if (silent) { st.nvl = null; ui.q('#vn-box').classList.remove('typing'); return true; }
    nvlDone(); return true;
  }
  function nvlDone() {
    const turn = st.nvl?.turn; st.nvl = null;
    ui.q('#vn-box').classList.remove('typing'); st.curImg?.classList.remove('talk', 'dim');
    if (turn) onTurnEnd(turn);
  }
  function advance() {
    if (!st.open || st.waiting || ui.q('#vn-event').classList.contains('on')) return;
    if (st.nvl) finishText();
  }
  async function onTurnEnd(turn) {
    if (turn !== st.turn || turn.ended) return;
    turn.ended = true;
    if (st.evt) {
      ui.status('이벤트 장면을 준비하는 중…');
      const p = st.evt; st.evt = null;
      const entry = await p; ui.status('');
      if (turn !== st.turn) return;
      if (entry) await openEvent(entry);
    }
    if (turn !== st.turn) return;
    showEnd(turn);
  }
  /* 창을 나갔다 들어오면 선택지가 그려지지 않다가 글상자를 접었다 펴야 보이던 문제:
     접기→펼치기와 같은 레이아웃 재계산을 직접 한 번 해 준다 (접힘 상태는 그대로 유지) */
  function nudgeLayout() {
    const box = ui.q('#vn-box'); if (!box || !st.open || !ui.root || ui.root.classList.contains('vn-off')) return;
    const was = box.classList.contains('min');
    box.classList.toggle('min', !was); void box.offsetHeight;
    box.classList.toggle('min', was); void box.offsetHeight;
    scrollText();
  }
  function showEnd(turn) {
    const meta = M(), s = S(), box = ui.q('#vn-box');
    box.classList.add('end');
    const ch = ui.q('#vn-choices'), eb = ui.q('#vn-endbtns');
    ch.innerHTML = ''; eb.innerHTML = '';
    const list = s.choicesMode === 'free' ? [] : (turn.choices || []);
    if (list.length) {
      list.slice(0, 4).forEach((c, i) => {
        const b = document.createElement('button'); b.className = 'vn-choice'; b.dataset.i = i;
        b.innerHTML = `<b>${i + 1}</b><span></span>`; b.lastChild.textContent = typeof c === 'string' ? c : c.t;
        ch.appendChild(b);
      });
      ch.classList.add('on');
    } else ch.classList.remove('on');
    if (meta.mode === 'daily' && !list.length) eb.insertAdjacentHTML('beforeend', '<button class="vn-pill" data-act="next-slot">다음 시간대로 ▶</button>');
    ui.q('.vn-evmini-wrap')?.remove();
    if (turn.lines?.length && eventPossible() && !turn.solo) { const lastP = [...ui.q('#vn-text').querySelectorAll('p')].filter((x) => !x.classList.contains('vn-wait')).pop(); (lastP || ui.q('#vn-text')).insertAdjacentHTML('beforeend', `<span class="vn-evmini-wrap vn-ev-inline"><button class="vn-evmini" data-act="make-evt" title="장면 생성기의 새 장면이나 새 CG로 이 순간을 이벤트 씬으로 띄워요">🎬 이벤트 씬${st.pendingEvt ? ' ●' : ''}</button></span>`); }
    ui.q('#vn-input').style.display = s.choicesMode === 'choice' && list.length ? 'none' : '';
    ui.q('#vn-in').value = ''; scrollText(true); nudgeLayout(); requestAnimationFrame(() => { nudgeLayout(); scrollText(true); }); setTimeout(() => { nudgeLayout(); scrollText(true); }, 120);
  }
  function showWaiting(on, msg = '…') {
    st.waiting = on; clearInterval(st.waitTimer);
    const box = ui.q('#vn-box');
    if (on) {
      finishText(true); ui.clearEnd();
      ui.q('#vn-name').style.visibility = 'hidden';
      const t = ui.q('#vn-text'); t.insertAdjacentHTML('beforeend', `<p class="k-narr vn-wait"><span class="vn-dots"></span><span class="vn-wsec"></span> <button class="vn-pill ghost vn-wcancel" data-act="cancel-wait">취소</button></p>`);
      const dots = t.querySelector('.vn-wait .vn-dots'), sec = t.querySelector('.vn-wait .vn-wsec');
      dots.textContent = trMsg(msg); st.waitStart = Date.now();
      const tick = () => { const s = Math.floor((Date.now() - st.waitStart) / 1000); sec.textContent = s >= 1 ? L2(` (${s}초)`, ` (${s}s)`) : ''; if (s >= 25 && s < 60) sec.textContent += L2(' · 모델 응답이 오래 걸리고 있어요. 멈춘 게 아니에요', ' · The model is taking a while. It has not frozen.'); else if (s >= 60) sec.textContent += L2(` · 응답이 많이 늦어요. ${Math.max(20, +S().llmTimeout || 150)}초가 지나면 이유와 함께 알려 드려요. 기다리지 않으려면 취소를 눌러 주세요`, ` · The reply is very late. After ${Math.max(20, +S().llmTimeout || 150)} s you will see the reason. Press Cancel if you do not want to wait.`); };
      st.waitTimer = setInterval(tick, 1000); scrollText(true);
      box.classList.add('waiting');
    } else { box.classList.remove('waiting'); ui.root && $$('.vn-wait', ui.root).forEach((e) => e.remove()); }
  }
  function cancelWait() {
    st.reqId++; showWaiting(false);
    if (st.turn) showEnd(st.turn); else showRetry('요청을 취소했어요.');
    toastr.info('요청을 취소했어요. 이미 모델에 전달된 요청은 서버에서 계속될 수 있어요.');
  }

  /* ================= 기록 패널 (옆에 띄워 두고 대화를 읽는 용도) ================= */
  const lpOpen = () => !ui.q('#vn-logpanel').classList.contains('vn-off');
  const lpKey = (e) => `${e.m}|${e.d}|${e.s}`;
  const lpSep = (e) => `<div class="vn-lp-sep">${e.m === 'daily' ? L2(`일상 · ${e.d}일째 ${SLOTS[e.s] || ''}`, `Daily · Day ${e.d} ${SLOTS[e.s] || ''}`) : L2('채팅', 'Chat')}</div>`;
  const lpEntryHTML = (e) => `<p class="k-${e.k}">${e.who ? `<b>${esc(e.who)}</b>` : ''}${esc(e.t)}</p>`;
  function lpAppend(e) {
    if (!ui.root || !lpOpen() || st.lpTab !== 'log') return;
    const b = ui.q('#vn-lp-body'), stick = b.scrollHeight - b.scrollTop - b.clientHeight < 60;
    b.insertAdjacentHTML('beforeend', (b.dataset.last !== lpKey(e) ? lpSep(e) : '') + lpEntryHTML(e)); b.dataset.last = lpKey(e);
    if (stick) b.scrollTop = b.scrollHeight;
  }
  function renderLogPanel() {
    const b = ui.q('#vn-lp-body'); $$('#vn-logpanel [data-lp]').forEach((x) => x.classList.toggle('on', x.dataset.lp === st.lpTab));
    if (st.lpTab === 'chat') {
      const msgs = (ctx().chat || []).filter((m) => m && !m.is_system && m.mes && (m.is_user || storyOnly(m))).slice(-150);
      const all = ctx().chat || [];
      b.innerHTML = msgs.map((m) => { const tx = parseBlock(m.mes).text.replace(/[*_]/g, ''); return `<div class="vn-lp-msg ${m.is_user ? 'u' : ''}"><b>${esc(m.name)}</b><p>${esc(tx)}</p>${!m.is_user ? `<div class="vn-lp-rich" data-mi="${all.indexOf(m)}"></div>` : ''}</div>`; }).join('') || '<p class="vn-hint">채팅이 아직 없어요.</p>';
      $$('.vn-lp-rich', b).slice(-40).forEach((host) => { try { const fx = effectsOf(richSource({ id: +host.dataset.mi })); if (!fx.blocks.length) { host.remove(); return; } host.attachShadow({ mode: 'open' }).innerHTML = `<style>:host{display:block;margin-top:6px;color:#f4eefc;font:15px/1.6 'Gowun Batang',serif}img,video,svg{max-width:100%}</style>${effectsDoc(fx)}`; } catch { host.remove(); } });
      delete b.dataset.last;
    } else {
      let key = '', h = '';
      for (const e of M().log.slice(-400)) { if (lpKey(e) !== key) { key = lpKey(e); h += lpSep(e); } h += lpEntryHTML(e); }
      b.innerHTML = h || '<p class="vn-hint">아직 기록이 없어요.</p>'; b.dataset.last = key;
    }
    b.scrollTop = b.scrollHeight;
  }
  function toggleLog() { const p = ui.q('#vn-logpanel'); p.classList.toggle('vn-off'); ui.root.classList.toggle('lp-on', !p.classList.contains('vn-off')); if (lpOpen()) renderLogPanel(); }

  /* ================= 채팅 원본 서식 패널 (프리셋의 HTML/CSS 상태창·효과를 팝업 안에서 보기) =================
     SillyTavern이 이미 그려 둔 메시지를 격리된 iframe에 넣어요. CSS 애니메이션·색·움직이는 이미지는 그대로 나오고,
     스크립트는 보안을 위해 실행하지 않아요(JS로 움직이는 효과는 안 나와요). */
  const RICH_TAGS = new Set(['div', 'table', 'section', 'aside', 'center', 'svg', 'canvas', 'marquee', 'figure', 'details']);
  const THINK_TAGS = 'think,thinking,thought,thoughts,reasoning,reason,cot,analysis,scratchpad,reflection,planning,inner_thoughts,thinking_process,memo,small,facts,fact,infobox,charinfo,tracker,status,statusblock,pre,code,script,iframe,object,embed,link,meta,base,form';
  const THINK_RE = /think|thought|reason|cot|analysis|생각|추론|사고/i;
  function sanitizeTree(root) {
    root.querySelectorAll('script,iframe,object,embed,link,meta,base,form').forEach((e) => e.remove());
    root.querySelectorAll('*').forEach((e) => { for (const a of [...e.attributes]) if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) e.removeAttribute(a.name); });
    return root;
  }
  /* 메시지에서 'HTML/CSS 효과'만 뽑는다: 생각 블록·상태창 글·코드블록·일반 문장은 빼고, <style>과 꾸며진 블록(div/table/…, 애니메이션이 붙은 요소)만 남긴다 */
  function effectsOf(html) {
    const doc = new DOMParser().parseFromString('<body>' + String(html || '').replace(RE_BLOCK_ALL, '') + '</body>', 'text/html'), body = sanitizeTree(doc.body);
    const styles = [...body.querySelectorAll('style')].map((s) => s.textContent); body.querySelectorAll('style').forEach((s) => s.remove());
    body.querySelectorAll('details').forEach((d) => { if (THINK_RE.test(d.querySelector('summary')?.textContent || '')) d.remove(); });
    body.querySelectorAll(THINK_TAGS).forEach((e) => { if (!e.querySelector?.('div,table,section,aside,svg,canvas')) e.remove(); });
    const blocks = [], anim = /animation|transition|@keyframes|filter|blur|text-shadow|box-shadow|gradient|transform|position\s*:\s*(fixed|absolute)/i;
    const isRich = (el) => RICH_TAGS.has(el.tagName.toLowerCase()) || anim.test(el.getAttribute('style') || '');
    const walk = (el) => { for (const c of [...el.children]) { if (isRich(c)) blocks.push(c.outerHTML); else if (c.children.length) walk(c); } };
    walk(body);
    return { styles, blocks };
  }
  function richSource(turn) {
    const el = turn?.id != null ? document.querySelector(`#chat .mes[mesid="${turn.id}"] .mes_text`) : null;
    return el ? el.innerHTML : String((ctx().chat || [])[turn?.id]?.mes || '');
  }
  const hasRich = (mes) => { try { return effectsOf(mes).blocks.length > 0; } catch { return false; } };
  /* SillyTavern 페이지에 있는 애니메이션(@keyframes)·사용자 CSS를 함께 가져와서 채팅창과 같은 효과가 나오게 한다 */
  function pageCss() {
    let css = '';
    document.querySelectorAll('style').forEach((s) => { if (s.closest('#vn-root')) return; const tx = s.textContent || ''; if (s.id === 'custom-style' || /@keyframes/.test(tx)) css += tx.slice(0, 150000) + '\n'; });
    return css.slice(0, 400000);
  }
  function effectsDoc(fx) { return `<style>${pageCss()}</style>${fx.styles.map((s) => `<style>${s}</style>`).join('')}${fx.blocks.join('')}`; }
  function openHtmlPanel(turn) {
    const p = ui.q('#vn-htmlpanel'), f = ui.q('#vn-hp-frame'); if (!p || !f) return;
    let fx; try { fx = effectsOf(richSource(turn)); } catch { fx = { styles: [], blocks: [] }; }
    if (!fx.blocks.length) { closeHtmlPanel(); return; }
    const pos = S().htmlPos; if (pos) { p.style.left = pos.x + 'px'; p.style.top = pos.y + 'px'; p.style.right = 'auto'; }
    f.srcdoc = `<!doctype html><meta charset="utf-8"><style>:root{color-scheme:dark}html,body{margin:0}body{padding:6px 8px;color:#f4eefc;font:15px/1.7 'Gowun Batang','Noto Serif KR',serif}img,video,svg{max-width:100%}a{color:#ffc58f}</style>${effectsDoc(fx)}<style>html,body{background:transparent!important}</style>`;
    p.classList.remove('vn-off');
  }
  const closeHtmlPanel = () => ui.q('#vn-htmlpanel')?.classList.add('vn-off');
  const htmlPanelOpen = () => !ui.q('#vn-htmlpanel')?.classList.contains('vn-off');

  /* ================= 이벤트 씬 오버레이 ================= */
  function renderEvent(entry) {
    const el = ui.q('#vn-event');
    const media = entry.video ? `<video src="${esc(entry.video)}" autoplay loop playsinline ${S().videoAudio ? '' : 'muted'}></video>` : `<img src="${esc(entry.url)}" alt="">`;
    const src = entry.from === 'ss' ? '장면 생성기' : entry.from === 'gen' ? 'VN Studio' : '';
    el.innerHTML = `<div class="vn-ev-back" style="background-image:url('${esc(entry.url)}')"></div><div class="vn-ev-media"><div class="vn-ev-frame">${media}</div></div><div class="vn-ev-bar top"></div><div class="vn-ev-bar bot"></div>
      <div class="vn-ev-cap"><b>${esc(entry.title || '이벤트')}</b><span>${esc(entry.caption || '')}${src ? ` · ${src}` : ''}</span></div>
      <div class="vn-ev-btns"><button class="vn-pill ghost" data-act="ev-text">${S().evText === false ? '글씨 켜기' : '글씨 끄기'}</button>${entry.video ? '' : '<button class="vn-pill ghost" data-act="ev-video">🎬 영상으로 만들기</button>'}<button class="vn-pill" data-act="ev-close">계속하기</button></div>`;
  }
  function openEvent(entry) {
    return new Promise((resolve) => {
      const el = ui.q('#vn-event'); st.viewEvt = entry; st.evtResolve = resolve;
      renderEvent(entry); el.classList.toggle('hide-cap', S().evText === false);
      el.classList.remove('vn-off'); void el.offsetWidth; el.classList.add('on');
    });
  }
  function closeEvent() {
    const el = ui.q('#vn-event'); el.classList.remove('on'); el.classList.add('vn-off'); el.innerHTML = '';
    st.viewEvt = null; const r = st.evtResolve; st.evtResolve = null; r?.();
  }

  /* ================= 모달 탭 ================= */
  const DAY_MS = 86400000;
  function startUTC() {
    const m = M();
    if (!m.startDate) { const n = new Date(); m.startDate = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; saveMeta(); }
    const [y, mo, d] = m.startDate.split('-').map(Number);
    return Date.UTC(y, mo - 1, d);
  }
  const dateOfDay = (day) => new Date(startUTC() + (day - 1) * DAY_MS);
  const dayOfUTC = (ms) => Math.round((ms - startUTC()) / DAY_MS) + 1;
  const WD = '일월화수목금토';
  const fmtDate = (d) => `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WD[d.getUTCDay()]})`;
  function annivsOn(md) {   // md = 'MM-DD'
    const out = [], meta = M();
    for (const a of meta.annivs) if (a.md === md) out.push(a.name);
    for (const [who, dos] of Object.entries(meta.dossier)) {
      for (const [label, val] of Object.entries(dos.facts || {})) {
        if (!/생일|birthday/i.test(label)) continue;
        const m = String(val).match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || String(val).match(/(\d{1,2})[-/.](\d{1,2})/);
        if (m && `${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}` === md) out.push(`${who}의 생일`);
      }
    }
    return out;
  }
  const weatherIcon = (w) => { const s = String(w); return /눈|snow/i.test(s) ? '❄️' : /천둥|번개|storm/i.test(s) ? '⛈️' : /비|rain|소나기/i.test(s) ? '🌧️' : /안개|fog|mist/i.test(s) ? '🌫️' : /바람|wind/i.test(s) ? '💨' : /흐|구름|cloud/i.test(s) ? '☁️' : /밤|night|별/i.test(s) ? '🌙' : /맑|sun|clear|화창/i.test(s) ? '☀️' : '🌤️'; };
  const placeNames = () => [...new Set([...Object.values(placesOf()).map((p) => p.name), ...ssPlaces().map((p) => p.name)])];
  const fileInput = (act, attrs = '', multi = false, label = '') => `<label class="vn-btn">${label}<input type="file" accept="image/*" ${multi ? 'multiple' : ''} data-act="${act}" ${attrs} hidden></label>`;
  const selChar = () => { const cast = castAll(); return cast.find((c) => chKey(c) === st.selChar) || activeChar() || cast[0] || null; };

  async function renderModal() {
    const body = ui.q('#vn-mbody'); if (!body) return;
    $$('#vn-mtabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === st.tab));
    const keep = body.scrollTop, rid = (st.rmId = (st.rmId || 0) + 1);   // 늦게 끝난 이전 렌더가 새 탭을 덮어쓰지 않게
    let html = '';
    try {
      html = await ({ dossier: tabDossier, npc: tabNpc, cal: tabCal, map: tabMap, outfit: tabOutfit, place: tabPlace, gallery: tabGallery, usage: tabUsage, set: tabSet, dev: tabDev }[st.tab === 'sched' ? 'cal' : st.tab] || tabSet)();
    } catch (e) { console.warn('[VN] 탭 오류', e); html = `<p class="vn-hint">표시 중 오류: ${esc(e.message || e)}</p>`; }
    if (rid !== st.rmId) return;
    body.innerHTML = html; body.scrollTop = keep;
    fillInputs(body); const ss = body.querySelector('#vn-style-sel'); if (ss) ss.value = S().stylePreset || 'ss';
  }

  /* ---------- 공략집 ---------- */
  async function profileImage(ch) {
    const cd = cdata(ch), kind = (u) => ({ url: u, kind: isPortrait(u) ? 'portrait' : 'sprite' });
    if (cd.profile) return kind(cd.profile);
    const cand = [cd.outfits[outfitOf(ch)]?.base, cd.outfits['기본']?.base, ...Object.values(cd.outfits).map((o) => o.base)].find(Boolean);   // 표정·의상 탭의 '대표 이미지'
    if (cand) return kind(cand);
    return spriteFor(ch, 'neutral', outfitOf(ch));
  }
  const NPC_STD = () => STD_FACTS;
  function tabNpc() {
    const npcs = M().npcs, sel = npcs.find((n) => n.name === st.npcSel), cast = castList();
    const extra = sel ? Object.keys(sel.facts || {}).filter((k) => !NPC_STD().includes(k)) : [];
    const fact = (k) => sel.facts?.[k] ? `<div class="vn-fact"><span>${esc(k)}</span><b>${esc(sel.facts[k])}</b><button class="vn-x" data-act="npcfact-del" data-l="${esc(k)}" aria-label="삭제">✕</button></div>` : `<div class="vn-fact lock"><span>${esc(k)}</span><b>???</b></div>`;
    return `
      <div class="vn-row tight"><input type="text" id="vn-npcnew" placeholder="새 인물 이름" style="flex:1 1 140px"><button class="vn-btn sm" data-act="npc-add">인물 추가</button><button class="vn-btn sm primary" data-act="npc-analyze-src" title="카드 설명과 로어북(파란 점 항목 우선)을 한 번 읽어서 인물을 미리 모아요. 채팅에서 안 마주쳐도 등록돼요.">카드·로어북으로 NPC 찾기 (모델 1회)</button><button class="vn-btn sm" data-act="npc-analyze">채팅 기록으로 분석 (모델 1회)</button></div>
      <p class="vn-hint">NPC는 ${esc(cast.map((c) => c.name).join(', ') || '주인공')} 외에 이야기에 나오는 이름 있는 인물이에요. "카드·로어북으로 NPC 찾기"는 아직 만나지 않은 인물까지 카드와 로어북에서 한 번에 모아요. "채팅 기록으로 분석"은 대화에 나온 인물을 찾고 관계 요약과 정보를 갱신해요. NPC에 이미지를 넣어 두면 이야기에 나올 때 주인공 옆에 같이 나타나요.</p>
      ${npcs.length ? `<div class="vn-npcs">${npcs.map((n) => `<button class="vn-npc ${n.name === st.npcSel ? 'sel' : ''}" data-act="npc-open" data-name="${esc(n.name)}"><span class="vn-npc-img">${n.img ? `<img src="${esc(n.img)}" alt="">` : '👤'}</span><b>${esc(n.name)}</b><small>${esc(n.role || 'NPC')}</small></button>`).join('')}</div>` : '<p class="vn-hint">아직 등장인물이 없어요. 위에서 직접 추가하거나 "채팅 기록으로 분석"을 눌러 주세요. 일상 모드에서 새 인물이 나오면 자동으로 모여요.</p>'}
      ${sel ? `<div class="vn-npced"><div><div class="vn-npced-pic">${sel.img ? `<img src="${esc(sel.img)}" alt="${esc(sel.name)}" title="클릭하면 크게 보기">` : '<span>이미지 없음</span>'}</div>
        <div class="vn-dos-picbtns">${fileInput('npc-up', '', false, '이미지 바꾸기')}${npcImgPool().length ? '<button class="vn-btn" data-act="npc-pick">내 이미지에서 고르기</button>' : ''}<button class="vn-btn" data-act="npc-gen">AI로 만들기</button>${sel.img ? '<button class="vn-btn" data-act="npc-cut">✂ 배경 제거</button>' + (S().cutOrig?.[sel.img] ? '<button class="vn-btn" data-act="npc-uncut">↩ 원본으로 되돌리기</button>' : '') + '<button class="vn-btn" data-act="npc-imgdel">이미지 삭제</button>' : ''}</div></div>
        <div class="vn-npced-f">
          <div class="vn-row tight"><input type="text" data-act="npc-field" data-f="name" value="${esc(sel.name)}" placeholder="이름" style="flex:1 1 110px"><input type="text" data-act="npc-field" data-f="role" value="${esc(sel.role || '')}" placeholder="역할 / 관계" style="flex:1 1 90px"></div>
          ${S().useSS && ssWorld()?.places?.length ? `<div class="vn-row tight"><label>지도 위치</label><select data-act="npc-place" data-name="${esc(sel.name)}" style="flex:1 1 140px">${placeOptions(npcMarker(sel.name)?.place, '위치 모름')}</select></div>` : ''}
          <div class="vn-row tight"><label>이미지가 보는 방향</label><select data-act="npc-field" data-f="faces" style="flex:1 1 140px">${[['', '모름 (반전 안 함)'], ['left', '왼쪽을 봐요'], ['right', '오른쪽을 봐요']].map(([v, l]) => `<option value="${v}" ${(sel.faces || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <p class="vn-hint">고르거나 올린 이미지가 '기준 사진'이에요. "이미지로 외형 태그 뽑기"는 이 이미지만 보고 추측해서 만들고(설명·로어북·채팅 기록은 쓰지 않아요), AI로 만들 때도 사진을 먼저 따라요. 사람이든 동물이든 같아요.</p>
          <textarea rows="2" data-act="npc-field" data-f="desc" placeholder="설명 (메모예요. 외형 태그·AI 이미지에는 영향을 주지 않아요)">${esc(sel.desc || '')}</textarea>
          <textarea rows="2" data-act="npc-field" data-f="look" placeholder="외형 태그 (영어). 비워 두고, 이미지를 정한 뒤 아래 \"이미지로 외형 태그 뽑기\"를 누르면 이미지를 보고 만들어요">${esc(sel.look || '')}</textarea>
          <div class="vn-row tight"><button class="vn-btn sm" data-act="npc-look">이미지로 외형 태그 뽑기 (모델 1회)</button></div>
          <textarea rows="2" data-act="npc-field" data-f="summary" placeholder="관계 요약 (${esc(ctx().name1 || '나')}와 ${esc(cast[0]?.name || '캐릭터')} 사이에서의 위치)">${esc(sel.summary || '')}</textarea>
          <h4>알아낸 정보</h4>
          <div class="vn-facts">${[...NPC_STD(), ...extra].map(fact).join('')}</div>
          <div class="vn-row tight"><input type="text" id="vn-nfl" placeholder="항목" style="flex:1 1 90px"><input type="text" id="vn-nfv" placeholder="내용" style="flex:2 1 140px"><button class="vn-btn sm" data-act="npcfact-add">정보 추가</button><button class="vn-btn sm danger" data-act="npc-del">인물 삭제</button></div>
          <p class="vn-hint">이미지를 넣으면 이 인물이 이야기에 나올 때 주인공 옆(오른쪽, 두 번째는 왼쪽)에 같이 나타나고, 말할 때 밝아져요.</p></div></div>` : ''}`;
  }
  async function tabDossier() {
    const cast = castAll();
    if (!cast.length) return '<p class="vn-hint">캐릭터 채팅을 연 다음에 볼 수 있어요.</p>';
    const ch = selChar(); st.selChar = chKey(ch);
    const name = ch.name, v = affOf(name), dos = dossierOf(name), done = M().heartDone[name] || {}, cd = cdata(ch);
    const sp = await profileImage(ch);
    const av = Math.abs(v), hearts = Array.from({ length: 10 }, (_, i) => `<span class="vn-heart ${v < 0 ? 'neg ' : ''}${av >= (i + 1) * 10 ? 'on' : av >= (i + 1) * 10 - 5 ? 'half' : ''}">♥</span>`).join('');
    const extra = Object.keys(dos.facts).filter((k) => !STD_FACTS.includes(k));
    const fact = (k) => dos.facts[k] ? `<div class="vn-fact"><span>${esc(k)}</span><b>${esc(dos.facts[k])}</b><button class="vn-x" data-act="fact-del" data-l="${esc(k)}" aria-label="삭제">✕</button></div>` : `<div class="vn-fact lock"><span>${esc(k)}</span><b>???</b></div>`;
    const imgs = [...new Set([cd.profile, ...Object.values(cd.outfits).flatMap((o) => [o.base, ...Object.values(o.emo || {})])].filter(Boolean))];
    return `
      <div class="vn-dos">
        <div><div class="vn-dos-pic ${sp.kind === 'portrait' ? 'soft' : ''}">${sp.url ? `<img src="${esc(sp.url)}" alt="${esc(name)}" title="클릭하면 크게 보기">` : '<span>이미지 없음</span>'}</div>
          <div class="vn-dos-picbtns">${fileInput('dos-up', '', false, '이미지 바꾸기')}${imgs.length ? '<button class="vn-btn" data-act="dos-pick">내 이미지에서 고르기</button>' : '<span></span>'}${cd.profile ? '<button class="vn-btn wide" data-act="dos-reset">대표로 되돌리기</button>' : ''}</div></div>
        <div class="vn-dos-main">
          ${cast.length > 1 ? `<select data-act="sel-char">${cast.map((c) => `<option value="${esc(chKey(c))}" ${chKey(c) === st.selChar ? 'selected' : ''}>${c._parent ? '↳ ' : ''}${esc(c.name)}</option>`).join('')}</select>` : ''}
          <h3>${esc(name)}</h3>
          <div class="vn-hearts" aria-label="호감도 ${v}">${hearts}</div>
          <div class="vn-dos-lv">${v < 0 ? '🖤 ' : ''}${esc(affLevel(v))} <small>(${v})</small></div>
          <p class="vn-dos-sum">${esc(dos.summary || '아직 정리된 관계 요약이 없어요. "채팅 기록으로 분석"을 눌러 보세요.')}</p>
        </div>
      </div>
      <h4>하트 이벤트</h4>
      <div class="vn-steps">${HEART_STEPS.map(([t, n]) => `<span class="vn-step ${done[t] ? 'on' : ''}">${done[t] ? '✓' : '🔒'} ♥${t / 10 * 1} · ${esc(n)}</span>`).join('')}</div>
      <p class="vn-hint">호감도가 해당 수치를 처음 넘으면 특별 이벤트 장면이 나오도록 모델에게 요청해요. 마이너스 호감도는 같은 10칸이 검은 하트로 채워져요.</p>
      <h4>알아낸 정보</h4>
      <div class="vn-facts">${[...STD_FACTS, ...extra].map(fact).join('')}</div>
      <div class="vn-row"><input type="text" id="vn-fl" placeholder="항목 (예: 좋아하는 꽃)" style="flex:1 1 120px"><input type="text" id="vn-fv" placeholder="내용" style="flex:2 1 160px"><button class="vn-btn" data-act="fact-add">정보 추가</button></div>
      <div class="vn-row"><button class="vn-btn" data-act="analyze">채팅 기록으로 분석 (모델 1회)</button></div>
      <label class="vn-ck sm"><input type="checkbox" data-vk="analyzePlaces"><span>장소·마커도 함께 분석 (모델 +1회)</span></label>
      <p class="vn-hint">롤플레이 중 새로 드러난 정보는 모델이 알려 줘서 자동으로 채워져요. 이미 쌓인 채팅이 있으면 위 버튼으로 호감도·관계 요약·정보를 한 번에 가져와요. 등장인물은 NPC 탭에서 따로 분석해요.</p>`;
  }

  /* ---------- 일정 · 캘린더 (한 화면) ---------- */
  const kindLabel = (k) => ({ meet: '만남', encounter: '우연한 만남', npc: 'NPC와', solo: '혼자', charsolo: `${activeChar()?.name || '캐릭터'} 혼자` }[k] || k);
  const shortAct = (id) => actOf(id).n.replace(/\s*\(.*\)\s*$/, '');
  function dayDetail(dn) {
    const meta = M(), cal = meta.cal[dn], live = meta.plans[dn], pl = live || cal?.plan, sch = meta.sched[dn] || cal?.sched || [], dt = dateOfDay(dn);
    const md = `${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`, an = annivsOn(md);
    const editable = dn >= meta.day && !live;
    let body = '';
    if (editable) {
      body = `<div class="vn-sc-grid">${SLOTS.map((n, i) => `<label class="vn-sc"><small>${n} ${SLOT_TIMES[i]}</small><select data-act="sched-set" data-slot="${i}" data-day="${dn}">${ACTS.map((a) => `<option value="${a.id}" ${(sch[i] || 'free') === a.id ? 'selected' : ''}>${shortAct(a.id)}</option>`).join('')}</select></label>`).join('')}</div>
        <div class="vn-row tight"><button class="vn-btn sm" data-act="sched-rand">무작위</button><button class="vn-btn sm" data-act="sched-clear">모두 자유</button><label class="vn-sc wide"><small>만날 장소</small><select data-act="wish"><option value="">AI가 정함</option>${placeNames().map((n) => `<option ${n === meta.wish ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label></div>`;
    } else if (pl) {
      body = SLOTS.map((n, i) => {
        const s = pl.slots?.[i] || {}, e = (cal?.events || []).find((x) => x.slot === i), picks = e?.picks?.length ? ` · 선택: ${e.picks.map(esc).join(' › ')}` : '';
        return `<div class="vn-dd"><div class="vn-dd-h"><b>${n}</b><small>${esc(s.time || SLOT_TIMES[i])}</small><span class="vn-tag">${esc(shortAct(sch[i] || 'free'))}</span><span class="vn-tag k-${s.kind}">${esc(kindLabel(s.kind))}${s.kind === 'npc' && s.npc ? ` · ${esc(s.npc)}` : ''}</span>${s.special ? '<span class="vn-tag sp">★ 하이라이트</span>' : ''}</div>
          <p>${esc(s.loc || '')}${s.premise ? ` — ${esc(s.premise)}` : ''}</p>
          ${e ? `<p class="vn-dd-e">${esc(e.title || '')}${picks}${e.aff ? ` · 호감 ${e.aff > 0 ? '+' : ''}${e.aff}` : ''}<button class="vn-x" data-act="cal-evdel" data-day="${dn}" data-idx="${(cal?.events || []).indexOf(e)}" aria-label="삭제">✕</button></p>` : (dn <= meta.day && !(dn === meta.day && i >= meta.slot) ? '' : '<p class="vn-hint">아직 진행 전</p>')}</div>`;
      }).join('');
    } else if (cal?.events?.length) {
      body = cal.events.map((e, ei) => `<div class="vn-dd"><div class="vn-dd-h"><b>${esc(SLOTS[e.slot] || '')}</b></div><p>${esc(e.loc || '')} — ${esc(e.title || '')}${e.aff ? ` · 호감 ${e.aff > 0 ? '+' : ''}${e.aff}` : ''}<button class="vn-x" data-act="cal-evdel" data-day="${dn}" data-idx="${ei}" aria-label="삭제">✕</button></p></div>`).join('');
    } else body = '<p class="vn-hint">기록된 내용이 없어요.</p>';
    const canGo = dn === meta.day || (dn > meta.day);
    return `<div class="vn-caldet"><h4>${fmtDate(dt)}${dn >= 1 ? ` · ${dn}일째` : ''}${(cal?.weather || pl?.weather) ? ` · ${weatherIcon(cal?.weather || pl?.weather)} ${esc(cal?.weather || pl?.weather)}` : ''}${pl?.title ? ` — ${esc(pl.title)}` : ''}</h4>
      ${an.length ? `<p>🎂 ${an.map(esc).join(', ')}</p>` : ''}${body}
      <div class="vn-row tight">${dn === meta.day ? `<button class="vn-btn primary sm" data-act="sched-go">${meta.mode === 'daily' ? '일상 이어서' : '일상 모드로 시작'}</button>` : ''}${live && dn >= meta.day ? '<button class="vn-btn danger sm" data-act="plan-redo">이 날 계획 다시 만들기</button>' : ''}${(cal?.events?.length || cal?.title) ? `<button class="vn-btn danger sm" data-act="cal-daydel" data-day="${dn}">이 날 기록 삭제</button>` : ''}</div>${live && dn > meta.day ? '' : ''}</div>`;
  }
  function tabCal() {
    const meta = M(), today = dateOfDay(meta.day);
    if (st.calSel == null) st.calSel = meta.day;
    if (!st.calMonth) st.calMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
    const [Y, Mo] = st.calMonth.split('-').map(Number), first = new Date(Date.UTC(Y, Mo - 1, 1)), days = new Date(Date.UTC(Y, Mo, 0)).getUTCDate();
    let cells = '';
    for (let i = 0; i < first.getUTCDay(); i++) cells += '<span class="vn-cd empty"></span>';
    for (let d = 1; d <= days; d++) {
      const ms = Date.UTC(Y, Mo - 1, d), dn = dayOfUTC(ms), cal = meta.cal[dn], md = `${String(Mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, an = annivsOn(md);
      const evs = cal?.events?.length || 0;
      cells += `<button class="vn-cd ${meta.mode === 'daily' && dn === meta.day ? 'today' : ''} ${dn === st.calSel ? 'sel' : ''} ${dn < 1 ? 'pre' : ''}" data-act="cal-sel" data-day="${dn}"><i>${d}</i>${evs ? `<em>♥${evs}</em>` : ''}${an.length ? '<u>🎂</u>' : ''}${(meta.plans[dn] || cal?.plan) && !evs ? '<s>•</s>' : ''}</button>`;
    }
    return `
      <div class="vn-row tight"><label>시작일</label><input type="date" data-act="start-date" value="${esc(meta.startDate)}"><span class="vn-hint">1일째 날짜 · 오늘 ${fmtDate(today)} (${meta.day}일째)</span></div>
      <div class="vn-calnav"><button class="vn-btn sm" data-act="cal-prev" aria-label="이전 달">◀</button><b>${Y}년 ${Mo}월</b><button class="vn-btn sm" data-act="cal-next" aria-label="다음 달">▶</button></div>
      <div class="vn-cal"><span class="vn-cw">일</span><span class="vn-cw">월</span><span class="vn-cw">화</span><span class="vn-cw">수</span><span class="vn-cw">목</span><span class="vn-cw">금</span><span class="vn-cw">토</span>${cells}</div>
      ${dayDetail(st.calSel)}
      ${Object.keys(meta.cal).length ? `<div class="vn-row tight"><button class="vn-btn danger sm" data-act="cal-clearall">캘린더 기록 전체 삭제 (${Object.keys(meta.cal).length}일)</button></div>` : ''}
      ${(meta.chatEvents || []).length ? `<details class="vn-more"><summary>채팅 모드 이벤트 (${meta.chatEvents.length})</summary>${meta.chatEvents.slice().reverse().map((e, ri) => `<div class="vn-fact"><span>${esc(new Date(e.t).toLocaleDateString('ko-KR'))}</span><b>${esc(e.loc || '')} — ${esc(e.title || '')}</b><button class="vn-x" data-act="chatevt-del" data-i="${meta.chatEvents.length - 1 - ri}" aria-label="삭제">✕</button></div>`).join('')}<div class="vn-row tight"><button class="vn-btn danger sm" data-act="chatevt-clear">채팅 모드 이벤트 전체 삭제</button></div></details>` : ''}
      <details class="vn-more"><summary>기념일 (${meta.annivs.length})</summary>
        ${meta.annivs.map((a, i) => `<div class="vn-fact"><span>${esc(a.md)}</span><b>${esc(a.name)}</b><button class="vn-x" data-act="anniv-del" data-i="${i}" aria-label="삭제">✕</button></div>`).join('')}
        <div class="vn-row tight"><input type="text" id="vn-an" placeholder="이름 (예: 첫 만남)" style="flex:1 1 130px"><input type="text" id="vn-amd" placeholder="월-일 (03-14)" style="flex:0 1 110px"><button class="vn-btn sm" data-act="anniv-add">추가</button></div>
        <p class="vn-hint">캐릭터의 생일을 알아내면 자동으로 표시돼요.</p></details>`;
  }

  /* ---------- 지도 (장면 생성기와 같은 편집: 장소 추가/삭제/이동, 지도 이미지, 내부 지도 정리) ---------- */
  /* ----- 장소·마커 자동 분석 (장면 생성기의 분석을 그대로 가져옴) ----- */
  const MARKER_TYPES = { user: '나 (유저)', char: '캐릭터', npc: 'NPC', enemy: '적', quest: '퀘스트' };
  function ensureWorld() {
    const m = ctx().chatMetadata; if (!m) throw new Error('채팅을 먼저 열어 주세요');
    m.minimap ||= {}; m.minimap.world ||= { places: [], maps: {}, gallery: [], scenes: {}, markers: [], look: '' };
    m.minimap.world.markers ||= []; return m.minimap.world;
  }
  const placeKeys = (p) => [p.name, ...(p.aliases || [])].map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  const findPlaceByName = (nm) => ssWorld()?.places.find((p) => placeKeys(p).includes(String(nm).trim().toLowerCase()));
  const isDescOf = (id, anc) => { let q = placeById(id), n = 0; while (q?.parent && n++ < 10) { if (q.parent === anc.id) return true; q = placeById(q.parent); } return false; };
  function nudgePlace(p) {
    const others = ssWorld().places.filter((q) => q !== p && hasXY(q) && (q.parent || null) === (p.parent || null));
    for (let i = 0; i < 40 && others.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 9); i++) { p.x = clamp(+(p.x + 6 * Math.cos(i * 2.4)).toFixed(1), 6, 94); p.y = clamp(+(p.y + 6 * Math.sin(i * 2.4)).toFixed(1), 6, 94); }
  }
  function mergePlacesVN(list) {
    const w = ssWorld(), created = [], num = (v) => (v == null || v === '' || Number.isNaN(+v) ? null : clamp(+v, 0, 100));
    for (const it of (list || []).slice(0, 30)) {
      if (!it?.name) continue;
      const al = (it.aliases || []).map(String).filter(Boolean);
      let p = findPlaceByName(it.name);
      if (p) { p.desc = p.desc || it.desc || ''; p.visual = p.visual || it.visual || ''; if (!p.kind && PLACE_KINDS[it.kind]) p.kind = it.kind; al.forEach((a) => { if (!placeKeys(p).includes(a.toLowerCase())) (p.aliases ||= []).push(a); }); continue; }
      p = { id: uid(), name: String(it.name).trim(), aliases: al, kind: PLACE_KINDS[it.kind] ? it.kind : '', x: num(it.x), y: num(it.y), parent: null, desc: it.desc || '', visual: it.visual || '', auto: true, _pn: it.parent };
      w.places.push(p); created.push(p);
    }
    for (const p of created) { if (p._pn) { const par = findPlaceByName(p._pn); if (par && par !== p && !isDescOf(par.id, p)) p.parent = par.id; } delete p._pn; }
    flattenPlaces(); created.filter(hasXY).forEach(nudgePlace);
    return created.length;
  }
  function roleOfName(name) {
    const n = String(name || '').trim().toLowerCase(); if (!n) return null;
    const same = (a) => { a = String(a || '').trim().toLowerCase(); return !!a && (a === n || (a.length >= 4 && n.length >= 4 && (a.includes(n) || n.includes(a)))); };
    if (same(ctx().name1)) return 'user';
    if (castList().some((ch) => same(ch.name))) return 'char';
    return null;
  }
  const fixMarkerType = (it) => (['npc', 'char', 'user'].includes(it.type) ? roleOfName(it.name) || 'npc' : it.type);
  const markerRoleNote = () => `{{user}} is "${ctx().name1}" → type "user". The main character(s) {{char}} (${castList().map((ch) => ch.name).join(', ') || 'unknown'}) → type "char". Every other named person → "npc".`;
  function mergeMarkersVN(list) {
    const w = ssWorld(); let n = 0;
    for (const it of (list || []).slice(0, 40)) {
      if (!MARKER_TYPES[it?.type] || !it.name) continue;
      const type = fixMarkerType(it), place = findPlaceByName(it.place || ''); if (!place) continue;
      const dup = w.markers.find((m) => m.type === type && m.name.toLowerCase() === String(it.name).toLowerCase());
      if (dup) { dup.place = place.id; continue; }
      w.markers.push({ id: uid(), type, name: String(it.name).trim(), place: place.id }); n++;
    }
    return n;
  }
  async function gatherWorldContext() {
    const c = ctx(), parts = [];
    for (const ch of castList()) parts.push(`[Character: ${ch.name}]\n${(ch.description || '').slice(0, 2500)}\n${(ch.scenario || '').slice(0, 1000)}`);
    const persona = c.powerUserSettings?.persona_description; if (persona) parts.push(`[User persona: ${c.name1}]\n${persona.slice(0, 1500)}`);
    let lore = '';
    for (const name of await loreNames()) {
      try {
        if (!loreCache[name]) { const r = await fetch('/api/worldinfo/get', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ name }) }); if (!r.ok) continue; loreCache[name] = await r.json(); }
        for (const e of Object.values(loreCache[name].entries || {})) { if (e.disable) continue; lore += `- ${(e.comment || (e.key || [])[0] || '').trim()}: ${(e.content || '').replace(/\s+/g, ' ').slice(0, 350)}\n`; if (lore.length > 9000) break; }
      } catch (err) { console.warn('[VN] lorebook', name, err); }
    }
    if (lore) parts.push(`[Lorebook]\n${lore}`);
    const recent = (c.chat || []).filter((m) => m && !m.is_system).slice(-8).map((m) => `${m.name}: ${String(m.mes).slice(0, 500)}`).join('\n');
    if (recent) parts.push(`[Recent chat]\n${recent}`);
    return parts.join('\n\n');
  }
  async function analyzeWorldVN() {
    const w = ensureWorld(), known = w.places.map((p) => p.name).join(', ');
    const prompt = `You are a worldbuilding analyst. Do NOT roleplay. Read the material below and extract the LOCATIONS and map markers of this story world.
Reply with ONLY one JSON object, no commentary:
{"look":"one English sentence on the overall visual style and atmosphere of the world",
"places":[{"name":"name in the story's language","aliases":["other names or keywords"],"kind":"city|town|inn|shop|food|smith|temple|school|home|castle|gate|dungeon|nature|water|building|other","parent":"name of the containing place or null","x":0-100,"y":0-100,"desc":"one short sentence in the story's language","visual":"one English sentence on how it looks, for an image generator"}],
"markers":[{"type":"user|char|npc|enemy|quest","name":"name","place":"exact name of a place above"}]}
Rules: at most 20 places and 20 markers. Nest at most ONE level: a building or area (e.g. a cabin) holds its rooms (room, bathroom, kitchen...) as DIRECT children; never put a room inside another room and never give rooms their own sub-places. x,y = position on the top-down map OF ITS PARENT (or of the whole world if parent is null), 0..100, west-east and north-south. Distances between places must reflect their real relative distances. EVERY place needs x,y, even when it has a parent (its position inside the parent's map). Markers: the user and main character(s) (where they are now), named important NPCs, hostile enemies/threats, and quest objectives with a location. ${markerRoleNote()} Skip places already known: ${known || 'none'}.

${await gatherWorldContext()}`;
    const data = parseJSON(await llm(prompt, 4096, '장소·마커 분석'));
    if (!data?.places) throw new Error('결과를 읽지 못했어요. 다시 시도해 주세요.');
    if (data.look && !w.look) w.look = String(data.look).slice(0, 300);
    const n = mergePlacesVN(data.places), m = mergeMarkersVN(data.markers);
    autoLayoutPlaces(); w.analyzed = true; saveMeta();
    toastr.success(`장소 ${n}개, 마커 ${m}개를 추가했어요. 지도 탭에서 수정할 수 있어요.`);
    return { n, m };
  }
  const PLACE_KINDS = { city: '도시', town: '마을·구역', inn: '여관·숙소', shop: '상점', food: '식당·카페', smith: '대장간', temple: '신전·교회', school: '학교', home: '집', castle: '성·궁전', gate: '문·다리', dungeon: '던전·동굴', nature: '숲·공원', water: '강·호수·바다', building: '건물', other: '기타' };
  const hasXY = (p) => p.x != null && p.y != null && !Number.isNaN(+p.x) && !Number.isNaN(+p.y);
  const placeById = (id) => ssWorld()?.places.find((p) => p.id === id);
  /* ----- 지도 아이콘 · NPC 위치 · 지도 이미지 생성 ----- */
  const KIND_ICON = { city: '🏙️', town: '🏘️', inn: '🛏️', shop: '🛍️', food: '🍽️', smith: '⚒️', temple: '⛩️', school: '🏫', home: '🏠', castle: '🏰', gate: '🚪', dungeon: '🕳️', nature: '🌳', water: '🌊', building: '🏢', other: '📍' };
  const NAME_ICONS = [
    [/침실|bed ?room|^room$|내 방|방$/i, '🛏️'], [/부엌|주방|kitchen/i, '🍳'], [/욕실|화장실|목욕|온천|bath|toilet/i, '🛁'], [/거실|living/i, '🛋️'],
    [/정원|마당|garden|yard/i, '🌷'], [/카페|cafe|coffee|식당|restaurant|술집|tavern|\bbar\b/i, '☕'], [/도서관|library/i, '📚'], [/병원|의무실|clinic|hospital/i, '🏥'],
    [/학교|교실|school|classroom/i, '🏫'], [/신전|교회|성당|church|temple|shrine/i, '⛩️'], [/상점|가게|시장|shop|store|market/i, '🛍️'], [/대장간|smith|forge/i, '⚒️'],
    [/성$|궁전|castle|palace/i, '🏰'], [/숲|공원|forest|woods|park/i, '🌳'], [/강$|강가|호수|바다|해변|lake|river|\bsea\b|beach/i, '🌊'], [/던전|동굴|dungeon|cave/i, '🕳️'],
    [/문$|다리|gate|bridge/i, '🚪'], [/옥상|roof/i, '🌇'], [/지하|basement|cellar/i, '🪜'], [/복도|hall|corridor/i, '🚪'],
  ];
  /* 종류가 정해져 있으면 그 아이콘, "기타"/비어 있으면 이름에서 짐작한다 */
  function placeIcon(p) {
    if (p?.kind && p.kind !== 'other' && KIND_ICON[p.kind]) return KIND_ICON[p.kind];
    for (const [re, ic] of NAME_ICONS) if (re.test(String(p?.name || '').trim())) return ic;
    return KIND_ICON[p?.kind] || KIND_ICON.other;
  }
  const MARKER_ICON = { user: '🙋', char: '💗', npc: '🧑', enemy: '👹', quest: '❗' };
  const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const npcMarker = (name) => (ssWorld()?.markers || []).find((m) => m.type === 'npc' && sameName(m.name, name));
  function setNpcPlace(name, placeId) {
    const w = ensureWorld(); let m = npcMarker(name);
    if (!placeId) { if (m) w.markers = w.markers.filter((x) => x !== m); }
    else if (m) m.place = placeId;
    else w.markers.push({ id: uid(), type: 'npc', name: String(name).trim(), place: placeId });
    saveMeta();
  }
  /* 건물 아래에 방이 오도록 정렬한 장소 목록 (선택 상자용) */
  function orderedPlaces() {
    const ps = ssWorld()?.places || [], out = [];
    for (const r of ps.filter((p) => !p.parent || !placeById(p.parent))) { out.push([r, 0]); ps.filter((c) => c.parent === r.id).forEach((c) => out.push([c, 1])); }
    return out;
  }
  const placeOptions = (selId, noneLabel) => `<option value="">${esc(noneLabel)}</option>${orderedPlaces().map(([p, d]) => `<option value="${esc(p.id)}" ${p.id === selId ? 'selected' : ''}>${d ? '　↳ ' : ''}${esc(placeIcon(p))} ${esc(p.name)}</option>`).join('')}`;
  async function locateNpcsVN() {
    const w = ensureWorld(), meta = M(), npcs = meta.npcs.filter((n) => !npcMarker(n.name));
    if (!meta.npcs.length) throw new Error('NPC가 없어요. NPC 탭에서 먼저 추가하거나 분석해 주세요.');
    if (!w.places.length) throw new Error('장소가 없어요. 먼저 장소·마커 분석을 해 주세요.');
    if (!npcs.length) return 0;
    const places = orderedPlaces().map(([p, d]) => `${d ? '  ' : ''}${p.name}${p.parent ? ` (inside ${placeById(p.parent)?.name})` : ''}`).join('\n');
    const list = npcs.map((n) => `- ${n.name}${n.role ? ` (${n.role})` : ''}${n.desc ? `: ${String(n.desc).slice(0, 100)}` : ''}`).join('\n');
    const prompt = `You are a story analyst. Do NOT roleplay. Decide where each NPC below is most likely to be found on the map right now (use the recent chat first, then their role and the lorebook).
Reply with ONLY one JSON object, no commentary: {"npcs":[{"name":"exact NPC name","place":"exact name from the place list, or null if there is no basis"}]}
Never invent places. If unsure, use null.
[Places]
${places}
[NPCs]
${list}

${await gatherWorldContext()}`;
    const data = parseJSON(await llm(prompt, 2048, 'NPC 위치 찾기'));
    if (!Array.isArray(data?.npcs)) throw new Error('결과를 읽지 못했어요. 다시 시도해 주세요.');
    let n = 0;
    for (const it of data.npcs) {
      const npc = npcs.find((x) => sameName(x.name, it?.name)), p = it?.place ? findPlaceByName(it.place) : null;
      if (npc && p) { setNpcPlace(npc.name, p.id); n++; }
    }
    return n;
  }
  /* 지도 이미지 기록: 만들었거나 올린 지도는 바뀌어도 여기에 남고, 배경 탭의 "지도 이미지"에서 다시 볼 수 있다 */
  const mapHist = () => (M().mapHist ||= []);
  function pushMapHist(url, scope, ratio, kind, ts = Date.now()) {
    if (!url) return null;
    const h = mapHist(), ex = h.find((e) => e.url === url); if (ex) return ex;
    const e = { id: uid(), url, scope: scope || 'world', scopeName: scope === 'world' ? '세계' : (placeById(scope)?.name || ''), ratio: ratio || 1, kind: kind || 'ai', ts };
    h.push(e);
    while (h.length > 40) { const old = h.shift(); dropImage(old.url); }
    saveMeta(); return e;
  }
  const mapKind = (m) => (m?.ai ? 'ai' : m?.user ? 'user' : 'ss');
  /* 지도 확대/축소: 단계 확대 + 끌어서 이동 (장면 생성기와 같은 방식). 장소 핀·마커는 확대해도 같은 크기로 보인다 */
  const MAP_Z = [1, 1.5, 2, 3, 4, 6];
  const camOf = () => (st.mapCam ||= { z: 1, tx: 0, ty: 0 });
  function camClamp(c) { c.tx = clamp(c.tx, 100 - 100 * c.z, 0); c.ty = clamp(c.ty, 100 - 100 * c.z, 0); return c; }
  function applyMapCam() {
    const stg = $q('.vn-map-stage', ui.root); if (!stg) return;
    const c = camClamp(camOf());
    stg.style.setProperty('--z', c.z); stg.style.transform = `translate(${c.tx}%, ${c.ty}%) scale(${c.z})`;
    const o = $q('.vn-mapctl output', ui.root); if (o) o.textContent = c.z === 1 ? '' : `×${c.z}`;
  }
  function mapZoom(dir, vx = 50, vy = 50) {   // vx, vy: 확대 중심 (보이는 지도 안의 위치, %)
    const c = camOf(), i = MAP_Z.reduce((b, v, k) => (Math.abs(v - c.z) < Math.abs(MAP_Z[b] - c.z) ? k : b), 0), nz = MAP_Z[clamp(i + dir, 0, MAP_Z.length - 1)];
    if (nz === c.z) return;
    const px = (vx - c.tx) / c.z, py = (vy - c.ty) / c.z;
    c.z = nz; c.tx = vx - px * nz; c.ty = vy - py * nz;
    if (nz === 1) { c.tx = 0; c.ty = 0; }
    applyMapCam();
  }
  async function generateMapVN(scope) {
    const w = ssWorld(); if (!w) throw new Error('채팅을 먼저 열어 주세요');
    autoLayoutPlaces();
    const parent = scope === 'world' ? null : placeById(scope), kids = w.places.filter((p) => (p.parent || 'world') === scope && hasXY(p));
    if (!kids.length) throw new Error('이 지도에 놓을 장소가 없어요. 장소를 먼저 추가해 주세요.');
    const aspect = '1:1', look = String(w.look || '').trim();
    const brief = (p) => String(p.visual || p.desc || '').replace(/\s+/g, ' ').slice(0, 140);
    const list = kids.map((p) => `- "${p.name}" (${PLACE_KINDS[p.kind] ? p.kind : 'place'}): ${Math.round(p.x)}% from the left, ${Math.round(p.y)}% from the top${brief(p) ? `. ${brief(p)}` : ''}`).join('\n');
    const what = parent
      ? `the INSIDE of "${parent.name}"${brief(parent) ? ` (${brief(parent)})` : ''}, drawn as a cutaway floor plan where each room or area below is a clearly separate space`
      : 'the whole story world, like a game overview map, with each location below as a distinct landmark';
    const prompt = `Generate one image. ${styleBg()}. A top-down illustrated MAP of ${what}.
Place every location at the given position (x = distance from the left edge, y = distance from the top edge, as a percentage of the image) so the relative layout matches:
${list}
Connect them with natural paths, roads or corridors, and fill the whole image edge to edge with terrain or floor.${look ? ` World atmosphere: ${look}.` : ''}
IMPORTANT: absolutely no text, letters, numbers, labels, signs with writing, legend, compass, UI, border, frame or watermark. No people and no characters. Do not draw pins or markers; they are added separately.`;
    const url = await geminiGenerate(prompt, [], aspect, 'vnmap_', parent ? `지도 · ${parent.name} 내부` : '지도 · 세계');
    const dim = await new Promise((ok) => { const im = new Image(); im.onload = () => ok(im.width / Math.max(1, im.height)); im.onerror = () => ok(1); im.src = url; });
    const old = (w.maps ||= {})[scope], ratio = +dim.toFixed(3) || 1;
    if (old?.url) pushMapHist(old.url, scope, old.ratio, mapKind(old));   // 이전 지도는 배경 탭 "지도 이미지"에 남긴다
    w.maps[scope] = { url, ratio, ai: true }; pushMapHist(url, scope, ratio, 'ai'); saveMeta();
    return url;
  }
  function rootOfPlace(p) { let q = p, n = 0; while (q?.parent && placeById(q.parent) && n++ < 10) q = placeById(q.parent); return q; }
  /* 지도는 2단계만: 건물(마을) > 내부 장소(방·구역). 더 깊은 장소는 건물 바로 아래로 올려 하나의 내부 지도로 합친다 */
  function flattenPlaces() {
    let moved = 0; const w = ssWorld(); if (!w) return 0;
    for (const p of w.places) {
      if (!p.parent) continue;
      const par = placeById(p.parent);
      if (!par) { p.parent = null; continue; }
      if (par.parent) { p.parent = rootOfPlace(par).id; p.x = null; p.y = null; moved++; }
    }
    return moved;
  }
  function autoLayoutPlaces() {
    const w = ssWorld(); if (!w) return;
    const groups = new Map();
    for (const p of w.places) { const k = p.parent || 'world'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
    for (const list of groups.values()) {
      const placed = list.filter(hasXY);
      for (const p of list.filter((q) => !hasXY(q))) {
        let a = placed.length * 2.4, r = 14, pos = null;
        for (let i = 0; i < 300 && !pos; i++) {
          const x = 50 + r * Math.cos(a), y = 50 + r * Math.sin(a);
          if (x > 8 && x < 92 && y > 8 && y < 92 && placed.every((q) => Math.hypot(q.x - x, q.y - y) > 13)) pos = { x, y };
          a += 0.7; r += 0.3;
        }
        p.x = +(pos?.x ?? 50).toFixed(1); p.y = +(pos?.y ?? 50).toFixed(1); placed.push(p);
      }
    }
  }
  function tabMap() {
    const w = ssWorld();
    if (!S().useSS) return '<p class="vn-hint">설정에서 "장면 생성기 연동"이 꺼져 있어요.</p>';
    const analyzeBox = `<div class="vn-anbox"><div><b>장소·마커 자동 분석</b><p class="vn-hint">장면 생성기와 같은 방식으로 캐릭터 카드·로어북·최근 대화에서 장소와 마커를 찾아 지도에 추가해요. 모델 1회 호출이에요. 이미 있는 장소는 건너뛰어요.</p></div><button class="vn-btn primary" data-act="map-analyze">분석하기 (모델 1회)</button></div>`;
    if (!w?.places) return `${analyzeBox}<p class="vn-hint">이 채팅의 장소 데이터가 아직 없어요. 위 버튼으로 만들거나, 장면 생성기에서 먼저 분석해도 같은 데이터를 써요.</p>`;
    const parents = w.places.filter((p) => w.places.some((c) => c.parent === p.id) || ['city', 'town', 'building', 'castle', 'school', 'home', 'inn', 'dungeon'].includes(p.kind));
    const scopes = [['world', '세계'], ...parents.map((p) => [p.id, p.name])];
    if (!scopes.some(([id]) => id === st.mapScope)) st.mapScope = 'world';
    const map = w.maps?.[st.mapScope] || (st.mapScope === 'world' && ssSet()?.mapImage ? { url: ssSet().mapImage, ratio: ssSet().mapRatio || 1 } : null);
    const kids = w.places.filter((p) => (p.parent || 'world') === st.mapScope && hasXY(p));
    const cur = w.places.find((p) => p.id === ctx().chatMetadata?.minimap?.current);
    const sel = w.places.find((p) => p.name === st.mapSel);
    const selBg = sel && bgFor(sel.name);
    const parentOpts = (p) => `<option value="">세계 지도에 표시</option>${w.places.filter((q) => q.id !== p.id && !(q.parent && placeById(q.parent)?.parent)).map((q) => `<option value="${esc(q.id)}" ${p.parent === q.id ? 'selected' : ''}>${esc(q.name)} 안</option>`).join('')}`;
    const kindOpts = (k) => Object.entries(PLACE_KINDS).map(([v, n]) => `<option value="${v}" ${k === v ? 'selected' : ''}>${n}</option>`).join('');
    const nested = w.places.filter((p) => p.parent && placeById(p.parent)?.parent).length;
    const mks = w.markers || [], mkf = st.mapMk || 'all';
    const pinHtml = (p) => `<button class="vn-pin ${p.name === st.mapSel ? 'sel' : ''} ${p.id === cur?.id ? 'cur' : ''}" style="left:${p.x}%;top:${p.y}%" data-act="map-pick" data-id="${esc(p.id)}" data-name="${esc(p.name)}" title="${esc(p.name)}"><i class="vn-ic">${placeIcon(p)}</i><span>${esc(p.name)}</span></button>`;
    /* 마커(NPC·캐릭터·나 …)는 이름표 대신 작은 아이콘으로 핀 둘레에 놓고, 이름은 마우스를 올리거나 눌렀을 때만 말풍선으로 보여 준다 (장면 생성기 방식). 방 안에 있으면 그 방이 속한 건물 핀에 붙는다 */
    const anchorOf = (m) => { let q = placeById(m.place), n = 0; while (q && n++ < 10) { if (kids.includes(q)) return q; q = q.parent ? placeById(q.parent) : null; } return null; };
    const byPin = new Map();
    if (mkf !== 'off') for (const m of mks) { if (mkf === 'npc' && m.type !== 'npc') continue; const a = anchorOf(m); if (a) { if (!byPin.has(a.id)) byPin.set(a.id, []); byPin.get(a.id).push(m); } }
    const mkBadge = (m, x, y, dx, dy) => {
      const img = m.type === 'npc' ? npcByName(m.name)?.img : '', pl = placeById(m.place), tip = `${MARKER_TYPES[m.type] || m.type} · ${m.name}${pl ? ` (${pl.name})` : ''}`;
      return `<button class="vn-mk t-${esc(m.type)} ${x < 22 ? 'l' : x > 78 ? 'r' : ''} ${y < 22 ? 'd' : ''}" style="left:${x}%;top:${y}%;--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px" data-act="mk-tip" data-tip="${esc(tip)}" title="${esc(tip)}" aria-label="${esc(tip)}">${img ? `<img src="${esc(img)}" alt="">` : `<i>${MARKER_ICON[m.type] || '📍'}</i>`}</button>`;
    };
    const ringPos = (i) => { const ang = 0.6 + (i % 8) * 0.85, r = 25 + Math.floor(i / 8) * 16; return [r * Math.cos(ang), -r * Math.sin(ang)]; };
    const mkHtml = [...byPin.entries()].map(([id, list]) => { const a = placeById(id); const fl = a.y < 22 ? -1 : 1; return list.slice(0, 16).map((m, i) => { const [dx, dy] = ringPos(i); return mkBadge(m, a.x, a.y, dx, dy * fl); }).join(''); }).join('');   // 지도 위쪽 가장자리의 장소는 아이콘을 아래로 펼친다
    const here = (mkf !== 'off' && st.mapScope !== 'world') ? mks.filter((m) => m.place === st.mapScope && (mkf !== 'npc' || m.type === 'npc')) : [];
    const hereHtml = here.slice(0, 10).map((m, i, arr) => mkBadge(m, 50, 7, (i - (arr.length - 1) / 2) * 25, 0)).join('');
    const shownMk = [...byPin.values()].reduce((a, l) => a + l.length, 0) + here.length;
    if (st.mapCamScope !== st.mapScope) { st.mapCam = null; st.mapCamScope = st.mapScope; }   // 지도를 바꾸면 확대는 처음으로
    const cam = camClamp(camOf());
    return `
      ${analyzeBox}
      <div class="vn-row tight"><label>지도</label><select data-act="map-scope">${scopes.map(([id, n]) => `<option value="${esc(id)}" ${id === st.mapScope ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>${fileInput('map-img-up', '', false, '지도 이미지 올리기')}${map ? '<button class="vn-btn sm danger" data-act="map-img-del">지도 이미지 제거</button>' : ''}<button class="vn-btn sm" data-act="map-flat" title="방마다 따로 생긴 내부 지도를 건물 하나로 합쳐요">내부 지도 정리${nested ? ` (${nested})` : ''}</button><button class="vn-btn sm primary" data-act="map-gen" title="이 지도의 장소 위치에 맞춰 지도 그림을 AI로 그려요 (이미지 1회 요금)">${map ? '지도 이미지 다시 생성' : '지도 이미지 생성'}</button><select data-act="map-mkf" title="지도에 표시할 마커">${[['all', '마커 전체'], ['npc', 'NPC만'], ['off', '마커 숨김']].map(([v, n]) => `<option value="${v}" ${v === mkf ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="vn-map" style="aspect-ratio:${map?.ratio || 1}">${map ? '' : '<div class="vn-map-empty">지도 이미지가 없어요. 위에서 올리거나 "지도 이미지 생성"을 눌러 주세요</div>'}<div class="vn-map-stage" style="--z:${cam.z};transform:translate(${cam.tx}%,${cam.ty}%) scale(${cam.z})">${map ? `<img src="${esc(map.url)}" alt="지도" draggable="false">` : ''}${kids.map(pinHtml).join('')}${mkHtml}${hereHtml}</div><div class="vn-mapctl"><button data-act="map-zin" title="확대 (마우스 휠·두 손가락)" aria-label="확대">＋</button><button data-act="map-zout" title="축소" aria-label="축소">－</button><button data-act="map-zreset" title="처음 크기로" aria-label="처음 크기로">⟲</button><output>${cam.z === 1 ? '' : `×${cam.z}`}</output></div></div>
      <p class="vn-hint">${L2('핀을 끌어서 옮기고, 눌러서 선택해요. 장면 생성기와 같은 장소 데이터라 양쪽에 같이 반영돼요. 지도 그림은 <b>"지도 이미지 생성"</b>으로 장소 위치에 맞춰 그릴 수 있어요. 마커(NPC 등)는 핀 둘레의 작은 아이콘이고, 마우스를 올리거나 누르면 이름이 떠요. 휠·＋/－·두 손가락으로 확대/축소하고, 확대하면 끌어서 이동해요.', 'Drag pins to move them and click to select. This is the same place data as Scene Studio, so changes apply to both. Use <b>"Generate map image"</b> to draw the map to match the pin layout. Markers (NPCs etc.) are small icons around the pins; hover or tap one to see its name. Zoom with the wheel, ＋/－ or two fingers, and drag to pan when zoomed in.')}</p>
      <div class="vn-row tight"><input type="text" id="vn-newmp" placeholder="새 장소 이름" style="flex:1 1 120px"><select id="vn-newmk">${kindOpts('other')}</select><select id="vn-newmpar"><option value="">${st.mapScope === 'world' ? '세계 지도에 표시' : `${esc(placeById(st.mapScope)?.name || '')} 안`}</option></select><button class="vn-btn sm primary" data-act="map-add">장소 추가</button></div>
      ${sel ? `<div class="vn-mapsel"><div class="vn-pl-img">${selBg ? `<img src="${esc(selBg.url)}" alt="">` : '<span>이미지 없음</span>'}</div><div class="vn-pl-info">
        <div class="vn-row tight"><input type="text" data-act="map-field" data-f="name" data-id="${esc(sel.id)}" value="${esc(sel.name)}" style="flex:1 1 130px"><select data-act="map-kind" data-id="${esc(sel.id)}">${kindOpts(sel.kind || 'other')}</select></div>
        <div class="vn-row tight"><label>위치</label><select data-act="map-parent" data-id="${esc(sel.id)}">${parentOpts(sel)}</select>${selBg ? `<em>${selBg.from === 'ss' ? '장면 생성기 이미지' : selBg.from === 'user' ? '직접 올림' : 'VN Studio 생성'}</em>` : ''}</div>
        <input type="text" data-act="map-field" data-f="aliases" data-id="${esc(sel.id)}" value="${esc((sel.aliases || []).join(', '))}" placeholder="다른 이름 (쉼표로 구분)" style="width:100%">
        <textarea rows="2" data-act="map-field" data-f="desc" data-id="${esc(sel.id)}" placeholder="설명">${esc(sel.desc || '')}</textarea>
        <textarea rows="2" data-act="map-field" data-f="visual" data-id="${esc(sel.id)}" placeholder="그림 묘사 (영어 권장, 배경 생성에 쓰여요)">${esc(sel.visual || '')}</textarea>
        <div class="vn-row tight"><button class="vn-btn sm primary" data-act="map-go">이 장소로 이동</button><button class="vn-btn sm" data-act="map-wish">여기서 만나기</button><button class="vn-btn sm" data-act="map-regen">${selBg ? '배경 새로 생성' : '배경 생성'}</button><button class="vn-btn sm danger" data-act="map-del">삭제</button></div></div></div>` : ''}
      <details class="vn-more" open><summary>NPC 위치 (${M().npcs.filter((n) => npcMarker(n.name)).length}/${M().npcs.length})</summary>
        ${M().npcs.length ? `<div class="vn-npcloc">${M().npcs.map((n) => `<div class="vn-npcloc-r"><span class="vn-npcloc-i">${n.img ? `<img src="${esc(n.img)}" alt="">` : '🧑'}</span><b>${esc(n.name)}</b><select data-act="npc-place" data-name="${esc(n.name)}">${placeOptions(npcMarker(n.name)?.place, '위치 모름')}</select></div>`).join('')}</div>
        <div class="vn-row tight"><button class="vn-btn sm" data-act="npc-locate">위치 없는 NPC 위치 찾기 (모델 1회)</button></div>
        <p class="vn-hint">NPC가 어느 장소에 있는지 정하면 지도의 그 장소 핀 둘레에 작은 아이콘으로 나와요. 아이콘에 마우스를 올리거나 누르면 이름이 떠요. 장면 생성기의 마커와 같은 데이터예요.</p>` : '<p class="vn-hint">NPC가 아직 없어요. NPC 탭에서 추가하거나 "채팅 기록으로 분석"을 먼저 눌러 주세요. 장소·마커 분석으로 찾은 NPC 마커는 아래 마커 목록에 있어요.</p>'}</details>
      <details class="vn-more"><summary>마커 (${mks.length}${mks.length && shownMk < mks.length && mkf !== 'off' ? ` · 이 지도에 ${shownMk}개 표시` : ''})</summary>${mks.map((m) => `<div class="vn-fact vn-mkrow"><span>${esc(MARKER_ICON[m.type] || '')} ${esc(MARKER_TYPES[m.type] || m.type)}</span><b>${esc(m.name)}</b><select data-act="marker-place" data-id="${esc(m.id)}">${placeOptions(m.place, '장소 없음')}</select><button class="vn-x" data-act="marker-del" data-id="${esc(m.id)}" aria-label="삭제">✕</button></div>`).join('') || '<p class="vn-hint">마커가 없어요.</p>'}</details>
      <details class="vn-more"><summary>장소 목록 (${w.places.length})</summary><div class="vn-plist">${w.places.map((p) => { const b = bgFor(p.name); return `<button class="vn-pchip ${b ? 'has' : ''}" data-act="map-pick" data-id="${esc(p.id)}" data-name="${esc(p.name)}">${b ? '🖼 ' : ''}${esc(p.name)}</button>`; }).join('')}</div>
      <p class="vn-hint">🖼 표시는 이미 이미지가 있는 장소예요. 이런 장소는 다시 만들지 않고 그대로 써요. 새로 만들려면 "배경 새로 생성"을 직접 눌러야 해요.</p></details>`;
  }

  /* ---------- 표정·의상 ---------- */
  async function tabOutfit() {
    const cast = castAll();
    if (!cast.length) return '<p class="vn-hint">캐릭터 채팅을 연 다음에 설정할 수 있어요.</p>';
    const ch = selChar(); st.selChar = chKey(ch);
    const cd = cdata(ch), sp = S().useST ? await stSprites(ch) : {}, nSp = Object.keys(sp).length, wearing = outfitOf(ch), en = enabledEmos(ch);
    const thumb = (u, label, regen = true) => `<figure class="vn-th"><img src="${esc(u)}" alt="${esc(label)}" title="클릭하면 크게 보기"><figcaption>${esc(label)}</figcaption><button class="vn-x" data-act="emo-del" data-l="${esc(label)}" aria-label="삭제">✕</button>${regen ? `<button class="vn-rg" data-act="emo-regen" data-l="${esc(label)}" title="이 표정 다시 생성" aria-label="다시 생성">↻</button>` : ''}<button class="vn-cutb" data-act="emo-cut" data-l="${esc(label)}" title="배경 제거(투명하게)" aria-label="배경 제거">✂</button>${S().cutOrig?.[u] ? `<button class="vn-uncutb" data-act="emo-uncut" data-l="${esc(label)}" title="배경 제거 전 원본으로 되돌리기" aria-label="원본으로 되돌리기">↩</button>` : ''}</figure>`;
    const ofs = Object.entries(cd.outfits).map(([name, o]) => {
      const emoList = Object.entries(o.emo || {}), missing = en.filter((e) => !o.emo?.[e]).length;
      return `
      <section class="vn-of ${wearing === name ? 'on' : ''}" data-of="${esc(name)}">
        <header><b>${esc(name)}</b>${cd.def === name ? '<em>기본 의상</em>' : ''}${wearing === name ? '<em class="cur">착용 중</em>' : ''}${name === '기본' && nSp ? `<em>ST 스프라이트 ${nSp}개</em>` : ''}<em>${emoList.length}장</em>
          <span class="grow"></span><button class="vn-btn sm" data-act="of-wear">입히기</button>${name !== '기본' ? '<button class="vn-btn sm" data-act="of-def">기본으로</button><button class="vn-btn sm danger" data-act="of-del">삭제</button>' : ''}</header>
        <div class="vn-thumbs">${o.base && !Object.values(o.emo || {}).includes(o.base) ? thumb(o.base, '대표', false).replace(/<button class="vn-x"[^>]*>✕<\/button>/, '') : ''}${emoList.map(([l, u]) => thumb(u, l)).join('') || (o.base ? '' : '<span class="vn-hint">이미지 없음 — 아래에서 AI로 만들거나 올려 주세요</span>')}</div>
        <input type="text" class="vn-ofdesc" data-act="of-desc" placeholder="의상 설명 (AI 생성용, 예: white sailor school uniform with red ribbon)" value="${esc(o.desc || '')}">
        <div class="vn-row tight"><button class="vn-btn sm" data-act="of-genset" data-n="1">기준 이미지 1장</button><button class="vn-btn sm primary" data-act="of-genset" data-n="sel" ${missing ? '' : 'disabled'}>선택한 표정 만들기 (${missing}장)</button>${fileInput('up-base', `data-of="${esc(name)}"`, false, '대표 올리기')}${fileInput('up-emo', `data-of="${esc(name)}"`, true, '표정별 올리기')}</div>
      </section>`;
    }).join('');
    const sug = Object.entries(cd.suggest || {}).filter(([n]) => !cd.outfits[n]).sort((a, b) => b[1] - a[1]);
    return `
      <div class="vn-row tight"><label>캐릭터</label><select data-act="sel-char">${cast.map((c) => `<option value="${esc(chKey(c))}" ${chKey(c) === st.selChar ? 'selected' : ''}>${c._parent ? '↳ ' : ''}${esc(c.name)}</option>`).join('')}</select><button class="vn-btn sm danger vn-gencancel" data-act="cancel-vid">생성 취소</button></div>
      ${(() => { const card = ch._parent || ch, subs = subsOf(card), mainNames = castList().map((x) => x.name.toLowerCase()), ssn = Object.keys(ssSet()?.appearance || {}).filter((n) => n && !mainNames.includes(n.toLowerCase()) && n.toLowerCase() !== String(ctx().name1 || '').toLowerCase() && !subs.includes(n)).slice(0, 8);
        return `<details class="vn-more"><summary>카드 안의 다른 인물 (${subs.length}) — 한 카드에 여러 명이 있을 때</summary>
          <p class="vn-hint">카드 이미지(PNG)에 여러 사람이 있으면 인물을 따로 등록해 외형 태그·표정·의상을 각자 관리해요. 이야기에서 모델이 [VN] 블록의 who: 로 지금 화면에 보여 줄 인물을 알려 줘요.</p>
          <div class="vn-chiprow">${subs.map((n) => `<span class="vn-subchip">${esc(n)}<button data-act="sub-del" data-name="${esc(n)}" aria-label="삭제">✕</button></span>`).join('') || '<span class="vn-hint">등록된 인물이 없어요.</span>'}</div>
          <div class="vn-row tight"><input type="text" id="vn-subnew" placeholder="인물 이름" style="flex:1 1 140px"><button class="vn-btn sm" data-act="sub-add">인물 추가</button></div>
          ${ssn.length ? `<div class="vn-chiprow"><small class="vn-hint">장면 생성기에 있는 인물:</small>${ssn.map((n) => `<button class="vn-pchip" data-act="sub-add" data-name="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>` : ''}</details>`; })()}
      <details class="vn-more" open><summary>사용할 표정 선택 (${en.length}/${ALL_EMOS.length}) — 고른 표정만 자동 생성돼요</summary>
        <div class="vn-emochips">${ALL_EMOS.map((e) => `<button class="vn-ec ${en.includes(e) ? 'on' : ''}" data-act="emo-toggle" data-l="${e}">${e}</button>`).join('')}</div>
        <p class="vn-hint">SillyTavern 표정 확장과 같은 28개 이름이에요. 고르지 않은 표정은 이미지를 만들지 않고, 비슷한 표정이나 대표 이미지로 대신 보여 줘요. 아래 "선택한 표정 만들기"를 눌렀을 때만 만들어요. 대화 중 필요한 표정이 없으면, 고른 표정에 한해서만 한 장씩 만들어요.</p></details>
      <p class="vn-hint">${L2('의상은 <b>직접 추가한 것만</b> 써요(대화에서 새 옷이 나오면 아래에 "제안"으로만 모여요). 요청은 한 장씩 간격을 두고 보내서 429를 피해요. 이미지를 누르면 크게 볼 수 있고, ✂는 배경 제거(투명)예요.', 'Only outfits <b>you add yourself</b> are used (new clothes mentioned in the story are collected below as "suggestions"). Requests are sent one at a time with a gap to avoid 429. Click an image to enlarge; ✂ removes the background (transparent).')}</p>
      ${sug.length ? `<div class="vn-sug"><b>대화에서 나온 의상 제안</b>${' '}${sug.map(([n, c]) => `<button class="vn-pchip" data-act="sug-add" data-name="${esc(n)}">+ ${esc(n)} <small>×${c}</small></button>`).join('')}</div>` : ''}
      ${ofs}
      <div class="vn-row tight"><input type="text" id="vn-newof" placeholder="새 의상 이름 (예: 교복, 잠옷, 수영복)" style="flex:1 1 180px"><button class="vn-btn sm" data-act="of-add">의상 추가</button></div>
      <h4>외형 태그 (모든 이미지 생성에 똑같이 쓰여요)</h4>
      ${(() => { const ss = String(ssSet()?.appearance?.[ch.name]?.t || '').trim(), linked = S().useSS && S().useSSLook && !!ss; return `
      <div class="vn-opt"><label class="vn-ck"><input type="checkbox" data-vk="useSSLook"><span>장면 생성기 외형 태그 연동 ${ss ? '(저장된 태그가 있어요)' : '(이 캐릭터의 태그가 아직 없어요)'}</span></label><p class="vn-opt-h">켜면 장면 생성기에 저장된 태그를 그대로 써요. 태그가 없으면 아래 내 태그나 카드 설명을 써요.</p></div>
      ${ss ? `<label class="vn-lbl">장면 생성기 태그${linked ? ' (사용 중)' : ''}</label><textarea rows="3" readonly class="vn-look-ss">${esc(ss)}</textarea>` : ''}
      <label class="vn-lbl">내 태그${linked ? ' (연동 중이라 쓰이지 않아요)' : ''}</label>
      <textarea id="vn-look" rows="4" ${linked ? 'disabled' : ''} placeholder="비워 두면 처음 생성할 때 카드 PNG와 설명으로 영어 외형 태그를 한 번 만들어 저장해요. 직접 고치면 외형이 더 일관돼요.">${esc(cd.look || '')}</textarea>
      <div class="vn-row tight"><button class="vn-btn sm" data-act="look-ai" ${linked ? 'disabled' : ''}>카드 PNG·설명에서 영어 외형 태그 뽑기 (모델 1회)</button><button class="vn-btn sm" data-act="look-copy" ${ss ? '' : 'disabled'}>장면 생성기 태그를 내 태그로 복사</button></div>`; })()}`;
  }

  const ssGalleryImgs = (limit = 30) => [...(ssWorld()?.gallery || [])].filter((e) => e.kind !== 'video' && e.url && !String(e.url).startsWith('blob:')).reverse().slice(0, limit);
  const ssPicker = (act, extra = '') => { const g = ssGalleryImgs(); return g.length ? `<div class="vn-pickgrid"><p class="vn-hint">장면 생성기에 만들어 둔 이미지에서 고르세요</p>${g.map((e) => `<button class="vn-pickitem" data-act="${act}" data-u="${esc(e.url)}" ${extra} title="${esc(e.name || '')}"><img src="${esc(e.url)}" alt=""><small>${esc(e.name || '')}</small></button>`).join('')}</div>` : '<p class="vn-hint">장면 생성기에 불러올 이미지가 아직 없어요.</p>'; };
  /* 배경 탭 목록 = 저장된 배경 + 지도(장소·마커 분석 포함)에만 있는 장소. 이미지가 없어도 목록에 보여서 언제든 미리 만들 수 있다 */
  function placeRows() {
    const ps = placesOf(), seen = new Set(Object.keys(ps));
    const rows = Object.entries(ps).map(([k, p]) => ({ k, p, name: p.name, mp: ssFind(p.name) }));
    for (const sp of ssPlaces()) {
      const keys = [pk(sp.name), ...(sp.aliases || []).map(pk)].filter(Boolean);
      if (!keys[0] || keys.some((x) => seen.has(x))) continue;
      seen.add(keys[0]); rows.push({ k: keys[0], p: null, name: sp.name, mp: sp });
    }
    return rows;
  }
  function plEnsure(k, name) { const ps = placesOf(); if (!ps[k]) ps[k] = { name: name || k, url: '', desc: '', user: false }; return ps[k]; }
  function mapGallery() {
    const w = ssWorld();
    if (w?.maps) for (const [sc, mp] of Object.entries(w.maps)) if (mp?.url) pushMapHist(mp.url, sc, mp.ratio, mapKind(mp), 0);
    const h = [...mapHist()].reverse(); if (!h.length) return '';
    const used = (e) => Object.values(w?.maps || {}).some((m) => m?.url === e.url);
    const sname = (e) => (e.scope === 'world' ? '세계' : (placeById(e.scope)?.name || e.scopeName || '?'));
    const when = (t) => (t ? new Date(t).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '');
    return `<details class="vn-more" open><summary>🗺 지도 이미지 (${h.length})</summary>
      <p class="vn-hint">지도 탭에서 만들거나 올린 지도 이미지예요. 새로 만들어도 이전 지도는 여기에 남아요. 이미지를 누르면 크게 보이고, "이 지도로 쓰기"를 누르면 그 지도로 되돌려요.</p>
      <div class="vn-mhgrid">${h.map((e) => `<figure class="vn-mh ${used(e) ? 'on' : ''}" data-id="${esc(e.id)}"><img src="${esc(e.url)}" alt="" loading="lazy"><figcaption>${esc(sname(e))}${when(e.ts) ? ` · ${esc(when(e.ts))}` : ''}${used(e) ? ' · 사용 중' : ''}</figcaption><div class="vn-row tight">${used(e) ? '' : '<button class="vn-btn sm" data-act="mh-use">이 지도로 쓰기</button><button class="vn-btn sm danger" data-act="mh-del">삭제</button>'}</div></figure>`).join('')}</div></details>`;
  }
  function tabPlace() {
    const ps = Object.entries(placesOf());
    const src = st.plSrc || 'none';
    const form = st.plAdd ? `
      <div class="vn-addform">
        <div class="vn-row tight"><input type="text" id="vn-pl-name" placeholder="장소 이름 (예: 학교 옥상)" value="${esc(st.plName || '')}" style="flex:1 1 160px"></div>
        <textarea id="vn-pl-desc" rows="2" placeholder="설명 (선택: 비우면 장면 생성기 묘사나 로어북에서 찾아 써요)">${esc(st.plDesc || '')}</textarea>
        <div class="vn-radios">${[['none', '이미지 없음'], ['upload', '이미지 올리기'], ['ss', '장면 생성기 이미지에서 불러오기'], ['gen', 'AI로 생성 (이미지 1회)']].map(([v, n]) => `<label class="vn-rd"><input type="radio" name="vn-plsrc" value="${v}" data-act="pl-src" ${src === v ? 'checked' : ''}> ${n}</label>`).join('')}</div>
        ${src === 'upload' ? '<input type="file" id="vn-pl-file" accept="image/*">' : ''}
        ${src === 'ss' ? `${st.plAddImg ? `<div class="vn-pl-img" style="width:180px"><img src="${esc(st.plAddImg)}" alt=""></div>` : ''}${ssPicker('pl-addpick')}` : ''}
        <div class="vn-row tight"><button class="vn-btn sm primary" data-act="pl-addgo">추가</button><button class="vn-btn sm" data-act="pl-addcancel">취소</button></div>
      </div>` : '';
    const rows = placeRows(), noImg = rows.filter((r) => !bgFor(r.name)).length;
    const list = rows.map(({ k, p, name, mp }) => { const b = bgFor(name); return `
      <section class="vn-pl" data-k="${esc(k)}" data-n="${esc(name)}">
        <div class="vn-pl-img">${b ? `<img src="${esc(b.url)}" alt="">` : '<span>이미지 없음</span>'}</div>
        <div class="vn-pl-info"><b>${esc(mp ? placeIcon(mp) : '📍')} ${esc(name)}</b>${p?.user ? '<em>직접 지정</em>' : ''}${mp ? '<em>지도 장소</em>' : ''}${b?.from === 'ss' ? '<em>장면 생성기 이미지</em>' : ''}
          <textarea rows="2" data-act="pl-desc" placeholder="${esc(mp?.visual || mp?.desc || '장소 묘사 (비우면 장면 생성기 묘사나 로어북에서 찾아 써요)')}">${esc(p?.desc || '')}</textarea>
          <div class="vn-row tight">${fileInput('pl-up', '', false, '이미지 올리기')}<button class="vn-btn sm" data-act="pl-ssopen">장면 생성기 이미지</button><button class="vn-btn sm ${b ? '' : 'primary'}" data-act="pl-gen">${b ? '다시 생성' : '배경 생성'}</button>${p ? `<button class="vn-btn sm danger" data-act="${mp ? 'pl-clear' : 'pl-del'}">${mp ? '이미지 비우기' : '삭제'}</button>` : ''}</div>
          ${st.plPickFor === k ? ssPicker('pl-ssset') : ''}</div>
      </section>`; }).join('');
    return `<p class="vn-hint">배경은 직접 올린 이미지 → 이미 만든 이미지 → 장면 생성기 이미지 순으로 쓰고, 어디에도 없을 때만 새로 만들어요. 다시 만드는 건 아래 "다시 생성"을 눌렀을 때뿐이에요. 이 목록은 캐릭터마다 따로 저장돼요.</p>
      <p class="vn-hint">지도 탭에서 분석하거나 추가한 장소도 여기에 함께 나와요. 이미지가 없는 장소는 "배경 생성"으로 미리 만들 수 있고, 처음에 취소해도 언제든 다시 만들 수 있어요.</p>
      ${mapGallery()}
      <div class="vn-row tight"><button class="vn-btn sm primary" data-act="pl-addform">+ 장소 추가</button><button class="vn-btn sm" data-act="pl-genall" ${noImg ? '' : 'disabled'}>이미지 없는 장소 한꺼번에 생성 (${noImg}장)</button></div>
      ${form}
      ${list || '<p class="vn-hint">아직 저장된 장소가 없어요.</p>'}`;
  }
  function tabGallery() {
    const g = [...M().gallery].reverse();
    if (!g.length) return '<p class="vn-hint">이벤트 씬이 생기면 여기에 모여요.</p>';
    return `<div class="vn-grid">${g.map((e) => `<figure class="vn-gi" data-id="${e.id}"><img src="${esc(e.url)}" alt=""><figcaption>${e.video ? '🎬 ' : ''}${esc(e.title || '')}</figcaption><button class="vn-x" data-act="gal-del" aria-label="삭제">✕</button></figure>`).join('')}</div>`;
  }
  const fmtK = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n || 0));
  function tabUsage() {
    const u = S().usage || {}, rows = usageLog.slice(0, 40).map((e) => `<tr class="${e.status}"><td>${new Date(e.t).toLocaleTimeString('ko-KR', { hour12: false })}</td><td>${e.kind === 'text' ? '텍스트' : e.kind === 'image' ? '이미지' : '영상'}</td><td>${esc(e.label)}</td><td>${e.tok ? `${e.tok.est ? '≈' : ''}${fmtK(e.tok.in)} → ${fmtK(e.tok.out)}` : ''}</td><td>${e.status === 'ok' ? '성공' : e.status === '429' ? '429 재시도' : `실패${e.err ? `: ${esc(e.err)}` : ''}`}</td></tr>`).join('');
    return `
      <div class="vn-stats2">
        <div><small>텍스트 호출</small><b>${u.text || 0}</b><span>토큰 ≈ ${fmtK(u.tin)} 입력 / ${fmtK(u.tout)} 출력</span></div>
        <div><small>이미지 호출</small><b>${u.image || 0}</b><span>토큰 ${fmtK(u.iin)} 입력 / ${fmtK(u.iout)} 출력</span></div>
        <div><small>영상 호출</small><b>${u.video || 0}</b><span>429 재시도 ${u.r429 || 0}회</span></div>
      </div>
      <p class="vn-hint">텍스트 토큰은 글자 수로 추정한 값(≈)이에요. 연결된 모델이 사용량을 돌려주지 않아서요. 이미지 토큰은 Google이 알려 준 실제 값이에요. <button class="vn-btn sm" data-act="usage-reset">누적 초기화</button></p>
      <h4>언제 호출되나요</h4>
      <div class="vn-callinfo">
        <p>${L2('<b>채팅 연동 모드</b>: 메시지마다 추가 텍스트 호출은 <b>0회</b>예요. 연출용 정보는 원래 답글에 같이 실려 와요. 이미지는 ① 처음 가는 장소의 배경(1회, 이후 재사용) ② 고른 표정 중 없는 것 한 장 ③ 이벤트 CG(장면 생성기 이미지가 있으면 0회)일 때만 나가요.', '<b>Chat-linked mode</b>: <b>0</b> extra text calls per message. The staging info comes along with the normal reply. Images are only requested for ① the background of a place you visit for the first time (1 call, reused afterwards) ② one missing image among your selected expressions ③ an event CG (0 calls if a Scene Studio image exists).')}</p>
        <p>${L2('<b>일상 모드</b>: 하루 계획 <b>1회</b> + 만남(분기 포함)마다 <b>1회</b> + 직접 입력할 때마다 <b>1회</b>(가벼운 호출). 선택지를 고르는 건 <b>0회</b>예요. 다음 만남은 첫 선택 직후 백그라운드에서 미리 만들어요.', '<b>Daily mode</b>: <b>1</b> call for the day plan + <b>1</b> per encounter (branches included) + <b>1</b> per typed input (a light call). Picking a choice costs <b>0</b>. The next encounter is prepared in the background right after your first pick.')}</p>
        <p>${L2('<b>기타</b>: 기존 채팅 분석 1회(처음 한 번), 외형 태그 추출 1회(캐릭터당 한 번), 표정 세트는 장수만큼 이미지 호출이에요.', '<b>Other</b>: existing-chat analysis 1 call (once), appearance-tag extraction 1 call (once per character), and an expression set costs one image call per image.')}</p>
      </div>
      <h4>최근 호출</h4>
      ${rows ? `<table class="vn-utable"><tr><th>시각</th><th>종류</th><th>내용</th><th>토큰</th><th>결과</th></tr>${rows}</table>` : '<p class="vn-hint">이번 접속에서 나간 호출이 아직 없어요.</p>'}`;
  }
  /* ---------- 개발자 탭 ---------- */
  const evtNote = (reason) => { st.evtLog.unshift({ t: Date.now(), reason }); if (st.evtLog.length > 30) st.evtLog.pop(); };
  function tabDev() {
    const meta = M(), gap = meta.mode === 'daily' ? 3 : S().eventEvery, turn = st.turn;
    const ssg = (ssWorld()?.gallery || []).filter((e) => e.kind !== 'video').slice(-8).reverse();
    const mine = [...meta.gallery].slice(-8).reverse();
    const opts = [...mine.map((e) => [e.url, `VN 갤러리 · ${e.title}`]), ...ssg.map((e) => [e.url, `장면 생성기 · ${e.name || e.placeId || ''}`])];
    const j = (o) => esc(JSON.stringify(o, (k, v) => (typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + '…' : v), 1));
    return `
      <p class="vn-hint">이벤트 씬이 안 뜰 때 여기서 이유를 확인하고 직접 실행해 볼 수 있어요.</p>
      <h4>이벤트 상태</h4>
      <div class="vn-devgrid"><div><small>자동 생성</small><b>${S().autoEventImg ? '켜짐' : '꺼짐'}</b></div><div><small>이미지 키</small><b>${S().geminiKey.trim() ? '있음' : '없음'}</b></div><div><small>장면 생성기 이미지</small><b>${ssg.length}장</b></div><div><small>간격</small><b>${meta.lastEvent <= -90 ? '이벤트 없음' : `${sinceEvent()} / ${gap}`}</b></div><div><small>현재 장면 event</small><b>${turn?.event ? '있음' : '없음'}</b></div><div><small>장면 소스</small><b>${esc(S().eventSrc)}</b></div></div>
      <div class="vn-row tight"><button class="vn-btn sm primary" data-act="dev-force">현재 장면으로 이벤트 강제 실행</button><button class="vn-btn sm" data-act="dev-sample">샘플 이벤트 화면 보기</button></div>
      <div class="vn-row tight"><select id="vn-devimg" style="flex:1 1 220px"><option value="">저장된 이미지로 이벤트 화면 미리보기…</option>${opts.map(([u, n]) => `<option value="${esc(u)}">${esc(n)}</option>`).join('')}</select><button class="vn-btn sm" data-act="dev-preview">미리보기</button></div>
      <h4>이벤트 판단 기록 (최근 순)</h4>
      ${st.evtLog.length ? `<table class="vn-utable"><tr><th>시각</th><th>판단</th></tr>${st.evtLog.slice(0, 20).map((e) => `<tr><td>${new Date(e.t).toLocaleTimeString('ko-KR', { hour12: false })}</td><td>${esc(e.reason)}</td></tr>`).join('')}</table>` : '<p class="vn-hint">아직 판단 기록이 없어요. 캐릭터가 답하면 여기에 이유가 쌓여요.</p>'}
      <h4>진단</h4>
      <details class="vn-more"><summary>마지막 모델 응답 원문 / 파싱 결과</summary><pre class="vn-pre">${st.lastRaw ? esc(String(st.lastRaw.mes).slice(0, 4000)) : '(없음)'}</pre><pre class="vn-pre">${st.lastRaw ? j(st.lastRaw.parsed) : ''}</pre></details>
      <details class="vn-more"><summary>모델에 보내는 지시문</summary><pre class="vn-pre">${esc(injectText() || '(꺼짐)')}</pre></details>
      <details class="vn-more"><summary>현재 장면(turn) 상태</summary><pre class="vn-pre">${turn ? j({ src: turn.src, loc: turn.loc, emo: turn.emo, emoSeq: turn.emoSeq, outfit: turn.outfit, event: turn.event, strong: turn.strong, noEvent: turn.noEvent, lines: turn.lines?.length, choices: turn.choices?.length }) : '(없음)'}</pre></details>
      <details class="vn-more"><summary>채팅 메타데이터 요약</summary><pre class="vn-pre">${j({ mode: meta.mode, day: meta.day, slot: meta.slot, loc: meta.loc, aff: meta.aff, lastEvent: meta.lastEvent, gallery: meta.gallery.length, plans: Object.keys(meta.plans), nodes: Object.keys(meta.nodes), npcs: meta.npcs.map((n) => n.name), usedSS: meta.usedSS?.length })}</pre></details>`;
  }

  const chk = (k, label, hint = '') => `<div class="vn-opt"><label class="vn-ck"><input type="checkbox" data-vk="${k}"><span>${label}</span></label>${hint ? `<p class="vn-opt-h">${hint}</p>` : ''}</div>`;
  const numRow = (k, label, min, max, step = 1, hint = '') => `<div class="vn-opt"><div class="vn-orow"><label>${label}</label><input type="number" min="${min}" max="${max}" step="${step}" data-vk="${k}"></div>${hint ? `<p class="vn-opt-h">${hint}</p>` : ''}</div>`;
  const selRow = (k, label, opts, hint = '') => `<div class="vn-opt"><div class="vn-orow"><label>${label}</label><select data-vk="${k}">${opts.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></div>${hint ? `<p class="vn-opt-h">${hint}</p>` : ''}</div>`;
  const sec = (title, inner) => `<section class="vn-set-sec"><h4>${title}</h4>${inner}</section>`;
  function tabSet() {
    return `
      ${sec('언어 · 개발', `${selRow('lang', 'Language / 언어', [['ko', '한국어'], ['en', 'English']], '화면 문구와 모델이 쓰는 언어가 함께 바뀌어요. English로 하면 입력도 출력도 영어로 진행할 수 있어요.')}${chk('devMode', '개발자 모드', '이벤트가 왜 안 나오는지 확인하는 진단 탭이 생겨요 (이벤트 판단 기록, 강제 실행, 응답 원문, 지시문 보기).')}`)}
      ${sec('진행', `${chk('enabled', 'VN Studio 사용')}${chk('autoOpen', '캐릭터가 답하면 팝업 자동으로 열기')}${chk('inject', '모델에게 [VN] 블록 규칙 보내기', '끄면 표정·장소·호감도·선택지가 자동으로 안 나와요.')}${chk('autoAnalyze', '기존 채팅이 있으면 처음 한 번 호감도·관계·정보 분석', '모델을 1회 호출해요. 채팅 내용이 연결된 모델로 전송돼요.')}${selRow('choicesMode', '입력 방식', [['both', '선택지 + 직접 입력 (선택지 아래에 입력칸)'], ['choice', '선택지만'], ['free', '직접 입력만']])}`)}
      ${sec('채팅 모드: 글상자에 안 보이게 숨기기', `${chk('hideInChat', 'SillyTavern 채팅창에서도 숨기기 (아래 태그 이름 + facts/status 등)', '화면에서만 가려요. 저장된 대화와 모델에게 보내는 내용은 그대로예요. 짝이 안 맞는 태그(&lt;small&gt;&lt;facts&gt;&lt;/small&gt;&lt;/facts&gt;)도 처리해요.')}${chk('htmlAuto', 'HTML/CSS 효과가 있는 메시지는 효과 창을 자동으로 열기', '프리셋이 만드는 색·애니메이션·움직이는 이미지 효과만 작은 창에 따로 보여 줘요(생각·본문·상태창 글은 제외). 효과가 있는 메시지일 때만 상단에 &lt;/&gt; 버튼이 나타나고, 창 오른쪽 위에 마우스를 올리면 이동·닫기 버튼이 보여요.')}${chk('hideYaml', 'YAML형 상태창 줄(key: value가 3줄 이상 이어짐) 숨기기', '```로 감싸지 않은 상태창도 가려요. 대사가 "이름: 말" 형식이라 잘못 가려지면 끄세요.')}${chk('hideBlocks', '상태창·코드블록·HTML 블록 통째로 숨기기', '```로 감싼 블록, &lt;div&gt;/&lt;table&gt;/&lt;details&gt; 같은 HTML 블록, [STATUS]…[/STATUS]를 연출에서 빼요.')}<div class="vn-opt"><label class="vn-lbl">숨길 태그 이름 (쉼표로 구분)</label><input type="text" data-vk="hideTags" placeholder="예: mythink, 상태창"><p class="vn-opt-h">think, status, 상태창, details 등 흔한 태그는 이미 자동으로 숨겨요.</p></div><div class="vn-opt"><label class="vn-lbl">숨길 패턴 (정규식, 한 줄에 하나)</label><textarea rows="2" data-vk="hideRegex" placeholder="예: ^\\[.*?\\]$"></textarea></div>`)}
      ${sec('이벤트 씬', `${numRow('eventEvery', '이벤트 최소 간격 (메시지 수)', 2, 60)}${selRow('eventSrc', '장면 이미지', [['ss', '장면 생성기 새 장면 우선, 없으면 새로 생성'], ['gen', '항상 새로 생성'], ['ssonly', '장면 생성기 장면만 (생성 비용 0)']], L2(`발동 조건: ① 모델이 event: 를 낼 때(간격 적용) ② 호감도가 한 번에 ±4 이상 변하거나 하트 단계를 넘을 때 ③ 일상 모드의 하이라이트 장면 ④ 글상자 아래 "🎬 이 장면을 이벤트 씬으로" 버튼. ${M().lastEvent <= -90 ? '아직 이벤트가 한 번도 없었어요.' : `마지막 이벤트 후 ${sinceEvent()}개 메시지가 지났어요.`}`, `Triggers: ① the model emits event: (interval applies) ② closeness changes by ±4 or more at once, or a heart level is passed ③ a daily-mode highlight scene ④ the "🎬 Make this an event scene" button under the text box. ${M().lastEvent <= -90 ? 'No event has happened yet.' : `${sinceEvent()} messages since the last event.`}`))}${chk('autoEventImg', '이벤트 발생 시 CG 자동 준비')}${chk('autoEventVid', '이벤트 CG를 영상으로 자동 변환', '켜면 확인창 없이 요금이 나가요.')}${chk('videoConfirm', '수동 영상 생성 때 요금 확인창 띄우기')}${chk('useAvatars', 'CG 생성 시 캐릭터·페르소나 이미지를 참조로 보내기')}`)}
      ${sec('연동 · 이미지 생성 (API 요금 발생)', `${chk('useSS', '장면 생성기(Scene Studio) 연동', '장소 목록·지도·이미 만든 장면 이미지·화풍·외형 태그를 가져다 써요.')}${chk('autoBg', '배경이 없는 장소는 한 번만 자동 생성')}${chk('autoSprite', '고른 표정이 없으면 한 장씩 자동 생성')}${chk('npcAutoImg', '마주친 NPC에 이미지가 없으면 한 번만 자동 생성', 'NPC가 이야기에 나왔는데 이미지가 없을 때, 이미지 1회 요금으로 한 장 만들어 주인공 옆에 띄워요. 실패하면 그 NPC는 다시 시도하지 않아요. 끄면 NPC 탭에서 직접 올리거나 만든 이미지만 나와요.')}${chk('npcStyleRef', 'NPC를 AI로 만들 때 주인공 이미지도 화풍 기준으로 함께 보내기', '켜면 화풍은 더 비슷해지지만 NPC 얼굴이 주인공을 닮을 수 있어요. 기본은 꺼짐이고, 이때는 기준 사진·배경·화풍 문구만 써요.')}${numRow('spriteCap', '표정 자동 생성 상한 (접속당)', 0, 60)}${numRow('llmTimeout', '모델 응답 기다리는 최대 시간 (초)', 30, 600, 10, '일상 모드 계획·장면 생성이 이 시간 안에 오지 않으면 이유와 함께 실패로 처리하고 다시 시도할 수 있어요.')}${numRow('imgGapSec', '이미지 요청 간격 (초)', 0, 60, 1, '429(요청 과다)가 뜨면 늘려 보세요. 429가 나면 자동으로 기다렸다가 다시 시도해요.')}${chk('cutout', '생성한 캐릭터 이미지의 배경 자동 제거 (투명 PNG)', '흰 배경으로 만든 뒤 가장자리에서부터 배경색만 지워요. 배경이 균일하지 않으면 원본을 그대로 저장해요.')}${numRow('cutTol', '배경 제거 민감도', 10, 80, 2, '값이 크면 배경을 더 많이 지우지만 인물 가장자리가 깎일 수 있어요.')}${chk('useST', 'SillyTavern 표정 스프라이트 사용')}${chk('classify', '[VN] 블록에 표정이 없으면 분류기로 추정')}`)}
      ${sec('선택지 (CYOA)', `${numRow('choiceCount', '선택지 개수', 2, 4)}${numRow('followCount', '일상 모드: 선택 후 이어지는 선택지 개수', 2, 4, 1, '처음 선택지(3~4개)를 고르면 이어지는 후속 선택지가 이 개수만큼 나와요. 모델이 적게 줄 수 있어 개수를 지정해 요청해요.')}${numRow('choiceLen', '선택지 길이 (글자 수 안팎)', 20, 200, 5, '짧고 단조로운 선택지를 줄이려면 늘려 보세요. 행동과 대사를 함께 써요.')}${[1, 2, 3, 4].map((i) => `<div class="vn-opt"><label class="vn-lbl">${i}번 선택지 프롬프트</label><textarea rows="3" data-vk="choiceP${i}" placeholder="${esc(CHOICE_DEF[langKey()][i - 1])}"></textarea></div>`).join('')}<p class="vn-opt-h" style="margin-left:0">비워 두면 위 기본 문장(placeholder)을 써요. {{user}}와 {{char}}를 쓸 수 있어요. 채팅 모드와 일상 모드 모두에 적용돼요.</p><div class="vn-opt"><label class="vn-lbl">선택지 공통 추가 지시</label><textarea rows="2" data-vk="choiceExtra" placeholder="예: 매번 서로 다른 장소/소품을 활용할 것"></textarea></div>`)}
      ${sec('응답 품질 · 언어', `${chk('keepLen', '내 입력이 짧아도 답변 길이·품질 유지', '모델에게 "이전 답변만큼 길고 풍부하게, 짧은 입력을 따라 줄어들지 말 것"을 항상 전달해요.')}<div class="vn-opt"><label class="vn-lbl">추가 품질 지시 (선택)</label><textarea rows="2" data-vk="keepLenText" placeholder="예: 최소 4문단, 감각 묘사와 인물의 속마음을 포함"></textarea></div>${selRow('outLang', '이야기 출력 언어', [['ui', '화면 언어와 같게'], ['ko', '한국어'], ['en', 'English'], ['input', '내가 입력한 언어를 따라감 (영어로 입력하면 영어로 답해요)'], ['chat', '채팅 기록을 따라감']], '기존 채팅이 영어여도 한국어를 고르면 모델이 한국어로 쓰도록 강하게 지시해요. 선택지와 상태 정보도 같은 언어예요. 「내가 입력한 언어를 따라감」은 최근에 쓴 내 글이 영어면 영어로, 한글이면 한글로 이야기를 써요. 화면(UI)은 계속 한글이에요.')}${chk('translateInput', '내가 다른 언어로 입력하면 출력 언어로 번역해서 전송 (모델 1회)', '예: 한국어로 입력했는데 출력 언어가 English이면 영어로 번역한 문장이 SillyTavern에 기록돼요.')}`)}
      ${sec('일상 모드', `<div class="vn-opt"><label class="vn-lbl">이벤트 씨앗 (한 줄에 하나)</label><textarea rows="5" data-vk="dailySeeds"></textarea></div><div class="vn-opt"><label class="vn-lbl">인카운터 씨앗 (한 줄에 하나)</label><textarea rows="5" data-vk="encSeeds"></textarea><p class="vn-opt-h">하루 계획을 만들 때 이 중 일부가 무작위로 들어가 혼자 있는 시간·NPC·우연한 만남을 풍성하게 해요.</p></div>${numRow('encCount', '하루에 넣을 인카운터 수', 0, 4)}`)}
      ${sec('화면', `${selRow('theme', '테마', [['sakura', '벚꽃 (기본)'], ['midnight', '한밤 (남색)'], ['forest', '숲 (초록)'], ['ember', '노을 (주황)'], ['lavender', '라벤더 (보라)'], ['mono', '흑백']], '화면 색 분위기가 바뀌어요.')}<div class="vn-opt"><div class="vn-orow"><label>캐릭터 이미지 크기 %</label><input type="range" min="40" max="170" data-vk="spriteScale"></div><p class="vn-opt-h" style="margin-left:0">화면 위의 ⤢ 버튼이나 Ctrl+마우스 휠로도 조절해요.</p></div><div class="vn-opt"><div class="vn-orow"><label>캐릭터 이미지 위치 (위·아래)</label><input type="range" min="-30" max="30" data-vk="spriteY"></div></div>
        ${[['choiceFs', '선택지 글씨 크기 (%)', 50, 130, 5], ['choiceFsMin', '글상자를 접었을 때 선택지 글씨 크기 (%)', 50, 120, 5], ['textH', '글상자 높이 (px, 0 = 자동)', 0, 700, 10], ['minTextH', '글상자를 접었을 때 높이 (px)', 70, 500, 10], ['npcGap', 'NPC 이미지 간격 (주인공에서 좌우로, %)', 8, 46, 1], ['npcScale', 'NPC 이미지 크기 (%)', 50, 150, 5], ['npcY', 'NPC 이미지 위치 (위·아래)', -30, 30, 1]].map(([k, l, a, b, st2]) => `<div class="vn-opt"><div class="vn-orow"><label>${l}</label><input type="range" min="${a}" max="${b}" step="${st2}" data-vk="${k}"></div></div>`).join('')}
        <p class="vn-opt-h" style="margin-left:0">⤢ 버튼의 팝업에서도 같은 값을 조절해요. 글상자를 접으면 위쪽 대화가 더 보이도록 선택지 글씨를 따로 줄일 수 있어요.</p>
        ${selRow('npcFirst', '첫 번째 NPC가 서는 쪽', [['R', '주인공 오른쪽'], ['L', '주인공 왼쪽']], '두 번째 NPC는 반대쪽에 서요.')}${chk('npcFace', 'NPC가 주인공 쪽을 바라보게 좌우 반전', 'NPC 탭에서 그 인물의 이미지가 원래 어느 쪽을 보는지 정해 두면 적용돼요. AI로 만든 이미지는 왼쪽을 보는 것으로 자동 기록돼요.')}${chk('bgBlank', '배경 이미지 없이 단색으로 두기', '캐릭터 이미지에서 투명하게 안 지워진 부분(팔 사이 등)이 배경과 같은 색이라 투명처럼 보여요. 배경 생성과 장소 이미지는 그대로 두고 화면에서만 가려요.')}<div class="vn-opt"><div class="vn-orow"><label>단색 배경 색</label><input type="color" data-vk="bgBlankColor" style="flex:0 0 60px;height:30px;padding:0"></div></div>${chk('bgBlankAuto', '캐릭터 이미지의 배경색을 자동으로 맞추기', '생성한 원본 이미지(배경을 지우지 않은 것)의 모서리 색을 읽어 그 색으로 채워요.')}${numRow('typeSpeed', '글자 속도 (ms, 0=즉시)', 0, 100)}${numRow('fadeMs', '표정·배경 디졸브 (ms)', 0, 3000, 100)}<div class="vn-opt"><div class="vn-orow"><label>글자 크기 %</label><input type="range" min="80" max="150" data-vk="textSize"></div></div><div class="vn-opt"><div class="vn-orow"><label>대화창 불투명도 %</label><input type="range" min="40" max="100" data-vk="boxOpacity"></div></div>${selRow('logSide', '기록 패널 위치', [['right', '오른쪽'], ['left', '왼쪽']])}`)}
      ${sec('화풍 (장면 생성기와 같은 방식)', `<div class="vn-opt"><div class="vn-orow"><label>프리셋</label><select id="vn-style-sel" data-act="style-sel"><option value="ss">장면 생성기와 동일 (연동)</option><option value="custom">직접 입력</option>${S().stylePresets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div><p class="vn-opt-h">${S().stylePreset === 'ss' ? (ssStyleText() ? `장면 생성기 화풍을 쓰는 중: ${esc(ssStyleText().slice(0, 140))}` : '장면 생성기에 저장된 화풍이 없어서 아래 직접 입력 값을 써요.') : '직접 입력 / 저장한 프리셋을 쓰는 중이에요.'}</p></div>
        <div class="vn-opt"><label class="vn-lbl">화풍 프롬프트 (CG·표정·인물)</label><textarea rows="4" data-vk="cgStyle"></textarea><div class="vn-orow" style="margin-top:6px"><input type="text" id="vn-style-name" placeholder="프리셋 이름" style="flex:1 1 140px"><button class="vn-btn sm" data-act="style-save">프리셋 저장</button><button class="vn-btn sm danger" data-act="style-del">프리셋 삭제</button></div></div>
        <div class="vn-opt"><label class="vn-lbl">제외 요소 (이런 건 그리지 않기)</label><input type="text" data-vk="negative" placeholder="예: text, watermark, extra fingers"></div>
        <div class="vn-opt"><label class="vn-lbl">배경 화풍 (비우면 위 화풍 사용)</label><textarea rows="2" data-vk="style"></textarea></div>
        ${chk('lookVision', '외형 태그를 뽑을 때 카드 PNG 이미지도 함께 보내기', 'Gemini 모델로 이미지를 먼저 보고, 설명은 빈틈을 채워요.')}${`<div class="vn-opt"><label class="vn-lbl">외형 추출 모델 (Gemini)</label><input type="text" data-vk="lookModel"></div>`}`)}
      ${sec('저장 공간', `${chk('deleteFiles', '이미지를 지울 때 서버 파일도 함께 지우기', '다른 곳에서 쓰지 않는 VN Studio 이미지(user/images/vnstudio)만 지워요. 이 서버가 삭제를 지원하지 않으면 파일은 그대로 남아요.')}<div class="vn-row tight"><button class="vn-btn sm" data-act="clean-scan">쓰지 않는 표정·NPC 이미지 찾아서 정리</button><button class="vn-btn sm" data-act="img-manage">저장된 이미지 보기·삭제</button></div><p class="vn-opt-h">이미지는 SillyTavern 폴더의 data/(사용자 폴더, 보통 default-user)/user/images/vnstudio 에 저장돼요.</p>`)}
      <div class="vn-row"><button class="vn-btn" data-act="show-prompt">모델에 보내는 지시문 보기</button><button class="vn-btn danger" data-act="reset-aff">이 채팅 호감도 초기화</button></div>`;
  }
  function fillInputs(root) {
    const s = S();
    $$('[data-vk]', root).forEach((el) => { const v = s[el.dataset.vk]; if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? ''; });
  }
  function openModal(tab) { if (tab) st.tab = tab; ui.q('#vn-modal').classList.remove('vn-off'); renderModal(); }

  /* ================= 호감도 · 정보 · 캘린더 기록 ================= */
  function checkMilestone(name, old, nv) {
    const meta = M(), done = (meta.heartDone[name] ||= {});
    for (const [thr, label] of HEART_STEPS) {
      if (old < thr && nv >= thr && !done[thr]) { done[thr] = Date.now(); meta.milestone[name] = [thr, label, (ctx().chat || []).length]; toastr.success(`♥ ${name} · ${label} — 특별한 이벤트가 곧 일어날 거예요`); }
    }
  }
  function setAff(name, v, silent = false) {
    const old = affOf(name), nv = clamp(Math.round(v), -100, 100), meta = M();
    meta.aff[name] = nv;
    if (silent) { const done = (meta.heartDone[name] ||= {}); for (const [thr] of HEART_STEPS) if (nv >= thr) done[thr] ||= Date.now(); }   // 이미 지나온 단계는 이벤트로 치지 않는다
    else checkMilestone(name, old, nv);
    saveMeta();
  }
  function applyAff(name, d) {
    if (!d) return;
    setAff(name, affOf(name) + d); st.slotAff += d; ui.hud(st.turn); ui.floatAff(d);
  }
  function addFact(name, label, val, notify = true) {
    const dos = dossierOf(name);
    if (dos.facts[label] === val) return;
    if (!dos.facts[label] && Object.keys(dos.facts).length >= 40) return;
    dos.facts[label] = val; saveMeta();
    if (notify) toastr.info(`공략집에 추가: ${label} — ${val}`);
  }
  function calAdd(day, ev) {
    const meta = M(), c = (meta.cal[day] ||= { events: [] });
    c.events.push(ev); if (meta.plans[day]?.title) c.title = meta.plans[day].title;
    saveMeta();
  }

  /* ================= 이벤트 씬 =================
     발동 조건
     ① 모델이 답글에 event: 줄을 넣었을 때 (최소 간격: 설정의 "이벤트 최소 간격")
     ② 호감도가 한 번에 ±4 이상 움직이거나 하트 단계를 처음 넘었을 때 (간격 2)
     ③ 일상 모드에서 모델이 cg:true로 표시한 장면
     ④ 언제든 글상자 아래 "🎬 이 장면을 이벤트 씬으로" 버튼
     화면: 장면 생성기가 새로 만든 장면 이미지가 있으면 그것을, 없으면 새로 생성(설정에서 선택)해서 화면 중앙에 띄워요. 영상은 버튼을 눌렀을 때만(자동 변환을 켜면 자동). */
  const counter = () => (M().mode === 'daily' ? M().hist.length : (ctx().chat || []).length);
  const sinceEvent = () => counter() - M().lastEvent;
  const eventAllowed = (strong = false) => sinceEvent() >= (strong ? 2 : (M().mode === 'daily' ? 3 : S().eventEvery));
  const eventPossible = () => (S().useSS && !!ssWorld()?.gallery?.length) || !!S().geminiKey.trim();
  const newEntry = (url, turn, extra = {}) => ({ id: uid(), kind: 'image', url, title: [turn.loc, turn.noChar ? turn.npcName : turn.ch?.name].filter(Boolean).join(' · ') || '이벤트', caption: turn.event, loc: turn.loc || '', t: Date.now(), ...extra });
  const synthEvent = (turn) => `A key dramatic moment in the scene: ${turn.lines.filter((l) => l.k !== 'user').slice(0, 4).map((l) => l.t).join(' ').slice(0, 280)}`;
  async function getEventEntry(turn) {
    const s = S(), meta = M();
    if (s.useSS && s.eventSrc !== 'gen') {
      const g = ssPickEvent(turn);
      if (g) { const e = newEntry(g.url, turn, { video: g.video || '', from: 'ss', caption: g.moment || turn.event }); meta.gallery.push(e); saveMeta(); evtNote(`장면 생성기 이미지 사용: ${g.url}`); return e; }
      evtNote('장면 생성기에 아직 쓰지 않은 새 장면 이미지가 없음');
    }
    if (s.eventSrc === 'ssonly') { toastr.info('장면 생성기에 새 장면 이미지가 아직 없어요. 장면 생성기에서 장면을 만든 뒤 다시 눌러 주세요.'); return null; }
    if (!hasImgKey()) return null;
    const url = await makeEventCG(turn), e = newEntry(url, turn, { from: 'gen' });
    meta.gallery.push(e); saveMeta(); evtNote(`새로 생성 성공: ${url}`);
    if (s.autoEventVid) makeVideo(e, { confirmFirst: false }).then((v) => { if (v && st.viewEvt === e) renderEvent(e); });
    return e;
  }
  function startEvent(turn) {
    const meta = M(); meta.lastEvent = counter(); saveMeta();
    if (!S().autoEventImg || !eventPossible()) { st.pendingEvt = turn; evtNote(!S().autoEventImg ? '자동 준비가 꺼져 있어요 → 🎬 버튼으로 실행' : '이미지 키도 없고 장면 생성기 이미지도 없어서 준비할 수 없어요'); return null; }
    evtNote('이벤트 장면 준비 시작');
    return (async () => {
      try {
        const e = await getEventEntry(turn);
        if (e && meta.mode === 'chat') { (meta.chatEvents ||= []).push({ t: Date.now(), loc: turn.loc || '', title: e.title }); if (meta.chatEvents.length > 60) meta.chatEvents.shift(); saveMeta(); }      // 채팅 이벤트는 일상 달력에 섞지 않는다
        return e;
      } catch (e) { evtNote('이벤트 준비 실패: ' + (e.message || e)); toastr.error('이벤트 씬 준비 실패: ' + (e.message || e)); return null; }
    })();
  }
  async function manualEvent() {
    const turn = st.turn; if (!turn) return;
    if (!turn.event) turn.event = synthEvent(turn);
    st.pendingEvt = null; ui.q('#vn-endbtns').innerHTML = '';
    ui.status('이벤트 씬을 준비하는 중…');
    try { const e = await getEventEntry(turn); ui.status(''); if (e) await openEvent(e); } catch (e) { ui.status(''); toastr.error('이벤트 씬 준비 실패: ' + (e.message || e)); }
    if (st.turn) showEnd(st.turn);
  }

  /* ================= 턴 재생 ================= */
  async function applyBg(loc) {
    if (!loc) { ui.setBg('', ''); return; }
    const b = bgFor(loc);
    if (b) { ui.setBg(b.url, b.name); return; }          // 이미 있는 이미지는 그대로 사용 (재생성 안 함)
    ui.setBg('', loc);
    if (S().autoBg && hasImgKey()) {
      const url = await generatePlace(loc);
      if (url && pk(M().loc) === pk(loc)) ui.setBg(url, loc);
    }
  }
  async function playTurn(turn) {
    if (!st.open) return;
    const meta = M();
    finishText(true); ui.clearEnd(); showWaiting(false); ui.hideNpcSide();
    st.turn = turn; st.pendingEvt = null; st.evt = null;
    if (turn.loc) { meta.loc = turn.loc; saveMeta(); }
    if (turn.time) meta.time = turn.time;
    if (turn.weather) meta.weather = turn.weather;
    if (turn.ch && !turn.noChar) {
      const o = matchOutfit(turn.ch, turn.outfit), nm = String(turn.outfit || '').trim(), cd = cdata(turn.ch);
      if (o && meta.outfit[turn.ch.name] !== o) { meta.outfit[turn.ch.name] = o; saveMeta(); }
      else if (!o && nm && nm.length <= 20 && !turn.noEvent) {   // 등록되지 않은 의상은 만들지 않고 '제안'으로만 모아 둔다 (비용 폭주 방지)
        if (Object.keys(cd.suggest).length < 8 || cd.suggest[nm]) { cd.suggest[nm] = (cd.suggest[nm] || 0) + 1; saveSettings(); }
      }
    }
    ui.hud(turn); applyBg(turn.loc);
    ui.root.classList.toggle('has-rich', !!turn.rich);
    if (turn.rich && (S().htmlAuto || htmlPanelOpen())) openHtmlPanel(turn); else if (!turn.rich) closeHtmlPanel();
    st.curEmo = turn.emo;
    let sp = Promise.resolve();
    const np = turn.noChar && turn.npcName ? npcByName(turn.npcName) : null;
    if (np?.img) sp = ui.showSpriteUrl('npc|' + np.name, np.img, 'sprite');
    else if (turn.noChar) ui.hideSprites(); else if (turn.ch) sp = ui.setSprite(turn.ch, turn.emo, outfitOf(turn.ch));
    // 이벤트 발동 판단
    if (!turn.noEvent) {
      const strong = !!turn.strong, gap = strong ? 2 : (meta.mode === 'daily' ? 3 : S().eventEvery);
      if (!turn.event && strong && eventAllowed(true)) { turn.event = synthEvent(turn); evtNote('강한 변화(호감도 ±4 이상/하트 단계/하이라이트) → 이벤트 자동 생성'); }
      if (turn.event) { if (eventAllowed(strong)) st.evt = startEvent(turn); else evtNote(`이벤트가 있었지만 간격 부족 (${sinceEvent()}/${gap}) → 건너뜀`); }
      else evtNote(strong ? `강한 변화였지만 간격 부족 (${sinceEvent()}/2)` : '모델이 event: 줄을 내지 않았고 강한 변화도 없음');
    } else evtNote('다시 보기(replay) 장면이라 판단하지 않음');
    await sp;
    if (turn !== st.turn) return;
    playText(turn);
  }

  /* ================= 채팅 연동 ================= */
  const storyOnly = (msg) => !!msg && !msg.is_user && !msg.is_system && parseBlock(msg.mes).text.replace(/[\s.…·\-*_~`'"“”]/g, '').length > 1;      // 상태창만 따로 온 메시지는 이야기가 아니다
  const lastStoryIndex = () => { const c = ctx().chat || []; for (let i = c.length - 1; i >= 0; i--) if (storyOnly(c[i])) return i; return -1; };
  async function turnFromMessage(msg, id, replay = false) {
    const b = parseBlock(msg.mes); let ch = castByName(msg.name) || activeChar();
    st.lastRaw = { id, mes: msg.mes, parsed: b };
    if (ch && b.who) { const card = ch._parent || ch, w = String(b.who).trim().toLowerCase(), nm = subsOf(card).find((n) => n.toLowerCase() === w) || subsOf(card).find((n) => w.includes(n.toLowerCase())); if (nm) ch = subChar(card, nm); }   // 한 카드의 여러 인물 중 화면에 보일 사람
    if (ch) await stSprites(ch);
    const avail = ch ? availEmos(ch) : EMOS;
    let emo = normEmo(b.emo, avail);
    if (!emo) { const cl = await classify(b.text); emo = normEmo(cl, avail) || guessEmo(b.text); }
    const emoSeq = (b.emoSeq || []).map((x) => normEmo(x, avail)).filter(Boolean);
    let lines = splitLines(b.text); if (!lines.length) lines = [{ k: 'narr', t: '…' }];
    const meta = M();
    let strong = false;
    if (ch) {
      if (b.aff != null) {   // 같은 메시지를 다시 읽어도 두 번 반영되지 않게, 스와이프하면 이전 값을 되돌린다
        const h = hash(msg.mes), ap = meta.applied[id];
        if (!ap || ap.h !== h) {
          const old = ap?.d || 0; setAff(ch.name, affOf(ch.name) - old + b.aff); meta.applied[id] = { h, d: b.aff };
          const keys = Object.keys(meta.applied); if (keys.length > 80) delete meta.applied[keys[0]];
          saveMeta(); if (!replay) { setTimeout(() => ui.floatAff(b.aff - old), 300); if (Math.abs(b.aff - old) >= 4) strong = true; }
        }
      }
      if (!replay) for (const f of b.info) addFact(ch.name, f.label, f.val);
      const ms = meta.milestone[ch.name];
      if (ms && !replay && ms[2] === (ctx().chat || []).length) strong = true;      // 방금 하트 단계를 넘었다
      if (ms && !replay && (b.event || (ctx().chat || []).length - ms[2] > 6)) delete meta.milestone[ch.name];
    }
    const rawLoc = b.loc || ssCurrentName() || meta.loc, loc = ssFind(rawLoc)?.name || rawLoc;   // 장면 생성기의 장소 이름으로 통일
    return { src: 'chat', id, hash: hash(msg.mes), rich: hasRich(msg.mes), ch, who: msg.name, loc, emo, emoSeq, outfit: b.outfit, time: b.time, weather: b.weather, event: b.event, strong, lines, choices: b.choices.slice(0, 4), noEvent: replay };
  }
  const ssCurrentName = () => { const m = ctx().chatMetadata?.minimap, p = m?.world?.places?.find((x) => x.id === m.current); return S().useSS && p ? p.name : ''; };
  async function onMessage(id) {
    const s = S(); if (!s.enabled) return;
    const c = ctx(); const i = typeof id === 'number' ? id : c.chat.length - 1;
    const msg = c.chat[i]; if (!msg || msg.is_user || msg.is_system) return;
    if (M().mode === 'daily') return;
    if (!storyOnly(msg)) return;      // 상태창만 따로 온 메시지는 연출하지 않는다
    try {
      const turn = await turnFromMessage(msg, i);
      if (st.pendingUser) { turn.lines.unshift({ k: 'user', t: st.pendingUser }); st.pendingUser = ''; }
      if (!st.open && s.autoOpen) ui.open();
      if (st.open) playTurn(turn); else st.deferred = turn;      // 닫혀 있는 동안 온 답변은 다음에 열 때 새 답변으로 보여 준다
    } catch (e) { console.warn('[VN] 메시지 처리 실패', e); showWaiting(false); }
  }
  async function replayLast() {
    const c = ctx(); if (!st.open) return;
    if (M().mode === 'daily') return playSlot();
    const i = lastStoryIndex();
    if (i < 0) { ui.q('#vn-text').textContent = '캐릭터와 대화를 시작하면 이 화면에 연출돼요.'; ui.hud(null); return; }
    playTurn(await turnFromMessage(c.chat[i], i, true));
  }
  function sendToChat(text) {
    const ta = document.getElementById('send_textarea'), btn = document.getElementById('send_but');
    if (!ta || !btn) { toastr.error('SillyTavern 입력창을 찾지 못했어요.'); return false; }
    ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true })); btn.click();
    return true;
  }
  async function maybeTranslate(text) {
    const s = S(), k = outLangKey(); if (!s.translateInput || k === 'chat' || s.outLang === 'input') return text;
    const hasHan = /[가-힣]/.test(text), hasLat = /[A-Za-z]{3,}/.test(text);
    if (!((k === 'en' && hasHan) || (k === 'ko' && !hasHan && hasLat))) return text;
    try { const out = await llm(`Translate the following into ${LANGS[k].name}. Keep the tone, *actions*, formatting and quotation marks. Output ONLY the translation.\n\n${text}`, 600, '입력 번역'); const o = String(out).trim(); return o || text; } catch (e) { toastr.warning('입력 번역에 실패해서 원문 그대로 보내요: ' + (e.message || e)); return text; }
  }
  async function submitText(text) {
    text = String(text || '').trim(); if (!text || st.waiting) return;
    if (S().translateInput) { showWaiting(true, '입력을 번역하는 중'); text = await maybeTranslate(text); showWaiting(false); }
    if (M().mode === 'daily') return dailyFree(text);
    ui.clearEnd();
    if (sendToChat(text)) { st.pendingUser = text; { const pre = { k: 'user', t: text }, m = mkPara(pre, {}); m.tx.textContent = text; ui.q('#vn-text').appendChild(m.p); } showWaiting(true, '…'); setTimeout(() => { if (st.waiting) showWaiting(false); }, 180000); }
  }
  function pickChoice(i) {
    const turn = st.turn, c = turn?.choices?.[i]; if (!c) return;
    if (M().mode === 'daily' && typeof c === 'object') return dailyChoice(c);
    submitText(typeof c === 'string' ? c : c.t);
  }

  /* ================= 기존 채팅 반영 (분석) ================= */
  async function analyzeNpcs(ch) {
    const meta = M(), c = ctx();
    const msgs = (c.chat || []).filter((m) => m && !m.is_system && m.mes);
    if (msgs.length < 2) throw new Error('분석할 채팅이 아직 거의 없어요');
    const log = msgs.slice(-60).map((m) => `${m.name}: ${parseBlock(m.mes).text.replace(/\s+/g, ' ').slice(0, 350)}`).join('\n').slice(-15000);
    const cast = castList().map((x) => x.name).join(', ') || ch?.name || '';
    const prompt = `Do NOT roleplay. Read the roleplay log and extract the NAMED non-main characters (NPCs) who appear or are talked about. Reply with ONLY JSON:
{"npcs":[{"name":"exact name","role":"short role or relationship","desc":"one short line on appearance and personality","summary":"1-2 ${DLN()} sentences about this person's relationship to ${c.name1} and ${cast}","facts":{"<short ${DLN()} label such as ${STD_FACTS.join(', ')}>":"<value>"}}]}
Rules: at most 10 npcs. Never include ${c.name1} or ${cast}. "facts" only holds things the log actually established (omit unknown items, values under 60 characters). Keep the exact names of already known NPCs: ${meta.npcs.map((n) => n.name).join(', ') || 'none'}. Write texts in ${DLN()}.
[Main character card: ${cast}]
${String(ch?.description || '').slice(0, 1500)}
[Log between ${cast} and ${c.name1}]
${log}`;
    const d = parseJSON(await llm(prompt, 3000, 'NPC 분석'));
    if (!d || !Array.isArray(d.npcs)) throw new Error('결과를 읽지 못했어요');
    let added = 0, updated = 0;
    for (const it of d.npcs.slice(0, 10)) {
      const name = String(it?.name || '').trim().slice(0, 20); if (!name || name === c.name1 || castList().some((x) => x.name === name)) continue;
      let n = meta.npcs.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!n) { n = { name, role: '', desc: '' }; meta.npcs.push(n); added++; } else updated++;
      n.role = n.role || String(it.role || '').slice(0, 20); n.desc = n.desc || String(it.desc || '').slice(0, 120);
      if (it.summary) n.summary = String(it.summary).slice(0, 300);
      n.facts ||= {}; for (const [k, v] of Object.entries(it.facts || {})) if (k && v) n.facts[String(k).slice(0, 14)] = String(v).slice(0, 90);
    }
    saveMeta(); return { added, updated };
  }
  /* 카드·로어북 읽기: 파란 점(항상 켜짐, constant) 항목을 먼저, 그 다음 키워드 항목 */
  async function loreEntriesAll(ch) {
    const c = ctx(), out = [], seen = new Set();
    const push = (book, e, keys, constant) => {
      const text = String(e?.content || '').replace(/\s+/g, ' ').trim(); if (!text) return;
      const title = String(e.comment || e.name || (keys || [])[0] || '').trim(), id = book + '|' + title + '|' + text.slice(0, 40);
      if (seen.has(id)) return; seen.add(id);
      out.push({ book, title, keys: (keys || []).filter(Boolean).slice(0, 6), constant: !!constant, text });
    };
    for (const name of await loreNames()) {
      try {
        if (!loreCache[name]) { const r = await fetch('/api/worldinfo/get', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ name }) }); if (!r.ok) continue; loreCache[name] = await r.json(); }
        for (const e of Object.values(loreCache[name].entries || {})) { if (e.disable) continue; push(name, e, e.key, e.constant); }
      } catch (err) { console.warn('[VN] lorebook', name, err); }
    }
    const cb = ctx().characters?.[ctx().characterId]?.data?.character_book?.entries || ch?.data?.character_book?.entries;
    if (Array.isArray(cb)) for (const e of cb) { if (e.enabled === false) continue; push('(카드 내장)', e, e.keys, e.constant); }
    return out.sort((a, b) => (b.constant ? 1 : 0) - (a.constant ? 1 : 0));
  }
  /* 카드·로어북 분석: 로어북이 길어도 빠짐없이 읽도록 여러 번에 나눠 보낸다. 외형 태그는 채우지 않고 설명(메모)만 채운다 */
  async function analyzeNpcsFromSources(ch) {
    const meta = M(), c = ctx(), cast = castList().map((x) => x.name).join(', ') || ch?.name || '';
    const entries = await loreEntriesAll(ch);
    const cardText = castList().map((x) => `[Card: ${x.name}]\n${String(x.description || '').slice(0, 2500)}\n${String(x.personality || '').slice(0, 600)}\n${String(x.scenario || '').slice(0, 1200)}`).join('\n\n') || String(ch?.description || '').slice(0, 2500);
    const batches = []; let cur = '';
    for (const e of entries) {
      const ln = `- ${e.constant ? '[ALWAYS ON] ' : ''}${e.title || e.keys[0] || '(no title)'}${e.keys.length ? ` (keys: ${e.keys.join(', ')})` : ''}: ${e.text.slice(0, 600)}\n`;
      if (cur && cur.length + ln.length > 11000) { batches.push(cur); cur = ''; }
      cur += ln;
    }
    if (cur) batches.push(cur);
    if (!batches.length && !cardText.trim()) throw new Error('카드 설명도 로어북도 찾지 못했어요. 이 채팅에 로어북이 연결돼 있는지 확인해 주세요.');
    if (!batches.length) batches.push('');
    let added = 0, updated = 0, failed = 0, firstErr = null;
    for (let bi = 0; bi < batches.length; bi++) {
      ui.status(`카드·로어북에서 NPC를 찾는 중… (${bi + 1}/${batches.length})`);
      const known = meta.npcs.map((n) => n.name).join(', ').slice(0, 2500) || 'none';
      const prompt = `Do NOT roleplay. Read the material below (part ${bi + 1} of ${batches.length}) and extract the NAMED individual people (NPCs) that exist in this story world, other than the main character(s) and the user.
Entries marked [ALWAYS ON] are always-active lorebook entries and often describe important NPCs. List every qualifying person in THIS part. Reply with ONLY JSON:
{"npcs":[{"name":"exact name as written","aliases":["short names or nicknames used in the text"],"role":"short role or relationship","desc":"one short ${DLN()} line copying what the text itself says about this person (role, looks, personality); do not invent anything","summary":"1-2 ${DLN()} sentences about this person's relationship to ${c.name1} and ${cast}","facts":{"<short ${DLN()} label such as ${STD_FACTS.join(', ')}>":"<value>"}}]}
Rules: Only individual people or beings who can talk. Never include places, items, factions, organizations, rules or world settings. Never include ${c.name1} or ${cast}. "facts" only holds things the text states (omit unknown items, values under 60 characters). Already known NPCs (use these exact names; list them again only if this part adds new facts): ${known}. Write texts in ${DLN()}.
${bi === 0 ? cardText : ''}

[Lorebook part ${bi + 1}/${batches.length}]
${batches[bi] || '(none)'}`;
      let d = null;
      try { d = parseJSON(await llm(prompt, 6000, `NPC 분석 (카드·로어북 ${bi + 1}/${batches.length})`)); } catch (e) { firstErr ||= e; }
      if (!d || !Array.isArray(d.npcs)) { failed++; continue; }
      for (const it of d.npcs.slice(0, 80)) {
        const name = String(it?.name || '').trim().slice(0, 24); if (!name || sameName(name, c.name1) || castList().some((x) => sameName(x.name, name))) continue;
        let n = meta.npcs.find((x) => sameName(x.name, name));
        if (!n) { n = { name, role: '', desc: '' }; meta.npcs.push(n); added++; } else updated++;
        n.role = n.role || String(it.role || '').slice(0, 24); n.desc = n.desc || String(it.desc || '').slice(0, 160);
        if (it.summary && !n.summary) n.summary = String(it.summary).slice(0, 300);
        const al = (Array.isArray(it.aliases) ? it.aliases : []).map((x) => String(x).trim().slice(0, 20)).filter((x) => x.length >= 2 && !sameName(x, name));
        if (al.length) n.aliases = [...new Set([...(n.aliases || []), ...al])].slice(0, 5);
        n.facts ||= {}; for (const [k, v] of Object.entries(it.facts || {})) if (k && v && !n.facts[String(k).slice(0, 14)]) n.facts[String(k).slice(0, 14)] = String(v).slice(0, 90);
      }
      saveMeta();
    }
    if (failed === batches.length) throw firstErr || new Error('결과를 읽지 못했어요');
    return { added, updated, scanned: entries.length, constant: entries.filter((e) => e.constant).length, batches: batches.length, failed };
  }
  async function analyzeHistory(ch, force = false) {
    const meta = M(), c = ctx();
    const msgs = (c.chat || []).filter((m) => m && !m.is_system && m.mes);
    if (msgs.length < 3) { if (force) toastr.info('분석할 채팅이 아직 거의 없어요.'); return false; }
    const log = msgs.slice(-60).map((m) => `${m.name}: ${parseBlock(m.mes).text.replace(/\s+/g, ' ').slice(0, 350)}`).join('\n').slice(-15000);
    const prompt = `Do NOT roleplay. You are analyzing an existing roleplay log for a dating-sim style dossier. Reply ONLY with JSON.
[Character card: ${ch.name}]
${String(ch.description || '').slice(0, 1800)}
${String(ch.personality || '').slice(0, 500)}
[Roleplay log between ${ch.name} and ${c.name1}]
${log}
Return:
{"aff":<integer -100..100: how close ${ch.name} is to ${c.name1} NOW, judged from the story and from ${ch.name}'s own personality. 0 = strangers, 20 = friendly acquaintances, 40 = close friends or a mild crush, 60 = clearly in love, 80 = lovers, 95 = deeply committed. Negative = hostile>,"summary":"2 short ${DLN()} sentences describing the relationship so far","facts":{"<short ${DLN()} label such as ${STD_FACTS.join(', ')}>":"<value>"},"annivs":[{"name":"<important date in the story>","md":"MM-DD"}],"npcs":[{"name":"","role":"","desc":"one short line"}]}
Rules: "npcs" lists named people (not ${ch.name}, not ${c.name1}) who actually appear or are mentioned with a role in the log (at most 8). "facts" only has things that ${c.name1} has actually learned in the log (not card-only secrets). Omit unknown items. Keep each value under 60 characters. "annivs" may be empty.`;
    const d = parseJSON(await llm(prompt, 2500, '기존 채팅 분석'));
    if (!d) throw new Error('분석 결과를 읽지 못했어요');
    const dos = dossierOf(ch.name);
    if (Number.isFinite(+d.aff) && (force || meta.aff[ch.name] === undefined)) setAff(ch.name, +d.aff, true);
    if (d.summary) dos.summary = String(d.summary).slice(0, 300);
    for (const [k, v] of Object.entries(d.facts || {})) if (k && v) addFact(ch.name, String(k).slice(0, 14), String(v).slice(0, 90), false);
    for (const a of d.annivs || []) if (a?.name && /^\d{1,2}-\d{1,2}$/.test(a.md || '') && !meta.annivs.some((x) => x.name === a.name)) meta.annivs.push({ name: String(a.name).slice(0, 30), md: a.md.split('-').map((x) => x.padStart(2, '0')).join('-') });
    for (const n of Array.isArray(d.npcs) ? d.npcs : []) if (n?.name && n.name !== ch.name && n.name !== c.name1 && !meta.npcs.some((x) => x.name === n.name)) { meta.npcs.push({ name: String(n.name).slice(0, 20), role: String(n.role || '').slice(0, 20), desc: String(n.desc || '').slice(0, 80) }); }
    meta.analyzed[ch.name] = true; saveMeta();
    return true;
  }
  async function autoAnalyze() {
    const ch = activeChar(), meta = M(); if (!ch || meta.analyzed[ch.name] || !S().autoAnalyze) return;
    const n = (ctx().chat || []).filter((m) => m && !m.is_user && !m.is_system).length;
    if (n < 3) return;
    meta.analyzed[ch.name] = 'pending';
    ui.status('기존 채팅으로 호감도·관계를 파악하는 중…');
    try { await analyzeHistory(ch); ui.hud(st.turn); refreshInject(); toastr.success(`${ch.name}: 기존 채팅을 반영했어요 (${affLevel(affOf(ch.name))})`); }
    catch (e) { delete meta.analyzed[ch.name]; toastr.warning('기존 채팅 분석 실패: ' + (e.message || e)); }
    finally { ui.status(''); }
  }
  async function onboardSprites() {
    const ch = activeChar(); if (!ch) return;
    const cd = cdata(ch); if (cd.asked) return;
    await stSprites(ch);
    const has = Object.keys(spriteCache[chKey(ch)] || {}).length > 0 || Object.values(cd.outfits).some((o) => o.base || Object.keys(o.emo || {}).length);
    if (has) return;
    cd.asked = true; saveSettings();
    if (!S().geminiKey.trim()) { toastr.info('이 캐릭터는 표정 이미지가 없어요. API 키를 넣으면 AI로 만들 수 있고, 표정·의상 탭에서 직접 올려도 돼요.'); return; }
    if (confirm(`${ch.name}의 표정 이미지가 아직 없어요.\nAI로 기본 표정 ${SET6.length}장을 만들어 둘까요?\n이미지 ${SET6.length}회(+외형 태그 추출 텍스트 1회) 요금이 발생해요. 요청은 ${S().imgGapSec}초 간격으로 한 장씩 보내서 2~4분쯤 걸려요.\n(취소하면 대화 중 필요할 때 한 장씩만 만들어요)`)) runGenSet(ch, '기본', SET6);
  }
  async function runGenSet(ch, outfit, list) {
    if (st.genBusy) return toastr.info('이미 이미지를 만드는 중이에요.');
    st.genBusy = true; st.genStop = false; ui.root?.classList.add('gen-busy');
    try {
      const n = await genSet(ch, outfit, list, (i, total, e) => ui.status(`표정 생성 ${i}/${total} · ${e}`, true), () => st.genStop);
      toastr.success(n ? `${ch.name} · ${outfit}: ${n}장을 만들었어요${st.genStop ? ' (중지됨)' : ''}` : (st.genStop ? '중지했어요' : '이미 모두 있어요'));
    } finally { st.genBusy = false; st.genStop = false; ui.root?.classList.remove('gen-busy'); ui.status(''); if (st.turn?.ch) ui.setSprite(st.turn.ch, st.curEmo || st.turn.emo, outfitOf(st.turn.ch)); if (st.open && !ui.q('#vn-modal').classList.contains('vn-off')) renderModal(); }
  }

  /* ================= 일상 모드: 하루치 계획 + 분기 이벤트 + 선행 생성 ================= */
  const lineNorm = (arr) => (Array.isArray(arr) ? arr : []).map((l) => ({ k: l?.k === 'narr' ? 'narr' : 'say', t: String(l?.t ?? l ?? '').trim(), who: l?.who ? String(l.who).slice(0, 20) : '', emo: l?.emo ? String(l.emo).trim() : '' })).filter((l) => l.t).flatMap((l) => chunk(l.t).map((t) => ({ k: l.k, t, who: l.who, emo: l.emo })));
  function normChoice(c, avail, depth) {
    return { t: String(c?.t || '').trim(), aff: clamp(parseInt(c?.aff, 10) || 0, -6, 6), emo: normEmo(c?.emo, avail), reply: lineNorm(c?.reply), choices: depth < 2 ? (Array.isArray(c?.choices) ? c.choices : []).slice(0, clamp(+S().followCount || 3, 2, 4)).map((x) => normChoice(x, avail, depth + 1)).filter((x) => x.t) : [] };
  }
  function normNode(d, ch) {
    const avail = availEmos(ch);
    return { title: String(d.title || '').slice(0, 40), emo: normEmo(d.emo, avail) || 'neutral', outfit: d.outfit || '', lines: lineNorm(d.lines), aff: clamp(parseInt(d.aff, 10) || 0, -6, 6), cg: d.cg ? String(d.cg_desc || d.event || '').trim() || 'a memorable moment' : '', choices: (Array.isArray(d.choices) ? d.choices : []).slice(0, 4).map((c) => normChoice(c, avail, 1)).filter((c) => c.t) };
  }
  const actName = (id) => actOf(id).n;
  const relCtx = (ch) => { const dos = dossierOf(ch.name), v = affOf(ch.name), facts = Object.entries(dos.facts).map(([k, x]) => `${k}: ${x}`).join('; '); return `Closeness ${v} on a -100..100 scale (${affLevel(v)}). ${dos.summary ? `Relationship so far: ${dos.summary} ` : ''}${facts ? `Known facts: ${facts}.` : ''}`; };
  const chatExcerpt = (n = 10) => (ctx().chat || []).filter((m) => m && !m.is_system && m.mes).slice(-n).map((m) => `${m.name}: ${parseBlock(m.mes).text.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n');
  const cardOf = (ch) => `${String(ch.description || '').slice(0, 2200)}\n${String(ch.personality || '').slice(0, 600)}\n${String(ch.scenario || '').slice(0, 400)}`;
  const histText = (ch) => M().hist.slice(-14).map((h) => (h.r === 'user' ? `${ctx().name1}: ${h.t}` : h.r === 'sys' ? `(${h.t})` : `${ch.name}: ${h.t}`)).join('\n');
  const PERS_RULE = (n) => `"aff" values must come ONLY from ${n}'s own personality, background and tastes, never from general etiquette. The same choice can please one character and upset another; rude is not automatically bad and kind is not automatically good. Many choices should be 0 or ±1, and the set of choices must differ in effect (some up, some down, some neutral) according to what THIS character would feel.`;
  async function jsonCall(prompt, maxTok, label = 'JSON') {
    for (let i = 0; i < 2; i++) {
      const d = parseJSON(await llm(i ? prompt + '\nIMPORTANT: Reply with one valid JSON object only, nothing else.' : prompt, maxTok, i ? label + ' (재시도)' : label));
      if (d) return d;
    }
    throw new Error('모델이 JSON 형식으로 답하지 않았어요 (연결 프로필 모델을 바꿔 보세요)');
  }
  const chatKey = () => (ctx().getCurrentChatId?.() || 'x');
  const planP = {}, nodeP = {};

  const seedList = (key) => {
    const v = String(S()[key] || '').trim(), isDefault = v === (key === 'dailySeeds' ? DEFAULT_SEEDS : DEFAULT_ENC);
    const base = (langKey() === 'en' && isDefault) ? (key === 'dailySeeds' ? DEFAULT_SEEDS_EN : DEFAULT_ENC_EN) : v;
    return base.split('\n').map((x) => x.trim()).filter(Boolean);
  };
  const pickN = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
  const sceneText = (n = 14) => st.sceneLines.slice(-n).map((l) => (l.k === 'narr' ? `(${l.t})` : `${l.who || '?'}: ${l.t}`)).join('\n');
  const prevDays = (day) => [day - 3, day - 2, day - 1].filter((d) => d >= 1 && M().cal[d]).map((d) => {
    const c = M().cal[d], pl = c.plan;
    const sl = (pl?.slots || []).map((s, i) => { const e = (c.events || []).find((x) => x.slot === i); return `${SLOTS[i]} ${s.loc || ''} [${s.kind}] ${e?.title || s.premise || ''}${e?.picks?.length ? ` (player chose: ${e.picks.join(' > ')})` : ''}`; }).join('; ');
    return `Day ${d}${c.title ? ` "${c.title}"` : ''}: ${sl || (c.events || []).map((e) => `${SLOTS[e.slot]} ${e.loc || ''} ${e.title || ''}`).join('; ') || 'no events'}`;
  }).join('\n');
  async function genDayPlan(day, ch) {
    const meta = M(), c = ctx(), user = c.name1 || 'the player', cd = cdata(ch);
    const sched = meta.sched[day] || [], dt = dateOfDay(day), an = annivsOn(`${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`);
    const ms = meta.milestone[ch.name]; if (ms) delete meta.milestone[ch.name];
    const enc = pickN(seedList('encSeeds'), Math.max(0, +S().encCount || 0)), ins = pickN(seedList('dailySeeds'), 2);
    const prompt = `You plan ONE in-story day for a dating-sim style visual novel ("daily life mode"). The days must form a continuing STORY, not a repeating routine. Write in ${DLN()}.
[Character: ${ch.name}]
${cardOf(ch)}
[Player: ${user}]
${String(c.powerUserSettings?.persona_description || '').slice(0, 700)}
[State] ${fmtDate(dt)} (day ${day}). ${relCtx(ch)}
${chatExcerpt(8) ? `[Story so far]\n${chatExcerpt(8)}` : ''}
${prevDays(day) ? `[Previous days: do NOT reuse their openings, situations or places]\n${prevDays(day)}` : '[Previous days] none: this is the first day.'}
${meta.lastScene?.length ? `[How the previous day ended]\n${meta.lastScene.map((l) => (l.k === 'narr' ? `(${l.t})` : `${l.who || '?'}: ${l.t}`)).join('\n')}\nToday must begin the NEXT morning/time, following from this.` : ''}
${meta.arc ? `[Story thread to continue] ${meta.arc}` : ''}
${meta.npcs.length ? `[Known NPCs] ${meta.npcs.map((n) => `${n.name} (${n.role || ''})`).join(', ')}` : ''}
[Player's schedule] ${SLOTS.map((n, i) => `${n}: ${actName(sched[i] || 'free')}`).join(' / ')}
${an.length ? `[Today is special] ${an.join(', ')}` : ''}
[Known places] ${placeNames().slice(0, 25).join(', ') || 'none yet'}${meta.wish ? `\nThe player wants to meet at: ${meta.wish}` : ''}
${ms ? `[Milestone] Closeness just reached "${ms[1]}". The highlight slot must be a special, memorable heart event (kind "meet").` : ''}
[Random inspiration for variety, use at least one] ${[...enc, ...ins].join(' / ')} (novelty seed ${Math.random().toString(36).slice(2, 7)})
Return ONLY JSON:
{"title":"short title of the day","weather":"Sunny/Cloudy/Rain/Snow etc. in ${DLN()}","arc":"one sentence: the story thread or unresolved question to carry into tomorrow","npcs":[{"name":"","role":"","desc":"one short line"}],"slots":[{"time":"HH:MM","loc":"place name","kind":"meet|encounter|npc|solo|charsolo","npc":"NPC name when kind is npc","outfit":"what ${ch.name} wears (fit time and place)","emo":"expression label","beat":"progress|conflict|reveal|surprise|comic|tender|rest","special":false,"premise":"one-line situation","solo":["2-4 lines, only when kind is solo or charsolo"]}]}
"slots" must have exactly 5 entries in this order: ${SLOTS.join(', ')} (times near ${SLOT_TIMES.join(', ')}).
Slot kinds: "meet" = ${user} and ${ch.name} together; "encounter" = ${ch.name} shows up unexpectedly (or they bump into each other); "npc" = ${user} is alone with an NPC and ${ch.name} is absent (friend, rival, family, shopkeeper, teacher, stranger; reuse known NPCs or add a new one in "npcs"); "solo" = ${user} alone, a quiet moment or small incident narrated in "solo"; "charsolo" = ${ch.name} alone without ${user}, a private moment written in "solo" (what they do, think or say to themselves), which reveals something about them.
Rules for variety and story:
- Move the story forward. Include at least one real development today: a conflict or misunderstanding, a revealed secret, a surprise, an event (festival, exam, trip, accident, weather incident), a new or returning NPC, or a step in the relationship. Never repeat earlier days' premises or places unless the story demands it.
- Use at least 3 different slot kinds across the day. Mark exactly ONE slot (a meet, encounter or npc slot) as "special": true: the highlight of the day, a memorable moment worth an event illustration.
- The player's activity decides the slot: "${actName('meet')}" means kind "meet". A concrete activity (${actName('study')}, ${actName('exercise')}, ...) means "solo" or "npc" (something happens while doing it). "${actName('free')}" means you decide, with at least one and at most three slots involving ${ch.name}.
- Fit ${ch.name}'s routine and personality, the weekday and season, and the closeness level (low = awkward or formal, high = intimate). Reuse known places when natural. Known outfits: ${Object.keys(cd.outfits).join(', ')}; choose among them when it fits, and only invent a new outfit when clearly necessary.`;
    const d = await jsonCall(prompt, 3800, '하루 계획');
    const slots = SLOTS.map((_, i) => {
      const s = d.slots?.[i] || {}, act = sched[i] || 'free';
      let kind = ['meet', 'solo', 'encounter', 'npc', 'charsolo'].includes(s.kind) ? s.kind : 'meet';
      if (act === 'meet') kind = 'meet'; else if (act !== 'free' && (kind === 'meet' || kind === 'charsolo')) kind = 'solo';
      return { time: String(s.time || SLOT_TIMES[i]).slice(0, 8), loc: String(s.loc || meta.loc || '').trim(), kind, npc: String(s.npc || '').slice(0, 20), outfit: s.outfit || '', emo: s.emo || '', beat: s.beat || '', special: !!s.special, premise: String(s.premise || '').slice(0, 140), solo: (Array.isArray(s.solo) ? s.solo : []).map(String).slice(0, 4) };
    });
    for (const s of slots) { if (s.kind === 'npc' && !s.npc) s.kind = 'solo'; if (!['meet', 'encounter', 'npc'].includes(s.kind)) s.special = false; }
    if (!slots.some((s) => s.kind === 'meet' || s.kind === 'encounter')) slots[2].kind = 'meet';
    if (!slots.some((s) => s.special)) { const i = slots.findIndex((s) => s.kind === 'meet' || s.kind === 'encounter'); if (i >= 0) slots[i].special = true; }
    return { title: String(d.title || `Day ${day}`).slice(0, 40), weather: String(d.weather || '').slice(0, 12), arc: String(d.arc || '').slice(0, 200), npcs: (Array.isArray(d.npcs) ? d.npcs : []).slice(0, 3), slots };
  }
  async function getPlan(day) {
    const meta = M(); if (meta.plans[day]) return meta.plans[day];
    const key = chatKey() + ':' + day;
    return (planP[key] ||= genDayPlan(day, activeChar()).then((pl) => {
      meta.plans[day] = pl;
      if (pl.arc) meta.arc = pl.arc;
      const cal = (meta.cal[day] ||= { events: [] }); cal.title = pl.title; cal.weather = pl.weather; cal.sched = [...(meta.sched[day] || [])];   // 계획은 지워져도 캘린더에는 남긴다
      cal.plan = { title: pl.title, weather: pl.weather, slots: pl.slots.map((s) => ({ time: s.time, loc: s.loc, kind: s.kind, npc: s.npc, premise: s.premise, special: s.special })) };
      for (const n of pl.npcs || []) if (n?.name && !meta.npcs.some((x) => x.name === n.name)) { meta.npcs.push({ name: String(n.name).slice(0, 20), role: String(n.role || '').slice(0, 20), desc: String(n.desc || '').slice(0, 80) }); }
      for (const k of Object.keys(meta.plans)) if (+k < day - 3) { delete meta.plans[k]; for (const nk of Object.keys(meta.nodes)) if (nk.startsWith(k + ':')) delete meta.nodes[nk]; }
      saveMeta(); return pl;
    }).finally(() => { delete planP[key]; }));
  }
  async function genNode(day, idx, ch, userText = '') {
    const meta = M(), plan = meta.plans[day], slot = plan.slots[idx], next = plan.slots[idx + 1], user = ctx().name1 || 'the player', cd = cdata(ch), light = !!userText;
    const today = (meta.cal[day]?.events || []).map((e) => `${SLOTS[e.slot]}: ${e.title}${e.aff ? ` (closeness ${e.aff > 0 ? '+' : ''}${e.aff})` : ''}`).join('; ');
    const npc = slot.kind === 'npc' ? meta.npcs.find((n) => n.name === slot.npc) || { name: slot.npc, role: '', desc: '' } : null;
    const scene = npc
      ? `${user} is with the NPC "${npc.name}"${npc.role ? ` (${npc.role})` : ''}${npc.desc ? `: ${npc.desc}` : ''}. ${ch.name} is NOT present. Lines spoken by the NPC must carry "who":"${npc.name}".`
      : slot.kind === 'encounter' ? `${ch.name} unexpectedly shows up. Other people (NPCs) may appear briefly; mark their lines with "who".` : `${user} and ${ch.name} are together. Other people (NPCs) may appear briefly; mark their lines with "who".`;
    const nTop = clamp(+S().choiceCount || 4, 2, 4), choiceBrief = choiceProms().slice(0, nTop).map((x, i) => `[${i + 1}] ${x.replace(/\{\{user\}\}/g, user).replace(/\{\{char\}\}/g, ch.name)}`).join(' ') + (String(S().choiceExtra || '').trim() ? ` Extra: ${String(S().choiceExtra).trim()}` : '');
    const seen = sceneText(16);
    const head = `You write one interactive scene for a dating-sim visual novel ("daily life mode"). Write in ${DLN()}.
[Character: ${ch.name}]
${cardOf(ch)}
[Player: ${user}]
${String(ctx().powerUserSettings?.persona_description || '').slice(0, 600)}
[State] Day ${day} ${SLOTS[idx]} (${slot.time || ''}), at "${slot.loc}", weather ${plan.weather || 'unspecified'}. ${relCtx(ch)} Outfit: ${slot.outfit || outfitOf(ch)}.
[Plan] ${plan.title}. This slot (${slot.beat || 'progress'}): ${slot.premise}
${meta.arc ? `[Story thread] ${meta.arc}` : ''}
${today ? `[Earlier today] ${today}` : ''}
[Scene] ${scene}
${seen ? `[Scene so far. Do NOT repeat or paraphrase any line below, continue after the last one]\n${seen}` : ''}`;
    if (light) {   // 직접 입력: 가볍고 빠르게 (분기 없이 반응 + 다음 선택지)
      const prompt = `${head}
[${user} just did or said] ${userText}
Write ${npc ? npc.name : ch.name}'s reaction as 2-4 NEW "lines" that follow the last line above (never restate earlier lines, never reopen the scene), then offer new "choices".
Return ONLY JSON:
{"emo":"${ch.name}'s expression label","aff":0,"lines":[{"k":"narr or say","who":"speaker name only if not ${npc ? npc.name : ch.name}","emo":"optional expression label","t":"1-2 sentences"}],"choices":[{"t":"what ${user} says or does: a vivid first-person line (up to ${+S().choiceLen || 70} chars)","aff":0,"emo":"","reply":[{"k":"say","t":"reaction"}]}]}
Offer 2-3 choices that differ clearly in style, following this brief by number: ${choiceBrief}
${PERS_RULE(ch.name)} "aff" is the change caused by the player's latest action.`;
      return normNode(await jsonCall(prompt, 2200, '직접 입력 답변'), ch);
    }
    const prompt = `${head}
${next ? `[Next slot (${SLOTS[idx + 1]})] ${next.premise}. Only foreshadow things that will really happen there.` : ''}
Write the opening of this scene, then give choices.${slot.special ? `\nThis is the HIGHLIGHT of the day: build to a memorable moment and set "cg" to true with a vivid "cg_desc".` : ''}
Return ONLY JSON:
{"title":"short event title","emo":"${ch.name}'s expression label","outfit":"","aff":0,"lines":[{"k":"narr or say","who":"speaker name only if not ${npc ? npc.name : ch.name}","emo":"${ch.name}'s expression for this line (optional)","t":"1-2 sentences"}],"choices":[{"t":"what ${user} says or does: a vivid first-person line (up to ${+S().choiceLen || 70} chars)","aff":0,"emo":"","reply":[{"k":"say","who":"","t":"reaction"}],"choices":[{"t":"follow-up option","aff":0,"emo":"","reply":[{"k":"say","t":"reaction"}]}]}],"cg":false,"cg_desc":"English CG description, only if cg is true"}
Rules: "lines" has 3-6 entries ("say" = speech without quotation marks, "narr" = narration). Vary the expression ("emo") across the lines so the character reacts visibly. Give exactly ${nTop} top-level choices for ${user}, in this order and style: ${choiceBrief}. Each choice has 1-2 reply lines AND exactly ${clamp(+S().followCount || 3, 2, 4)} follow-up "choices" of its own, each different in intent (each with 1-2 reply lines, no deeper nesting). The branches must truly differ in tone and outcome, and each follow-up must build on the choice before it. Never promise that "something good will happen later" unless it happens in this scene or is the next slot's premise. ${PERS_RULE(ch.name)} Set "cg" true only for a truly memorable moment. Top-level "aff" is 0 for a scene opening.`;
    return normNode(await jsonCall(prompt, 5000, `만남 장면 (${day}일째 ${SLOTS[idx]})`), ch);
  }
  function getNode(day, idx) {
    const meta = M(), key = `${day}:${idx}`;
    if (meta.nodes[key]) return Promise.resolve(meta.nodes[key]);
    const nk = chatKey() + ':' + key;
    return (nodeP[nk] ||= (async () => { const pl = await getPlan(day); void pl; const n = await genNode(day, idx, activeChar()); meta.nodes[key] = n; saveMeta(); return n; })().finally(() => { delete nodeP[nk]; }));
  }
  function prefetchNext() {   // 선택지를 하나 고른 뒤, 그 선택이 반영된 다음 만남 장면을 미리 만들어 둔다
    const meta = M(), plan = meta.plans[meta.day]; if (!plan) return;
    const j = plan.slots.findIndex((s, i) => i > meta.slot && s.kind !== 'solo');
    if (j >= 0) { getNode(meta.day, j).catch(() => {}); return; }
    getPlan(meta.day + 1).then((pl) => { const k = pl.slots.findIndex((s) => s.kind !== 'solo'); if (k >= 0) getNode(meta.day + 1, k).catch(() => {}); }).catch(() => {});
  }
  function turnFromNode(node, slot, ch) {
    const npc = slot.kind === 'npc';
    const lines = (node.lines.length ? node.lines : [{ k: 'narr', t: '…' }]).map((l) => (npc && l.k === 'say' && !l.who ? { ...l, who: slot.npc } : l));
    let ev = node.cg || null;
    if (!ev && slot.special) ev = `A special, memorable moment: ${slot.premise}`;      // 하이라이트 슬롯은 반드시 이벤트 씬
    return { src: 'daily', daily: true, ch, who: npc ? slot.npc : ch.name, loc: slot.loc, time: slot.time, emo: node.emo !== 'neutral' ? node.emo : (normEmo(slot.emo, availEmos(ch)) || 'neutral'), outfit: node.outfit || slot.outfit, event: ev, strong: !!slot.special, title: node.title, lines, choices: node.choices, noChar: npc, npcName: npc ? slot.npc : '' };
  }
  function showRetry(msg) {
    showWaiting(false); ui.clearEnd(); ui.q('#vn-box').classList.add('end'); ui.q('#vn-input').style.display = 'none';
    ui.q('#vn-endbtns').innerHTML = `<span class="vn-hint vn-err">${esc(msg)}</span><button class="vn-pill" data-act="retry">다시 시도</button>`;
  }
  async function playSlot(force = false) {
    const meta = M(), ch = activeChar();
    if (force) { const k = `${meta.day}:${meta.slot}`; delete nodeP[chatKey() + ':' + k]; delete planP[chatKey() + ':' + meta.day]; }     // 멈춰 있던 요청을 버리고 새로 시작
    if (!ch) { toastr.warning('캐릭터 채팅을 먼저 열어 주세요.'); return; }
    await stSprites(ch);
    st.slotAff = 0; st.firstPick = false; st.sceneLines = []; st.slotPicks = [];
    const rid = ++st.reqId, day = meta.day, idx = meta.slot;
    showWaiting(true, meta.plans[day] ? '이벤트를 준비하는 중' : '하루를 계획하는 중');
    try {
      const plan = await getPlan(day), slot = plan.slots[idx];
      if (rid !== st.reqId) return;
      meta.time = slot.time; meta.weather = slot.weather || plan.weather || meta.weather; saveMeta();
      st.slotInfo = { day, idx, title: '', loc: slot.loc, kind: slot.kind, premise: slot.premise, npc: slot.npc };
      if (slot.kind === 'solo' || slot.kind === 'charsolo') {
        const own = slot.kind === 'charsolo';
        const lines = lineNorm((slot.solo.length ? slot.solo : [slot.premise || '…']).map((tx) => ({ k: 'narr', t: tx })));
        st.slotInfo.title = slot.premise || (own ? `${ch.name}의 시간` : '혼자만의 시간');
        await playTurn({ src: 'daily', daily: true, ch, who: ch.name, loc: slot.loc, time: slot.time, emo: normEmo(slot.emo, availEmos(ch)) || 'neutral', outfit: slot.outfit, lines, choices: [], noChar: !own, solo: true, charSolo: own });
        if (idx >= SLOTS.length - 1) getPlan(day + 1).catch(() => {});
        return;
      }
      const node = await getNode(day, idx);
      if (rid !== st.reqId) return;
      st.slotInfo.title = node.title || slot.premise;
      await playTurn(turnFromNode(node, slot, ch));
      if (idx >= SLOTS.length - 1) getPlan(day + 1).catch(() => {});
    } catch (e) { if (rid !== st.reqId) return; console.warn('[VN] 일상 생성 실패', e); toastr.error('일상 이벤트 생성 실패: ' + (e.message || e), '', { timeOut: 12000 }); showRetry('생성 실패: ' + (e.message || e)); }
  }
  function dailyChoice(c) {
    const turn = st.turn, ch = turn.ch, meta = M();
    (st.slotPicks ||= []).push(c.t);
    meta.hist.push({ r: 'user', t: c.t }); meta.hist.push({ r: 'char', t: c.reply.map((l) => l.t).join(' ').slice(0, 300) }); saveMeta();
    const nt = { ...turn, lines: [{ k: 'user', t: c.t }, ...(c.reply.length ? c.reply : [{ k: 'narr', t: '…' }])], choices: c.choices || [], emo: c.emo || turn.emo, event: null, strong: false, ended: false, _logged: null, append: true, title: turn.title };
    playTurn(nt).then(() => applyAff(ch.name, c.aff));
    if (!st.firstPick) { st.firstPick = true; prefetchNext(); }
  }
  async function dailyFree(text) {
    const meta = M(), ch = activeChar(), turn = st.turn; if (!ch) return;
    const plan = meta.plans[meta.day]; if (!plan) return;
    ui.clearEnd(); (st.slotPicks ||= []).push(text); meta.hist.push({ r: 'user', t: text });
    // 입력한 말은 바로 화면에 올리고(반응이 없어도 입력이 보이게), 답변을 기다린다
    const rid = ++st.reqId;
    { const pre = { k: 'user', t: text }, m = mkPara(pre, turn || {}); m.tx.textContent = text; ui.q('#vn-text').appendChild(m.p); logLine({ lines: [pre], _logged: new Set() }, 0, m.who); scrollText(true); }
    showWaiting(true, '답변을 만드는 중');
    try {
      const slot = plan.slots[meta.slot] || plan.slots[0];
      st.sceneLines.push({ k: 'user', who: ctx().name1 || '', t: text });
      const node = await genNode(meta.day, meta.slot, ch, text);
      if (rid !== st.reqId) return;
      const nt = turnFromNode(node, slot, ch); nt.append = 'cont'; nt.event = null; nt.strong = false; nt.emo = node.emo || turn?.emo;
      meta.hist.push({ r: 'char', t: node.lines.map((l) => l.t).join(' ').slice(0, 300) }); saveMeta();
      await playTurn(nt); applyAff(ch.name, node.aff);
      if (!st.firstPick) { st.firstPick = true; prefetchNext(); }
    } catch (e) { if (rid !== st.reqId) return; showWaiting(false); toastr.error('답변 생성 실패: ' + (e.message || e)); if (turn) showEnd(turn); }
  }
  async function nextSlot() {
    const meta = M(), si = st.slotInfo;
    if (si) {
      calAdd(si.day, { slot: si.idx, loc: si.loc, title: si.title || '이벤트', aff: st.slotAff, kind: si.kind, premise: si.premise || '', npc: si.npc || '', picks: [...(st.slotPicks || [])] });
      meta.hist.push({ r: 'sys', t: `${SLOTS[si.idx]} ${si.title || ''}${st.slotAff ? ` (${st.slotAff > 0 ? '+' : ''}${st.slotAff})` : ''}` }); if (meta.hist.length > 40) meta.hist.splice(0, meta.hist.length - 40);
      meta.lastScene = st.sceneLines.slice(-5).map((l) => ({ k: l.k, who: l.who, t: l.t }));
    }
    st.slotInfo = null; st.turn = null;
    meta.slot++; if (meta.slot >= SLOTS.length) { meta.slot = 0; meta.day++; }
    saveMeta(); ui.hud(null);
    playSlot();
  }
  async function toggleMode() {
    const meta = M(); meta.ms ||= {};
    meta.ms[meta.mode] = { loc: meta.loc, time: meta.time, weather: meta.weather };         // 모드마다 장소·시간·날씨를 따로 기억한다
    meta.mode = meta.mode === 'daily' ? 'chat' : 'daily';
    const nx = meta.ms[meta.mode] || { loc: '', time: '', weather: '' }; meta.loc = nx.loc; meta.time = nx.time; meta.weather = nx.weather; saveMeta();
    st.turn = null; ui.hud(null); finishText(true);
    toastr.info(meta.mode === 'daily' ? '일상 모드: 채팅과 별개로 하루가 진행돼요. 하루 계획은 처음 한 번만 만들고, 다음 장면은 미리 준비돼요.' : '채팅 연동 모드로 돌아왔어요.');
    await replayLast();
  }

  const sentencesWith = (text, name, max = 3, len = 300) => { const out = [], nm = name.toLowerCase(); for (const s of String(text || '').split(/(?<=[.!?。！？])\s+|\n+/)) { if (s.toLowerCase().includes(nm)) { out.push(s.trim().slice(0, len)); if (out.length >= max) break; } } return out; };
  async function npcSources(n, ch) {
    const card = sentencesWith([ch?.description, ch?.scenario].filter(Boolean).join('\n'), n.name, 4);
    let lore = ''; try { lore = await loreDesc(n.name); } catch { /* 로어북 없음 */ }
    const chat = [];
    for (const m of [...(ctx().chat || [])].reverse().slice(0, 150)) { if (!m || m.is_system) continue; chat.push(...sentencesWith(parseBlock(m.mes).text, n.name, 2, 260)); if (chat.length >= 8) break; }
    return { card, lore: String(lore || '').slice(0, 600), chat: chat.reverse() };
  }
  /* NPC 외형 태그: 저장된 태그 → (설명 + 카드·로어북 + 채팅 기록에서 이름이 언급된 문장)으로 모델이 영어 태그를 만든다. 자료가 전혀 없으면 태그 없이 AI가 역할에 맞게 설계한다 */
  /* NPC 이미지 후보: 캐릭터 이미지 · 다른 NPC 이미지 · 이벤트 이미지 */
  function npcImgPool() {
    const out = new Set(), meta = M();
    try { for (const c of castAll()) { const cd = cdata(c); [cd.profile, ...Object.values(cd.outfits || {}).flatMap((o) => [o.base, ...Object.values(o.emo || {})])].forEach((u) => u && out.add(u)); } } catch { /* 캐릭터 없음 */ }
    (meta.npcs || []).forEach((n) => { [n.base, n.photo, n.img].forEach((u) => u && out.add(u)); });
    (meta.gallery || []).forEach((e) => { if (e.url && !String(e.url).startsWith('blob:')) out.add(e.url); });
    return [...out];
  }
  /* 외형 태그: 기준 이미지를 보고 추측해서만 만든다. 설명·로어북·채팅 기록은 쓰지 않는다(사진과 다른 사람이 나오는 걸 막음). 사람·동물 모두 같다 */
  async function npcLookTags(n, ch, force = false) {
    if (n.look && !force) return { text: n.look, source: '저장된 외형 태그' };
    const photo = npcBaseUrl(n) || n.img || '';
    if (!photo) return { text: '', source: '', reason: 'no-image' };
    if (!S().geminiKey.trim()) return { text: '', source: '', reason: 'no-key' };
    const img = await refInline(photo, 1024); if (!img) return { text: '', source: '', reason: 'no-load' };
    const out = cleanLook(await geminiText(`The attached image is the ONLY source. Look at it and describe what you SEE of the subject named "${n.name}": a person, an animal or a creature. Do not use any outside information and do not invent a backstory. Write ONE line of comma-separated English visual tags under 55 words, with the kind of subject as the FIRST tag ("human" for a person, otherwise the animal species or breed). For a person then give: apparent age, gender, ethnicity and skin tone, face, hair color/length/style, eye color, build, clothing, accessories. For an animal or creature give: fur, feather or skin color and pattern, size, distinctive markings, collar or other accessories. No names, no personality. Output only that line.`, [img], `NPC 외형 태그 (이미지: ${n.name})`));
    if (out && out.length >= 15) { n.look = out.slice(0, 600); n.lookSrc = 'photo'; n.lookPhoto = photo; saveMeta(); return { text: n.look, source: '이미지' }; }
    return { text: '', source: '', reason: 'empty' };
  }
  /* NPC 기준 사진: 내가 고르거나 올린 이미지 → (옛 참고 사진) → 같은 이름의 SillyTavern 캐릭터 카드 이미지. AI가 만든 이미지는 기준으로 쓰지 않는다 */
  function npcBaseUrl(n) {
    if (!n) return '';
    if (n.base) return n.base; if (n.photo) return n.photo;
    if (n.img && !n.imgAi) return n.img;
    const hit = (ctx().characters || []).find((x) => x?.avatar && x.name && sameName(x.name, n.name));
    return hit ? '/characters/' + encodeURIComponent(hit.avatar) : '';
  }
  /* 동물 여부: 이미지에서 뽑은 외형 태그의 맨 앞 태그로만 판단한다 */
  const NPC_ANIMAL_RE = /\b(cat|kitten|dog|puppy|rabbit|bunny|hamster|parrot|bird|turtle|tortoise|hedgehog|fox|wolf|fish|horse|pony|cow|pig|sheep|goat|mouse|rat|squirrel|duck|chicken|owl|snake|lizard|animal|creature|pet)\b/i;
  const NPC_HUMAN_RE = /\b(human|man|woman|boy|girl|person|male|female|adult|teen|teenager|child|catboy|catgirl)\b/i;
  function npcIsAnimal(n) { const first = String(n?.look || '').split(',').slice(0, 2).join(' '); return !!first && NPC_ANIMAL_RE.test(first) && !NPC_HUMAN_RE.test(first); }
  async function genNpcImage(n, ch) {
    const s = S(), refs = [], notes = [], photo = npcBaseUrl(n), tags = String(n.look || '').trim(), animal = npcIsAnimal(n);
    if (photo) { const r = await refInline(photo, 1280); if (r) { refs.push(r); notes.push(`Reference image ${refs.length} is the PHOTO of "${n.name}" and the ONLY source for what the subject looks like (a person, an animal or a creature). Keep EXACTLY the same kind of subject, face or head, ethnicity, skin tone, fur or hair color and pattern, age, build, clothing and accessories. Do not change anything because of text.`); } }
    const hasPhoto = refs.length > 0;
    if (ch && s.npcStyleRef) { const r = await charRefs(ch, outfitOf(ch), 1); if (r.refs[0]) { refs.push(r.refs[0]); notes.push(`Reference image ${refs.length} shows ONLY the art style, rendering, lighting and color grading of this visual novel. The subject must be a completely different individual: do NOT copy this person's face, hair, clothing or accessories.`); } }
    const bgUrl = bgFor(M().loc || '')?.url;
    if (bgUrl) { const r = await refInline(bgUrl, 768); if (r) { refs.push(r); notes.push(`Reference image ${refs.length} is the current background: match its color grading and light, but do NOT draw this scene.`); } }
    const worldLook = String(ssWorld()?.look || '').slice(0, 200);
    const appearance = tags ? ` (${tags})` : (hasPhoto ? '' : (n.desc ? `. ${n.desc}` : `. No appearance is specified, so invent a distinctive, fitting look for this role${worldLook ? ` in this world: ${worldLook}` : ''}`));
    st.lastNpcSrc = hasPhoto ? `기준 이미지${tags ? ' + 외형 태그' : ''}` : (tags ? '외형 태그' : (n.desc ? '설명' : '자료 없음 (AI가 역할에 맞게 설계)'));
    const subject = hasPhoto && !tags ? 'the subject shown in the photo reference (a person, an animal or a creature, exactly as in the photo)' : (animal ? `an animal named "${n.name}": a real animal, NOT a human, NOT anthropomorphic` : `an NPC named "${n.name}"`);
    const shot = animal ? 'full-body view' : (hasPhoto && !tags ? 'natural framing (waist-up for a person, full body for an animal)' : 'waist-up portrait');
    const pose = animal ? "natural animal pose, head turned slightly toward the viewer's LEFT" : "natural expressive pose, three-quarter view with the body and face turned slightly toward the viewer's LEFT";
    const prompt = `${notes.join(' ')}\nGenerate one image: a visual novel sprite, ${shot} of ${subject}${!hasPhoto && n.role ? `, ${n.role}` : ''}${appearance}.${hasPhoto ? ' The photo reference decides the look; the tags (if any) only supplement it.' : ''} ${pose}. Rendering style: ${styleMain()}. Match EXACTLY the rendering style, level of realism, lighting and color grading described above and in the references (if photorealistic, make this photorealistic too, NOT anime or illustration). Background: plain flat solid pure white, no floor, no shadow, no gradient. Single subject, no text, no watermark.`;
    let url = await geminiGenerate(prompt, refs, animal ? '1:1' : '3:4', 'vngen_', `NPC ${n.name}`);
    if (s.cutout) { try { const c = await cutoutImage(url); if (c.url) { const orig = url; url = c.url; dropImage(orig); } } catch { /* 원본 유지 */ } }
    n.faces = 'left';   // 위 지시대로 왼쪽을 보게 만들었으니 기록해 둔다 (NPC 탭에서 바꿀 수 있어요)
    return url;
  }

  /* ---------- 서버 이미지 정리 ---------- */
  const IMG_RE = /\/user\/images\/vnstudio\//;
  function allImageRefs() {
    const s = S(), set = new Set(), add = (u) => { if (u) set.add(u); };
    for (const c of Object.values(s.chars || {})) { add(c.profile); for (const o of Object.values(c.outfits || {})) { add(o.base); Object.values(o.emo || {}).forEach(add); } }
    for (const by of Object.values(s.placesBy || {})) Object.values(by).forEach((p) => add(p.url));
    Object.values(s.places || {}).forEach((p) => add(p.url));
    const m = ctx().chatMetadata?.[MODULE]; if (m) { (m.gallery || []).forEach((e) => { add(e.url); add(e.video); }); (m.npcs || []).forEach((n) => { add(n.img); add(n.photo); add(n.base); }); (m.mapHist || []).forEach((e) => add(e.url)); }
    Object.values(ctx().chatMetadata?.minimap?.world?.maps || {}).forEach((mp) => add(mp?.url));   // 지도 이미지
    for (const [k, v] of Object.entries(s.cutOrig || {})) if (set.has(k)) set.add(v);   // 배경 제거 전 원본(되돌리기용)
    return set;
  }
  /* 목록에서 지운 이미지가 다른 곳에서 쓰이지 않으면 서버 파일도 지운다 (가능한 경우에만) */
  async function deleteServerFile(url) {
    try {
      if (!url || !IMG_RE.test(url)) return false;
      const rel = String(url).replace(/^\/+/, '');
      for (const body of [{ path: rel }, { path: '/' + rel }]) { const r = await fetch('/api/images/delete', { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify(body) }); if (r.ok) return true; }
    } catch { /* 지울 수 없으면 그대로 둔다 */ }
    return false;
  }
  async function dropImage(url) {
    if (!S().deleteFiles || !url || !IMG_RE.test(url) || allImageRefs().has(url)) return false;
    return deleteServerFile(url);
  }
  /* 이미지 한 장을 쓰이는 모든 곳에서 떼어내고 서버 파일도 지운다 (사용자가 직접 지우겠다고 한 경우) */
  async function purgeImage(url) {
    const s = S(), meta = M(); let refs = 0;
    for (const c of Object.values(s.chars || {})) {
      if (c.profile === url) { delete c.profile; refs++; }
      for (const o of Object.values(c.outfits || {})) { if (o.base === url) { o.base = ''; refs++; } for (const [k, v] of Object.entries(o.emo || {})) if (v === url) { delete o.emo[k]; refs++; } }
    }
    for (const by of Object.values(s.placesBy || {})) for (const pl of Object.values(by)) if (pl?.url === url) { pl.url = ''; refs++; }
    for (const pl of Object.values(s.places || {})) if (pl?.url === url) { pl.url = ''; refs++; }
    for (const n of meta.npcs || []) for (const f of ['img', 'base', 'photo']) if (n[f] === url) { delete n[f]; refs++; if (f === 'img') delete n.imgAi; }
    meta.gallery = (meta.gallery || []).filter((e) => { if (e.url === url) { refs++; return false; } return true; });
    for (const [k, v] of Object.entries(s.cutOrig || {})) if (k === url || v === url) delete s.cutOrig[k];
    saveSettings(); saveMeta();
    await deleteServerFile(url);
    return refs;
  }
  /* 선택 화면의 이미지 한 칸: 사진을 누르면 크게 보기, [선택]으로 고르기, 🗑로 완전 삭제. 투명 배경도 보이게 체크무늬 */
  const pickTile = (u, selAct, badge = '') => `<div class="vn-pickitem" data-u="${esc(u)}"><img loading="lazy" decoding="async" src="${esc(u)}" alt="" title="클릭하면 크게 보기" onerror="this.parentNode.classList.add('broken')"><small class="vn-pk-bad">파일 없음</small>${badge ? `<small class="vn-pk-badge ${badge === '미사용' ? 'unused' : ''}">${badge}</small>` : ''}<div class="vn-pickbtns">${selAct ? `<button class="vn-btn sm" data-act="${selAct}" data-u="${esc(u)}">선택</button>` : ''}<button class="vn-btn sm danger" data-act="img-purge" data-u="${esc(u)}" title="이 이미지를 쓰는 모든 곳에서 떼어내고 파일도 삭제">🗑</button></div></div>`;
  async function listVnImages() {
    const hdr = ctx().getRequestHeaders();
    for (const [u, b] of [['/api/images/list/vnstudio', {}], ['/api/images/list', { folder: 'vnstudio' }]]) {
      try { const r = await fetch(u, { method: 'POST', headers: hdr, body: JSON.stringify(b) }); if (r.ok) { const j = await r.json(); if (Array.isArray(j)) return j.map((x) => (typeof x === 'string' ? x : (x.name || x.path || ''))).filter(Boolean); } } catch { /* 다음 방법 */ }
    }
    return null;
  }

  /* ================= 모달 동작 / 입력 처리 ================= */
  async function modalAction(act, el) {
    const s = S(), meta = M();
    const ch = selChar(), cd = ch ? cdata(ch) : null;
    const ofName = el.closest('[data-of]')?.dataset.of || el.dataset.of;
    const plKey = el.closest('[data-k]')?.dataset.k;
    const refresh = () => { renderModal(); if (st.turn?.ch) ui.setSprite(st.turn.ch, st.turn.emo, outfitOf(st.turn.ch)); };
    const day = st.calSel ?? meta.day;
    switch (act) {
      case 'of-add': {
        const n = $q('#vn-newof', ui.root).value.trim();
        if (!n || n === '기본') return toastr.info('다른 이름을 써 주세요.');
        if (cd.outfits[n]) return toastr.info('이미 있는 의상이에요.');
        cd.outfits[n] = { base: '', emo: {} }; delete cd.suggest[n]; saveSettings(); renderModal();
        if (s.geminiKey.trim() && confirm(`'${n}' 기준 이미지 1장을 지금 만들까요? (이미지 1회 요금)\\n표정은 나중에 필요할 때 따로 만들 수 있어요.`)) runGenSet(ch, n, ['neutral']);
        return;
      }
      case 'sug-add': { const n = el.dataset.name; if (!cd.outfits[n]) cd.outfits[n] = { base: '', emo: {} }; delete cd.suggest[n]; saveSettings(); renderModal(); if (s.geminiKey.trim() && confirm(`'${n}' 기준 이미지 1장을 지금 만들까요? (이미지 1회 요금)`)) runGenSet(ch, n, ['neutral']); return; }
      case 'emo-toggle': { const e = el.dataset.l, list = enabledEmos(ch), i = list.indexOf(e); if (i >= 0) { if (e === 'neutral') return toastr.info('neutral은 기준 이미지라 빼지 않아요.'); list.splice(i, 1); } else list.push(e); saveSettings(); return renderModal(); }
      case 'emo-cut': {
        const o = cd.outfits[ofName], l = el.dataset.l, url = o?.emo?.[l]; if (!url) return;
        ui.status('배경을 지우는 중…');
        try { const c = await cutoutImage(url); if (c.url) { const root = s.cutOrig?.[url] || url; (s.cutOrig ||= {})[c.url] = root; delete s.cutOrig[url]; o.emo[l] = c.url; if (o.base === url) o.base = c.url; saveSettings(); if (root !== url) dropImage(url); toastr.success('배경을 지웠어요 (↩ 버튼으로 원본으로 되돌릴 수 있어요)'); } else toastr.warning(`배경이 균일하지 않아 지우지 못했어요 (인식 ${(c.ratio * 100).toFixed(0)}%). 설정의 배경 제거 민감도를 조절해 보세요.`); }
        catch (e) { toastr.error('배경 제거 실패: ' + (e.message || e)); }
        ui.status(''); return refresh();
      }
      case 'emo-uncut': {
        const o = cd.outfits[ofName], l = el.dataset.l, cur = o?.emo?.[l], orig = s.cutOrig?.[cur]; if (!orig) return;
        o.emo[l] = orig; if (o.base === cur) o.base = orig; delete s.cutOrig[cur]; saveSettings(); dropImage(cur); toastr.success('원본으로 되돌렸어요'); return refresh();
      }
      case 'npc-uncut': {
        const n = npcByName(st.npcSel), cur = n?.img, orig = s.cutOrig?.[cur]; if (!orig) return;
        n.img = orig; if (n.base === cur) n.base = orig; delete s.cutOrig[cur]; saveMeta(); saveSettings(); dropImage(cur); toastr.success('원본으로 되돌렸어요'); return renderModal();
      }
      case 'dos-reset': { const old = cd.profile; delete cd.profile; saveSettings(); dropImage(old); return renderModal(); }
      case 'dos-pick': {
        st.pickKind = 'dos-pick';
        const imgs = [...new Set([cd.profile, ...Object.values(cd.outfits).flatMap((o) => [o.base, ...Object.values(o.emo || {})])].filter(Boolean))];
        const body = ui.q('#vn-mbody'); body.insertAdjacentHTML('afterbegin', `<div class="vn-pickgrid" id="vn-pickgrid"><p class="vn-hint">대표로 쓸 이미지를 고르세요 (사진을 누르면 크게 보여요)</p>${imgs.map((u) => pickTile(u, 'dos-pickset')).join('')}<button class="vn-btn sm" data-act="dos-pickclose">닫기</button></div>`); return;
      }
      case 'dos-pickset': cd.profile = el.dataset.u; saveSettings(); return renderModal();
      case 'dos-pickclose': return renderModal();
      case 'npc-add': { const n = $q('#vn-npcnew', ui.root).value.trim(); if (!n) return toastr.info('이름을 먼저 적어 주세요.'); if (meta.npcs.some((x) => x.name === n)) return toastr.info('이미 있는 인물이에요.'); meta.npcs.push({ name: n.slice(0, 20), role: '', desc: '' }); st.npcSel = n.slice(0, 20); saveMeta(); return renderModal(); }
      case 'sub-add': {
        const card = ch._parent || ch, n = (el.dataset.name || $q('#vn-subnew', ui.root)?.value || '').trim().slice(0, 24);
        if (!n) return toastr.info('이름을 먼저 적어 주세요.'); if (castList().some((x) => x.name === n) || subsOf(card).includes(n)) return toastr.info('이미 있는 인물이에요.');
        subsOf(card).push(n); saveSettings(); st.selChar = chKey(subChar(card, n)); return renderModal();
      }
      case 'sub-del': { const card = ch._parent || ch; if (!confirm(`'${el.dataset.name}' 인물을 목록에서 뺄까요? (만든 이미지는 서버에 남아요)`)) return; cdata(card).subs = subsOf(card).filter((x) => x !== el.dataset.name); saveSettings(); st.selChar = chKey(card); return renderModal(); }
      case 'npc-look': {
        const n = npcByName(st.npcSel); if (!n) return; el.disabled = true; ui.status('NPC 외형 근거를 찾는 중…');
        try { const r = await npcLookTags(n, ch, true); toastr[r.text ? 'success' : 'warning'](r.text ? `이미지를 보고 외형 태그를 만들었어요` : ({ 'no-image': '먼저 이미지 바꾸기 / 내 이미지에서 고르기로 이미지를 정해 주세요.', 'no-key': '이미지를 보려면 이미지 API 키가 필요해요.', 'no-load': '이미지를 불러오지 못했어요.' }[r.reason] || '모델이 태그를 주지 않았어요. 다시 시도해 주세요.')); } catch (e) { toastr.error('실패: ' + (e.message || e)); }
        ui.status(''); return renderModal();
      }
      case 'npc-analyze-src': { el.disabled = true; ui.status('카드·로어북에서 NPC를 찾는 중…'); try { const r = await analyzeNpcsFromSources(ch); toastr.success(`NPC ${r.added}명을 추가하고 ${r.updated}명을 갱신했어요 (로어북 ${r.scanned}항목 읽음, 파란 점 ${r.constant}개${r.batches > 1 ? `, ${r.batches}번에 나눠 분석${r.failed ? ` · ${r.failed}번 실패` : ''}` : ''})`); } catch (e) { toastr.error('분석 실패: ' + (e.message || e)); } ui.status(''); return renderModal(); }
      case 'npc-analyze': { el.disabled = true; ui.status('NPC를 분석하는 중…'); try { const n = await analyzeNpcs(ch); toastr.success(`NPC ${n.added}명을 추가하고 ${n.updated}명을 갱신했어요`); } catch (e) { toastr.error('분석 실패: ' + (e.message || e)); } ui.status(''); return renderModal(); }
      case 'npcfact-add': { const n = npcByName(st.npcSel); if (!n) return; const l = $q('#vn-nfl', ui.root).value.trim().slice(0, 14), v = $q('#vn-nfv', ui.root).value.trim().slice(0, 90); if (!l || !v) return; (n.facts ||= {})[l] = v; saveMeta(); return renderModal(); }
      case 'npcfact-del': { const n = npcByName(st.npcSel); if (n?.facts) { delete n.facts[el.dataset.l]; saveMeta(); } return renderModal(); }
      case 'npc-pick': {
        const n = npcByName(st.npcSel); if (!n) return; st.pickKind = 'npc-pick';
        const body = ui.q('#vn-mbody'); body.insertAdjacentHTML('afterbegin', `<div class="vn-pickgrid" id="vn-pickgrid"><p class="vn-hint">'${esc(n.name)}'의 이미지로 쓸 사진을 고르세요 (사진을 누르면 크게 보이고, [선택]으로 고르면 기준 사진이 돼요)</p>${npcImgPool().map((u) => pickTile(u, 'npc-pickset')).join('')}<button class="vn-btn sm" data-act="npc-pickclose">닫기</button></div>`); return;
      }
      case 'npc-pickset': { const n = npcByName(st.npcSel); if (n) { const o1 = n.img, o2 = n.base; n.img = n.base = el.dataset.u; n.imgAi = false; delete n.lookPhoto; if (n.lookSrc === 'photo') { n.look = ''; delete n.lookSrc; } saveMeta(); dropImage(o1); if (o2 !== o1) dropImage(o2); } return renderModal(); }
      case 'npc-pickclose': return renderModal();
      case 'img-purge': {
        if (!confirm('이 이미지를 쓰는 모든 곳(표정·NPC·이벤트 등)에서 떼어내고, 서버 파일도 지울까요? 되돌릴 수 없어요.')) return;
        const n = await purgeImage(el.dataset.u); toastr.success(`삭제했어요 (연결 ${n}곳 정리)`);
        const kind = st.pickKind; await renderModal(); if (kind) return modalAction(kind, el); return;
      }
      case 'img-manage': {
        st.pickKind = 'img-manage'; el.disabled = true; ui.status('저장된 이미지 목록을 불러오는 중…');
        const files = await listVnImages(); ui.status(''); el.disabled = false;
        if (!files) return toastr.warning('이 서버에서는 이미지 목록을 가져올 수 없어요. 폴더(data/사용자폴더/user/images/vnstudio)를 직접 확인해 주세요.');
        const refs = allImageRefs(), urls = files.map((f) => '/user/images/vnstudio/' + f.split('/').pop()).reverse(), used = urls.filter((u) => refs.has(u)).length;
        const body = ui.q('#vn-mbody'); body.querySelector('#vn-pickgrid')?.remove();
        body.insertAdjacentHTML('afterbegin', `<div class="vn-pickgrid big" id="vn-pickgrid"><p class="vn-hint">이미지 ${urls.length}개 · 지금 이 채팅/설정에서 쓰는 ${used}개 · 안 쓰는 ${urls.length - used}개. 파일은 SillyTavern 폴더의 data/(사용자 폴더, 보통 default-user)/user/images/vnstudio 에 있어요. 파일이 많아도 생성 속도엔 영향이 없고 저장 공간만 차지해요. 다른 채팅에서 쓰는 이미지도 '미사용'으로 보일 수 있으니, 사진을 눌러 크게 보고 지우세요.</p>${urls.map((u) => pickTile(u, '', refs.has(u) ? '사용 중' : '미사용')).join('')}<button class="vn-btn sm" data-act="npc-pickclose">닫기</button></div>`); return;
      }
      case 'npc-open': st.npcSel = el.dataset.name; return renderModal();
      case 'npc-del': { if (!confirm('이 인물을 삭제할까요?')) return; { const gone = meta.npcs.find((n) => n.name === st.npcSel); meta.npcs = meta.npcs.filter((n) => n.name !== st.npcSel); st.npcSel = ''; saveMeta(); dropImage(gone?.img); } return renderModal(); }
      case 'npc-imgdel': { const n = npcByName(st.npcSel); if (n) { const old = n.img; delete n.img; saveMeta(); dropImage(old); } return renderModal(); }
      case 'npc-cut': { const n = npcByName(st.npcSel); if (!n?.img) return; ui.status('배경을 지우는 중…'); try { const c = await cutoutImage(n.img); if (c.url) { const old = n.img, root = s.cutOrig?.[old] || old; (s.cutOrig ||= {})[c.url] = root; delete s.cutOrig[old]; n.img = c.url; saveMeta(); saveSettings(); if (root !== old) dropImage(old); toastr.success('배경을 지웠어요 (↩ 버튼으로 원본으로 되돌릴 수 있어요)'); } else toastr.warning('배경이 균일하지 않아 지우지 못했어요.'); } catch (e) { toastr.error('실패: ' + (e.message || e)); } ui.status(''); return renderModal(); }
      case 'npc-gen': {
        const n = npcByName(st.npcSel); if (!n) return;
        if (!s.geminiKey.trim()) return toastr.warning('이미지 API 키를 먼저 넣어 주세요.');
        if (!confirm(`'${n.name}' 이미지를 AI로 만들까요? (이미지 1회 요금)`)) return;
        ui.status(`${n.name} 이미지를 만드는 중…`);
        try { const old = n.img; if (old && !n.imgAi && !n.base) n.base = old; n.img = await genNpcImage(n, ch); n.imgAi = true; saveMeta(); if (old && old !== n.base && old !== n.photo) dropImage(old); toastr.info(`외형 근거: ${st.lastNpcSrc}`); } catch (e) { toastr.error('생성 실패: ' + (e.message || e)); }
        ui.status(''); return renderModal();
      }
      /* 개발자 */
      case 'dev-force': { if (!st.turn) return toastr.info('먼저 장면을 하나 열어 주세요.'); ui.q('#vn-modal').classList.add('vn-off'); evtNote('개발자: 현재 장면으로 강제 실행'); return manualEvent(); }
      case 'dev-sample': { const u = (await spriteFor(ch, 'neutral', outfitOf(ch))).url; if (!u) return toastr.info('보여 줄 이미지가 없어요.'); ui.q('#vn-modal').classList.add('vn-off'); return openEvent({ id: 'dev', url: u, title: '샘플 이벤트', caption: '이 화면이 이벤트 씬 연출이에요 (개발자 미리보기)', from: '' }); }
      case 'dev-preview': { const u = $q('#vn-devimg', ui.root).value; if (!u) return toastr.info('이미지를 골라 주세요.'); ui.q('#vn-modal').classList.add('vn-off'); return openEvent({ id: 'dev', url: u, title: '미리보기', caption: u, from: '' }); }
      case 'usage-reset': S().usage = { text: 0, image: 0, video: 0, r429: 0 }; usageLog.length = 0; saveSettings(); ui.usagePill(); return renderModal();
      case 'of-wear': meta.outfit[ch.name] = ofName; saveMeta(); return refresh();
      case 'of-def': cd.def = ofName; saveSettings(); return renderModal();
      case 'of-del': if (!confirm(`'${ofName}' 의상을 삭제할까요? (서버의 이미지 파일은 남아요)`)) return; { const o = cd.outfits[ofName], urls = [o?.base, ...Object.values(o?.emo || {})]; delete cd.outfits[ofName]; if (cd.def === ofName) cd.def = ''; if (meta.outfit[ch.name] === ofName) delete meta.outfit[ch.name]; saveSettings(); saveMeta(); urls.forEach(dropImage); return refresh(); }
      case 'emo-del': { const old = cd.outfits[ofName]?.emo?.[el.dataset.l]; delete cd.outfits[ofName]?.emo?.[el.dataset.l]; saveSettings(); dropImage(old); return refresh(); }
      case 'of-genset': {
        if (!s.geminiKey.trim()) return toastr.warning('이미지 API 키를 먼저 넣어 주세요.');
        const list = el.dataset.n === '1' ? ['neutral'] : enabledEmos(ch);
        const have = cd.outfits[ofName]?.emo || {}, need = [...new Set(['neutral', ...list])].filter((e) => !have[e]).length;
        if (!need) return toastr.info('만들 표정이 없어요. 위에서 사용할 표정을 고르면 여기에 장수가 표시돼요.');
        if (!confirm(`${ch.name} · ${ofName}: 이미지 ${need}장을 AI로 만들까요?\\n${need}회 요금이 발생하고, 429를 피하려고 ${s.imgGapSec}초 간격으로 한 장씩 보내 약 ${Math.ceil(need * (s.imgGapSec + 12) / 60)}분 걸려요. 만든 이미지는 계속 재사용돼요.`)) return;
        return runGenSet(ch, ofName, list);
      }
      case 'emo-regen': {
        if (!s.geminiKey.trim()) return toastr.warning('이미지 API 키를 먼저 넣어 주세요.');
        if (!confirm(`'${el.dataset.l}' 표정을 새로 만들까요? (이미지 1회 요금)`)) return;
        ui.status('표정을 다시 만드는 중…');
        try { const url = await genSpriteImage(ch, ofName, el.dataset.l); const o = cd.outfits[ofName], old = o.emo?.[el.dataset.l]; (o.emo ||= {})[el.dataset.l] = url; if (el.dataset.l === 'neutral') o.base = url; saveSettings(); dropImage(old); } catch (e) { toastr.error('생성 실패: ' + (e.message || e)); }
        ui.status(''); return refresh();
      }
      case 'look-copy': { const v = String(ssSet()?.appearance?.[ch.name]?.t || '').trim(); if (v) { cd.look = v; saveSettings(); toastr.success('장면 생성기 태그를 복사했어요'); } return renderModal(); }
      case 'style-save': {
        const n = ($q('#vn-style-name', ui.root).value || '').trim(); if (!n) return toastr.info('프리셋 이름을 적어 주세요.');
        const ex = s.stylePresets.find((p) => p.name === n); if (ex) ex.text = s.cgStyle; else s.stylePresets.push({ id: uid(), name: n, text: s.cgStyle });
        s.stylePreset = (s.stylePresets.find((p) => p.name === n) || {}).id; saveSettings(); toastr.success('화풍 프리셋을 저장했어요'); return renderModal();
      }
      case 'style-del': { const p = s.stylePresets.find((x) => x.id === s.stylePreset); if (!p) return toastr.info('삭제할 프리셋을 먼저 고르세요.'); s.stylePresets = s.stylePresets.filter((x) => x.id !== p.id); s.stylePreset = 'custom'; saveSettings(); return renderModal(); }
      case 'look-ai': {
        el.disabled = true; ui.status('외형 태그를 뽑는 중…');
        try { const v = await extractLook(ch); if (v) { cd.look = v; saveSettings(); toastr.success('외형 태그를 저장했어요'); } else toastr.warning('모델이 쓸 수 있는 태그를 주지 않았어요. 다른 모델로 다시 시도하거나 직접 적어 주세요.'); renderModal(); }
        catch (e) { toastr.error('외형 추출 실패: ' + (e.message || e)); } finally { el.disabled = false; ui.status(''); }
        return;
      }
      case 'pl-addform': st.plAdd = !st.plAdd; st.plName = st.plDesc = ''; st.plSrc = 'none'; st.plAddImg = ''; return renderModal();
      case 'pl-addcancel': st.plAdd = false; return renderModal();
      case 'pl-addpick': { st.plName = $q('#vn-pl-name', ui.root)?.value || st.plName; st.plDesc = $q('#vn-pl-desc', ui.root)?.value || st.plDesc; st.plAddImg = el.dataset.u; return renderModal(); }
      case 'pl-addgo': {
        const name = ($q('#vn-pl-name', ui.root).value || '').trim(), desc = $q('#vn-pl-desc', ui.root).value || '', srcv = st.plSrc || 'none';
        if (!name) return toastr.info('장소 이름을 먼저 적어 주세요.');
        const k = pk(name); if (placesOf()[k]) return toastr.info('이미 있는 장소예요.');
        let url = '', user = false;
        try {
          if (srcv === 'upload') { const f = $q('#vn-pl-file', ui.root)?.files?.[0]; if (!f) return toastr.info('올릴 이미지를 선택해 주세요.'); ui.status('이미지를 올리는 중…'); url = await uploadImage(f, 2000); user = true; ui.status(''); }
          else if (srcv === 'ss') { url = st.plAddImg; if (!url) return toastr.info('불러올 이미지를 골라 주세요.'); user = true; }
          else if (srcv === 'gen') { if (!s.geminiKey.trim()) return toastr.warning('이미지 API 키를 먼저 넣어 주세요.'); }
        } catch (e) { ui.status(''); return toastr.error('업로드 실패: ' + (e.message || e)); }
        placesOf()[k] = { name, url, desc, user }; saveSettings();
        if (srcv === 'gen') { if (confirm('배경 이미지를 지금 생성할까요? (이미지 요금이 발생해요)')) await generatePlace(name, true); else toastr.info('장소는 목록에 남겨 뒀어요. 나중에 "배경 생성"을 누르면 돼요.'); }
        st.plAdd = false; return renderModal();
      }
      case 'pl-ssopen': st.plPickFor = st.plPickFor === plKey ? '' : plKey; return renderModal();
      case 'pl-ssset': { const p = plEnsure(plKey, el.closest('[data-k]')?.dataset.n); p.url = el.dataset.u; p.user = true; saveSettings(); if (pk(meta.loc) === plKey) ui.setBg(p.url, p.name); st.plPickFor = ''; return renderModal(); }
      case 'pl-gen': { if (!s.geminiKey.trim()) return toastr.warning('이미지 API 키를 먼저 넣어 주세요.'); const nm = el.closest('[data-k]')?.dataset.n || placesOf()[plKey]?.name || plKey; if (!confirm('이 장소의 배경을 새로 생성할까요? (이미지 요금이 발생해요)')) return; el.disabled = true; await generatePlace(nm, true); if (pk(meta.loc) === plKey) applyBg(nm); return renderModal(); }
      case 'pl-del': { if (!confirm('이 장소를 삭제할까요?')) return; const old = placesOf()[plKey]?.url; delete placesOf()[plKey]; saveSettings(); dropImage(old); return renderModal(); }
      case 'gal-del': { const id = el.closest('[data-id]').dataset.id, gone = meta.gallery.find((e) => e.id === id); meta.gallery = meta.gallery.filter((e) => e.id !== id); saveMeta(); dropImage(gone?.url); dropImage(gone?.video); return renderModal(); }
      case 'clean-scan': {
        el.disabled = true; ui.status('저장된 이미지를 확인하는 중…');
        const files = await listVnImages(); ui.status(''); el.disabled = false;
        if (!files) return toastr.warning('이 서버에서는 이미지 목록을 가져올 수 없어요. 확장 폴더(user/images/vnstudio)를 직접 확인해 주세요.');
        const refs = allImageRefs(), orphans = files.filter((f) => /^(vngen_|vncut_)/.test(f.split('/').pop()) && !refs.has('/user/images/vnstudio/' + f.split('/').pop()));
        if (!orphans.length) return toastr.success(`전체 ${files.length}개 중 지울 미사용 표정·NPC 이미지는 없어요.`);
        if (!confirm(`vnstudio 폴더에 이미지 ${files.length}개가 있고, 그중 어디에도 쓰이지 않는 표정·NPC 이미지가 ${orphans.length}개예요.\n지울까요? (이벤트 CG와 영상은 다른 채팅에서 쓰일 수 있어 건드리지 않아요)`)) return;
        let n = 0; const old = S().deleteFiles; S().deleteFiles = true;
        for (const f of orphans) { if (await dropImage('/user/images/vnstudio/' + f.split('/').pop())) n++; }
        S().deleteFiles = old; return toastr.success(`${n}개를 지웠어요`);
      }
      case 'show-prompt': return alert(injectText() || '(지시문이 꺼져 있어요)');
      case 'reset-aff': if (!confirm('이 채팅의 호감도를 모두 0으로 되돌릴까요?')) return; meta.aff = {}; meta.applied = {}; meta.heartDone = {}; saveMeta(); return ui.hud(st.turn);
      /* 공략집 */
      case 'analyze': {
        el.disabled = true; ui.status('채팅 기록을 분석하는 중…');
        try { await analyzeHistory(ch, true); if (S().analyzePlaces) { ui.status('장소·마커를 분석하는 중…'); await analyzeWorldVN(); } toastr.success('공략집을 갱신했어요'); ui.hud(st.turn); refreshInject(); } catch (e) { toastr.error('분석 실패: ' + (e.message || e)); }
        ui.status(''); return renderModal();
      }
      case 'fact-add': { const l = $q('#vn-fl', ui.root).value.trim().slice(0, 14), v = $q('#vn-fv', ui.root).value.trim().slice(0, 90); if (!l || !v) return; addFact(ch.name, l, v, false); return renderModal(); }
      case 'fact-del': delete dossierOf(ch.name).facts[el.dataset.l]; saveMeta(); return renderModal();
      /* 일정 */
      case 'sched-rand': { const ids = ACTS.filter((a) => a.id !== 'meet').map((a) => a.id); meta.sched[day] = SLOTS.map(() => ids[Math.floor(Math.random() * ids.length)]); saveMeta(); return renderModal(); }
      case 'sched-clear': delete meta.sched[day]; saveMeta(); return renderModal();
      case 'plan-redo': if (!confirm('이 날의 계획과 미리 만든 장면을 지우고 다시 만들까요? (모델 호출이 다시 필요해요)')) return; delete meta.plans[day]; for (const k of Object.keys(meta.nodes)) if (k.startsWith(day + ':')) delete meta.nodes[k]; saveMeta(); if (day === meta.day && meta.mode === 'daily') { st.turn = null; } return renderModal();
      case 'sched-go': { ui.q('#vn-modal').classList.add('vn-off'); if (meta.mode !== 'daily') { meta.mode = 'daily'; saveMeta(); st.turn = null; ui.hud(null); return playSlot(); } if (!st.turn) return playSlot(); return; }
      /* 캘린더 */
      case 'cal-evdel': { const c = meta.cal[el.dataset.day]; if (c?.events) c.events.splice(+el.dataset.idx, 1); saveMeta(); return renderModal(); }
      case 'cal-daydel': { if (!confirm('이 날의 캘린더 기록(진행한 장면·선택·저장된 계획)을 지울까요? 되돌릴 수 없어요.')) return; delete meta.cal[el.dataset.day]; saveMeta(); return renderModal(); }
      case 'cal-clearall': { if (!confirm(`캘린더에 저장된 ${Object.keys(meta.cal).length}일치 기록을 모두 지울까요? 되돌릴 수 없어요.`)) return; meta.cal = {}; saveMeta(); return renderModal(); }
      case 'chatevt-del': meta.chatEvents.splice(+el.dataset.i, 1); saveMeta(); return renderModal();
      case 'chatevt-clear': { if (!confirm('채팅 모드 이벤트 기록을 모두 지울까요?')) return; meta.chatEvents = []; saveMeta(); return renderModal(); }
      case 'cal-sel': st.calSel = +el.dataset.day; return renderModal();
      case 'cal-prev': case 'cal-next': { const [Y, Mo] = st.calMonth.split('-').map(Number), d = new Date(Date.UTC(Y, Mo - 1 + (act === 'cal-next' ? 1 : -1), 1)); st.calMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; return renderModal(); }
      case 'anniv-add': { const n = $q('#vn-an', ui.root).value.trim(), md = $q('#vn-amd', ui.root).value.trim(); if (!n || !/^\d{1,2}-\d{1,2}$/.test(md)) return toastr.info('이름과 월-일(예: 03-14)을 적어 주세요.'); meta.annivs.push({ name: n.slice(0, 30), md: md.split('-').map((x) => x.padStart(2, '0')).join('-') }); saveMeta(); return renderModal(); }
      case 'anniv-del': meta.annivs.splice(+el.dataset.i, 1); saveMeta(); return renderModal();
      /* 지도 */
      case 'map-pick': if (Date.now() - (st.dragAt || 0) < 250) return; st.mapSel = el.dataset.name; return renderModal();
      case 'map-add': {
        const w = ssWorld(); if (!w) return;
        const n = $q('#vn-newmp', ui.root).value.trim(); if (!n) return toastr.info('장소 이름을 먼저 적어 주세요.');
        if (w.places.some((p) => p.name === n)) return toastr.info('이미 있는 장소예요.');
        const p = { id: uid(), name: n, aliases: [], kind: $q('#vn-newmk', ui.root).value || 'other', x: null, y: null, parent: st.mapScope === 'world' ? null : st.mapScope, desc: '', visual: '' };
        w.places.push(p); autoLayoutPlaces(); saveMeta(); st.mapSel = n; return renderModal();
      }
      case 'map-analyze': { el.disabled = true; ui.status('장소·마커를 분석하는 중…'); try { await analyzeWorldVN(); } catch (e) { toastr.error('분석 실패: ' + (e.message || e)); } ui.status(''); return renderModal(); }
      case 'map-zin': mapZoom(1); return;
      case 'map-zout': mapZoom(-1); return;
      case 'map-zreset': st.mapCam = null; applyMapCam(); return;
      case 'mk-tip': {
        if (Date.now() - (st.dragAt || 0) < 250) return;
        const on = el.classList.contains('show');
        el.closest('.vn-map')?.querySelectorAll('.vn-mk.show').forEach((x) => x.classList.remove('show'));
        if (!on) el.classList.add('show');
        return;
      }
      case 'mh-use': {
        const e = mapHist().find((x) => x.id === el.closest('[data-id]')?.dataset.id); if (!e) return;
        let w; try { w = ensureWorld(); } catch (er) { return toastr.error(er.message || er); }
        const sc = (e.scope === 'world' || placeById(e.scope)) ? e.scope : st.mapScope, old = w.maps?.[sc];
        if (old?.url && old.url !== e.url) pushMapHist(old.url, sc, old.ratio, mapKind(old));
        (w.maps ||= {})[sc] = { url: e.url, ratio: e.ratio || 1, ...(e.kind === 'ai' ? { ai: true } : e.kind === 'user' ? { user: true } : {}) };
        e.scope = sc; saveMeta();
        toastr.success(`'${sc === 'world' ? '세계' : (placeById(sc)?.name || '')}' 지도를 이 이미지로 바꿨어요.`); return renderModal();
      }
      case 'mh-del': {
        const h = mapHist(), e = h.find((x) => x.id === el.closest('[data-id]')?.dataset.id); if (!e) return;
        if (!confirm('이 지도 이미지를 목록에서 지울까요? (서버 파일도 지워요)')) return;
        h.splice(h.indexOf(e), 1); saveMeta(); dropImage(e.url); return renderModal();
      }
      case 'pl-clear': {
        const p = placesOf()[plKey]; if (!p) return;
        if (!confirm('이 장소의 배경 이미지를 비울까요? (장소는 지도에 그대로 남아요)')) return;
        const old = p.url; p.url = ''; p.user = false; saveSettings(); dropImage(old);
        if (pk(meta.loc) === plKey) applyBg(p.name); return renderModal();
      }
      case 'pl-genall': {
        if (!s.geminiKey.trim()) return toastr.warning('이미지 API 키를 먼저 넣어 주세요.');
        const todo = placeRows().filter((r) => !bgFor(r.name));
        if (!todo.length) return toastr.info('이미지가 없는 장소가 없어요.');
        if (!confirm(`이미지가 없는 장소 ${todo.length}곳의 배경을 만들까요?\n이미지 ${todo.length}회 요금이 발생하고, ${s.imgGapSec}초 간격으로 한 장씩 보내 약 ${Math.ceil(todo.length * (s.imgGapSec + 12) / 60)}분 걸려요.\n(진행 중 위쪽 \"중지\" 버튼으로 멈출 수 있어요)`)) return;
        st.genBusy = true; st.genStop = false; ui.root?.classList.add('gen-busy');
        let ok = 0, miss = 0;
        try {
          for (let i = 0; i < todo.length && !st.genStop && miss < 3; i++) {
            ui.status(`배경 생성 ${i + 1}/${todo.length} · ${todo[i].name}`, true);
            if (await generatePlace(todo[i].name, true)) { ok++; miss = 0; } else miss++;
          }
          toastr[ok ? 'success' : 'warning'](`배경 ${ok}장을 만들었어요${st.genStop ? ' (중지됨)' : miss >= 3 ? ' (연속 실패로 멈췄어요)' : ''}`);
        } finally { st.genBusy = false; st.genStop = false; ui.root?.classList.remove('gen-busy'); ui.status(''); if (meta.loc) applyBg(meta.loc); }
        return renderModal();
      }
      case 'map-gen': {
        const w = ssWorld(); if (!w) return;
        if (!s.geminiKey.trim()) return toastr.warning('이미지 API 키를 먼저 넣어 주세요.');
        const scope = st.mapScope, old = w.maps?.[scope], nm = scope === 'world' ? '세계' : (placeById(scope)?.name || '');
        if (!confirm(`'${nm}' 지도 이미지를 ${old ? '새로 ' : ''}생성할까요? (이미지 1회 요금)${old ? '\n이전 지도 이미지는 배경 탭의 "지도 이미지"에 남아요.' : ''}`)) return;
        el.disabled = true; ui.status('지도 이미지를 그리는 중… ' + nm);
        try { await generateMapVN(scope); toastr.success('지도 이미지를 만들었어요. 그림과 핀이 어긋나면 핀을 끌어서 맞춰 주세요.'); } catch (e) { toastr.error('지도 생성 실패: ' + (e.message || e)); }
        ui.status(''); return renderModal();
      }
      case 'npc-locate': {
        el.disabled = true; ui.status('NPC 위치를 찾는 중…');
        try { const n = await locateNpcsVN(); toastr[n ? 'success' : 'info'](n ? `NPC ${n}명의 위치를 정했어요. 틀린 곳은 직접 바꿔 주세요.` : '새로 정할 NPC 위치가 없어요.'); } catch (e) { toastr.error('실패: ' + (e.message || e)); }
        ui.status(''); return renderModal();
      }
      case 'marker-del': { const w = ssWorld(); if (w?.markers) { w.markers = w.markers.filter((m) => m.id !== el.dataset.id); saveMeta(); } return renderModal(); }
      case 'map-flat': { const n = flattenPlaces(); autoLayoutPlaces(); saveMeta(); toastr.success(n ? `${n}개 장소를 건물 바로 아래로 옮겨 내부 지도를 합쳤어요. 새 위치를 확인해 주세요.` : '합칠 내부 지도가 없어요. 이미 정리돼 있어요.'); return renderModal(); }
      case 'map-img-del': { const w = ssWorld(); if (!w?.maps) return; if (!confirm('이 지도 이미지를 제거할까요? (장소는 그대로 남아요)')) return; const o = w.maps[st.mapScope]; if (o?.url) pushMapHist(o.url, st.mapScope, o.ratio, mapKind(o)); delete w.maps[st.mapScope]; saveMeta(); return renderModal(); }
      case 'map-addcancel': st.mapAdd = ''; return renderModal();
      case 'map-del': { const w = ssWorld(), p = w?.places.find((x) => x.name === st.mapSel); if (!p) return; if (!confirm(`'${p.name}' 장소를 삭제할까요?\n장면 생성기의 장소 목록에서도 사라져요. (만들어 둔 이미지는 남아요)`)) return; w.places = w.places.filter((x) => x !== p); w.places.forEach((c) => { if (c.parent === p.id) c.parent = null; }); if (Array.isArray(w.markers)) w.markers = w.markers.filter((m) => m.place !== p.id); autoLayoutPlaces(); saveMeta(); st.mapSel = ''; return renderModal(); }
      case 'map-go': { const n = st.mapSel; if (!n) return; meta.loc = n; saveMeta(); ui.hud(st.turn); applyBg(n); ui.q('#vn-modal').classList.add('vn-off'); return; }
      case 'map-wish': meta.wish = st.mapSel; saveMeta(); return toastr.success(`다음 하루 계획에서 '${st.mapSel}'에서 만나도록 요청해요.`);
      case 'map-regen': {
        const n = st.mapSel; if (!n) return;
        if (!s.geminiKey.trim()) return toastr.warning('이미지 API 키를 먼저 넣어 주세요.');
        if (!confirm(`'${n}' 배경을 ${bgFor(n) ? '새로 ' : ''}생성할까요? (이미지 1회 요금)`)) return;
        await generatePlace(n, true); if (pk(meta.loc) === pk(n)) applyBg(n); return renderModal();
      }
      default:
    }
  }
  async function modalChange(el) {
    const act = el.dataset.act, s = S(), meta = M();
    const ch = selChar(), cd = ch ? cdata(ch) : null;
    if (act === 'pl-src') { st.plName = $q('#vn-pl-name', ui.root)?.value || ''; st.plDesc = $q('#vn-pl-desc', ui.root)?.value || ''; st.plSrc = el.value; return renderModal(); }
    if (act === 'sel-char') { st.selChar = el.value; return renderModal(); }
    if (act === 'style-sel') { s.stylePreset = el.value; const p = s.stylePresets.find((x) => x.id === el.value); if (p) s.cgStyle = p.text; saveSettings(); return renderModal(); }
    if (act === 'sched-day') { st.schedDay = +el.value; return renderModal(); }
    if (act === 'sched-set') { const d = +el.dataset.day || st.calSel || meta.day; (meta.sched[d] ||= []); meta.sched[d][+el.dataset.slot] = el.value; saveMeta(); return; }
    if (act === 'wish') { meta.wish = el.value; saveMeta(); return; }
    if (act === 'start-date') { if (el.value) { meta.startDate = el.value; saveMeta(); renderModal(); } return; }
    if (act === 'map-scope') { st.mapScope = el.value; st.mapSel = ''; return renderModal(); }
    if (act === 'map-field') {
      const p = placeById(el.dataset.id); if (!p) return; const f = el.dataset.f;
      if (f === 'aliases') p.aliases = el.value.split(',').map((x) => x.trim()).filter(Boolean); else p[f] = f === 'name' ? (el.value.trim() || p.name) : el.value;
      if (f === 'name') st.mapSel = p.name; saveMeta(); if (f === 'name') renderModal(); return;
    }
    if (act === 'map-mkf') { st.mapMk = el.value; return renderModal(); }
    if (act === 'npc-place') { setNpcPlace(el.dataset.name, el.value); return renderModal(); }
    if (act === 'marker-place') { const m = (ssWorld()?.markers || []).find((x) => x.id === el.dataset.id); if (m) { m.place = el.value; saveMeta(); } return renderModal(); }
    if (act === 'map-kind') { const p = placeById(el.dataset.id); if (p) { p.kind = el.value; saveMeta(); } return; }
    if (act === 'map-parent') { const p = placeById(el.dataset.id); if (!p) return; p.parent = el.value || null; p.x = null; p.y = null; st.mapScope = p.parent || 'world'; autoLayoutPlaces(); saveMeta(); return renderModal(); }
    if (act === 'map-img-up') {
      const w = ssWorld(), f = el.files?.[0]; if (!w || !f) return; ui.status('지도 이미지를 올리는 중…');
      try {
        const url = await uploadImage(f, 2000), dim = await new Promise((ok) => { const im = new Image(); im.onload = () => ok(im.width / Math.max(1, im.height)); im.onerror = () => ok(1); im.src = url; });
        const old = (w.maps ||= {})[st.mapScope], ratio = +dim.toFixed(3) || 1; if (old?.url) pushMapHist(old.url, st.mapScope, old.ratio, mapKind(old)); w.maps[st.mapScope] = { url, ratio, user: true }; pushMapHist(url, st.mapScope, ratio, 'user'); saveMeta();
      } catch (e) { toastr.error('업로드 실패: ' + (e.message || e)); }
      ui.status(''); el.value = ''; return renderModal();
    }
    if (act === 'map-rename') { const w = ssWorld(), p = w?.places.find((x) => x.id === el.dataset.id); if (p && el.value.trim()) { p.name = el.value.trim(); st.mapSel = p.name; saveMeta(); renderModal(); } return; }
    if (act === 'npc-field') { const n = npcByName(st.npcSel); if (n) { const f = el.dataset.f; const v = el.value.trim(); if (f === 'name' && v && v !== n.name) { const mk = npcMarker(n.name); if (mk) mk.name = v; st.npcSel = v; } if (f === 'name' ? v : true) n[f] = f === 'name' ? v : el.value; saveMeta(); if (f === 'name') renderModal(); if (f === 'faces') ui.refreshNpcFlip(); if (f === 'look') { n.lookSrc = String(n.look || '').trim() ? 'manual' : ''; saveMeta(); } } return; }
    if (act === 'dos-up') { if (el.files?.[0] && cd) { ui.status('이미지를 올리는 중…'); try { cd.profile = await uploadImage(el.files[0]); saveSettings(); } catch (e) { toastr.error('업로드 실패: ' + (e.message || e)); } ui.status(''); el.value = ''; renderModal(); } return; }
    if (act === 'npc-up') { const n = npcByName(st.npcSel); if (n && el.files?.[0]) { ui.status('이미지를 올리는 중…'); try { const o1 = n.img, o2 = n.base, u = await uploadImage(el.files[0]); n.img = n.base = u; n.imgAi = false; delete n.lookPhoto; if (n.lookSrc === 'photo') { n.look = ''; delete n.lookSrc; } saveMeta(); dropImage(o1); if (o2 !== o1) dropImage(o2); } catch (e) { toastr.error('업로드 실패: ' + (e.message || e)); } ui.status(''); el.value = ''; renderModal(); } return; }
    if (act === 'of-desc') { const n = el.closest('[data-of]').dataset.of; cd.outfits[n].desc = el.value; saveSettings(); return; }
    if (el.id === 'vn-look') { cd.look = el.value; saveSettings(); return; }
    if (act === 'pl-desc') { const sec = el.closest('[data-k]'); plEnsure(sec.dataset.k, sec.dataset.n).desc = el.value; saveSettings(); return; }
    const files = [...(el.files || [])]; if (!files.length) return;
    const ofName = el.dataset.of, plKey = el.closest('[data-k]')?.dataset.k;
    try {
      ui.status('이미지를 올리는 중…');
      if (act === 'up-base') cd.outfits[ofName].base = await uploadImage(files[0]);
      else if (act === 'up-emo') {
        const avail = availEmos(ch), emo = (cd.outfits[ofName].emo ||= {}), bad = [];
        for (const f of files) {
          const label = f.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/-\d+$/, '');
          const n = normEmo(label, avail); if (!n) bad.push(label);
          emo[n || label] = await uploadImage(f);
        }
        if (bad.length) toastr.info(`인식하지 못한 표정 이름도 그대로 저장했어요: ${bad.join(', ')}`);
      } else if (act === 'pl-up') { placesOf()[plKey] = { name: el.closest('[data-k]')?.dataset.n || plKey, ...placesOf()[plKey], url: await uploadImage(files[0], 2000), user: true }; if (pk(meta.loc) === plKey) ui.setBg(placesOf()[plKey].url, placesOf()[plKey].name); }
      saveSettings();
    } catch (e) { toastr.error('업로드 실패: ' + (e.message || e)); }
    finally { ui.status(''); el.value = ''; renderModal(); if (st.turn?.ch) ui.setSprite(st.turn.ch, st.turn.emo, outfitOf(st.turn.ch)); }
  }

  /* ================= 열기/닫기 · 이벤트 연결 ================= */
  function openVN() {
    if (!S().enabled) { toastr.info('VN Studio가 꺼져 있어요. 확장 프로그램 설정에서 켜 주세요.'); return; }
    ui.open(); ui.hud(null);
    const cm = M().mode === 'chat', idx = cm ? lastStoryIndex() : -1, latest = idx >= 0 ? (ctx().chat || [])[idx] : null;
    if (cm && st.deferred && st.deferred.id === idx) { const d = st.deferred; st.deferred = null; showWaiting(false); playTurn(d); }      // 창을 닫은 사이에 온 새 답변
    else if (cm && st.turn && !(st.turn.src === 'chat' && st.turn.id === idx && st.turn.hash === hash(latest?.mes))) { showWaiting(false); replayLast(); }   // 보던 장면이 최신이 아니면 최신으로 맞춘다
    else if (st.turn) { showWaiting(false); ui.hud(st.turn); showEnd(st.turn); } else replayLast();
    requestAnimationFrame(() => { ui.fit?.(); nudgeLayout(); });
    setTimeout(() => { onboardSprites().then(autoAnalyze).catch((e) => console.warn('[VN]', e)); }, 800);
  }
  function bindUI() {
    const root = ui.root;
    // 창 크기에 맞춰 레이아웃을 자동으로 줄인다 (최대화하지 않은 작은 창에서도 화면이 보이게)
    const fit = () => { const r = ui.q('#vn-stage').getBoundingClientRect(); if (!r.width || !r.height) return;      // 창이 숨겨진 동안은 다시 재지 않는다
      root.dataset.size = (r.height < 520 || r.width < 520) ? 'xs' : (r.height < 700 || r.width < 760) ? 'sm' : 'md'; scrollText(); };
    if (window.ResizeObserver) { new ResizeObserver(fit).observe(ui.q('#vn-stage')); new ResizeObserver(() => { if (st.stick) ui.q('#vn-text').scrollTop = ui.q('#vn-text').scrollHeight; }).observe(ui.q('#vn-box')); }
    window.addEventListener('resize', fit); fit(); ui.fit = fit;
    const sprOut = () => { const pp = ui.q('#vn-sprpop'); $$('label', pp).forEach((l) => { const i = l.querySelector('input'), o = l.querySelector('output'); if (i && o) { const k = i.dataset.vk; o.textContent = k === 'textH' && +i.value === 0 ? '자동' : i.value + (['spriteScale', 'choiceFs', 'choiceFsMin', 'npcScale', 'npcGap'].includes(k) ? '%' : (['textH', 'minTextH'].includes(k) ? 'px' : '')); } }); };
    ui.q('#vn-sprpop').addEventListener('input', sprOut);
    ui.q('#vn-stage').addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.altKey) return; e.preventDefault(); const s = S(); s.spriteScale = clamp((+s.spriteScale || 100) + (e.deltaY < 0 ? 5 : -5), 40, 170); saveSettings(); ui.applyLook(); }, { passive: false });   // Ctrl+휠: 캐릭터 크기
    // 효과 패널 끌어서 옮기기 (마우스를 올리면 오른쪽 위에 나타나는 손잡이)
    const hh = ui.q('.vn-hp-drag');
    hh.addEventListener('pointerdown', (e) => {
      e.preventDefault(); hh.setPointerCapture?.(e.pointerId);
      const pn = ui.q('#vn-htmlpanel'), r = pn.getBoundingClientRect(), sr = ui.q('#vn-stage').getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mv = (ev) => { const x = clamp(ev.clientX - dx - sr.left, 0, sr.width - 60), y = clamp(ev.clientY - dy - sr.top, 0, sr.height - 40); pn.style.left = x + 'px'; pn.style.top = y + 'px'; pn.style.right = 'auto'; S().htmlPos = { x: Math.round(x), y: Math.round(y) }; };
      const up = () => { hh.removeEventListener('pointermove', mv); hh.removeEventListener('pointerup', up); saveSettings(); };
      hh.addEventListener('pointermove', mv); hh.addEventListener('pointerup', up);
    });
    // 글상자 높이 조절 (손잡이를 끌면 캐릭터 이미지가 가려지지 않게 줄일 수 있어요)
    const rz = ui.q('#vn-resize');
    rz.addEventListener('pointerdown', (e) => {
      e.preventDefault(); rz.setPointerCapture?.(e.pointerId);
      const tx = ui.q('#vn-text'), y0 = e.clientY, h0 = tx.getBoundingClientRect().height, maxH = ui.q('#vn-stage').getBoundingClientRect().height * 0.78;
      const mv = (ev) => { const h = clamp(h0 + (y0 - ev.clientY), 56, maxH); const s = S(); s.textH = Math.round(h); ui.applyLook(); scrollText(); };
      const up = () => { rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); saveSettings(); };
      rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up);
    });
    rz.addEventListener('dblclick', () => { S().textH = 0; saveSettings(); ui.applyLook(); scrollText(); });
    // 기록 패널 너비 조절
    const lz = ui.q('#vn-lp-resize');
    lz.addEventListener('pointerdown', (e) => {
      e.preventDefault(); lz.setPointerCapture?.(e.pointerId);
      const panel = ui.q('#vn-logpanel'), x0 = e.clientX, w0 = panel.getBoundingClientRect().width, left = root.classList.contains('lp-left'), maxW = ui.q('#vn-stage').getBoundingClientRect().width * 0.9;
      const mv = (ev) => { const dx = ev.clientX - x0, w = clamp(w0 + (left ? dx : -dx), 260, maxW); S().lpWidth = Math.round(w); ui.applyLook(); };
      const up = () => { lz.removeEventListener('pointermove', mv); lz.removeEventListener('pointerup', up); saveSettings(); };
      lz.addEventListener('pointermove', mv); lz.addEventListener('pointerup', up);
    });
    lz.addEventListener('dblclick', () => { S().lpWidth = 0; saveSettings(); ui.applyLook(); });
    ui.q('#vn-text').addEventListener('scroll', (e) => { const el = e.target; st.stick = el.scrollHeight - el.scrollTop - el.clientHeight < 36; el.classList.toggle('scrolled', el.scrollTop > 6); }, { passive: true });
    root.addEventListener('click', (e) => {
      const t = e.target;
      const choice = t.closest('.vn-choice'); if (choice) return pickChoice(+choice.dataset.i);
      const tab = t.closest('[data-tab]'); if (tab) { st.tab = tab.dataset.tab; return renderModal(); }
      const lp = t.closest('[data-lp]'); if (lp) { st.lpTab = lp.dataset.lp; return renderLogPanel(); }
      if (t.closest('#vn-lightbox')) { ui.q('#vn-lightbox').classList.add('vn-off'); return; }
      const a = t.closest('[data-act]');
      if (a && a.tagName !== 'INPUT') {
        const act = a.dataset.act;
        if (act === 'close') return ui.close();
        if (act === 'modal') return openModal();
        if (act === 'dos') return openModal('dossier');
        if (act === 'sched') return openModal('cal');
        if (act === 'modal-close') return ui.q('#vn-modal').classList.add('vn-off');
        if (act === 'hide') { root.classList.toggle('vn-uihide'); return; }
        if (act === 'log') return toggleLog();
        if (act === 'spr') { const pp = ui.q('#vn-sprpop'); pp.classList.toggle('vn-off'); if (!pp.classList.contains('vn-off')) { fillInputs(pp); sprOut(); } return; }
        if (act === 'spr-close') return ui.q('#vn-sprpop').classList.add('vn-off');
        if (act === 'spr-reset') { Object.assign(S(), { spriteScale: 100, spriteY: 0, npcGap: 26, npcScale: 100, npcY: 0, textH: 0, minTextH: 150, choiceFs: 90, choiceFsMin: 78 }); saveSettings(); ui.applyLook(); fillInputs(ui.q('#vn-sprpop')); sprOut(); return; }
        if (act === 'html') { if (htmlPanelOpen()) return closeHtmlPanel(); return openHtmlPanel(st.turn); }
        if (act === 'html-close') return closeHtmlPanel();
        if (act === 'collapse') { const b = ui.q('#vn-box'); b.classList.toggle('min'); a.firstElementChild.className = b.classList.contains('min') ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'; return; }
        if (act === 'cancel-wait') return cancelWait();
        if (act === 'txt-up' || act === 'txt-down') { const x = ui.q('#vn-text'); x.scrollBy({ top: (act === 'txt-up' ? -1 : 1) * Math.max(40, x.clientHeight * 0.8), behavior: 'smooth' }); st.stick = false; setTimeout(() => { st.stick = x.scrollHeight - x.scrollTop - x.clientHeight < 36; }, 400); return; }
        if (act === 'txt-end') { scrollText(true); return; }
        if (act === 'logside') { const s = S(); s.logSide = s.logSide === 'left' ? 'right' : 'left'; saveSettings(); ui.applyLook(); return; }
        if (act === 'usage') return openModal('usage');
        if (act === 'mode') return toggleMode();
        if (act === 'send') { const i = ui.q('#vn-in'); const v = i.value; i.value = ''; return submitText(v); }
        if (act === 'next-slot') return nextSlot();
        if (act === 'retry') return M().mode === 'daily' ? playSlot(true) : replayLast();
        if (act === 'make-evt') return manualEvent();
        if (act === 'ev-close') return closeEvent();
        if (act === 'ev-text') { const s = S(); s.evText = s.evText === false; saveSettings(); ui.q('#vn-event').classList.toggle('hide-cap', s.evText === false); a.textContent = s.evText === false ? trMsg('글씨 켜기') : trMsg('글씨 끄기'); return; }
        if (act === 'ev-video') { const en = st.viewEvt; if (!en) return; return makeVideo(en).then((v) => { if (v && st.viewEvt === en) renderEvent(en); }); }
        if (act === 'cancel-vid') {
          if (st.genBusy) { st.genStop = true; ui.status('중지하는 중… (진행 중인 한 장은 끝까지 기다려요)'); return; }
          if (vid.abort && confirm('영상 생성을 취소할까요?\n이미 Google에 요청이 들어갔다면 서버에서는 계속 진행돼 요금이 나올 수 있어요.')) vid.abort.abort(); return;
        }
        if (!a.closest('#vn-modal')) return;
        if (a.tagName === 'LABEL') return;
        return modalAction(act, a);
      }
      if (t.closest('#vn-stage') && !t.closest('button,input,textarea,select,label,.vn-end,.vn-event,.vn-top,.vn-modal,.vn-text')) advance();
      else if (t.closest('.vn-text')) advance();
    });
    root.addEventListener('change', (e) => { const t = e.target; if (t.closest('#vn-modal') && (t.dataset.act || t.id === 'vn-look')) modalChange(t); });
    ui.q('#vn-in').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const v = e.target.value; e.target.value = ''; submitText(v); } e.stopPropagation(); });
    /* 지도 확대/축소: 마우스 휠(포인터 위치 기준), 두 손가락 벌리기/오므리기, 확대한 상태에서 끌어서 이동 */
    let mapWheelAt = 0;
    root.addEventListener('wheel', (e) => {
      const mp = e.target.closest?.('.vn-map'); if (!mp || !mp.closest('#vn-modal')) return;
      e.preventDefault(); if (Date.now() - mapWheelAt < 110) return; mapWheelAt = Date.now();
      const r = mp.getBoundingClientRect(); mapZoom(e.deltaY < 0 ? 1 : -1, ((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
    }, { passive: false });
    {
      const ptrs = new Map(); let base = 0, pan = null;
      root.addEventListener('pointerdown', (e) => {
        const mp = e.target.closest?.('.vn-map'); if (!mp || st.mapAdd || e.target.closest('.vn-mapctl, .vn-mk')) return;
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (ptrs.size === 2) { const [p1, p2] = [...ptrs.values()]; base = Math.hypot(p1.x - p2.x, p1.y - p2.y); pan = null; return; }
        if (e.target.closest('.vn-pin')) return;   // 핀은 아래 핸들러가 끌어서 옮긴다
        const c = camOf(); if (c.z <= 1) return;
        const r = mp.getBoundingClientRect(); pan = { x: e.clientX, y: e.clientY, tx: c.tx, ty: c.ty, w: r.width, h: r.height, moved: false };
      });
      window.addEventListener('pointermove', (e) => {
        if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (ptrs.size === 2 && base) {
          const [p1, p2] = [...ptrs.values()], d = Math.hypot(p1.x - p2.x, p1.y - p2.y), mp = $q('.vn-map', ui.root); if (!mp) return;
          const r = mp.getBoundingClientRect(), vx = (((p1.x + p2.x) / 2 - r.left) / r.width) * 100, vy = (((p1.y + p2.y) / 2 - r.top) / r.height) * 100;
          if (d / base > 1.35) { mapZoom(1, vx, vy); base = d; } else if (d / base < 0.74) { mapZoom(-1, vx, vy); base = d; }
          return;
        }
        if (!pan) return;
        const dx = e.clientX - pan.x, dy = e.clientY - pan.y; if (!pan.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        pan.moved = true; const c = camOf(); c.tx = pan.tx + (dx / pan.w) * 100; c.ty = pan.ty + (dy / pan.h) * 100; applyMapCam();
      });
      const endPtr = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) base = 0; if (pan?.moved) st.dragAt = Date.now(); pan = null; };
      window.addEventListener('pointerup', endPtr); window.addEventListener('pointercancel', endPtr);
    }
    root.addEventListener('pointerdown', (e) => {   // 지도 핀 끌어서 옮기기
      const pin = e.target.closest('.vn-pin'); if (!pin || st.mapAdd) return;
      const map = pin.closest('.vn-map-stage') || pin.closest('.vn-map'), r = map.getBoundingClientRect(), sx = e.clientX, sy = e.clientY; let moved = false;
      const mv = (ev) => { if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 5) moved = true; if (!moved) return; pin.style.left = clamp(((ev.clientX - r.left) / r.width) * 100, 1, 99) + '%'; pin.style.top = clamp(((ev.clientY - r.top) / r.height) * 100, 1, 99) + '%'; };
      const up = () => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
        if (moved) { const p = ssWorld()?.places.find((q) => q.id === pin.dataset.id); if (p) { p.x = +parseFloat(pin.style.left).toFixed(1); p.y = +parseFloat(pin.style.top).toFixed(1); saveMeta(); } st.dragAt = Date.now(); }
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    ui.q('#vn-mbody').addEventListener('click', (e) => {
      const mp = e.target.closest('.vn-map');
      if (mp && st.mapAdd && !e.target.closest('.vn-pin')) {
        const r = (mp.querySelector('.vn-map-stage') || mp).getBoundingClientRect(), w = ssWorld(); if (!w) return;
        const p = { id: uid(), name: st.mapAdd, aliases: [], kind: '', x: +clamp(((e.clientX - r.left) / r.width) * 100, 2, 98).toFixed(1), y: +clamp(((e.clientY - r.top) / r.height) * 100, 2, 98).toFixed(1), desc: '', visual: '' };
        if (st.mapScope !== 'world') p.parent = st.mapScope;
        w.places.push(p); saveMeta(); st.mapSel = p.name; st.mapAdd = ''; renderModal(); return;
      }
      const im = e.target.closest('img');
      if (im && !im.closest('.vn-map') && !im.closest('.vn-gi') && !e.target.closest('button')) { const lb = ui.q('#vn-lightbox'); lb.firstElementChild.src = im.src; lb.classList.remove('vn-off'); return; }
      const gi = e.target.closest('.vn-gi'); if (gi && !e.target.closest('.vn-x')) { const en = M().gallery.find((x) => x.id === gi.dataset.id); if (en) { ui.q('#vn-modal').classList.add('vn-off'); openEvent(en); } } });
    document.addEventListener('keydown', (e) => {
      if (!st.open) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (e.key === 'Escape') { if (!ui.q('#vn-lightbox').classList.contains('vn-off')) ui.q('#vn-lightbox').classList.add('vn-off'); else if (!ui.q('#vn-event').classList.contains('vn-off')) closeEvent(); else if (!ui.q('#vn-modal').classList.contains('vn-off')) ui.q('#vn-modal').classList.add('vn-off'); else if (lpOpen()) toggleLog(); else ui.close(); e.stopPropagation(); return; }
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advance(); }
      else if (/^[1-4]$/.test(e.key) && ui.q('#vn-choices').classList.contains('on')) pickChoice(+e.key - 1);
      else if (e.key.toLowerCase() === 'h') root.classList.toggle('vn-uihide');
    }, true);
  }

  /* ================= 채팅창의 [VN] 블록 숨기기 ================= */
  const KNOWN_STATUS_TAGS = ['facts', 'fact', 'infobox', 'charinfo', 'memo', 'tracker', 'status', 'statusblock', 'status_block', 'statuswindow', 'status_window', '상태창', 'hud'];
  function stripTags() {
    const names = S().hideInChat ? [...new Set([...String(S().hideTags || '').split(',').map((x) => x.trim()).filter(Boolean), ...KNOWN_STATUS_TAGS])].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : [];
    document.querySelectorAll('#chat .mes_text').forEach((el) => {
      let h = el.innerHTML, ch = false;
      if (/\[VN\]/i.test(h)) { h = h.replace(RE_BLOCK_ALL, ''); ch = true; }
      for (const n of names) {      // ST 채팅창에서도 숨기기 (화면에서만 가리고, 저장된 대화는 그대로예요)
        const h2 = h.replace(new RegExp(`<${n}\\b[^>]*>[\\s\\S]*?</${n}\\s*>`, 'gi'), '').replace(new RegExp(`&lt;${n}\\b[\\s\\S]*?&gt;[\\s\\S]*?&lt;/${n}\\s*&gt;`, 'gi'), '');
        if (h2 !== h) { h = h2; ch = true; }
      }
      if (ch) el.innerHTML = h;
    });
  }

  /* ================= ST 확장 설정 패널 ================= */
  const drawerHtml = `
<div class="inline-drawer" id="vn-drawer">
  <div class="inline-drawer-toggle inline-drawer-header"><b>🌸 VN Studio · 미연시 팝업</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
  <div class="inline-drawer-content">
    <label class="checkbox_label"><input type="checkbox" data-vk="enabled"><span>VN Studio 사용 (끄면 화면·아이콘·모델 지시문이 모두 꺼져요)</span></label>
    <label class="checkbox_label"><input type="checkbox" data-vk="fab"><span>화면 위에 작은 💗 아이콘 띄우기 (끌어서 옮길 수 있어요)</span></label>
    <div class="vn-set-row"><button class="menu_button" id="vn-open-btn">미연시 화면 열기</button><button class="menu_button" id="vn-import-btn" title="Scene Studio에 저장해 둔 API 설정을 복사해요">Scene Studio 설정 가져오기</button></div>
    <small>자세한 게임 옵션(입력 방식, 자동 생성, 화풍 등)은 화면 안 ☰ 메뉴 → 설정에 있어요.</small>
    <h4>이미지</h4>
    <div class="vn-set-row"><label>방식</label><select data-vk="imgProvider" class="text_pole"><option value="vertex">Agent Platform (구 Vertex AI)</option><option value="gemini">Gemini Developer API</option></select></div>
    <div class="vn-set-row"><label>프로젝트 ID</label><input type="text" class="text_pole" data-vk="vertexProject" placeholder="비워도 이미지는 돼요"></div>
    <div class="vn-set-row"><label>리전</label><input type="text" class="text_pole" data-vk="vertexLocation"></div>
    <div class="vn-set-row"><label>API 키</label><input type="password" class="text_pole" data-vk="geminiKey" autocomplete="off"></div>
    <div class="vn-set-row"><label>모델</label><input type="text" class="text_pole" data-vk="geminiModel"><button class="menu_button" id="vn-test-btn">연결 테스트</button></div>
    <h4>영상 (Veo)</h4>
    <div class="vn-set-row"><label>방식</label><select data-vk="videoProvider" class="text_pole"><option value="auto">이미지와 동일</option><option value="vertex">Agent Platform</option><option value="gemini">Gemini Developer API</option></select></div>
    <div class="vn-set-row"><label>모델</label><input type="text" class="text_pole" data-vk="videoModel"></div>
    <div class="vn-set-row"><label>프로젝트 ID</label><input type="text" class="text_pole" data-vk="videoProject" placeholder="Agent Platform이면 필수"></div>
    <div class="vn-set-row"><label>리전</label><input type="text" class="text_pole" data-vk="videoLocation"></div>
    <div class="vn-set-row"><label>영상 키</label><input type="password" class="text_pole" data-vk="videoKey" autocomplete="off" placeholder="비우면 이미지 키 사용"></div>
    <div class="vn-set-row"><label>액세스 토큰</label><input type="password" class="text_pole" data-vk="videoToken" autocomplete="off"></div>
    <div class="vn-set-row"><label>길이(초)</label><select data-vk="videoSeconds" class="text_pole"><option>4</option><option>6</option><option>8</option></select><label>해상도</label><select data-vk="videoRes" class="text_pole"><option>720p</option><option>1080p</option></select></div>
    <label class="checkbox_label"><input type="checkbox" data-vk="videoAudio"> 소리 포함 (요금 증가)</label>
    <h4>텍스트 분석 (일상 모드 · 외형 추출)</h4>
    <div class="vn-set-row"><label>연결 프로필</label><select id="vn-prof" data-vk="llmProfile" class="text_pole"></select></div>
    <small>API 키는 SillyTavern settings.json에 평문으로 저장돼요. 파일을 공유하지 마세요.</small>
  </div>
</div>`;
  function renderProfiles() {
    const sel = document.getElementById('vn-prof'); if (!sel) return;
    const cur = S().llmProfile;
    sel.innerHTML = '<option value="">(채팅에 연결된 모델)</option>' + profileList().map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.model ? ` (${esc(p.model)})` : ''}</option>`).join('');
    sel.value = cur;
  }
  function importSceneStudio(silent) {
    const o = ctx().extensionSettings?.minimap;
    if (!o) { if (!silent) toastr.info('Scene Studio 설정을 찾지 못했어요.'); return; }
    const s = S(), keys = ['imgProvider', 'vertexProject', 'vertexLocation', 'geminiKey', 'geminiModel', 'videoProvider', 'videoKey', 'videoProject', 'videoLocation', 'videoToken', 'videoModel', 'videoSeconds', 'videoRes', 'videoAudio', 'llmProfile'];
    let n = 0; for (const k of keys) if (o[k] !== undefined && o[k] !== '') { s[k] = o[k]; n++; }
    if (o.imgProvider === 'sd') s.imgProvider = 'vertex';
    saveSettings(); fillInputs(document.getElementById('vn-drawer')); renderProfiles(); if (!silent) toastr.success(`Scene Studio에서 ${n}개 설정을 가져왔어요.`);
  }

  /* ================= English UI (한국어 ↔ English) =================
     키는 화면/알림에 나오는 한국어 문장이고, {} 는 값이 들어가는 자리예요. 사전에 없는 문장은 한국어 그대로 보여요. */
  const EN = {
    // --- 상단 · 공통 ---
    '채팅': 'Chat', '일상': 'Daily', '모드 전환': 'Switch mode', '채팅 연동 ↔ 일상 모드': 'Chat-linked ↔ Daily mode', '공략집': 'Walkthrough', '공략집 열기': 'Open walkthrough',
    '일정과 캘린더': 'Schedule & calendar', '기록': 'Log', '기록 (대화 읽기)': 'Log (read the conversation)', 'UI 숨기기': 'Hide UI', '화면 숨기기 (H)': 'Hide UI (H)', '메뉴': 'Menu', '닫기': 'Close', '닫기 (Esc)': 'Close (Esc)',
    'API 호출 현황': 'API usage', '글상자 접기': 'Collapse text box', '글상자 접기/펼치기': 'Collapse / expand text box', '보내기': 'Send', '직접 말을 건네 보세요': 'Say something yourself', '취소': 'Cancel',
    '다음 시간대로 ▶': 'Next time slot ▶', '다시 시도': 'Retry', '왼쪽/오른쪽 이동': 'Move left / right', '위치 이동': 'Move panel', '연출 기록': 'Scene log', '채팅 전체': 'Full chat',
    '🎬 이 장면을 이벤트 씬으로': '🎬 Make this an event scene', '🎬 영상으로 만들기': '🎬 Make a video', '계속하기': 'Continue', '이벤트': 'Events', '클릭하면 크게 보기': 'Click to enlarge',
    '장면 생성기의 새 장면이나 새 CG로 이 순간을 이벤트 씬으로 띄워요': "Shows this moment as an event scene using Scene Studio's new scene or a new CG",
    '아직 기록이 없어요.': 'No log yet.', '채팅이 아직 없어요.': 'No chat yet.',
    // --- 탭 ---
    '일정·캘린더': 'Schedule & Calendar', '지도': 'Map', '표정·의상': 'Expressions & Outfits', '장소': 'Places', '호출': 'Usage', '설정': 'Settings', '개발자': 'Developer',
    // --- 공략집 ---
    '아직 정리된 관계 요약이 없어요. 아래 "채팅 기록으로 분석"을 눌러 보세요.': 'No relationship summary yet. Press "Analyze from chat history" below.',
    '하트 이벤트': 'Heart events', '호감도가 해당 수치를 처음 넘으면 특별 이벤트 장면이 나오도록 모델에게 요청해요.': 'When closeness first passes these values, the model is asked to deliver a special event scene.',
    '등장인물 (눌러서 편집 · 이미지 넣기)': 'Characters (click to edit · add an image)', '알아낸 정보': 'Known info', '항목 (예: 좋아하는 꽃)': 'Item (e.g. favorite flower)', '내용': 'Value', '정보 추가': 'Add info',
    '채팅 기록으로 분석 (모델 1회)': 'Analyze from chat history (1 model call)', '롤플레이 중 새로 드러난 정보는 모델이 알려 줘서 자동으로 채워져요. 이미 쌓인 채팅이 있으면 위 버튼으로 호감도·관계 요약·정보를 한 번에 가져와요.': 'New facts revealed during roleplay are filled in automatically. If you already have a long chat, the button above imports closeness, a relationship summary and facts at once.',
    '이름': 'Name', '역할': 'Role', '설명 (AI 이미지 생성에도 쓰여요)': 'Description (also used for AI image generation)', '이미지 올리기': 'Upload image', 'AI로 만들기 (이미지 1회)': 'Generate with AI (1 image)', '✂ 배경 제거': '✂ Remove background', '이미지 삭제': 'Delete image', '인물 삭제': 'Delete character', '이미지를 넣으면 이 인물이 말할 때 화면에 나타나요.': 'If you add an image, this character appears on screen when speaking.', '이미지 없음': 'No image',
    '나이': 'Age', '생일': 'Birthday', '직업': 'Job', '좋아하는 것': 'Likes', '싫어하는 것': 'Dislikes', '취미': 'Hobby', '말버릇': 'Verbal tic', '고민': 'Worry', '비밀': 'Secret',
    '적대': 'Hostile', '불편': 'Uneasy', '낯섦': 'Strangers', '친근': 'Friendly', '호감': 'Fond', '두근두근': 'Heart-fluttering', '연인': 'Lovers',
    // --- 일정/캘린더 ---
    '시작일': 'Start date', '이전 달': 'Previous month', '다음 달': 'Next month', '일': 'Sun', '월': 'Mon', '화': 'Tue', '수': 'Wed', '목': 'Thu', '금': 'Fri', '토': 'Sat',
    '무작위': 'Random', '모두 자유': 'All free', '만날 장소': 'Meeting place', 'AI가 정함': 'AI decides', '일상 모드로 시작': 'Start daily mode', '일상 이어서': 'Continue daily', '이 날 계획 다시 만들기': 'Regenerate this day\'s plan', '아직 진행 전': 'Not played yet', '기록된 내용이 없어요.': 'Nothing recorded.',
    '만남': 'Meet', '우연한 만남': 'Chance encounter', 'NPC와': 'With NPC', '혼자': 'Alone', '★ 하이라이트': '★ Highlight', '이름 (예: 첫 만남)': 'Name (e.g. First meeting)', '월-일 (03-14)': 'MM-DD (03-14)', '추가': 'Add', '캐릭터의 생일을 알아내면 자동으로 표시돼요.': "A character's birthday appears automatically once you learn it.",
    '자유': 'Free', '캐릭터와 만남': 'Meet character', '공부': 'Study', '아르바이트': 'Part-time job', '운동': 'Exercise', '독서': 'Read', '산책': 'Walk', '휴식': 'Rest',
    '아침': 'Morning', '점심': 'Noon', '오후': 'Afternoon', '저녁': 'Evening', '밤': 'Night',
    // --- 지도 ---
    '세계': 'World', '새 장소 이름': 'New place name', '장소 추가': 'Add place', '장소 목록': 'Place list', '이 장소로 이동': 'Go to this place', '여기서 만나기': 'Meet here', '배경 생성': 'Generate background', '배경 새로 생성': 'Regenerate background', '삭제': 'Delete', '이 지도 이미지가 아직 없어요': 'No image for this map yet',
    '장면 생성기 이미지': 'Scene Studio image', '직접 올림': 'Uploaded', 'VN Studio 생성': 'VN Studio generated',
    '핀을 끌어서 옮기고, 눌러서 선택해요. 장면 생성기와 같은 장소 데이터를 써서 양쪽에 같이 반영돼요.': 'Drag pins to move them, click to select. This uses the same place data as Scene Studio, so changes apply to both.',
    '🖼 표시는 이미 이미지가 있는 장소예요. 이런 장소는 다시 만들지 않고 그대로 써요. 새로 만들려면 "배경 새로 생성"을 직접 눌러야 해요.': '🖼 marks places that already have an image. They are reused as they are; press "Regenerate background" yourself to make a new one.',
    '설정에서 "장면 생성기 연동"이 꺼져 있어요.': 'Scene Studio link is turned off in Settings.',
    '장면 생성기(Scene Studio)에서 이 채팅의 장소를 아직 분석하지 않았어요. 장면 창 → 장소·지도 탭에서 "장소·마커 자동 분석"을 먼저 눌러 주세요. 그러면 지도와 장소가 여기에 나타나고, 이미 만든 장면 이미지는 배경으로 그대로 쓰여요.': 'Scene Studio has not analyzed this chat\'s places yet. In the Scene window → Places & Map tab, press "Auto-analyze places & markers" first. The map and places will then appear here and existing scene images are used as backgrounds.',
    // --- 표정·의상 ---
    '캐릭터': 'Character', '캐릭터 채팅을 연 다음에 설정할 수 있어요.': 'Open a character chat first.', '대화에서 나온 의상 제안': 'Outfits suggested in the story', '의상 추가': 'Add outfit', '새 의상 이름 (예: 교복, 잠옷, 수영복)': 'New outfit name (e.g. uniform, pajamas, swimsuit)', '입히기': 'Wear', '기본으로': 'Set as default', '착용 중': 'Wearing', '기본 의상': 'Default outfit', '기본': 'Default',
    '의상 설명 (AI 생성용, 예: white sailor school uniform with red ribbon)': 'Outfit description (for AI, e.g. white sailor school uniform with red ribbon)', '기준 이미지 1장': '1 base image', '대표 올리기': 'Upload main', '표정별 올리기': 'Upload per expression',
    '이미지 없음 — 아래에서 AI로 만들거나 올려 주세요': 'No image — generate with AI or upload below', '이 표정 다시 생성': 'Regenerate this expression', '다시 생성': 'Regenerate', '배경 제거': 'Remove background', '배경 제거(투명하게)': 'Remove background (transparent)',
    '외형 태그 (모든 이미지 생성에 똑같이 쓰여요)': 'Appearance tags (used identically for every image)', '카드에서 영어 외형 태그 뽑기 (모델 1회)': 'Extract English appearance tags from the card (1 model call)',
    '비워 두면 처음 생성할 때 모델이 영어 외형 태그를 한 번 뽑아 저장해요. 직접 고치면 외형이 더 일관돼요. 예: silver hair in a low ponytail, red eyes, tall, slim': 'If empty, the model extracts English appearance tags once at the first generation. Editing them yourself makes the look more consistent. e.g. silver hair in a low ponytail, red eyes, tall, slim',
    'SillyTavern 표정 확장과 같은 28개 이름이에요. 고르지 않은 표정은 이미지를 만들지 않고, 비슷한 표정이나 대표 이미지로 대신 보여 줘요. 아래 "선택한 표정 만들기"를 눌렀을 때만 만들어요. 대화 중 필요한 표정이 없으면, 고른 표정에 한해서만 한 장씩 만들어요.': 'The same 28 names as SillyTavern\'s Expressions extension. Expressions you do not select are never generated; a similar expression or the main image is shown instead. They are made only when you press "Generate selected expressions" below, or one at a time during chat for the selected ones only.',
    '사용할 표정 선택 ({}/{}) — 고른 표정만 자동 생성돼요': 'Choose expressions to use ({}/{}) — only selected ones are auto-generated', '선택한 표정 만들기 ({}장)': 'Generate selected expressions ({})', 'ST 스프라이트 {}개': 'ST sprites: {}',
    '캐릭터가 답하면 팝업 자동으로 열기': 'Auto-open the popup when the character replies',
    // --- 장소 / 이벤트 / 호출 ---
    '장소 이름 (예: 학교 옥상)': 'Place name (e.g. School rooftop)', '장소 묘사 (비우면 장면 생성기 묘사나 로어북에서 찾아 써요)': "Place description (if empty, Scene Studio's description or the lorebook is used)", '아직 저장된 장소가 없어요.': 'No saved places yet.',
    '배경은 직접 올린 이미지 → 이미 만든 이미지 → 장면 생성기 이미지 순으로 쓰고, 어디에도 없을 때만 새로 만들어요. 다시 만드는 건 아래 "다시 생성"을 눌렀을 때뿐이에요.': 'Backgrounds are used in this order: your upload → an image already made → a Scene Studio image; a new one is generated only if none exists. Regeneration happens only when you press "Regenerate" below.',
    '이벤트 씬이 생기면 여기에 모여요.': 'Event scenes will collect here.', '텍스트 호출': 'Text calls', '이미지 호출': 'Image calls', '영상 호출': 'Video calls', '누적 초기화': 'Reset totals', '언제 호출되나요': 'When are calls made?', '최근 호출': 'Recent calls', '시각': 'Time', '종류': 'Type', '결과': 'Result', '토큰': 'Tokens', '성공': 'OK', '429 재시도': '429 retry', '텍스트': 'Text', '이미지': 'Image', '영상': 'Video',
    '이번 접속에서 나간 호출이 아직 없어요.': 'No calls made in this session yet.',
    '텍스트 토큰은 글자 수로 추정한 값(≈)이에요. 연결된 모델이 사용량을 돌려주지 않아서요. 이미지 토큰은 Google이 알려 준 실제 값이에요.': 'Text tokens are estimated from character counts (≈) because the connected model does not report usage. Image tokens are the actual values reported by Google.',
    '토큰 ≈ {} 입력 / {} 출력': 'tokens ≈ {} in / {} out', '토큰 {} 입력 / {} 출력': 'tokens {} in / {} out', '429 재시도 {}회': '429 retries: {}',
    // --- 개발자 ---
    '이벤트 씬이 안 뜰 때 여기서 이유를 확인하고 직접 실행해 볼 수 있어요.': 'If event scenes do not appear, check the reason here and run them manually.', '이벤트 상태': 'Event status', '자동 생성': 'Auto-generate', '켜짐': 'On', '꺼짐': 'Off', '이미지 키': 'Image key', '있음': 'Yes', '없음': 'No', '장면 생성기 이미지': 'Scene Studio images', '간격': 'Interval', '현재 장면 event': 'Current scene has event', '장면 소스': 'Scene source',
    '현재 장면으로 이벤트 강제 실행': 'Force an event for the current scene', '샘플 이벤트 화면 보기': 'View a sample event screen', '저장된 이미지로 이벤트 화면 미리보기…': 'Preview the event screen with a saved image…', '미리보기': 'Preview', '이벤트 판단 기록 (최근 순)': 'Event decision log (latest first)', '판단': 'Decision', '진단': 'Diagnostics',
    '아직 판단 기록이 없어요. 캐릭터가 답하면 여기에 이유가 쌓여요.': 'No decisions yet. Reasons will appear here after the character replies.', '마지막 모델 응답 원문 / 파싱 결과': 'Last raw model reply / parsed result', '모델에 보내는 지시문': 'Instructions sent to the model', '현재 장면(turn) 상태': 'Current scene (turn) state', '채팅 메타데이터 요약': 'Chat metadata summary',
    // --- 설정 ---
    '언어 · 개발': 'Language · Developer', '화면 문구와 모델이 쓰는 언어가 함께 바뀌어요. English로 하면 입력도 출력도 영어로 진행할 수 있어요.': 'Changes both the UI text and the language the model writes in. With English you can play with English input and English output.', '개발자 모드': 'Developer mode', '이벤트가 왜 안 나오는지 확인하는 진단 탭이 생겨요 (이벤트 판단 기록, 강제 실행, 응답 원문, 지시문 보기).': 'Adds a diagnostics tab to see why events do not appear (decision log, force run, raw reply, instructions).',
    '진행': 'Gameplay', 'VN Studio 사용': 'Enable VN Studio', '모델에게 [VN] 블록 규칙 보내기': 'Send the [VN] block rules to the model', '끄면 표정·장소·호감도·선택지가 자동으로 안 나와요.': 'If off, expressions, places, closeness and choices will not appear automatically.', '기존 채팅이 있으면 처음 한 번 호감도·관계·정보 분석': 'Analyze closeness, relationship and facts once if a chat already exists', '모델을 1회 호출해요. 채팅 내용이 연결된 모델로 전송돼요.': 'Calls the model once. The chat content is sent to the connected model.', '입력 방식': 'Input mode', '선택지 + 직접 입력': 'Choices + typing', '선택지 우선': 'Choices first', '직접 입력만': 'Typing only',
    '채팅 모드: 글상자에 안 보이게 숨기기': 'Chat mode: hide from the text box', '상태창·코드블록·HTML 블록 통째로 숨기기': 'Hide status windows, code blocks and HTML blocks entirely', '```로 감싼 블록, <div>/<table>/<details> 같은 HTML 블록, [STATUS]…[/STATUS]를 연출에서 빼요.': 'Removes ``` blocks, HTML blocks like <div>/<table>/<details>, and [STATUS]…[/STATUS] from the scene.', '숨길 태그 이름 (쉼표로 구분)': 'Tag names to hide (comma-separated)', '예: mythink, 상태창': 'e.g. mythink, statuswindow', 'think, status, 상태창, details 등 흔한 태그는 이미 자동으로 숨겨요.': 'Common tags such as think, status and details are already hidden automatically.', '숨길 패턴 (정규식, 한 줄에 하나)': 'Patterns to hide (regex, one per line)', '예: ^\\[.*?\\]$': 'e.g. ^\\[.*?\\]$',
    '이벤트 씬': 'Event scenes', '이벤트 최소 간격 (메시지 수)': 'Minimum interval between events (messages)', '장면 이미지': 'Scene image', '장면 생성기 새 장면 우선, 없으면 새로 생성': 'Prefer new Scene Studio scenes, otherwise generate', '항상 새로 생성': 'Always generate new', '장면 생성기 장면만 (생성 비용 0)': 'Scene Studio scenes only (no generation cost)',
    '발동 조건: ① 모델이 event: 를 낼 때(간격 적용) ② 호감도가 한 번에 ±4 이상 변하거나 하트 단계를 넘을 때 ③ 일상 모드의 하이라이트 장면 ④ 글상자 아래 "🎬 이 장면을 이벤트 씬으로" 버튼. 아직 이벤트가 한 번도 없었어요.': 'Triggers: ① the model emits event: (interval applies) ② closeness changes by ±4 or more at once, or a heart level is passed ③ a daily-mode highlight scene ④ the "🎬 Make this an event scene" button under the text box. No event has happened yet.',
    '마지막 이벤트 후 {}개 메시지가 지났어요.': '{} messages since the last event.', '아직 이벤트가 한 번도 없었어요.': 'No event has happened yet.',
    '이벤트 발생 시 CG 자동 준비': 'Prepare event CG automatically', '이벤트 CG를 영상으로 자동 변환': 'Convert event CG to video automatically', '켜면 확인창 없이 요금이 나가요.': 'If on, charges apply without a confirmation prompt.', '수동 영상 생성 때 요금 확인창 띄우기': 'Show a cost confirmation for manual video generation', 'CG 생성 시 캐릭터·페르소나 이미지를 참조로 보내기': 'Send character and persona images as references when generating CG',
    '연동 · 이미지 생성 (API 요금 발생)': 'Linking · Image generation (API charges apply)', '장면 생성기(Scene Studio) 연동': 'Scene Studio link', '장소 목록·지도·이미 만든 장면 이미지·화풍·외형 태그를 가져다 써요.': 'Uses its place list, map, existing scene images, art style and appearance tags.', '배경이 없는 장소는 한 번만 자동 생성': 'Auto-generate a background once for places without one', '고른 표정이 없으면 한 장씩 자동 생성': 'Auto-generate a missing selected expression, one at a time', '표정 자동 생성 상한 (접속당)': 'Auto-generation cap per session (expressions)', '이미지 요청 간격 (초)': 'Image request interval (seconds)', '429(요청 과다)가 뜨면 늘려 보세요. 429가 나면 자동으로 기다렸다가 다시 시도해요.': 'Increase this if you get 429 (too many requests). On 429 it waits automatically and retries.',
    '생성한 캐릭터 이미지의 배경 자동 제거 (투명 PNG)': 'Automatically remove the background of generated character images (transparent PNG)', '흰 배경으로 만든 뒤 가장자리에서부터 배경색만 지워요. 배경이 균일하지 않으면 원본을 그대로 저장해요.': 'Generates on a white background, then erases the background color starting from the edges. If the background is not uniform, the original is saved as is.', '배경 제거 민감도': 'Background removal sensitivity', '값이 크면 배경을 더 많이 지우지만 인물 가장자리가 깎일 수 있어요.': 'Higher values erase more background but may eat into the character\'s edges.',
    'SillyTavern 표정 스프라이트 사용': 'Use SillyTavern expression sprites', '[VN] 블록에 표정이 없으면 분류기로 추정': 'Guess the expression with the classifier if the [VN] block has none',
    '일상 모드': 'Daily mode', '이벤트 씨앗 (한 줄에 하나)': 'Event seeds (one per line)', '인카운터 씨앗 (한 줄에 하나)': 'Encounter seeds (one per line)', '하루 계획을 만들 때 이 중 일부가 무작위로 들어가 혼자 있는 시간·NPC·우연한 만남을 풍성하게 해요.': 'Some of these are mixed in randomly when a day plan is made, enriching alone time, NPCs and chance encounters.', '하루에 넣을 인카운터 수': 'Encounters per day',
    '화면': 'Display', '글자 속도 (ms, 0=즉시)': 'Text speed (ms, 0 = instant)', '표정·배경 디졸브 (ms)': 'Expression/background dissolve (ms)', '글자 크기 %': 'Text size %', '대화창 불투명도 %': 'Text box opacity %', '기록 패널 위치': 'Log panel position', '오른쪽': 'Right', '왼쪽': 'Left',
    '화풍 (장면 생성기 화풍이 있으면 그것이 우선)': 'Art style (Scene Studio\'s style takes priority if present)', '배경 화풍': 'Background style', 'CG·표정 화풍': 'CG / expression style', '모델에 보내는 지시문 보기': 'View instructions sent to the model', '이 채팅 호감도 초기화': 'Reset closeness for this chat',
    '한국어': '한국어',
    // --- 의상 / 안내 ---
    '이미지': 'Image', '삭제': 'Delete',
    // --- 드로어(확장 설정 패널) ---
    '미연시 화면 열기': 'Open the visual novel screen', 'Scene Studio 설정 가져오기': 'Import Scene Studio settings', 'Scene Studio에 저장해 둔 API 설정을 복사해요': 'Copies the API settings saved in Scene Studio',
    '자세한 게임 옵션(입력 방식, 자동 생성, 화풍 등)은 화면 안 ☰ 메뉴 → 설정에 있어요.': 'More game options (input mode, auto-generation, art style, etc.) are in ☰ menu → Settings inside the screen.',
    '방식': 'Provider', '프로젝트 ID': 'Project ID', '비워도 이미지는 돼요': 'Images work even if empty', '리전': 'Region', 'API 키': 'API key', '모델': 'Model', '연결 테스트': 'Test connection', '이미지와 동일': 'Same as image', 'Agent Platform이면 필수': 'Required for Agent Platform', '영상 키': 'Video key', '비우면 이미지 키 사용': 'Uses the image key if empty', '액세스 토큰': 'Access token', '길이(초)': 'Length (sec)', '해상도': 'Resolution', '소리 포함 (요금 증가)': 'Include audio (higher cost)', '연결 프로필': 'Connection profile', '(채팅에 연결된 모델)': '(model connected to chat)', '텍스트 분석 (일상 모드 · 외형 추출)': 'Text analysis (daily mode · appearance extraction)',
    'API 키는 SillyTavern settings.json에 평문으로 저장돼요. 파일을 공유하지 마세요.': 'API keys are stored in plain text in SillyTavern settings.json. Do not share that file.',
    '영상 (Veo)': 'Video (Veo)',
    // --- 알림 / 확인창 ({} = 값) ---
    '캐릭터 채팅을 먼저 열어 주세요.': 'Open a character chat first.', '이미지 API 키를 먼저 넣어 주세요.': 'Enter the image API key first.', 'API 키를 먼저 입력해 주세요.': 'Enter the API key first.', 'SillyTavern 입력창을 찾지 못했어요.': 'Could not find the SillyTavern input box.', 'VN Studio가 꺼져 있어요. 확장 프로그램 설정에서 켜 주세요.': 'VN Studio is off. Turn it on in the extension settings.',
    '이미 영상을 만드는 중이에요.': 'A video is already being generated.', '이미 이미지를 만드는 중이에요.': 'Images are already being generated.', '이미 있는 의상이에요.': 'That outfit already exists.', '이미 있는 장소예요.': 'That place already exists.', '다른 이름을 써 주세요.': 'Please use a different name.', '장소 이름을 먼저 적어 주세요.': 'Enter a place name first.', '이름과 월-일(예: 03-14)을 적어 주세요.': 'Enter a name and a date (e.g. 03-14).', '이미지를 골라 주세요.': 'Choose an image.', '보여 줄 이미지가 없어요.': 'There is no image to show.', '먼저 장면을 하나 열어 주세요.': 'Open a scene first.',
    'neutral은 기준 이미지라 빼지 않아요.': 'neutral is the base image and cannot be removed.', '만들 표정이 없어요. 위에서 사용할 표정을 고르면 여기에 장수가 표시돼요.': 'No expressions to generate. Select expressions above and the count shows here.', '분석할 채팅이 아직 거의 없어요.': 'There is barely any chat to analyze yet.', 'Scene Studio 설정을 찾지 못했어요.': 'Could not find Scene Studio settings.', 'Scene Studio에서 {}개 설정을 가져왔어요.': 'Imported {} settings from Scene Studio.',
    '공략집을 갱신했어요': 'Walkthrough updated', '외형 태그를 저장했어요': 'Appearance tags saved', '배경을 지웠어요': 'Background removed', '서버에 영상 저장이 안 돼서 이번 세션에서만 볼 수 있어요.': 'The video could not be saved to the server, so it is only viewable in this session.',
    '모델이 쓸 수 있는 태그를 주지 않았어요. 다른 모델로 다시 시도하거나 직접 적어 주세요.': 'The model did not return usable tags. Try another model or type them yourself.',
    '이미지 API 키가 없어서 자동 생성은 건너뛰어요. 확장 프로그램 → VN Studio에서 키를 넣어 주세요.': 'No image API key, so auto-generation is skipped. Enter a key in Extensions → VN Studio.',
    '이 캐릭터는 표정 이미지가 없어요. API 키를 넣으면 AI로 만들 수 있고, 표정·의상 탭에서 직접 올려도 돼요.': 'This character has no expression images. With an API key you can generate them, or upload them yourself in the Expressions & Outfits tab.',
    '장면 생성기에 새 장면 이미지가 아직 없어요. 장면 생성기에서 장면을 만든 뒤 다시 눌러 주세요.': 'Scene Studio has no new scene image yet. Create a scene there and press again.',
    '요청을 취소했어요.': 'Request cancelled.', '요청을 취소했어요. 이미 모델에 전달된 요청은 서버에서 계속될 수 있어요.': 'Request cancelled. A request already sent to the model may continue on the server.', '생성에 실패했어요.': 'Generation failed.',
    '중지하는 중… (진행 중인 한 장은 끝까지 기다려요)': 'Stopping… (the image in progress will finish first)', '영상 생성을 취소했어요. 이미 시작된 작업은 Google 쪽에서 계속돼 요금이 나올 수 있어요.': 'Video generation cancelled. A job already started continues on Google\'s side and may be charged.',
    '배경을 지우는 중…': 'Removing the background…', '배경이 균일하지 않아 지우지 못했어요.': 'Could not remove the background because it is not uniform.', '이미지를 올리는 중…': 'Uploading image…', '표정을 다시 만드는 중…': 'Regenerating the expression…', '외형 태그를 뽑는 중…': 'Extracting appearance tags…', '채팅 기록을 분석하는 중…': 'Analyzing the chat history…', '기존 채팅으로 호감도·관계를 파악하는 중…': 'Reading the existing chat to estimate closeness and relationship…',
    '이벤트 장면을 준비하는 중…': 'Preparing the event scene…', '이벤트 씬을 준비하는 중…': 'Preparing the event scene…', '영상을 만드는 중… (수십 초~몇 분)': 'Generating the video… (tens of seconds to minutes)', '답변을 만드는 중': 'Writing the reply', '하루를 계획하는 중': 'Planning the day', '이벤트를 준비하는 중': 'Preparing the scene',
    '이 인물을 삭제할까요?': 'Delete this character?', '이 장소를 삭제할까요?': 'Delete this place?', '이 장소의 배경을 새로 생성할까요? (이미지 요금이 발생해요)': 'Regenerate this place\'s background? (image charges apply)', '배경 이미지를 지금 생성할까요? (이미지 요금이 발생해요)': 'Generate the background image now? (image charges apply)', '이 채팅의 호감도를 모두 0으로 되돌릴까요?': 'Reset all closeness values in this chat to 0?', '이 날의 계획과 미리 만든 장면을 지우고 다시 만들까요? (모델 호출이 다시 필요해요)': 'Delete this day\'s plan and prepared scenes and regenerate? (model calls are needed again)',
    '영상 생성을 취소할까요?\n이미 Google에 요청이 들어갔다면 서버에서는 계속 진행돼 요금이 나올 수 있어요.': 'Cancel video generation?\nIf the request already reached Google, it continues on the server and may be charged.',
    '연결 성공: {}': 'Connected: {}', '다음 하루 계획에서 \'{}\'에서 만나도록 요청해요.': "The next day plan will be asked to meet at '{}'.", '표정 생성 {}/{} · {}': 'Generating expressions {}/{} · {}', '{}: 기존 채팅을 반영했어요 ({})': '{}: existing chat reflected ({})', '♥ {} · {} — 특별한 이벤트가 곧 일어날 거예요': '♥ {} · {} — a special event is coming', '공략집에 추가: {} — {}': 'Added to walkthrough: {} — {}',
    '{} 이미지를 만드는 중…': 'Generating the image for {}…', '배경을 그리는 중… {}': 'Painting the background… {}', '인식하지 못한 표정 이름도 그대로 저장했어요: {}': 'Unrecognized expression names were saved as they are: {}',
    '\'{}\' 표정을 새로 만들까요? (이미지 1회 요금)': "Regenerate the '{}' expression? (1 image charge)", '\'{}\' 이미지를 AI로 만들까요? (이미지 1회 요금)': "Generate an image for '{}' with AI? (1 image charge)", '\'{}\' 기준 이미지 1장을 지금 만들까요? (이미지 1회 요금)': "Create 1 base image for '{}' now? (1 image charge)", '\'{}\' 의상을 삭제할까요? (서버의 이미지 파일은 남아요)': "Delete the outfit '{}'? (image files on the server remain)",
    '\'{}\' 배경을 생성할까요? (이미지 1회 요금)': "Generate the background for '{}'? (1 image charge)", '\'{}\' 배경을 새로 생성할까요? (이미지 1회 요금)': "Regenerate the background for '{}'? (1 image charge)", '\'{}\' 장소를 삭제할까요?\n장면 생성기의 장소 목록에서도 사라져요. (만들어 둔 이미지는 남아요)': "Delete the place '{}'?\nIt will also disappear from Scene Studio's place list. (Existing images remain.)",
    '{} · {}: 이미지 {}장을 AI로 만들까요?\n{}회 요금이 발생하고, 429를 피하려고 {}초 간격으로 한 장씩 보내 약 {}분 걸려요. 만든 이미지는 계속 재사용돼요.': '{} · {}: generate {} images with AI?\n{} image charges apply. To avoid 429, they are sent one by one every {} s, taking about {} min. Generated images are reused from then on.',
    '{}의 표정 이미지가 아직 없어요.\nAI로 기본 표정 {}장을 만들어 둘까요?\n이미지 {}회(+외형 태그 추출 텍스트 1회) 요금이 발생해요. 요청은 {}초 간격으로 한 장씩 보내서 2~4분쯤 걸려요.\n(취소하면 대화 중 필요할 때 한 장씩만 만들어요)': '{} has no expression images yet.\nGenerate {} basic expressions with AI now?\n{} image calls (+1 text call to extract appearance tags) are charged. Requests are sent one at a time every {} s, taking about 2–4 minutes.\n(If you cancel, only the ones needed during chat are made, one at a time.)',
    '이 장면을 {}초 영상으로 만들까요?\n모델: {}\n예상 요금: 약 ${} (참고용이에요)\n수십 초~몇 분 걸려요.': 'Make this scene into a {}-second video?\nModel: {}\nEstimated cost: about ${} (for reference)\nTakes tens of seconds to minutes.',
    '\'{}\' 기준 이미지 1장을 지금 만들까요? (이미지 1회 요금)\n표정은 나중에 필요할 때 따로 만들 수 있어요.': "Create 1 base image for '{}' now? (1 image charge)\nExpressions can be generated separately later.",
    '표정 자동 생성은 접속당 {}장까지만 해요. 표정·의상 탭에서 직접 더 만들 수 있어요.': 'Auto-generation is limited to {} images per session. You can make more yourself in the Expressions & Outfits tab.',
    '배경 제거를 건너뛰었어요 (배경이 균일하지 않아요, 인식 {}%). 이미지는 원본으로 저장했어요.': 'Background removal was skipped (the background is not uniform, detected {}%). The original image was saved.',
    '배경이 균일하지 않아 지우지 못했어요 (인식 {}%). 설정의 배경 제거 민감도를 조절해 보세요.': 'Could not remove the background because it is not uniform (detected {}%). Try adjusting the background removal sensitivity in Settings.',
    '표정 이미지 생성 실패 ({} · {} · {}): {}': 'Expression image generation failed ({} · {} · {}): {}',
    '일상 이벤트 생성 실패: {}': 'Daily event generation failed: {}', '답변 생성 실패: {}': 'Reply generation failed: {}', '이벤트 씬 준비 실패: {}': 'Event scene preparation failed: {}', '분석 실패: {}': 'Analysis failed: {}', '기존 채팅 분석 실패: {}': 'Existing chat analysis failed: {}', '생성 실패: {}': 'Generation failed: {}', '배경 생성 실패: {}': 'Background generation failed: {}', '배경 제거 실패: {}': 'Background removal failed: {}', '업로드 실패: {}': 'Upload failed: {}', '외형 추출 실패: {}': 'Appearance extraction failed: {}', '영상 생성 실패: {}': 'Video generation failed: {}', '{} 생성 실패: {}': '{} generation failed: {}', '실패: {}': 'Failed: {}', '요청 실패 (네트워크/CORS): {}': 'Request failed (network/CORS): {}',
    '표정 {}장': '{} expressions', '{}장': '{}',
    '일상 모드: 채팅과 별개로 하루가 진행돼요. 하루 계획은 처음 한 번만 만들고, 다음 장면은 미리 준비돼요.': 'Daily mode: the day progresses separately from the chat. The day plan is made once, and the next scene is prepared in advance.', '채팅 연동 모드로 돌아왔어요.': 'Back to chat-linked mode.',
    '캐릭터와 대화를 시작하면 이 화면에 연출돼요.': 'Start chatting with the character and it will be staged on this screen.',
    '기념일 ({})': 'Anniversaries ({})', '장소 목록 ({})': 'Place list ({})', 'Language / 언어': 'Language', '🎬 이 장면을 이벤트 씬으로': '🎬 Make this an event scene',
    '이벤트 장면 준비 시작': 'Started preparing the event scene', '장면 생성기 이미지 사용: {}': 'Using Scene Studio image: {}', '장면 생성기 · {}': 'Scene Studio · {}',
    '🔒 ♥{} · {}': '🔒 ♥{} · {}', '✓ ♥{} · {}': '✓ ♥{} · {}',
    '장면 생성기의 새 장면이나 새 CG로 이 순간을 이벤트 씬으로 띄워요 (자동 대기)': 'Shows this moment as an event scene (auto-queued)',
    '기본 표정': 'Default', '🎬 이 장면을 이벤트 씬으로 (자동 대기)': '🎬 Make this an event scene (auto-queued)',
    // --- 1.4 추가 ---
    '글상자 높이 조절': 'Adjust text box height', '끌어서 글상자 높이 조절 (더블클릭: 자동)': 'Drag to resize the text box (double-click: auto)', '끌어서 너비 조절 (더블클릭: 기본)': 'Drag to resize the width (double-click: default)', '기록 패널 너비 조절': 'Resize log panel',
    '위로': 'Up', '아래로': 'Down', '맨 아래로': 'To bottom', '위로 스크롤': 'Scroll up', '아래로 스크롤': 'Scroll down', '🎬 이벤트 씬': '🎬 Event scene', '🎬 이벤트 씬 ●': '🎬 Event scene ●',
    'VN Studio 열기 (끌어서 옮기기)': 'Open VN Studio (drag to move)', 'VN Studio 사용 (끄면 화면·아이콘·모델 지시문이 모두 꺼져요)': 'Enable VN Studio (if off, the screen, icon and model instructions are all disabled)', '화면 위에 작은 💗 아이콘 띄우기 (끌어서 옮길 수 있어요)': 'Show a small 💗 icon on screen (drag to move it)',
    '이미지 바꾸기': 'Change image', '내 이미지에서 고르기': 'Pick from my images', '대표로 되돌리기': 'Reset to main image', '대표로 쓸 이미지를 고르세요': 'Choose the image to use as the main one', '정보': 'Info', '등장인물 ({})': 'Characters ({})',
    '새 인물 이름': 'New character name', '인물 추가': 'Add character', '채팅 기록에서 찾기 (모델 1회)': 'Find in chat history (1 model call)', '아직 정리된 관계 요약이 없어요. "채팅 기록으로 분석"을 눌러 보세요.': 'No relationship summary yet. Press "Analyze from chat history".', '이미 있는 인물이에요.': 'That character already exists.', '이름을 먼저 적어 주세요.': 'Enter a name first.',
    '아직 등장인물이 없어요. 위에서 직접 추가하거나 "채팅 기록에서 찾기"를 눌러 주세요. 일상 모드에서 새 인물이 나오면 자동으로 모여요.': 'No characters yet. Add one above or press "Find in chat history". New characters from daily mode are collected automatically.',
    '호감도가 해당 수치를 처음 넘으면 특별 이벤트 장면이 나오도록 모델에게 요청해요. 마이너스 호감도는 왼쪽의 검은 하트로 표시돼요.': 'When closeness first passes these values, the model is asked to deliver a special event scene. Negative closeness is shown with black hearts on the left.',
    '롤플레이 중 새로 드러난 정보는 모델이 알려 줘서 자동으로 채워져요. 이미 쌓인 채팅이 있으면 위 버튼으로 호감도·관계 요약·정보·등장인물을 한 번에 가져와요.': 'New facts revealed in roleplay are filled in automatically. If you already have a long chat, the button above imports closeness, relationship summary, facts and characters at once.',
    '장면 생성기 외형 태그를 내 태그로 복사': 'Copy Scene Studio tags to mine', '장면 생성기 태그를 내 태그로 복사': 'Copy Scene Studio tags to mine', '장면 생성기 태그': 'Scene Studio tags', '장면 생성기 태그 (사용 중)': 'Scene Studio tags (in use)', '내 태그': 'My tags', '내 태그 (연동 중이라 쓰이지 않아요)': 'My tags (not used while linked)', '장면 생성기 외형 태그 연동 (저장된 태그가 있어요)': 'Link Scene Studio appearance tags (tags found)', '장면 생성기 외형 태그 연동 (이 캐릭터의 태그가 아직 없어요)': 'Link Scene Studio appearance tags (none for this character yet)',
    '켜면 장면 생성기에 저장된 태그를 그대로 써요. 태그가 없으면 아래 내 태그나 카드 설명을 써요.': 'When on, the tags saved in Scene Studio are used as they are. If none exist, your tags below or the card description are used.', '카드 PNG·설명에서 영어 외형 태그 뽑기 (모델 1회)': 'Extract English appearance tags from the card PNG and description (1 model call)',
    '비워 두면 처음 생성할 때 카드 PNG와 설명으로 영어 외형 태그를 한 번 만들어 저장해요. 직접 고치면 외형이 더 일관돼요.': 'If empty, English appearance tags are made once from the card PNG and description at the first generation. Editing them yourself makes the look more consistent.',
    '장면 생성기 태그를 복사했어요': 'Copied the Scene Studio tags', '장면 생성기 외형 태그를 복사했어요': 'Copied the Scene Studio tags', '프리셋을 저장했어요': 'Preset saved', '화풍 프리셋을 저장했어요': 'Style preset saved', '프리셋 이름을 적어 주세요.': 'Enter a preset name.', '삭제할 프리셋을 먼저 고르세요.': 'Choose a preset to delete first.',
    '화풍 (장면 생성기와 같은 방식)': 'Art style (same as Scene Studio)', '프리셋': 'Preset', '장면 생성기와 동일 (연동)': 'Same as Scene Studio (linked)', '직접 입력': 'Custom', '화풍 프롬프트 (CG·표정·인물)': 'Style prompt (CG · expressions · characters)', '프리셋 이름': 'Preset name', '프리셋 저장': 'Save preset', '프리셋 삭제': 'Delete preset', '제외 요소 (이런 건 그리지 않기)': 'Exclusions (things not to draw)', '예: text, watermark, extra fingers': 'e.g. text, watermark, extra fingers', '배경 화풍 (비우면 위 화풍 사용)': 'Background style (uses the style above if empty)',
    '외형 태그를 뽑을 때 카드 PNG 이미지도 함께 보내기': 'Also send the card PNG when extracting appearance tags', 'Gemini 모델로 이미지를 먼저 보고, 설명은 빈틈을 채워요.': 'A Gemini model looks at the image first; the description fills the gaps.', '외형 추출 모델 (Gemini)': 'Appearance extraction model (Gemini)',
    '선택지 (CYOA)': 'Choices (CYOA)', '선택지 개수': 'Number of choices', '선택지 길이 (글자 수 안팎)': 'Choice length (about N characters)', '짧고 단조로운 선택지를 줄이려면 늘려 보세요. 행동과 대사를 함께 써요.': 'Increase this to avoid short, monotonous choices. They combine an action and speech.', '{}번 선택지 프롬프트': 'Choice {} prompt', '선택지 공통 추가 지시': 'Extra instruction for all choices', '예: 매번 서로 다른 장소/소품을 활용할 것': 'e.g. Use a different place or prop each time',
    '비워 두면 위 기본 문장(placeholder)을 써요. {{user}}와 {{char}}를 쓸 수 있어요. 채팅 모드와 일상 모드 모두에 적용돼요.': 'If empty, the default sentence shown as the placeholder is used. You can use {{user}} and {{char}}. Applies to both chat and daily mode.',
    '응답 품질 · 언어': 'Reply quality · Language', '내 입력이 짧아도 답변 길이·품질 유지': 'Keep reply length and quality even when my input is short', '모델에게 "이전 답변만큼 길고 풍부하게, 짧은 입력을 따라 줄어들지 말 것"을 항상 전달해요.': 'Always tells the model to "stay as long and rich as earlier replies and not shrink to match a short input".', '추가 품질 지시 (선택)': 'Extra quality instruction (optional)', '예: 최소 4문단, 감각 묘사와 인물의 속마음을 포함': 'e.g. At least 4 paragraphs, with sensory detail and the character\'s inner thoughts',
    '이야기 출력 언어': 'Story output language', '화면 언어와 같게': 'Same as UI language', '채팅 기록을 따라감': 'Follow the chat history', '기존 채팅이 영어여도 한국어를 고르면 모델이 한국어로 쓰도록 강하게 지시해요. 선택지와 상태 정보도 같은 언어예요.': 'Even if the existing chat is in English, choosing Korean strongly instructs the model to write in Korean. Choices and status info use the same language.',
    '내가 다른 언어로 입력하면 출력 언어로 번역해서 전송 (모델 1회)': 'Translate my input into the output language before sending (1 model call)', '예: 한국어로 입력했는데 출력 언어가 English이면 영어로 번역한 문장이 SillyTavern에 기록돼요.': 'e.g. If you type in Korean but the output language is English, the English translation is what gets recorded in SillyTavern.', '입력을 번역하는 중': 'Translating your input', '입력 번역에 실패해서 원문 그대로 보내요: {}': 'Input translation failed, sending the original: {}',
    '🗺 지도 이미지 ({})': '🗺 Map images ({})', '이 지도로 쓰기': 'Use this map', '사용 중': 'In use', '지도 장소': 'Map place', '이미지 비우기': 'Clear image',
    '지도 탭에서 만들거나 올린 지도 이미지예요. 새로 만들어도 이전 지도는 여기에 남아요. 이미지를 누르면 크게 보이고, "이 지도로 쓰기"를 누르면 그 지도로 되돌려요.': 'Map images you made or uploaded in the Map tab. Older maps stay here when you make a new one. Click an image to enlarge it, or press "Use this map" to switch back.',
    '지도 탭에서 분석하거나 추가한 장소도 여기에 함께 나와요. 이미지가 없는 장소는 "배경 생성"으로 미리 만들 수 있고, 처음에 취소해도 언제든 다시 만들 수 있어요.': 'Places analyzed or added in the Map tab also appear here. Places without an image can be pre-generated with "Generate background", and you can always do it later even if you cancelled at first.',
    '이미지 없는 장소 한꺼번에 생성 ({}장)': 'Generate all places without an image ({})', '이미지가 없는 장소가 없어요.': 'Every place already has an image.', '이 지도 이미지를 목록에서 지울까요? (서버 파일도 지워요)': 'Remove this map image from the list? (The server file is deleted too.)',
    '이 장소의 배경 이미지를 비울까요? (장소는 지도에 그대로 남아요)': 'Clear this place\'s background image? (The place stays on the map.)', '장소는 목록에 남겨 뒀어요. 나중에 "배경 생성"을 누르면 돼요.': 'The place stays in the list. Press "Generate background" later.',
    '지도 이미지 생성': 'Generate map image', '지도 이미지 다시 생성': 'Regenerate map image', '마커 전체': 'All markers', 'NPC만': 'NPCs only', '마커 숨김': 'Hide markers', '위치 모름': 'Unknown', '장소 없음': 'No place',
    '위치 없는 NPC 위치 찾기 (모델 1회)': 'Find locations for NPCs without one (1 model call)', '지도 위치': 'Map location',
    'NPC가 어느 장소에 있는지 정하면 지도의 그 장소 핀 둘레에 작은 아이콘으로 나와요. 아이콘에 마우스를 올리거나 누르면 이름이 떠요. 장면 생성기의 마커와 같은 데이터예요.': 'Once you set where an NPC is, it appears as a small icon around that place pin on the map; hover or tap the icon to see the name. This is the same data as the Scene Studio markers.',
    '이미지 API 키를 먼저 넣어 주세요.': 'Enter the image API key first.', '지도 이미지를 만들었어요. 그림과 핀이 어긋나면 핀을 끌어서 맞춰 주세요.': 'Map image created. If the picture and the pins do not line up, drag the pins to match.',
    '내부 지도 정리': 'Tidy inner maps', '내부 지도 정리 ({})': 'Tidy inner maps ({})', '지도 이미지 올리기': 'Upload map image', '지도 이미지 제거': 'Remove map image', '지도 이미지를 올리는 중…': 'Uploading the map image…', '이 지도 이미지를 제거할까요? (장소는 그대로 남아요)': 'Remove this map image? (Places stay as they are.)',
    '지도 이미지가 없어요. 위에서 올리거나 "지도 이미지 생성"을 눌러 주세요': 'No map image. Upload one above or press "Generate map image".', '다른 이름 (쉼표로 구분)': 'Other names (comma-separated)', '설명': 'Description', '그림 묘사 (영어 권장, 배경 생성에 쓰여요)': 'Visual description (English recommended, used for background generation)', '위치': 'Location', '세계 지도에 표시': 'Show on the world map',
    '{}개 장소를 건물 바로 아래로 옮겨 내부 지도를 합쳤어요. 새 위치를 확인해 주세요.': 'Moved {} places directly under their building to merge the inner maps. Please check the new positions.', '합칠 내부 지도가 없어요. 이미 정리돼 있어요.': 'No inner maps to merge. Already tidy.',
    '도시': 'City', '마을·구역': 'Town / District', '여관·숙소': 'Inn', '상점': 'Shop', '식당·카페': 'Restaurant / Cafe', '대장간': 'Smithy', '신전·교회': 'Temple / Church', '학교': 'School', '집': 'Home', '성·궁전': 'Castle / Palace', '문·다리': 'Gate / Bridge', '던전·동굴': 'Dungeon / Cave', '숲·공원': 'Forest / Park', '강·호수·바다': 'River / Lake / Sea', '건물': 'Building', '기타': 'Other',
    '장면 생성기 화풍을 쓰는 중: {}': 'Using the Scene Studio style: {}', '장면 생성기에 저장된 화풍이 없어서 아래 직접 입력 값을 써요.': 'Scene Studio has no saved style, so the custom value below is used.', '직접 입력 / 저장한 프리셋을 쓰는 중이에요.': 'Using a custom value / saved preset.',
    '외형 태그를 뽑는 중…': 'Extracting appearance tags…', '이미지 API 키가 없어요': 'No image API key',

    // --- 1.5 추가 ---
    '+ 장소 추가': '+ Add place', '{} 안': 'Inside {}', 'AI로 만들기': 'Generate with AI', 'AI로 생성 (이미지 1회)': 'Generate with AI (1 image)', '기존 채팅 분석': 'Existing chat analysis', '다시 보기(replay) 장면이라 판단하지 않음': 'Replayed scene, no decision made', '이벤트 없음': 'No event',
    '단색 배경 색': 'Solid background color', '배경 이미지 없이 단색으로 두기': 'Use a solid color instead of a background image', '캐릭터 이미지에서 투명하게 안 지워진 부분(팔 사이 등)이 배경과 같은 색이라 투명처럼 보여요. 배경 생성과 장소 이미지는 그대로 두고 화면에서만 가려요.': 'Areas the cutout did not make transparent (between the arms, etc.) share the background color, so they look transparent. Backgrounds and place images are kept; they are only hidden on screen.', '캐릭터 이미지의 배경색을 자동으로 맞추기': 'Match the background color of the character image automatically', '생성한 원본 이미지(배경을 지우지 않은 것)의 모서리 색을 읽어 그 색으로 채워요.': "Reads the corner color of the generated original (background not removed) and fills with that color.",
    '롤플레이 중 새로 드러난 정보는 모델이 알려 줘서 자동으로 채워져요. 이미 쌓인 채팅이 있으면 위 버튼으로 호감도·관계 요약·정보를 한 번에 가져와요. 등장인물은 NPC 탭에서 따로 분석해요.': 'New facts revealed in roleplay are filled in automatically. If you already have a long chat, the button above imports closeness, relationship summary and facts at once. Characters (NPCs) are analyzed separately in the NPC tab.',
    '마커 ({})': 'Markers ({})', '마커가 없어요.': 'No markers.', '배경': 'Backgrounds', '분석하기 (모델 1회)': 'Analyze (1 model call)', '생성 취소': 'Cancel generation', '장소·마커 분석': 'Place & marker analysis', '장소·마커 자동 분석': 'Auto-analyze places & markers', '장소·마커도 함께 분석 (모델 +1회)': 'Also analyze places & markers (+1 model call)', '장소·마커를 분석하는 중…': 'Analyzing places and markers…',
    '배경은 직접 올린 이미지 → 이미 만든 이미지 → 장면 생성기 이미지 순으로 쓰고, 어디에도 없을 때만 새로 만들어요. 다시 만드는 건 아래 "다시 생성"을 눌렀을 때뿐이에요. 이 목록은 캐릭터마다 따로 저장돼요.': 'Backgrounds are used in this order: your upload → an image already made → a Scene Studio image; a new one is generated only if none exists. Regeneration happens only when you press "Regenerate" below. This list is stored separately for each character.',
    '설명 (외형·성격, AI 이미지 생성에도 쓰여요)': 'Description (appearance and personality, also used for AI image generation)', '역할 / 관계': 'Role / relationship', '인물 이름': 'Character name', '장면 생성기 이미지에서 불러오기': 'Load from a Scene Studio image', '장면 생성기 이미지': 'Scene Studio image', '장면 생성기에 만들어 둔 이미지에서 고르세요': 'Choose from the images already made in Scene Studio', '장면 생성기에 불러올 이미지가 아직 없어요.': 'Scene Studio has no image to load yet.',
    '장면 생성기와 같은 방식으로 캐릭터 카드·로어북·최근 대화에서 장소와 마커를 찾아 지도에 추가해요. 모델 1회 호출이에요. 이미 있는 장소는 건너뛰어요.': 'Finds places and markers from the character card, lorebook and recent chat the same way Scene Studio does, and adds them to the map. 1 model call. Places that already exist are skipped.',
    '카드 안의 다른 인물 ({}) — 한 카드에 여러 명이 있을 때': 'Other characters in this card ({}) — when one card holds several people', '카드 이미지(PNG)에 여러 사람이 있으면 인물을 따로 등록해 외형 태그·표정·의상을 각자 관리해요. 이야기에서 모델이 [VN] 블록의 who: 로 지금 화면에 보여 줄 인물을 알려 줘요.': 'If the card image (PNG) shows several people, register them separately to manage appearance tags, expressions and outfits for each. The model tells which one to show via who: in the [VN] block.',
    '등록된 인물이 없어요.': 'No characters registered.', '인물 추가': 'Add character', '장면 생성기에 있는 인물:': 'Characters in Scene Studio:', '항목': 'Item',
    '호감도가 해당 수치를 처음 넘으면 특별 이벤트 장면이 나오도록 모델에게 요청해요. 마이너스 호감도는 같은 10칸이 검은 하트로 채워져요.': 'When closeness first passes these values, the model is asked to deliver a special event scene. Negative closeness fills the same 10 slots with black hearts.',
    '이미지 올리기': 'Upload image', '장소 이름 (예: 학교 옥상)': 'Place name (e.g. School rooftop)', '설명 (선택: 비우면 장면 생성기 묘사나 로어북에서 찾아 써요)': "Description (optional: if empty, Scene Studio's description or the lorebook is used)", '이미지 없음': 'No image', '올릴 이미지를 선택해 주세요.': 'Choose an image to upload.', '불러올 이미지를 골라 주세요.': 'Choose an image to load.', '직접 지정': 'Set manually', '추가': 'Add',
    'NPC': 'NPC', '채팅 기록으로 분석 (모델 1회)': 'Analyze from chat history (1 model call)', 'NPC를 분석하는 중…': 'Analyzing NPCs…', '관계 요약': 'Relationship summary', '장소 {}, 마커 {}를 추가했어요. 지도 탭에서 수정할 수 있어요.': 'Added {} places and {} markers. You can edit them in the Map tab.', 'NPC {}명을 추가하고 {}명을 갱신했어요': 'Added {} NPCs and updated {}.',
    '카드 PNG·설명에서 영어 외형 태그 뽑기 (모델 1회)': 'Extract English appearance tags from the card PNG and description (1 model call)', '이미 있는 인물이에요.': 'That character already exists.', '\'{}\' 인물을 목록에서 뺄까요? (만든 이미지는 서버에 남아요)': "Remove '{}' from the list? (Generated images remain on the server.)",

    // --- 1.6 추가 ---
    '자료에서 외형 태그 뽑기 (모델 1회)': 'Extract appearance tags from the material (1 model call)', '외형 태그 (영어). 비워 두면 AI 이미지를 만들 때 설명 → 카드·로어북 → 채팅 기록 순으로 근거를 찾아 자동으로 만들어요': 'Appearance tags (English). If empty, when generating an AI image the evidence is searched in this order: description → card/lorebook → chat history.',
    'NPC 외형 근거를 찾는 중…': 'Looking for evidence of the NPC\'s appearance…', '외형 태그를 만들었어요 (근거: {})': 'Appearance tags created (evidence: {})', '카드·로어북·채팅 기록에서 이 인물의 외형 근거를 찾지 못했어요. 설명을 적어 주세요.': 'Could not find evidence of this character\'s appearance in the card, lorebook or chat history. Please write a description.', '외형 근거: {}': 'Appearance evidence: {}',
    '저장된 외형 태그': 'Saved appearance tags', '카드·로어북': 'Card / lorebook', '채팅 기록': 'Chat history', '설명': 'Description', '자료 없음 (AI가 역할에 맞게 설계)': 'No material (the AI designs it to fit the role)',
    '저장 공간': 'Storage', '이미지를 지울 때 서버 파일도 함께 지우기': 'Also delete the server file when removing an image', '다른 곳에서 쓰지 않는 VN Studio 이미지(user/images/vnstudio)만 지워요. 이 서버가 삭제를 지원하지 않으면 파일은 그대로 남아요.': 'Only VN Studio images (user/images/vnstudio) that are not used elsewhere are deleted. If this server does not support deletion, the file stays.', '쓰지 않는 표정·NPC 이미지 찾아서 정리': 'Find and clean up unused expression/NPC images', '저장된 이미지를 확인하는 중…': 'Checking saved images…',
    '이 서버에서는 이미지 목록을 가져올 수 없어요. 확장 폴더(user/images/vnstudio)를 직접 확인해 주세요.': 'This server cannot list images. Please check the folder (user/images/vnstudio) yourself.', '전체 {}개 중 지울 미사용 표정·NPC 이미지는 없어요.': 'Of {} images in total, there are no unused expression/NPC images to delete.', 'vnstudio 폴더에 이미지 {}개가 있고, 그중 어디에도 쓰이지 않는 표정·NPC 이미지가 {}개예요.\n지울까요? (이벤트 CG와 영상은 다른 채팅에서 쓰일 수 있어 건드리지 않아요)': 'The vnstudio folder has {} images, {} of them are expression/NPC images used nowhere.\nDelete them? (Event CGs and videos may be used by other chats, so they are left alone.)', '{}개를 지웠어요': 'Deleted {}',
    '모델 응답 기다리는 최대 시간 (초)': 'Maximum time to wait for the model (seconds)', '일상 모드 계획·장면 생성이 이 시간 안에 오지 않으면 이유와 함께 실패로 처리하고 다시 시도할 수 있어요.': 'If a daily-mode plan or scene does not arrive in this time, it is treated as failed with a reason and you can retry.', '생성 실패: {}': 'Generation failed: {}', '모델이 {}초 안에 답하지 않았어요. 연결 프로필·모델 상태를 확인하고 다시 시도해 주세요': 'The model did not answer within {} seconds. Check the connection profile / model and try again.', '모델 응답이 비어 있어요': 'The model reply was empty', '실패': 'Failed',
    'SillyTavern 채팅창에서도 숨기기 (아래 태그 이름 + facts/status 등)': 'Also hide in the SillyTavern chat window (tag names below + facts/status, etc.)', '화면에서만 가려요. 저장된 대화와 모델에게 보내는 내용은 그대로예요. 짝이 안 맞는 태그(<small><facts></small></facts>)도 처리해요.': 'Only hidden on screen. The saved chat and what is sent to the model stay unchanged. Mismatched tags like <small><facts></small></facts> are handled too.',
    'HTML/CSS 서식이 있는 메시지는 원본 서식 패널을 자동으로 열기': 'Automatically open the original-format panel for messages with HTML/CSS', '프리셋이 만드는 색·애니메이션·움직이는 이미지 상태창을 팝업 안 작은 창으로 볼 수 있어요. 해당 메시지가 있을 때만 상단에 </> 버튼이 나타나요.': 'Shows the colored, animated, moving-image status windows made by presets in a small window inside the popup. A </> button appears at the top only when such a message exists.',
    '채팅 원본 서식 보기 (HTML/CSS 효과)': 'View original chat formatting (HTML/CSS effects)', '채팅 원본 서식': 'Original chat formatting', '다시 불러오기': 'Reload',

    // --- 1.7 추가 ---
    'HTML/CSS 효과 보기': 'View HTML/CSS effects', 'HTML/CSS 효과': 'HTML/CSS effects', '끌어서 옮기기': 'Drag to move', '옮기기': 'Move', '글씨 끄기': 'Hide text', '글씨 켜기': 'Show text',
    'HTML/CSS 효과가 있는 메시지는 효과 창을 자동으로 열기': 'Automatically open the effect window for messages with HTML/CSS effects', '프리셋이 만드는 색·애니메이션·움직이는 이미지 효과만 작은 창에 따로 보여 줘요(생각·본문·상태창 글은 제외). 효과가 있는 메시지일 때만 상단에 </> 버튼이 나타나고, 창 오른쪽 위에 마우스를 올리면 이동·닫기 버튼이 보여요.': 'Shows only the colors, animations and moving images made by presets in a small separate window (thinking, story text and status text are excluded). A </> button appears at the top only for messages with effects, and hovering the top-right of the window reveals move/close buttons.',
    'YAML형 상태창 줄(key: value가 3줄 이상 이어짐) 숨기기': 'Hide YAML-style status lines (3 or more key: value lines in a row)', '```로 감싸지 않은 상태창도 가려요. 대사가 "이름: 말" 형식이라 잘못 가려지면 끄세요.': 'Also hides status blocks not wrapped in ```. Turn this off if dialogue in a "Name: text" format gets hidden by mistake.',
    '캐릭터 크기·위치': 'Character size & position', '캐릭터 크기와 위치': 'Character size and position', '크기': 'Size', '위치': 'Position', '초기화': 'Reset', '테마': 'Theme', '벚꽃 (기본)': 'Sakura (default)', '한밤 (남색)': 'Midnight (navy)', '숲 (초록)': 'Forest (green)', '노을 (주황)': 'Sunset (orange)', '라벤더 (보라)': 'Lavender (purple)', '흑백': 'Monochrome', '화면 색 분위기가 바뀌어요.': 'Changes the color mood of the screen.',
    '캐릭터 이미지 크기 %': 'Character image size %', '캐릭터 이미지 위치 (위·아래)': 'Character image position (up/down)', '화면 위의 ⤢ 버튼이나 Ctrl+마우스 휠로도 조절해요.': 'You can also adjust it with the ⤢ button on screen or Ctrl + mouse wheel.',
    '일상 모드: 선택 후 이어지는 선택지 개수': 'Daily mode: number of follow-up choices', '처음 선택지(3~4개)를 고르면 이어지는 후속 선택지가 이 개수만큼 나와요. 모델이 적게 줄 수 있어 개수를 지정해 요청해요.': 'After you pick one of the first choices (3–4), this many follow-up choices appear. The model may give fewer, so the count is requested explicitly.',
    '선택지 + 직접 입력 (선택지 아래에 입력칸)': 'Choices + typing (input box under the choices)', '선택지만': 'Choices only', '채팅 모드 이벤트 ({})': 'Chat-mode events ({})', '외형 추출 모델 \'{}\'을 쓸 수 없어 gemini-2.5-flash로 대신 시도해요.': "The appearance extraction model '{}' is unavailable, trying gemini-2.5-flash instead.",

  };
  const EN_EXACT = new Map(), EN_PAT = [];
  for (const [k, v] of Object.entries(EN)) {
    if (k.includes('{}')) { const re = new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '{' || c === '}' ? c : '\\' + c)).replace(/\{\}/g, '([\\s\\S]+?)') + '$'); EN_PAT.push([re, v]); }
    else EN_EXACT.set(k, v);
  }
  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], WD_EN = { 일: 'Sun', 월: 'Mon', 화: 'Tue', 수: 'Wed', 목: 'Thu', 금: 'Fri', 토: 'Sat' };
  /* 문장 안에 끼어 있는 조각(날짜, 숫자 단위 등) */
  const EN_SUB = [
    [/(\d+)월 (\d+)일 \(([일월화수목금토])\)/g, (m, mo, d, w) => `${MON_EN[mo - 1]} ${d} (${WD_EN[w]})`], [/(\d{4})년 (\d+)월/g, (m, y, mo) => `${MON_EN[mo - 1]} ${y}`],
    [/(\d+)일째/g, 'Day $1'], [/오늘 /g, 'Today '], [/Day 1 날짜/g, 'Day 1 date'], [/시작일/g, 'Start date'], [/API 텍스트 (\d+) · 이미지 (\d+)/g, 'API text $1 · images $2'], [/ · 영상 (\d+)/g, ' · videos $1'], [/ · 429×(\d+)/g, ' · 429×$1'],
    [/호감도 (-?\d+)/g, 'Closeness $1'], [/호감 ([+-]?\d+)/g, 'Closeness $1'], [/선택: /g, 'Chose: '], [/호감도 하트 (\S+)/g, 'Closeness hearts $1'], [/\((\d+)초\)/g, '($1s)'], [/ · 모델 응답이 오래 걸리고 있어요\. 멈춘 게 아니에요/g, ' · The model is taking a while. It has not frozen.'],
    [/(\d+)장/g, '$1'], [/(\d+)개/g, '$1'], [/ — 혼자/g, ' — alone'], [/(아침|점심|오후|저녁|밤) (\d\d:\d\d)/g, (m, a, tm) => `${({ 아침: 'Morning', 점심: 'Noon', 오후: 'Afternoon', 저녁: 'Evening', 밤: 'Night' })[a]} ${tm}`], [/(아침|점심|오후|저녁|밤)(?![가-힣])/g, (m) => ({ 아침: 'Morning', 점심: 'Noon', 오후: 'Afternoon', 저녁: 'Evening', 밤: 'Night' })[m]],
  ];
  const trStr = (s) => {
    const k = String(s).trim(); if (!k || !/[가-힣]/.test(k)) return s;
    let v = EN_EXACT.get(k);
    if (v === undefined) for (const [re, out] of EN_PAT) { const m = k.match(re); if (m) { let i = 0; v = out.replace(/\{\}/g, () => trStr(m[++i] ?? '')); break; } }
    if (v === undefined) { v = k; for (const [re, out] of EN_SUB) v = v.replace(re, out); if (v === k) return s; }
    return String(s).replace(k, v);
  };
  const trMsg = (m) => (langKey() === 'en' ? trStr(String(m)) : m);
  /* 화면(DOM)의 한국어 문구를 영어로 바꾸고, 한국어로 돌아올 때를 위해 원문을 기억해 둔다 */
  const I18N_ATTR = ['title', 'placeholder', 'aria-label', 'alt'];
  const trSkip = (el) => !el.closest?.('.vn-evmini-wrap') && !!el.closest?.('#vn-text, #vn-lp-body, .vn-ev-cap, .vn-pre, .vn-name, .vn-choice, .vn-wait');
  function i18nNode(root) {
    if (!root) return;
    const en = langKey() === 'en';
    const tw = document.createTreeWalker(root, 4); const nodes = []; let n;
    while ((n = tw.nextNode())) nodes.push(n);
    for (const node of nodes) {
      const el = node.parentElement; if (!el || trSkip(el)) continue;
      if (en) { if (/[가-힣]/.test(node.nodeValue)) { const out = trStr(node.nodeValue); if (out !== node.nodeValue) { node.__ko = node.__ko ?? node.nodeValue; node.nodeValue = out; } } }
      else if (node.__ko !== undefined) { node.nodeValue = node.__ko; delete node.__ko; }
    }
    const els = root.nodeType === 1 ? [root, ...root.querySelectorAll('[title],[placeholder],[aria-label],[alt]')] : [];
    for (const el of els) for (const a of I18N_ATTR) {
      const v = el.getAttribute?.(a); const key = 'data-ko-' + a;
      if (en && v && /[가-힣]/.test(v)) { const out = trStr(v); if (out !== v) { if (!el.hasAttribute(key)) el.setAttribute(key, v); el.setAttribute(a, out); } }
      else if (!en && el.hasAttribute?.(key)) { el.setAttribute(a, el.getAttribute(key)); el.removeAttribute(key); }
    }
  }
  function i18nWatch(rootEl) {
    if (!rootEl || !window.MutationObserver) return;
    let busy = false, dirty = false;
    const run = () => { busy = true; try { i18nNode(rootEl); } finally { setTimeout(() => { busy = false; if (dirty) { dirty = false; run(); } }, 0); } };
    new MutationObserver(() => { if (langKey() !== 'en') return; if (busy) { dirty = true; return; } run(); }).observe(rootEl, { childList: true, subtree: true, characterData: true });
  }
  const i18nAll = () => { i18nNode(ui.root); i18nNode(document.getElementById('vn-drawer')); };

  /* ================= 초기화 ================= */
  jQuery(() => {
    const c = ctx(), ET = c.event_types || c.eventTypes;
    S(); applyLang();
    if (!document.getElementById('vn-fonts')) { const l = document.createElement('link'); l.id = 'vn-fonts'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Gowun+Dodum&display=swap'; document.head.appendChild(l); }
    (document.getElementById('extensions_settings2') || document.getElementById('extensions_settings'))?.insertAdjacentHTML('beforeend', drawerHtml);
    const drawer = document.getElementById('vn-drawer');
    if (!S().geminiKey && ssSet()?.geminiKey) importSceneStudio(true);    // 장면 생성기에 키가 있으면 처음 한 번 자동으로 가져온다
    fillInputs(drawer); renderProfiles();
    document.getElementById('vn-open-btn')?.addEventListener('click', openVN);
    document.getElementById('vn-import-btn')?.addEventListener('click', () => importSceneStudio(false));
    document.getElementById('vn-test-btn')?.addEventListener('click', testGemini);
    const onSettingInput = (e) => {
      const el = e.target; if (!el?.dataset?.vk) return;
      const k = el.dataset.vk, s = S();
      s[k] = el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range') ? +el.value : el.value;
      saveSettings(); ui.applyLook(); refreshInject(); fabVisible();
      if (k === 'lang') { applyLang(); ui.hud(st.turn); i18nAll(); if (st.open) renderModal(); refreshInject(); }
      if (k === 'devMode' && !el.checked && st.tab === 'dev') st.tab = 'set';
      if (k === 'enabled' && !el.checked && st.open) ui.close();
      if (k === 'theme') ui.applyLook();
      if (k === 'bgBlank' || k === 'bgBlankColor' || k === 'bgBlankAuto') matchBlank(st.lastSprite?.url, st.lastSprite?.kind);
      if ((k === 'useSSLook' || k === 'useSS') && st.open) renderModal();
    };
    document.addEventListener('input', onSettingInput);
    document.addEventListener('change', onSettingInput);

    ui.build(); bindUI(); i18nWatch(ui.root); i18nWatch(document.getElementById('vn-drawer')); i18nAll();
    const fab = document.createElement('button'); fab.id = 'vn-fab'; fab.title = 'VN Studio 열기 (끌어서 옮기기)'; fab.setAttribute('aria-label', 'VN Studio 열기'); fab.innerHTML = '<i class="fa-solid fa-heart"></i>';
    document.body.appendChild(fab); ui.applyLook();
    const placeFab = () => { const p = S().fabPos || { r: 14, b: 96 }; fab.style.right = clamp(p.r, 4, Math.max(4, window.innerWidth - 44)) + 'px'; fab.style.bottom = clamp(p.b, 4, Math.max(4, window.innerHeight - 44)) + 'px'; };
    placeFab(); window.addEventListener('resize', placeFab);
    fab.addEventListener('pointerdown', (e) => {   // 눌러서 열기 / 끌어서 옮기기
      const sx = e.clientX, sy = e.clientY; let moved = false; fab.setPointerCapture?.(e.pointerId);
      const mv = (ev) => { if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 6) moved = true; if (!moved) return; S().fabPos = { r: window.innerWidth - ev.clientX - 19, b: window.innerHeight - ev.clientY - 19 }; placeFab(); };
      const up = () => { fab.removeEventListener('pointermove', mv); fab.removeEventListener('pointerup', up); if (moved) saveSettings(); else openVN(); };
      fab.addEventListener('pointermove', mv); fab.addEventListener('pointerup', up);
    });
    function fabVisible() {
      const on = S().enabled;
      fab.style.display = on && S().fab ? '' : 'none';
      const w = document.getElementById('vn_wand_btn'); if (w) w.style.display = on ? '' : 'none';
      const ob = document.getElementById('vn-open-btn'); if (ob) ob.disabled = !on;
    }
    fabVisible();
    const menu = document.getElementById('extensionsMenu');
    if (menu) { menu.insertAdjacentHTML('beforeend', '<div id="vn_wand_btn" class="list-group-item flex-container flexGap5"><div class="fa-solid fa-heart extensionsMenuExtensionButton"></div><span>VN Studio 열기</span></div>'); document.getElementById('vn_wand_btn').addEventListener('click', openVN); }
    fabVisible();

    c.eventSource.on(ET.CHAT_CHANGED, () => {
      st.turn = null; st.evt = null; st.pendingEvt = null; st.lastSprite = null; st.curEmo = ''; st.slotInfo = null; st.pendingUser = ''; st.calSel = null; st.calMonth = ''; st.schedDay = 0; st.selChar = '';
      finishText(true); showWaiting(false);
      for (const k of Object.keys(loreCache)) delete loreCache[k];
      refreshInject(); stripTags();
      if (ui.root) { ui.hideSprites(); ui.setBg('', ''); ui.q('#vn-text').innerHTML = ''; ui.clearEnd(); }     // 열려 있지 않아도 이전 캐릭터의 배경·이미지를 비운다
      if (st.open && lpOpen()) renderLogPanel();
      if (st.open) { replayLast(); setTimeout(() => autoAnalyze(), 800); }
    });
    for (const name of ['MESSAGE_RECEIVED', 'MESSAGE_SWIPED']) if (ET[name]) c.eventSource.on(ET[name], (id) => { st.processing = true; Promise.resolve(onMessage(id)).finally(() => { st.processing = false; }); stripTags(); });
    for (const name of ['CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED', 'MESSAGE_UPDATED', 'MESSAGE_EDITED']) if (ET[name]) c.eventSource.on(ET[name], stripTags);
    if (ET.GENERATION_STARTED) c.eventSource.on(ET.GENERATION_STARTED, (type, p, dry) => {
      refreshInject(type, p, dry);
      if (st.open && S().enabled && M().mode === 'chat' && type !== 'quiet' && type !== 'impersonate' && !dry && !st.waiting) showWaiting(true, '…');
    });
    for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED']) if (ET[name]) c.eventSource.on(ET[name], () => setTimeout(() => { if (st.waiting && !st.processing && st.open && M().mode === 'chat') { showWaiting(false); if (st.turn) showEnd(st.turn); } }, 1500));
    if (ET.PERSONA_CHANGED) c.eventSource.on(ET.PERSONA_CHANGED, () => ui.hud(st.turn));
    const chatEl = document.getElementById('chat');
    if (chatEl) new MutationObserver(stripTags).observe(chatEl, { childList: true, subtree: true, characterData: true });
    refreshInject(); stripTags();
  });
})();

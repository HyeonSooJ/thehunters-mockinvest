/* ============================================================================
 * thehunters 모의투자 - 통합 사이트
 *
 * desktop-tutorial(실제 KRX 시세 기반 캔들차트 엔진)과
 * invest_game_thehunters(그룹/리더보드 백엔드)를 합쳐 만든 사이트입니다.
 *
 * 참가자 데이터(그룹/닉네임/수익률)는 이 페이지가 직접 GitHub에 쓰지 않고,
 * Cloudflare Worker(WORKER_URL)를 통해서만 저장/조회합니다. 배포 방법은
 * cloudflare-worker/worker.js 파일 상단 주석과 README.md를 참고하세요.
 * ==================================================================== */

const WORKER_URL = 'https://mockinvest.thehunters.workers.dev';

async function callWorker(path, body) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.error || `요청 실패 (${res.status})`);
  return result;
}

let latestState = { groups: [], participants: [] };
async function fetchState() { latestState = await callWorker('/state', {}); return latestState; }
function escAttr(s) { return String(s).replace(/'/g, "\\'"); }

/* --- 모달 --- */
function openModal(html) {
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modalBackdrop').hidden = false;
}
function closeModal() {
  document.getElementById('modalBackdrop').hidden = true;
  document.getElementById('modalBox').innerHTML = '';
}

/* --- 투자 종목 풀 (2020년 이전 상장된 국내 종목) ---
 * 가격 데이터는 하드코딩하지 않고, data/ohlc/<code>.js 에서 지연 로딩합니다. */
const MI_STOCK_POOL = [
  { key: '005930', name: '삼성전자' }, { key: '000660', name: 'SK하이닉스' },
  { key: '207940', name: '삼성바이오로직스' }, { key: '005380', name: '현대차' },
  { key: '000270', name: '기아' }, { key: '051910', name: 'LG화학' },
  { key: '006400', name: '삼성SDI' }, { key: '035420', name: 'NAVER' },
  { key: '035720', name: '카카오' }, { key: '105560', name: 'KB금융' },
  { key: '055550', name: '신한지주' }, { key: '086790', name: '하나금융지주' },
  { key: '316140', name: '우리금융지주' }, { key: '012330', name: '현대모비스' },
  { key: '028260', name: '삼성물산' }, { key: '015760', name: '한국전력' },
  { key: '032830', name: '삼성생명' }, { key: '009150', name: '삼성전기' },
  { key: '010130', name: '고려아연' }, { key: '011170', name: '롯데케미칼' },
  { key: '096770', name: 'SK이노베이션' }, { key: '018260', name: '삼성에스디에스' },
  { key: '034730', name: 'SK' }, { key: '017670', name: 'SK텔레콤' },
  { key: '030200', name: 'KT' }, { key: '003550', name: 'LG' },
  { key: '066570', name: 'LG전자' }, { key: '051900', name: 'LG생활건강' },
  { key: '090430', name: '아모레퍼시픽' }, { key: '004020', name: '현대제철' },
  { key: '010950', name: 'S-Oil' }, { key: '011200', name: 'HMM' },
  { key: '010140', name: '삼성중공업' }, { key: '011210', name: '현대위아' },
  { key: '024110', name: '기업은행' }, { key: '138040', name: '메리츠금융지주' },
  { key: '000810', name: '삼성화재' }, { key: '032640', name: 'LG유플러스' },
  { key: '003670', name: '포스코퓨처엠' }, { key: '005490', name: 'POSCO홀딩스' },
  { key: '068270', name: '셀트리온' }, { key: '196170', name: '알테오젠' },
  { key: '036570', name: '엔씨소프트' }, { key: '251270', name: '넷마블' },
  { key: '036460', name: '한국가스공사' }, { key: '016360', name: '삼성증권' },
  { key: '005940', name: 'NH투자증권' }, { key: '039490', name: '키움증권' },
  { key: '078930', name: 'GS' }, { key: '011780', name: '금호석유' },
  { key: '010060', name: 'OCI' }, { key: '004990', name: '롯데지주' },
  { key: '097950', name: 'CJ제일제당' }, { key: '001040', name: 'CJ' },
  { key: '079160', name: 'CJ CGV' }, { key: '035760', name: 'CJ ENM' },
  { key: '008770', name: '호텔신라' }, { key: '271560', name: '오리온' },
  { key: '005300', name: '롯데칠성' }, { key: '002790', name: '아모레G' },
  { key: '069960', name: '현대백화점' }, { key: '023530', name: '롯데쇼핑' },
  { key: '139480', name: '이마트' }, { key: '282330', name: 'BGF리테일' },
  { key: '128940', name: '한미약품' }, { key: '000100', name: '유한양행' },
  { key: '185750', name: '종근당' }, { key: '069620', name: '대웅제약' },
  { key: '000720', name: '현대건설' }, { key: '006360', name: 'GS건설' },
  { key: '047040', name: '대우건설' }, { key: '028050', name: '삼성엔지니어링' },
  { key: '294870', name: 'HDC현대산업개발' }, { key: '180640', name: '한진칼' },
  { key: '003490', name: '대한항공' }, { key: '020560', name: '아시아나항공' },
  { key: '089590', name: '제주항공' }, { key: '009540', name: '한국조선해양' },
  { key: '028670', name: '팬오션' }, { key: '004000', name: '롯데정밀화학' },
  { key: '192820', name: '코스맥스' }, { key: '096530', name: '씨젠' },
  { key: '028300', name: 'HLB' }, { key: '068760', name: '셀트리온제약' },
  { key: '086900', name: '메디톡스' }, { key: '145020', name: '휴젤' },
  { key: '214450', name: '파마리서치' }, { key: '214150', name: '클래시스' },
  { key: '054450', name: '텔레칩스' }, { key: '046890', name: '서울반도체' },
  { key: '108320', name: '실리콘웍스' }, { key: '005290', name: '동진쎄미켐' },
  { key: '064760', name: '티씨케이' }, { key: '066970', name: '엘앤에프' },
  { key: '086520', name: '에코프로' }, { key: '247540', name: '에코프로비엠' },
  { key: '047050', name: '포스코인터내셔널' }, { key: '009830', name: '한화솔루션' },
  { key: '272210', name: '한화시스템' }, { key: '006260', name: 'LS' },
  { key: '010120', name: 'LS ELECTRIC' }, { key: '004800', name: '효성' },
  { key: '353200', name: '대덕전자' }, { key: '222800', name: '심텍' },
  { key: '079550', name: 'LIG넥스원' }, { key: '012450', name: '한화에어로스페이스' },
  { key: '047810', name: '한국항공우주' }, { key: '322000', name: '현대에너지솔루션' },
  { key: '145720', name: '덴티움' }, { key: '041830', name: '인바디' },
  { key: '021240', name: '코웨이' }, { key: '007310', name: '오뚜기' },
  { key: '004370', name: '농심' }, { key: '000080', name: '하이트진로' },
  { key: '267980', name: '매일유업' }, { key: '035250', name: '강원랜드' },
  { key: '034230', name: '파라다이스' }, { key: '039130', name: '하나투어' },
  { key: '080160', name: '모두투어' }, { key: '272450', name: '진에어' },
  { key: '000120', name: 'CJ대한통운' }, { key: '086280', name: '현대글로비스' },
  { key: '002380', name: 'KCC' }, { key: '011790', name: 'SKC' },
];

/* --- OHLC 지연 로딩/캐시 --- */
window.MI_OHLC_DATA = window.MI_OHLC_DATA || {};
const miOhlcCache = {};
const miOhlcLoading = {};

const miFetchOhlc = (code) => {
  if (miOhlcCache[code]) return Promise.resolve(miOhlcCache[code]);
  if (miOhlcLoading[code]) return miOhlcLoading[code];
  miOhlcLoading[code] = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `data/ohlc/${code}.js`;
    script.onload = () => {
      const data = window.MI_OHLC_DATA[code];
      miOhlcCache[code] = data;
      delete miOhlcLoading[code];
      resolve(data);
    };
    script.onerror = () => {
      delete miOhlcLoading[code];
      script.remove();
      reject(new Error(`${code} 시세 데이터를 불러오지 못했습니다.`));
    };
    document.head.appendChild(script);
  });
  return miOhlcLoading[code];
};

/* --- 날짜/체크포인트 유틸 --- */
const MI_MIN_YEAR = 2020;
const MI_MAX_YEAR = 2026;
const MI_INITIAL_CASH = 500000;
const MI_ROUNDS = 2;
const MI_CHECKPOINTS = 4;

const miFractionalYearToDate = (year) => {
  const y = Math.floor(year);
  const frac = year - y;
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return new Date(start + frac * (end - start));
};

const miFindCheckpointIndex = (ohlc, targetDate) => {
  const targetStr = targetDate.toISOString().slice(0, 10);
  const idx = ohlc.d.findIndex((d) => d >= targetStr);
  return idx === -1 ? ohlc.d.length - 1 : idx;
};

const miFormatPeriodLabel = (year) => {
  const y = Math.floor(year);
  let month = Math.round((year - y) * 12) + 1;
  let labelYear = y;
  if (month > 12) { month -= 12; labelYear += 1; }
  return `${labelYear}년 ${month}월`;
};

const miCheckpointYears = (startYear, endYear) => {
  const years = [];
  for (let i = 0; i <= MI_CHECKPOINTS; i += 1) years.push(startYear + ((endYear - startYear) * i) / MI_CHECKPOINTS);
  return years;
};

const formatWon = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;

/* --- 캔들 차트 (실제 일별 시세) --- */
const MI_CANDLE_W = 400;
const MI_CANDLE_H = 220;
const MI_CANDLE_PAD_TOP = 16;
const MI_CANDLE_PAD_BOTTOM = 26;
const MI_CANDLE_PAD_RIGHT = 8;
const MI_Y_TICKS = 4;

const miBuildSegments = (ohlc, years, uptoCheckpointIndex) => {
  const allIdxs = years.map((y) => miFindCheckpointIndex(ohlc, miFractionalYearToDate(y)));
  const idxs = allIdxs.slice(0, uptoCheckpointIndex + 1);
  const quarterLen = Math.max(1, allIdxs[1] - allIdxs[0]);
  const lookbackStart = Math.max(0, idxs[0] - quarterLen);
  const firstSeg = { from: lookbackStart, to: idxs[0] };
  if (lookbackStart === idxs[0] && allIdxs[1] > idxs[0] + 1) {
    const peekLen = Math.min(20, quarterLen - 1);
    firstSeg.to = Math.min(idxs[0] + peekLen, allIdxs[1] - 1);
    firstSeg.entryIdx = idxs[0];
  }
  const segments = [firstSeg];
  for (let i = 1; i < idxs.length; i += 1) segments.push({ from: i === 1 ? firstSeg.to : idxs[i - 1], to: idxs[i] });
  return segments;
};

const miAggregateBars = (ohlc, fromIdx, toIdx, maxBars) => {
  const totalDays = toIdx - fromIdx + 1;
  if (totalDays <= maxBars) {
    const bars = [];
    for (let i = fromIdx; i <= toIdx; i += 1) bars.push({ o: ohlc.o[i], h: ohlc.h[i], l: ohlc.l[i], c: ohlc.c[i], endIdx: i });
    return bars;
  }
  const bars = [];
  const groupLen = totalDays / maxBars;
  for (let g = 0; g < maxBars; g += 1) {
    const gs = fromIdx + Math.round(g * groupLen);
    const ge = g === maxBars - 1 ? toIdx : fromIdx + Math.round((g + 1) * groupLen) - 1;
    if (gs > ge) continue;
    let h = -Infinity; let l = Infinity;
    for (let i = gs; i <= ge; i += 1) { h = Math.max(h, ohlc.h[i]); l = Math.min(l, ohlc.l[i]); }
    bars.push({ o: ohlc.o[gs], h, l, c: ohlc.c[ge], endIdx: ge });
  }
  return bars;
};

const MI_MIN_BAR_PX = 4;
const MI_AXIS_HEADROOM = 30000;

const miComputeYRange = (ohlc, segments) => {
  const overallFrom = segments[0].from;
  const overallTo = segments[segments.length - 1].to;
  let dataMax = -Infinity;
  for (let i = overallFrom; i <= overallTo; i += 1) dataMax = Math.max(dataMax, ohlc.h[i]);
  const min = 0;
  const max = dataMax + MI_AXIS_HEADROOM;
  return { min, max, range: max - min, step: (max - min) / MI_Y_TICKS };
};

const miCandleChart = (ohlc, segments) => {
  const overallFrom = segments[0].from;
  const overallTo = segments[segments.length - 1].to;
  const { min, range, step } = miComputeYRange(ohlc, segments);
  const innerH = MI_CANDLE_H - MI_CANDLE_PAD_TOP - MI_CANDLE_PAD_BOTTOM;
  const scaleY = (p) => MI_CANDLE_PAD_TOP + (1 - (p - min) / range) * innerH;
  const tickRoundUnit = step >= 20000 ? 10000 : 5000;
  const formatAxisPrice = (p) => (Math.round(p / tickRoundUnit) * tickRoundUnit).toLocaleString('ko-KR');
  const tickPrices = Array.from({ length: MI_Y_TICKS + 1 }, (_, t) => min + step * t);
  const maxTickLen = Math.max(...tickPrices.map((p) => formatAxisPrice(p).length));
  const padLeft = 12 + maxTickLen * 7.5;
  const plotW = MI_CANDLE_W - padLeft - MI_CANDLE_PAD_RIGHT;
  const segW = plotW / segments.length;

  let candlesSvg = '';
  segments.forEach((seg, segIdx) => {
    const segX0 = padLeft + segIdx * segW;
    const isLastSegment = segIdx === segments.length - 1;
    const highlightIdx = seg.entryIdx ?? seg.to;
    const maxBars = Math.max(1, Math.floor(segW / MI_MIN_BAR_PX));
    const bars = miAggregateBars(ohlc, seg.from, seg.to, maxBars);
    const count = bars.length;
    const slotW = segW / count;
    const bodyW = Math.max(1.5, slotW * 0.6);
    bars.forEach(({ o, h, l, c, endIdx }, pos) => {
      const isUp = c >= o;
      const color = isUp ? 'var(--color-up)' : 'var(--color-down)';
      const cx = segX0 + slotW * pos + slotW / 2;
      const yOpen = scaleY(o); const yClose = scaleY(c); const yHigh = scaleY(h); const yLow = scaleY(l);
      const bodyTop = Math.min(yOpen, yClose);
      const bodyH = Math.max(1, Math.abs(yClose - yOpen));
      const isLast = isLastSegment && endIdx === highlightIdx;
      const strokeAttr = isLast ? ' stroke="var(--color-black)" stroke-width="1"' : '';
      candlesSvg += `<line x1="${cx.toFixed(1)}" y1="${yHigh.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yLow.toFixed(1)}" stroke="${color}" stroke-width="1" />`
        + `<rect x="${(cx - bodyW / 2).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${bodyW.toFixed(1)}" height="${bodyH.toFixed(1)}" fill="${color}"${strokeAttr} />`;
    });
  });

  let gridSvg = '';
  tickPrices.forEach((p) => {
    const y = scaleY(p);
    gridSvg += `<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${MI_CANDLE_W - MI_CANDLE_PAD_RIGHT}" y2="${y.toFixed(1)}" stroke="var(--color-border)" stroke-width="1" />`
      + `<text x="${padLeft - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="chart-label">${formatAxisPrice(p)}</text>`;
  });

  return `
    <div class="quiz-chart-wrap">
      <svg viewBox="0 0 ${MI_CANDLE_W} ${MI_CANDLE_H}" class="quiz-chart" role="img" aria-label="일별 캔들 차트 (양봉/음봉), 세로축 가격">
        ${gridSvg}
        ${candlesSvg}
        <text x="${padLeft}" y="${MI_CANDLE_H - 8}" class="chart-label">${ohlc.d[overallFrom]}</text>
        <text x="${MI_CANDLE_W - MI_CANDLE_PAD_RIGHT}" y="${MI_CANDLE_H - 8}" text-anchor="end" class="chart-label">${ohlc.d[overallTo]}</text>
      </svg>
    </div>
  `;
};

/* --- 주간 랜덤 챌린지: ISO 주차 기반 결정론적 시드 (서버 저장 없이 모두가 같은 조건을 봄) --- */
function isoWeekId(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStringToSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
function weeklyChallengeFor(weekId) {
  const rand = mulberry32(hashStringToSeed(weekId));
  const span = 1 + Math.floor(rand() * 3); // 1~3년
  const maxStart = MI_MAX_YEAR - span;
  const startYear = MI_MIN_YEAR + Math.floor(rand() * (maxStart - MI_MIN_YEAR + 1));
  const endYear = startYear + span;
  const pool = [...MI_STOCK_POOL];
  const picks = [];
  for (let i = 0; i < 2; i += 1) {
    const idx = Math.floor(rand() * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  return { startYear, endYear, stockKeys: picks.map((p) => p.key) };
}

/* --- 종목 선택 그리드 (개인모드 / 관리자 그룹 생성 공용) --- */
function createStockPicker(containerId, maxCount, initialKeys) {
  let selected = [...(initialKeys || [])];
  function render(filter) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    const keyword = (filter || '').trim().toLowerCase();
    const filtered = keyword
      ? MI_STOCK_POOL.filter((s) => s.name.toLowerCase().includes(keyword) || s.key.includes(keyword))
      : MI_STOCK_POOL;
    grid.innerHTML = filtered
      .map((s) => `<button type="button" class="mi-stock-btn${selected.includes(s.key) ? ' selected' : ''}" data-key="${s.key}">${s.name}</button>`)
      .join('') || '<p class="mi-help">검색 결과가 없습니다.</p>';
    grid.querySelectorAll('.mi-stock-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const idx = selected.indexOf(key);
        if (idx >= 0) { selected.splice(idx, 1); btn.classList.remove('selected'); }
        else if (selected.length < maxCount) { selected.push(key); btn.classList.add('selected'); }
      });
    });
  }
  return { render, getSelected: () => selected };
}

/* ============================================================================
 * 앱 상태 & 화면 전환
 * ==================================================================== */
const appRoot = document.getElementById('app');

const state = { nick: '', mode: null, group: null, myDocId: null, weekId: null };

let miStartYear = MI_MIN_YEAR;
let miEndYear = MI_MAX_YEAR;
let miSelectedKeys = [];
let miRoundIndex = 0;
let miCheckpointIndex = 0;
let miCash = MI_INITIAL_CASH;
let miHoldings = 0;
let miRoundResults = [];
let miCurrentOhlc = null;
let miRoundStartCash = MI_INITIAL_CASH;

/* --- 진입 화면 --- */
function renderEntry() {
  state.mode = null; state.group = null; state.myDocId = null;
  appRoot.innerHTML = `
    <div class="entry-card">
      <h3>모의투자 시작하기</h3>
      <div class="entry-nick-row">
        <input type="text" id="nickInput" placeholder="닉네임 입력 (그룹/주간 챌린지 참가 시 필요)" value="${state.nick}">
        <button class="btn btn-outline" id="nickConfirmBtn">확인</button>
      </div>
      <p class="entry-status" id="entryStatus">${state.nick ? `${state.nick} 님 반갑습니다!` : ''}</p>
      <div class="mode-grid">
        <button class="mode-card" id="modeGroupBtn" type="button">
          <div class="mode-icon">🏆</div><h4>그룹 대항전</h4>
          <p>관리자가 만든 그룹에 참가해 같은 조건(기간·종목)으로 겨루고, 그룹 내 순위표를 확인합니다.</p>
        </button>
        <button class="mode-card" id="modeSoloBtn" type="button">
          <div class="mode-icon">🧑‍💻</div><h4>혼자 하기</h4>
          <p>원하는 투자 기간과 종목 2개를 직접 골라 연습합니다. 순위표 없이 내 수익률만 확인합니다.</p>
        </button>
        <button class="mode-card" id="modeWeeklyBtn" type="button">
          <div class="mode-icon">🎲</div><h4>이번 주 랜덤 챌린지</h4>
          <p>사이트가 매주 무작위로 정하는 기간·종목에 도전하고, 전체 참가자 순위표를 확인합니다.</p>
        </button>
      </div>
      <div class="admin-row">
        <button class="btn btn-outline btn-small" id="adminCreateBtn" type="button">그룹 생성</button>
        <button class="btn btn-outline btn-small" id="adminRecordBtn" type="button">기록 조회</button>
        <button class="btn btn-outline btn-small" id="adminResetBtn" type="button">데이터 초기화</button>
      </div>
    </div>
  `;
  document.getElementById('nickConfirmBtn').addEventListener('click', handleNicknameConfirm);
  document.getElementById('nickInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleNicknameConfirm(); });
  document.getElementById('modeGroupBtn').addEventListener('click', () => startMode('group'));
  document.getElementById('modeSoloBtn').addEventListener('click', () => startMode('solo'));
  document.getElementById('modeWeeklyBtn').addEventListener('click', () => startMode('weekly'));
  document.getElementById('adminCreateBtn').addEventListener('click', openCreateGroupModal);
  document.getElementById('adminRecordBtn').addEventListener('click', openRecordLookup);
  document.getElementById('adminResetBtn').addEventListener('click', adminReset);
}

function handleNicknameConfirm() {
  const v = document.getElementById('nickInput').value.trim();
  if (!v) { alert('닉네임을 입력하세요.'); return; }
  state.nick = v;
  document.getElementById('entryStatus').textContent = `${v} 님 반갑습니다!`;
}

function startMode(mode) {
  if ((mode === 'group' || mode === 'weekly') && !state.nick) { alert('닉네임을 먼저 입력해주세요.'); return; }
  state.mode = mode;
  if (mode === 'group') renderGroupSelect();
  else if (mode === 'solo') {
    miSelectedKeys = []; miCash = MI_INITIAL_CASH; miHoldings = 0;
    renderMiPeriodStep();
  } else if (mode === 'weekly') renderWeeklyIntro();
}

/* --- 그룹 대항전 --- */
async function renderGroupSelect() {
  appRoot.innerHTML = `<p class="mi-help">그룹 목록을 불러오는 중...</p>`;
  try { await fetchState(); } catch (e) { appRoot.innerHTML = `<p class="mi-error">그룹 목록을 불러오지 못했습니다: ${e.message}</p><button class="btn btn-outline" id="groupErrBackBtn">← 처음으로</button>`; document.getElementById('groupErrBackBtn').addEventListener('click', renderEntry); return; }
  renderGroupListUI('');
}

function renderGroupListUI(filter) {
  const groups = [...latestState.groups].sort((a, b) => a.name.localeCompare(b.name));
  const cnt = {};
  latestState.participants.forEach((p) => { if (p.scope && p.scope.startsWith('group:')) cnt[p.scope] = (cnt[p.scope] || 0) + 1; });
  const keyword = filter.trim().toLowerCase();
  const filtered = keyword ? groups.filter((g) => g.name.toLowerCase().includes(keyword)) : groups;

  appRoot.innerHTML = `
    <h3>그룹 선택</h3>
    <p class="mi-help">참가할 그룹을 선택하세요. 그룹마다 정해진 투자 기간·종목으로 함께 겨룹니다. (그룹명을 더블클릭하면 관리자 수정)</p>
    <input type="text" class="mi-select group-search" id="groupSearchInput" placeholder="그룹 검색..." value="${filter}">
    <div class="group-list" id="groupListBox"></div>
    <button class="btn btn-outline" id="groupBackBtn" type="button">← 처음으로</button>
  `;

  const box = document.getElementById('groupListBox');
  box.innerHTML = filtered.map((g) => `
    <div class="group-row" data-id="${g.id}">
      <span><span class="group-name">${g.name}</span><br><span class="group-meta">${g.startYear}~${g.endYear} · ${(g.stockKeys || []).map((k) => (MI_STOCK_POOL.find((s) => s.key === k) || { name: k }).name).join(', ')}</span></span>
      <span class="group-count">${cnt[`group:${g.id}`] || 0}명</span>
    </div>
  `).join('') || '<p class="mi-help">생성된 그룹이 없습니다. 관리자에게 그룹 생성을 요청하세요.</p>';

  box.querySelectorAll('.group-row').forEach((row) => {
    const g = filtered.find((x) => x.id === row.dataset.id);
    row.addEventListener('click', () => confirmJoinGroup(g));
    const nameEl = row.querySelector('.group-name');
    nameEl.addEventListener('dblclick', (e) => { e.stopPropagation(); adminEditGroup(g); });
  });
  document.getElementById('groupSearchInput').addEventListener('input', (e) => renderGroupListUI(e.target.value));
  document.getElementById('groupBackBtn').addEventListener('click', renderEntry);
}

async function confirmJoinGroup(group) {
  if (!group) return;
  if (!confirm(`"${group.name}" 그룹으로 참가하시겠습니까?`)) return;
  try {
    const r = await callWorker('/add-participant', { nickname: state.nick, scope: `group:${group.id}` });
    state.myDocId = r.id;
    state.group = group;
  } catch (e) {
    if (e.message === 'duplicate') return alert('이미 사용 중인 닉네임입니다. 닉네임을 바꿔서 다시 시도해주세요.');
    return alert(`참가 등록 실패: ${e.message}`);
  }
  miStartYear = group.startYear; miEndYear = group.endYear; miSelectedKeys = [...group.stockKeys];
  miCash = MI_INITIAL_CASH; miHoldings = 0; miRoundIndex = 0; miRoundResults = [];
  beginMiRound();
}

async function adminEditGroup(group) {
  const pw = prompt('관리자 비밀번호:');
  if (pw === null) return;
  const newName = prompt('새 그룹명:', group.name);
  if (newName === null) return;
  if (newName && newName !== group.name) {
    try {
      await callWorker('/rename-group', { id: group.id, name: newName, adminPassword: pw });
    } catch (e) {
      return alert(e.message === 'unauthorized' ? '비밀번호가 틀렸습니다.' : e.message);
    }
  }
  if (!confirm(`"${newName || group.name}" 그룹을 삭제하시겠습니까? (참가자 기록도 함께 삭제됩니다)`)) { renderGroupSelect(); return; }
  try {
    await callWorker('/delete-group', { id: group.id, adminPassword: pw });
  } catch (e) {
    alert(e.message === 'unauthorized' ? '비밀번호가 틀렸습니다.' : e.message);
  }
  renderGroupSelect();
}

/* --- 이번 주 랜덤 챌린지 --- */
function renderWeeklyIntro() {
  const weekId = isoWeekId(new Date());
  const challenge = weeklyChallengeFor(weekId);
  state.weekId = weekId;
  const names = challenge.stockKeys.map((k) => (MI_STOCK_POOL.find((s) => s.key === k) || { name: k }).name);
  appRoot.innerHTML = `
    <h3>이번 주 랜덤 챌린지</h3>
    <div class="challenge-banner">
      <strong>${weekId}</strong>
      <p>투자 기간 ${challenge.startYear}년 ~ ${challenge.endYear}년 · 종목 ${names.join(', ')}</p>
      <p>이번 주 모든 참가자가 동일한 조건으로 겨루며, 완료 후 전체 순위표를 확인할 수 있습니다.</p>
    </div>
    <div class="quiz-actions">
      <button class="btn btn-outline" id="weeklyBackBtn" type="button">← 처음으로</button>
      <button class="btn btn-primary" id="weeklyStartBtn" type="button">챌린지 시작 →</button>
    </div>
  `;
  document.getElementById('weeklyBackBtn').addEventListener('click', renderEntry);
  document.getElementById('weeklyStartBtn').addEventListener('click', async () => {
    try {
      const r = await callWorker('/add-participant', { nickname: state.nick, scope: `weekly:${weekId}` });
      state.myDocId = r.id;
    } catch (e) {
      if (e.message === 'duplicate') return alert('이미 이번 주 챌린지에 참가하셨습니다 (닉네임 중복).');
      return alert(`참가 등록 실패: ${e.message}`);
    }
    miStartYear = challenge.startYear; miEndYear = challenge.endYear; miSelectedKeys = [...challenge.stockKeys];
    miCash = MI_INITIAL_CASH; miHoldings = 0; miRoundIndex = 0; miRoundResults = [];
    beginMiRound();
  });
}

/* --- 혼자 하기 (기간/종목 직접 선택) --- */
const renderMiPeriodStep = () => {
  const yearOptions = (selected) => {
    let opts = '';
    for (let y = MI_MIN_YEAR; y <= MI_MAX_YEAR; y += 1) opts += `<option value="${y}" ${y === selected ? 'selected' : ''}>${y}년</option>`;
    return opts;
  };
  appRoot.innerHTML = `
    <h3>1단계 · 투자 기간 선택</h3>
    <p class="mi-help">${MI_MIN_YEAR}년부터 ${MI_MAX_YEAR}년 사이에서 모의투자를 진행할 기간을 선택하세요.</p>
    <div class="mi-period-row">
      <div class="form-group"><label for="miStartYear">시작 연도</label><select id="miStartYear" class="mi-select">${yearOptions(miStartYear)}</select></div>
      <div class="form-group"><label for="miEndYear">종료 연도</label><select id="miEndYear" class="mi-select">${yearOptions(miEndYear)}</select></div>
    </div>
    <p class="mi-error" id="miPeriodError" hidden>종료 연도는 시작 연도보다 최소 1년 이상 뒤여야 합니다.</p>
    <div class="quiz-actions">
      <button class="btn btn-outline" id="miPeriodBackBtn" type="button">← 처음으로</button>
      <button class="btn btn-primary" id="miPeriodNext" type="button">다음 →</button>
    </div>
  `;
  document.getElementById('miPeriodBackBtn').addEventListener('click', renderEntry);
  document.getElementById('miPeriodNext').addEventListener('click', () => {
    const start = Number(document.getElementById('miStartYear').value);
    const end = Number(document.getElementById('miEndYear').value);
    if (end <= start) { document.getElementById('miPeriodError').hidden = false; return; }
    miStartYear = start; miEndYear = end;
    renderMiStockStep();
  });
};

const renderMiStockStep = () => {
  appRoot.innerHTML = `
    <h3>2단계 · 투자 종목 선택 (${MI_STOCK_POOL.length}개)</h3>
    <p class="mi-help">모의투자를 진행할 종목 2개를 선택하세요. 각 종목당 1라운드씩, 총 2라운드로 진행됩니다.</p>
    <input type="text" class="mi-select mi-stock-search" id="miStockSearch" placeholder="종목명으로 검색">
    <div class="mi-stock-grid" id="miStockGrid"></div>
    <p class="mi-error" id="miStockError" hidden>종목을 정확히 2개 선택해주세요.</p>
    <div class="quiz-actions">
      <button class="btn btn-outline" id="miStockBack" type="button">이전</button>
      <button class="btn btn-primary" id="miStockNext" type="button">투자 시작 →</button>
    </div>
  `;
  const picker = createStockPicker('miStockGrid', 2, miSelectedKeys);
  picker.render('');
  document.getElementById('miStockSearch').addEventListener('input', (e) => picker.render(e.target.value));
  document.getElementById('miStockBack').addEventListener('click', renderMiPeriodStep);
  document.getElementById('miStockNext').addEventListener('click', () => {
    const keys = picker.getSelected();
    if (keys.length !== 2) { document.getElementById('miStockError').hidden = false; return; }
    miSelectedKeys = keys;
    miRoundIndex = 0; miRoundResults = [];
    beginMiRound();
  });
};

/* --- 라운드 진행 엔진 (그룹/개인/주간 챌린지 공용) --- */
const beginMiRound = async () => {
  miCheckpointIndex = 0;
  miRoundStartCash = miCash;
  miHoldings = 0;
  const stock = MI_STOCK_POOL.find((s) => s.key === miSelectedKeys[miRoundIndex]);
  appRoot.innerHTML = `<p class="mi-help">${stock.name} 실제 시세 데이터를 불러오는 중...</p>`;
  try {
    miCurrentOhlc = await miFetchOhlc(stock.key);
    renderMiRoundStep();
  } catch (err) {
    appRoot.innerHTML = `
      <p class="mi-error">${stock.name} 시세 데이터를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.</p>
      <button class="btn btn-primary mi-next-btn" id="miRetryLoad" type="button">다시 시도 →</button>
    `;
    document.getElementById('miRetryLoad').addEventListener('click', beginMiRound);
  }
};

const renderMiRoundStep = () => {
  const stock = MI_STOCK_POOL.find((s) => s.key === miSelectedKeys[miRoundIndex]);
  const years = miCheckpointYears(miStartYear, miEndYear);
  const year = years[miCheckpointIndex];
  const idx = miFindCheckpointIndex(miCurrentOhlc, miFractionalYearToDate(year));
  const price = miCurrentOhlc.c[idx];
  const isLast = miCheckpointIndex === MI_CHECKPOINTS;

  if (isLast && miHoldings > 0) { miCash += miHoldings * price; miHoldings = 0; }

  const total = miCash + miHoldings * price;
  const returnPct = ((total - miRoundStartCash) / miRoundStartCash) * 100;
  const segments = miBuildSegments(miCurrentOhlc, years, miCheckpointIndex);
  const periodLabel = isLast ? `${MI_CHECKPOINTS + 1}분기 · 최종 정산가` : `${miCheckpointIndex + 1}분기`;

  appRoot.innerHTML = `
    <h3>라운드 ${miRoundIndex + 1} / ${MI_ROUNDS} · ${stock.name}</h3>
    <p class="mi-help">${periodLabel} · ${miFormatPeriodLabel(year)} (실제 거래일 ${miCurrentOhlc.d[idx]})${isLast ? ' — 이 시점은 매수/매도 없이 보유 주식이 이 가격에 자동 매도됩니다.' : ''}</p>
    ${miCandleChart(miCurrentOhlc, segments)}
    <div class="portfolio-stats">
      <div class="stat-card"><strong>${formatWon(price)}</strong><span>${isLast ? '정산가' : '현재가'}</span></div>
      <div class="stat-card"><strong>${formatWon(miCash)}</strong><span>보유 현금</span></div>
      <div class="stat-card"><strong>${miHoldings.toLocaleString('ko-KR')}주</strong><span>보유 수량</span></div>
      <div class="stat-card"><strong style="color:${returnPct > 0 ? 'var(--color-up)' : returnPct < 0 ? 'var(--color-down)' : '#fff'}">${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%</strong><span>현재 수익률</span></div>
    </div>
    ${isLast ? '' : `
    <div class="trade-controls mi-trade-controls">
      <input type="number" min="1" step="1" value="1" class="qty-input" id="miQty">
      <button class="btn btn-outline btn-small" id="miMaxQtyBtn" type="button">가능</button>
      <button class="btn btn-primary btn-small" id="miBuyBtn" type="button">매수</button>
      <button class="btn btn-outline btn-small" id="miSellBtn" type="button">매도</button>
    </div>
    <p class="mi-error" id="miTradeError" hidden></p>
    `}
    <button class="btn btn-primary mi-next-btn" id="miNextCheckpoint" type="button">${isLast ? '라운드 결과 보기 →' : '다음 시점으로 →'}</button>
  `;

  if (!isLast) {
    const qtyInput = document.getElementById('miQty');
    const errorEl = document.getElementById('miTradeError');
    document.getElementById('miMaxQtyBtn').addEventListener('click', () => {
      const maxQty = Math.floor(miCash / price);
      if (maxQty < 1) { errorEl.textContent = '보유 현금으로 매수 가능한 수량이 없습니다.'; errorEl.hidden = false; return; }
      errorEl.hidden = true; qtyInput.value = maxQty;
    });
    document.getElementById('miBuyBtn').addEventListener('click', () => {
      const qty = Math.max(1, Math.floor(Number(qtyInput.value) || 0));
      const cost = price * qty;
      if (cost > miCash) { errorEl.textContent = '보유 현금을 초과하는 수량은 매수할 수 없습니다.'; errorEl.hidden = false; return; }
      miCash -= cost; miHoldings += qty; renderMiRoundStep();
    });
    document.getElementById('miSellBtn').addEventListener('click', () => {
      const qty = Math.max(1, Math.floor(Number(qtyInput.value) || 0));
      if (qty > miHoldings) { errorEl.textContent = '보유 수량을 초과하는 수량은 매도할 수 없습니다.'; errorEl.hidden = false; return; }
      miCash += price * qty; miHoldings -= qty; renderMiRoundStep();
    });
  }

  document.getElementById('miNextCheckpoint').addEventListener('click', () => {
    if (isLast) renderMiRoundResult(stock);
    else { miCheckpointIndex += 1; renderMiRoundStep(); }
  });
};

const renderMiRoundResult = (stock) => {
  const finalValue = miCash;
  const returnPct = ((finalValue - miRoundStartCash) / miRoundStartCash) * 100;
  miRoundResults.push({ name: stock.name, finalValue, returnPct });

  const isLastRound = miRoundIndex === MI_ROUNDS - 1;
  const years = miCheckpointYears(miStartYear, miEndYear);
  const segments = miBuildSegments(miCurrentOhlc, years, MI_CHECKPOINTS);

  appRoot.innerHTML = `
    <h3>라운드 ${miRoundIndex + 1} 결과 · ${stock.name}</h3>
    ${miCandleChart(miCurrentOhlc, segments)}
    <div class="portfolio-stats">
      <div class="stat-card"><strong>${formatWon(finalValue)}</strong><span>최종 자산</span></div>
      <div class="stat-card"><strong style="color:${returnPct > 0 ? 'var(--color-up)' : returnPct < 0 ? 'var(--color-down)' : '#fff'}">${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%</strong><span>라운드 수익률</span></div>
    </div>
    <button class="btn btn-primary mi-next-btn" id="miRoundResultNext" type="button">${isLastRound ? '최종 결과 보기 →' : '다음 라운드 시작 →'}</button>
  `;
  document.getElementById('miRoundResultNext').addEventListener('click', async () => {
    if (isLastRound) await renderMiFinalResult();
    else { miRoundIndex += 1; beginMiRound(); }
  });
};

const renderMiFinalResult = async () => {
  const totalFinal = miRoundResults[miRoundResults.length - 1].finalValue;
  const totalReturnPct = (totalFinal / MI_INITIAL_CASH) * 100 - 100;
  const resultListHtml = `
    <ul class="mi-result-list">
      ${miRoundResults.map((r, i) => `
        <li>
          <span>라운드 ${i + 1} · ${r.name}</span>
          <span style="color:${r.returnPct > 0 ? 'var(--color-up)' : r.returnPct < 0 ? 'var(--color-down)' : 'inherit'}">${r.returnPct >= 0 ? '+' : ''}${r.returnPct.toFixed(2)}%</span>
        </li>
      `).join('')}
    </ul>
    <div class="portfolio-stats">
      <div class="stat-card"><strong>${formatWon(totalFinal)}</strong><span>총 최종 자산</span></div>
      <div class="stat-card"><strong style="color:${totalReturnPct > 0 ? 'var(--color-up)' : totalReturnPct < 0 ? 'var(--color-down)' : '#fff'}">${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}%</strong><span>총 수익률</span></div>
    </div>
  `;

  if (state.mode === 'solo') {
    appRoot.innerHTML = `<h3>모의투자 결과</h3>${resultListHtml}<p class="mi-help">개인 연습 모드는 순위표 없이 나의 수익률만 보여드립니다.</p><button class="btn btn-outline mi-next-btn" id="miRestartBtn" type="button">처음으로</button>`;
    document.getElementById('miRestartBtn').addEventListener('click', renderEntry);
    return;
  }

  appRoot.innerHTML = `<h3>모의투자 결과</h3>${resultListHtml}<p class="mi-help">결과를 제출하는 중...</p>`;
  const profitVal = Number(totalReturnPct.toFixed(2));
  try {
    await callWorker('/update-profit', { id: state.myDocId, profit: profitVal });
  } catch (e) {
    appRoot.innerHTML += `<p class="mi-error">결과 제출 실패: ${e.message}</p>`;
  }
  await showScopeLeaderboard(resultListHtml);
};

async function showScopeLeaderboard(resultListHtml) {
  const scope = state.mode === 'group' ? `group:${state.group.id}` : `weekly:${state.weekId}`;
  let data;
  try { data = await fetchState(); } catch (e) { data = latestState; }
  const list = data.participants.filter((p) => p.scope === scope).map((p) => ({ name: p.nickname, profit: p.profit || 0 })).sort((a, b) => b.profit - a.profit);
  const me = list.find((x) => x.name === state.nick);
  const title = state.mode === 'group' ? `${state.group.name} 그룹 순위표` : `${state.weekId} 주간 챌린지 순위표`;
  const rows = list.map((item, i) => `<tr class="${item.name === state.nick ? 'me' : ''}"><td>${i + 1}</td><td>${item.name}</td><td>${item.profit.toFixed(2)}%</td></tr>`).join('');
  appRoot.innerHTML = `
    <h3>${title}</h3>
    ${resultListHtml}
    <div class="me-card">나의 닉네임 : ${state.nick}<br>나의 수익률 : ${(me ? me.profit : 0).toFixed(2)}%</div>
    <table class="leaderboard"><thead><tr><th>순위</th><th>닉네임</th><th>수익률</th></tr></thead><tbody>${rows || '<tr><td colspan="3">참가자가 없습니다.</td></tr>'}</tbody></table>
    <button class="btn btn-outline mi-next-btn" id="lbBackBtn" type="button">처음으로</button>
  `;
  document.getElementById('lbBackBtn').addEventListener('click', renderEntry);
}

/* --- 관리자: 그룹 생성 --- */
function openCreateGroupModal() {
  const pw = prompt('관리자 비밀번호:');
  if (pw === null) return;
  const yearOpts = (sel) => {
    let o = '';
    for (let y = MI_MIN_YEAR; y <= MI_MAX_YEAR; y += 1) o += `<option value="${y}" ${y === sel ? 'selected' : ''}>${y}년</option>`;
    return o;
  };
  openModal(`
    <h3>그룹 생성</h3>
    <div class="form-group"><label for="gcName">그룹명</label><input type="text" id="gcName" placeholder="예: 1조"></div>
    <div class="mi-period-row">
      <div class="form-group"><label for="gcStart">시작 연도</label><select class="mi-select" id="gcStart">${yearOpts(MI_MIN_YEAR)}</select></div>
      <div class="form-group"><label for="gcEnd">종료 연도</label><select class="mi-select" id="gcEnd">${yearOpts(MI_MAX_YEAR)}</select></div>
    </div>
    <p class="mi-help">이 그룹 참가자 전원이 아래에서 고른 연도·종목으로 동일하게 플레이합니다 (종목 2개, 각 1라운드씩).</p>
    <input type="text" class="mi-select mi-stock-search" id="gcSearch" placeholder="종목명으로 검색">
    <div class="mi-stock-grid" id="gcGrid"></div>
    <p class="mi-error" id="gcError" hidden></p>
    <div class="modal-actions">
      <button class="btn btn-outline" id="gcCancelBtn" type="button">취소</button>
      <button class="btn btn-primary btn-block" id="gcSubmitBtn" type="button">그룹 생성</button>
    </div>
  `);
  const picker = createStockPicker('gcGrid', 2, []);
  picker.render('');
  document.getElementById('gcSearch').addEventListener('input', (e) => picker.render(e.target.value));
  document.getElementById('gcCancelBtn').addEventListener('click', closeModal);
  document.getElementById('gcSubmitBtn').addEventListener('click', async () => {
    const name = document.getElementById('gcName').value.trim();
    const startYear = Number(document.getElementById('gcStart').value);
    const endYear = Number(document.getElementById('gcEnd').value);
    const stockKeys = picker.getSelected();
    const errEl = document.getElementById('gcError');
    if (!name) { errEl.textContent = '그룹명을 입력하세요.'; errEl.hidden = false; return; }
    if (endYear <= startYear) { errEl.textContent = '종료 연도는 시작 연도보다 커야 합니다.'; errEl.hidden = false; return; }
    if (stockKeys.length !== 2) { errEl.textContent = '종목을 정확히 2개 선택하세요.'; errEl.hidden = false; return; }
    try {
      await callWorker('/create-group', { name, startYear, endYear, stockKeys, adminPassword: pw });
      closeModal();
      alert(`"${name}" 그룹이 생성되었습니다.`);
    } catch (e) {
      errEl.textContent = e.message === 'unauthorized' ? '비밀번호가 틀렸습니다.' : e.message;
      errEl.hidden = false;
    }
  });
}

/* --- 관리자: 데이터 초기화 --- */
async function adminReset() {
  const pw = prompt('관리자 비밀번호:');
  if (pw === null) return;
  if (!confirm('모든 참가자 기록을 초기화하시겠습니까? (그룹 자체는 유지되고 참가자 기록만 삭제됩니다)')) return;
  try {
    await callWorker('/reset', { adminPassword: pw });
    alert('초기화되었습니다.');
  } catch (e) {
    alert(e.message === 'unauthorized' ? '비밀번호가 틀렸습니다.' : e.message);
  }
}

/* --- 관리자: 기록 조회 --- */
async function openRecordLookup() {
  const pw = prompt('관리자 비밀번호:');
  if (pw === null) return;
  await backToRecordList(pw);
}

async function backToRecordList(pw) {
  let data;
  try { data = await fetchState(); } catch (e) { return alert(`데이터를 불러오지 못했습니다: ${e.message}`); }
  const groups = [...data.groups].sort((a, b) => a.name.localeCompare(b.name));
  const weekIds = [...new Set(data.participants.filter((p) => p.scope && p.scope.startsWith('weekly:')).map((p) => p.scope.slice(7)))].sort().reverse();

  let html = `<h3>기록 조회</h3><p class="mi-help">그룹 또는 주간 챌린지를 선택하세요.</p><div class="group-list">`;
  groups.forEach((g) => { html += `<div class="group-row" onclick="openRecordTable('${escAttr(pw)}','${escAttr(`group:${g.id}`)}','${escAttr(g.name)}')"><span>${g.name}</span><span class="group-meta">그룹</span></div>`; });
  weekIds.forEach((w) => { html += `<div class="group-row" onclick="openRecordTable('${escAttr(pw)}','${escAttr(`weekly:${w}`)}','${escAttr(`${w} 주간 챌린지`)}')"><span>${w} 주간 챌린지</span><span class="group-meta">주간</span></div>`; });
  if (groups.length === 0 && weekIds.length === 0) html += '<p class="mi-help">아직 기록이 없습니다.</p>';
  html += `</div><div class="modal-actions"><button class="btn btn-outline btn-block" id="recordCloseBtn" type="button">닫기</button></div>`;

  openModal(html);
  document.getElementById('recordCloseBtn').addEventListener('click', closeModal);
}

async function openRecordTable(pw, scope, label) {
  let data;
  try { data = await fetchState(); } catch (e) { return alert(`데이터를 불러오지 못했습니다: ${e.message}`); }
  const list = data.participants.filter((p) => p.scope === scope).sort((a, b) => (b.profit || 0) - (a.profit || 0));

  let html = `<h3>${label}</h3><p class="mi-help">닉네임을 클릭하면 삭제할 수 있습니다.</p>`;
  if (list.length === 0) html += '<p class="mi-help">참가자가 없습니다.</p>';
  else {
    html += `<table class="leaderboard"><thead><tr><th>순위</th><th>닉네임</th><th>수익률</th></tr></thead><tbody>`;
    list.forEach((p, i) => {
      html += `<tr class="clickable" onclick="confirmDeleteParticipant('${escAttr(pw)}','${escAttr(scope)}','${escAttr(p.nickname)}','${escAttr(label)}')"><td>${i + 1}</td><td>${p.nickname}</td><td>${(p.profit || 0).toFixed(2)}%</td></tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `<div class="modal-actions"><button class="btn btn-outline" id="recordBackBtn" type="button">목록으로</button><button class="btn btn-outline" id="recordCloseBtn2" type="button">닫기</button></div>`;

  openModal(html);
  document.getElementById('recordBackBtn').addEventListener('click', () => backToRecordList(pw));
  document.getElementById('recordCloseBtn2').addEventListener('click', closeModal);
}

async function confirmDeleteParticipant(pw, scope, nickname, label) {
  if (!confirm(`"${nickname}" 님을 삭제하시겠습니까?`)) return;
  try {
    await callWorker('/delete-participant', { scope, nickname, adminPassword: pw });
    openRecordTable(pw, scope, label);
  } catch (e) {
    alert(e.message === 'unauthorized' ? '비밀번호가 틀렸습니다.' : e.message);
  }
}

/* window에 노출 (인라인 onclick에서 호출하기 위함) */
window.openRecordTable = openRecordTable;
window.confirmDeleteParticipant = confirmDeleteParticipant;

renderEntry();

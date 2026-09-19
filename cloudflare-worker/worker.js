/* ============================================================================
 * thehunters 모의투자 통합 사이트용 Cloudflare Worker
 *
 * 역할: index.html(참가자 브라우저)이 이 Worker의 HTTP 엔드포인트만 호출하고,
 * 진짜 GitHub Personal Access Token은 이 Worker 안(Secret 환경변수)에만 존재합니다.
 * 그래서 참가자들에게 토큰을 나눠줄 필요가 전혀 없고, "소스 보기"를 해도
 * 아무 비밀 값도 보이지 않습니다.
 *
 * 그룹은 누구나(비밀번호 없이) 만들 수 있고, 생성 시 무작위 4자리 코드가
 * 발급됩니다. 그 코드를 아는 사람만 그룹에 참가할 수 있고(그룹 목록 자체는
 * 공개 조회 API가 없습니다), 그룹은 생성 후 7일이 지나면 자동으로 삭제됩니다
 * (다음 요청이 올 때 정리되는 방식이라, 아무도 사이트에 접속하지 않는 동안은
 * 실제 삭제가 며칠 늦어질 수 있습니다).
 *
 * ---- 배포 방법 (Cloudflare 대시보드, 무료 플랜으로 충분) ----
 * 1. https://dash.cloudflare.com 가입/로그인
 * 2. 왼쪽 메뉴 Workers & Pages → Create → "Create Worker" (Import a
 *    repository 아님! "Hello World" 같은 기본 템플릿 선택)
 * 3. 이름은 아무거나 정하고 Deploy
 * 4. 생성된 Worker의 "Edit code"/"Quick edit" 들어가서, 이 파일(worker.js)
 *    내용을 전부 복사해서 그대로 붙여넣고 Deploy
 * 5. Worker의 Settings → Variables and Secrets 에서 아래 항목 추가:
 *      - GITHUB_TOKEN (Secret 타입으로 추가!)
 *        → github.com/settings/personal-access-tokens/new 에서 발급
 *          Repository access: 이 저장소(REPO 상수 값)만
 *          Permissions: Contents = Read and write (나머지는 No access)
 * 6. Settings → Domains에서 workers.dev 주소를 확인해서 ../script.js
 *    상단의 WORKER_URL 값에 넣고 다시 배포(git push)하세요.
 * 7. ADMIN_PASSWORD는 이 파일에 평문으로 저장되며 저장소가 공개(public)라면
 *    누구나 볼 수 있습니다. 배포 후 반드시 원하는 값으로 바꾸세요.
 * ============================================================================ */

const OWNER = 'HyeonSooJ';
const REPO = 'thehunters-mockinvest';
const BRANCH = 'main';
const DATA_PATH = 'data/mock-investment-data.json';
const LEADERBOARD_PATH = 'LEADERBOARD.md';
const ADMIN_PASSWORD = '1011'; // 배포 후 꼭 바꾸세요
const GROUP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 그룹 자동 삭제까지 걸리는 시간(7일)

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders()),
  });
}
function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode('0x' + p1)));
}
function b64DecodeUnicode(str) {
  return decodeURIComponent(atob(str).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
}
function ghHeaders(env, extra) {
  return Object.assign({
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'thehunters-mockinvest-worker',
  }, extra || {});
}
async function ghReadFile(path, env) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}&_=${Date.now()}`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (res.status === 404) return { sha: null, text: null };
  if (!res.ok) throw new Error(`GitHub 읽기 실패 (${res.status})`);
  const json = await res.json();
  return { sha: json.sha, text: b64DecodeUnicode(json.content.replace(/\n/g, '')) };
}
async function ghWriteFile(path, text, sha, message, env) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const body = { message, content: b64EncodeUnicode(text), branch: BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers: ghHeaders(env, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
  if (res.status === 409) { const e = new Error('CONFLICT'); e.conflict = true; throw e; }
  if (!res.ok) throw new Error(`GitHub 저장 실패 (${res.status})`);
  return res.json();
}
async function readData(env) {
  const { sha, text } = await ghReadFile(DATA_PATH, env);
  const data = JSON.parse(text || '{}');
  if (!data.groups) data.groups = [];
  if (!data.participants) data.participants = [];
  return { sha, data };
}

/* 생성 후 7일이 지난 그룹과 그 참가자를 걸러낸다. 뭔가 지워졌으면 true 반환. */
function pruneExpired(data) {
  const now = Date.now();
  const activeIds = new Set();
  const keptGroups = data.groups.filter((g) => {
    const alive = !g.createdAt || (now - g.createdAt) < GROUP_TTL_MS;
    if (alive) activeIds.add(g.id);
    return alive;
  });
  const groupsChanged = keptGroups.length !== data.groups.length;
  const keptParticipants = data.participants.filter((p) => {
    if (!p.scope || !p.scope.startsWith('group:')) return true;
    return activeIds.has(p.scope.slice(6));
  });
  const participantsChanged = keptParticipants.length !== data.participants.length;
  data.groups = keptGroups;
  data.participants = keptParticipants;
  return groupsChanged || participantsChanged;
}

function groupLabel(data, scope) {
  if (scope.startsWith('group:')) {
    const g = data.groups.find((x) => `group:${x.id}` === scope);
    return g ? g.name : scope;
  }
  if (scope.startsWith('weekly:')) return `${scope.slice(7)} 주간 챌린지`;
  return scope;
}
function buildLeaderboardMarkdown(data) {
  const byScope = {};
  data.groups.forEach((g) => { byScope[`group:${g.id}`] = []; });
  data.participants.forEach((p) => { (byScope[p.scope] || (byScope[p.scope] = [])).push(p); });
  const scopes = Object.keys(byScope).sort((a, b) => groupLabel(data, a).localeCompare(groupLabel(data, b)));
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  let md = `# 모의투자 리더보드\n\n_마지막 업데이트: ${now} (KST)_\n\n`;
  if (scopes.length === 0) { md += '아직 참가 기록이 없습니다.\n'; return md; }
  scopes.forEach((scope) => {
    const list = [...byScope[scope]].sort((a, b) => (b.profit || 0) - (a.profit || 0));
    md += `## ${groupLabel(data, scope)} (${list.length}명)\n\n`;
    if (list.length === 0) { md += '참가자가 없습니다.\n\n'; return; }
    md += '| 순위 | 닉네임 | 수익률 |\n|---|---|---|\n';
    list.forEach((p, i) => { md += `| ${i + 1} | ${p.nickname} | ${(p.profit || 0).toFixed(2)}% |\n`; });
    md += '\n';
  });
  return md;
}
async function syncLeaderboard(data, env) {
  for (let i = 0; i < 5; i += 1) {
    try {
      const { sha } = await ghReadFile(LEADERBOARD_PATH, env);
      await ghWriteFile(LEADERBOARD_PATH, buildLeaderboardMarkdown(data), sha, 'update leaderboard', env);
      return;
    } catch (e) {
      if (e.conflict) { await new Promise((r) => setTimeout(r, 300 + Math.random() * 400)); continue; }
      return; // 리더보드 갱신 실패는 치명적이지 않으므로 조용히 넘어갑니다.
    }
  }
}
// 동시 편집 충돌(409) 시 최신본을 다시 읽어 재시도합니다.
// 리더보드 갱신은 응답 속도에 영향 없이 ctx.waitUntil로 백그라운드에서 처리합니다.
async function mutate(mutator, message, env, ctx) {
  for (let i = 0; i < 5; i += 1) {
    const { sha, data } = await readData(env);
    pruneExpired(data);
    mutator(data);
    try {
      await ghWriteFile(DATA_PATH, JSON.stringify(data, null, 2), sha, message, env);
      const leaderboardSync = syncLeaderboard(data, env);
      if (ctx) ctx.waitUntil(leaderboardSync); else await leaderboardSync;
      return data;
    } catch (e) {
      if (e.conflict) { await new Promise((r) => setTimeout(r, 300 + Math.random() * 400)); continue; }
      throw e;
    }
  }
  throw new Error('저장 충돌이 반복되어 실패했습니다.');
}
// 읽기 전용 요청: 즉시 응답할 값은 지금 정리해서 계산하고, 실제 만료분 삭제는
// (있었다면) 응답을 막지 않도록 백그라운드에서 저장한다.
async function readActive(env, ctx) {
  const { data } = await readData(env);
  const changed = pruneExpired(data);
  if (changed && ctx) {
    ctx.waitUntil((async () => {
      try { await mutate((d) => { pruneExpired(d); }, 'prune expired groups', env, null); } catch (e) { /* ignore */ }
    })());
  }
  return data;
}
function uid() { return crypto.randomUUID(); }
function genGroupCode(existingCodes) {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (existingCodes.has(code));
  return code;
}
function publicGroup(g) {
  return { id: g.id, name: g.name, startYear: g.startYear, endYear: g.endYear, stockKeys: g.stockKeys };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
    const { pathname } = new URL(request.url);
    let body = {};
    if (request.method === 'POST') body = await request.json().catch(() => ({}));

    try {
      /* ---- 그룹 생성: 비밀번호 없이 누구나 가능. 무작위 4자리 코드 발급 ---- */
      if (pathname === '/create-group') {
        if (!body.name) return jsonResponse({ error: 'name required' }, 400);
        const startYear = Number(body.startYear);
        const endYear = Number(body.endYear);
        const stockKeys = Array.isArray(body.stockKeys) ? body.stockKeys.slice(0, 2) : [];
        if (!startYear || !endYear || endYear <= startYear) return jsonResponse({ error: 'invalid year range' }, 400);
        if (stockKeys.length !== 2) return jsonResponse({ error: 'exactly 2 stockKeys required' }, 400);
        let created = null;
        await mutate((d) => {
          const code = genGroupCode(new Set(d.groups.map((g) => g.code)));
          created = { id: uid(), name: String(body.name).slice(0, 60), code, startYear, endYear, stockKeys, createdAt: Date.now() };
          d.groups.push(created);
        }, `create group ${body.name}`, env, ctx);
        return jsonResponse({ id: created.id, code: created.code, name: created.name, startYear: created.startYear, endYear: created.endYear, stockKeys: created.stockKeys, createdAt: created.createdAt, expiresAt: created.createdAt + GROUP_TTL_MS });
      }

      /* ---- 코드로 그룹 찾기: 코드를 아는 사람만 그룹 정보를 볼 수 있음 ---- */
      if (pathname === '/find-group') {
        if (!body.code) return jsonResponse({ error: 'code required' }, 400);
        const data = await readActive(env, ctx);
        const g = data.groups.find((x) => x.code === String(body.code).trim());
        if (!g) return jsonResponse({ error: 'not_found' }, 404);
        return jsonResponse(publicGroup(g));
      }

      if (pathname === '/rename-group') {
        if (body.adminPassword !== ADMIN_PASSWORD) return jsonResponse({ error: 'unauthorized' }, 401);
        if (!body.id || !body.name) return jsonResponse({ error: 'id/name required' }, 400);
        await mutate((d) => { const g = d.groups.find((x) => x.id === body.id); if (g) g.name = body.name; }, `rename group ${body.id}`, env, ctx);
        return jsonResponse({ ok: true });
      }
      if (pathname === '/delete-group') {
        if (body.adminPassword !== ADMIN_PASSWORD) return jsonResponse({ error: 'unauthorized' }, 401);
        if (!body.id) return jsonResponse({ error: 'id required' }, 400);
        await mutate((d) => {
          const scope = `group:${body.id}`;
          d.groups = d.groups.filter((x) => x.id !== body.id);
          d.participants = d.participants.filter((p) => p.scope !== scope);
        }, `delete group ${body.id}`, env, ctx);
        return jsonResponse({ ok: true });
      }

      /* ---- 관리자: 생성된 모든 그룹 조회 (비밀번호 필요) ---- */
      if (pathname === '/admin/list-groups') {
        if (body.adminPassword !== ADMIN_PASSWORD) return jsonResponse({ error: 'unauthorized' }, 401);
        const data = await readActive(env, ctx);
        const counts = {};
        data.participants.forEach((p) => { counts[p.scope] = (counts[p.scope] || 0) + 1; });
        const groups = data.groups.map((g) => ({
          id: g.id, name: g.name, code: g.code, startYear: g.startYear, endYear: g.endYear, stockKeys: g.stockKeys,
          createdAt: g.createdAt || null, expiresAt: g.createdAt ? g.createdAt + GROUP_TTL_MS : null,
          participantCount: counts[`group:${g.id}`] || 0,
        }));
        const weekIds = [...new Set(data.participants.filter((p) => p.scope && p.scope.startsWith('weekly:')).map((p) => p.scope.slice(7)))].sort().reverse();
        return jsonResponse({ groups, weekIds });
      }

      /* ---- 관리자: 특정 그룹/주간 챌린지의 참가자 기록 조회 (비밀번호 필요) ---- */
      if (pathname === '/admin/scope-participants') {
        if (body.adminPassword !== ADMIN_PASSWORD) return jsonResponse({ error: 'unauthorized' }, 401);
        if (!body.scope) return jsonResponse({ error: 'scope required' }, 400);
        const data = await readActive(env, ctx);
        const list = data.participants.filter((p) => p.scope === body.scope);
        return jsonResponse({ participants: list });
      }

      /* ---- 그룹/주간 챌린지 순위표 (해당 그룹·주차만 공개, 전체 그룹 목록은 노출 안 함) ---- */
      if (pathname === '/group-leaderboard') {
        if (!body.groupId) return jsonResponse({ error: 'groupId required' }, 400);
        const data = await readActive(env, ctx);
        const g = data.groups.find((x) => x.id === body.groupId);
        if (!g) return jsonResponse({ error: 'not_found' }, 404);
        const list = data.participants.filter((p) => p.scope === `group:${g.id}`);
        return jsonResponse({ group: publicGroup(g), participants: list });
      }
      if (pathname === '/weekly-leaderboard') {
        if (!body.weekId) return jsonResponse({ error: 'weekId required' }, 400);
        const { data } = await readData(env);
        const list = data.participants.filter((p) => p.scope === `weekly:${body.weekId}`);
        return jsonResponse({ participants: list });
      }

      if (pathname === '/add-participant') {
        if (!body.nickname || !body.scope) return jsonResponse({ error: 'nickname/scope required' }, 400);
        const id = uid();
        try {
          await mutate((d) => {
            if (body.scope.startsWith('group:')) {
              const gid = body.scope.slice(6);
              if (!d.groups.some((g) => g.id === gid)) throw Object.assign(new Error('group_not_found'), { notFound: true });
            }
            if (d.participants.some((p) => p.scope === body.scope && p.nickname === body.nickname)) {
              throw Object.assign(new Error('duplicate'), { duplicate: true });
            }
            d.participants.push({ id, nickname: body.nickname, scope: body.scope, profit: 0 });
          }, `add participant ${body.nickname}`, env, ctx);
        } catch (e) {
          if (e.duplicate) return jsonResponse({ error: 'duplicate' }, 409);
          if (e.notFound) return jsonResponse({ error: 'group_not_found' }, 404);
          throw e;
        }
        return jsonResponse({ id });
      }
      if (pathname === '/remove-participant') {
        if (!body.id) return jsonResponse({ error: 'id required' }, 400);
        await mutate((d) => { d.participants = d.participants.filter((p) => p.id !== body.id); }, `remove participant ${body.id}`, env, ctx);
        return jsonResponse({ ok: true });
      }
      if (pathname === '/delete-participant') {
        if (body.adminPassword !== ADMIN_PASSWORD) return jsonResponse({ error: 'unauthorized' }, 401);
        if (!body.scope || !body.nickname) return jsonResponse({ error: 'scope/nickname required' }, 400);
        await mutate((d) => {
          d.participants = d.participants.filter((p) => !(p.scope === body.scope && p.nickname === body.nickname));
        }, `delete participant ${body.nickname}`, env, ctx);
        return jsonResponse({ ok: true });
      }
      if (pathname === '/update-profit') {
        if (!body.id) return jsonResponse({ error: 'id required' }, 400);
        await mutate((d) => { const p = d.participants.find((x) => x.id === body.id); if (p) p.profit = body.profit; }, `update profit ${body.id}`, env, ctx);
        return jsonResponse({ ok: true });
      }
      if (pathname === '/reset') {
        if (body.adminPassword !== ADMIN_PASSWORD) return jsonResponse({ error: 'unauthorized' }, 401);
        await mutate((d) => {
          if (body.scope) d.participants = d.participants.filter((p) => p.scope !== body.scope);
          else d.participants = [];
        }, 'reset participants', env, ctx);
        return jsonResponse({ ok: true });
      }

      return jsonResponse({ error: 'not found' }, 404);
    } catch (e) {
      return jsonResponse({ error: e.message || 'internal error' }, 500);
    }
  },
};

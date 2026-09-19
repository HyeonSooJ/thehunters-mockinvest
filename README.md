# thehunters-mockinvest

`desktop-tutorial`(실제 KRX 시세 기반 모의투자 엔진)과 `invest_game_thehunters`(그룹/닉네임/리더보드 백엔드)를
하나로 합친 모의투자 사이트입니다.

## 기능

1. **그룹 대항전** — 관리자가 그룹을 만들 때 투자 기간(연도)과 종목 2개를 함께 지정합니다. 그룹 참가자는 전원
   동일한 조건으로 플레이하고, 그룹 내 순위표만 확인할 수 있습니다.
2. **혼자 하기** — 그룹에 속하지 않은 사람도 직접 투자 기간과 종목 2개를 골라 연습할 수 있습니다. 순위표 없이
   본인의 라운드별·총 수익률만 보여줍니다.
3. **이번 주 랜덤 챌린지** — 사이트가 ISO 주차를 시드로 매주 자동으로 투자 기간·종목을 결정합니다(서버 저장 없이
   모든 방문자가 결정론적으로 동일한 조건을 봅니다). 참가자에게는 그 주의 전체 참가자 순위표가 제공됩니다.
4. **실제 KRX 일별 시세 기반 캔들차트** — `data/ohlc/<종목코드>.js`에 2020-01-02 ~ 2026-07-03 일별 시가/고가/저가/종가
   데이터가 들어 있습니다. 원 출처는 한국거래소(KRX) 정보데이터시스템(data.krx.co.kr)이며,
   [FinanceData/marcap](https://github.com/FinanceData/marcap) 데이터셋을 그대로 사용했습니다. 사이트 footer에도
   출처를 표기해두었습니다.
5. **Google AdSense** — `index.html`에 로더 스크립트와 광고 슬롯(`<ins class="adsbygoogle">`)이 이미 들어가
   있습니다. `ca-pub-0000000000000000` (2곳) 과 `data-ad-slot` 값을 본인의 실제 AdSense 퍼블리셔 ID/슬롯으로
   교체하세요. AdSense 심사를 통과하려면 사이트가 먼저 GitHub Pages 등으로 실제 배포되어 있어야 합니다.

## 배포 방법

### 1. GitHub Pages로 프론트엔드 배포

저장소 Settings → Pages → Source를 `main` 브랜치로 지정하면
`https://<계정>.github.io/thehunters-mockinvest/` 로 서비스됩니다.

### 2. Cloudflare Worker 배포 (그룹/리더보드 저장용 백엔드)

`cloudflare-worker/worker.js` 파일 상단 주석을 따라 Cloudflare Workers(무료 플랜)에 배포하고,
Settings → Variables and Secrets에 `GITHUB_TOKEN`(Contents: Read/write 권한, 이 저장소 한정)을
Secret으로 추가하세요.

배포되면 생기는 `https://<이름>.<계정>.workers.dev` 주소를 `script.js` 최상단의

```js
const WORKER_URL = 'https://REPLACE-ME.workers.dev';
```

값에 넣고 다시 커밋/푸시하세요.

### 3. 관리자 비밀번호

`cloudflare-worker/worker.js`의 `ADMIN_PASSWORD` 값(기본 `1011`)을 원하는 값으로 바꾸세요. 이 값은 Worker
코드 안에 평문으로 저장되며, 저장소가 공개(public)라면 소스에서 그대로 보입니다 — 민감한 용도로 재사용하지 마세요.

## 알려진 제한 사항

- 그룹의 투자 기간·종목은 생성 시에만 지정할 수 있고, 이후에는 이름 변경/삭제만 가능합니다(설정을 바꾸려면
  삭제 후 재생성).
- "혼자 하기" 결과는 서버에 저장되지 않습니다(순위표가 없는 모드이므로 의도적으로 클라이언트 전용으로 두었습니다).
- 주간 챌린지의 기간·종목은 서버 저장 없이 ISO 주차 문자열을 시드로 한 결정론적 난수로 계산되므로, 참가자 전원이
  동일한 주에는 항상 같은 조건을 보게 됩니다.

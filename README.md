# WTI Research Terminal

**GitHub Pages:** https://jskimlam.github.io/WTI-Research-Terminal/

한국어 WTI (NYMEX Light Sweet Crude) 선물 정산가 기반 기술분석 리서치 대시보드입니다.

## 기능

- **정산가 차트:** 1주 / 1·2·3·6개월 / 전체. 결측 거래일 보간 없음.
- **기술지표 토글:** SMA20, SMA50, EMA20, Bollinger(20, 2σ), RSI14 (Wilder), MACD (12,26,9).
- **방향 점수 0~100:** 1주(5회), 1개월(21회), 2개월(42회), 3개월(63회). 추세·모멘텀·평균회귀 가중 합산. **상승 확률이 아닙니다.**
- **백테스트:** 판정 시점까지의 데이터만 사용; 검증 기간만큼 띄운 비중첩 표본; 방향 적중률·판정 비율·항상 상승 기준·95% Wilson 참고 구간과 CSV 다운로드.
- **모바일 최적화:** PC, 갤럭시 S 및 Fold 커버·메인 화면 대응.
- **정산가 CSV 불러오기/다운로드:** 브라우저에서만 일시 적용. 저장소에 자동으로 커밋되지 않습니다.

## 데이터

`data/wti-settlement.csv` · 열: `date,settlement_usd_bbl`

사용자 Google Drive 가격 DB의 NMCL001 (NYMEX Light Sweet Crude Settlement Mo01) 가격 이력 기반. 최종 기준일 2026-10-09, 정산가 **$91.85/bbl**, Reuters/Investing.com과 대조했습니다. 정산가 데이터는 **실시간 시세가 아닙니다**. 계약월이 바뀌는 근월물 연결 가격이며 별도 롤오버 조정을 적용하지 않습니다.

> Public 저장소의 모든 이력은 누구나 열람할 수 있습니다. 가격 데이터의 재배포 권리·계약 조건을 확인하세요.

## 매일 정산가 갱신 방법

1. [data/wti-settlement.csv](https://github.com/jskimlam/WTI-Research-Terminal/blob/main/data/wti-settlement.csv) → 편집(연필)
2. 가장 최근 거래일 다음에 실제 확인된 종가를 `YYYY-MM-DD,가격` 형식으로 추가합니다. 휴장일에는 추가하지 않습니다.
3. Commit changes를 누르면 GitHub Pages 배포 워크플로가 시작됩니다.
4. 사이트를 새로고침하면 차트, 기술지표, 방향 점수, 백테스트가 모두 재계산됩니다.

사이트의 **데이터 관리**에서 CSV를 임시 불러와 사전 확인할 수 있으나 저장소에는 반영되지 않습니다.

## 배포

`.github/workflows/deploy.yml`이 `main` 업데이트를 감지해 정적 사이트를 GitHub Pages에 배포합니다. 처음에 자동 배포가 실패하면 **Settings → Pages → Build and deployment → Source: GitHub Actions**를 선택하고 Actions에서 재실행하세요.

구현은 순수 HTML/CSS/JS/SVG이고 추가 API 키나 유료 CDN이 없습니다.

## 방법론 및 한계

방향 점수는 50을 중립으로 한 가중 신호 합계이며 상승 가능성이나 거래 성공 확률이 아닙니다. 백테스트도 비중첩 방향 비교일 뿐, 롤오버·실거래 수수료·슬리피지·세금 및 독립적인 외부 표본 검증을 포함하지 않습니다. 통계는 참고용이며 투자 권유가 아닙니다.

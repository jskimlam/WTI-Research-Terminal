---
name: wti-terminal
description: "WTI터미널: WTI 데일리·위클리 작성 중 NYMEX WTI 확정 종가를 검증하면 연결된 GitHub Pages 터미널의 정산가 CSV까지 함께 갱신하고 배포를 검증하는 운영 스킬. 'WTI터미널 업데이트', 'WTI 데일리', 'WTI 종가 갱신' 요청에 사용."
---

# WTI터미널 (WTI Research Terminal)

## 목적

사용자의 **WTI 데일리 / 위클리 작업 중 확정 종가를 확인할 때**, 동일한 확정 정산가를 GitHub의 WTI Research Terminal에도 반영한다. 가격 업데이트만 필요할 때는 기존 HTML/CSS/JavaScript UI 및 분석 알고리즘은 그대로 보존한다. 업데이트는 사용자의 관련 요청을 처리하는 **그 턴 안에서** 수행하며, 요청이 없는 상태에서 백그라운드로 실행된다고 주장하지 않는다.

## 대상

- GitHub repository: `jskimlam/WTI-Research-Terminal`
- Branch: `main`
- 가격 소스 파일: `data/wti-settlement.csv`
- 사이트: https://jskimlam.github.io/WTI-Research-Terminal/
- 배포: `.github/workflows/deploy.yml` · GitHub Pages Actions
- 로직: `app.js`가 CSV를 읽어 가격 차트, SMA20/SMA50/EMA20, Bollinger(20,2σ), RSI14, MACD(12,26,9), 방향 점수(5/21/42/63개 거래 관측치), 백테스트를 계산함.
- 사용자 요청 없이 `index.html`, `styles.css`, `app.js` 등의 레이아웃·계산식을 변경하지 않는다.

## 언제 실행하는가

1. 사용자가 "**WTI터미널 업데이트**", "**WTI 리서치터미널 업데이트**", "**WTI 종가 반영**"처럼 명시할 때.
2. 사용자 요청으로 **WTI 데일리 / 위클리 보고서**를 작성하면서 새 거래일의 **확정 정산가**를 검증해 데일리 가격 이력을 갱신할 때. 이 경우 별도의 "터미널 업데이트" 명령을 기다리지 않는다.
3. 단순히 WTI에 대해 개념 설명이나 의견을 요청한 경우에는 불필요한 GitHub 수정을 하지 않는다.

## 원본 및 가격 기준

- **우선 데이터 원본:** Google Drive의 `Price-Forecast-GPT_DB` Google Sheet. ID: `1IxibFuPPgCA2Zn7F9u0baBgDWc_YrJvTHXlKP4wc_O0`.
- Sheet: `prices`. 컬럼 A = `AssessDate`(날짜), 컬럼 B = `NMCL001` = **NYMEX Light Sweet Crude Settlement Mo01** (USD/bbl). 1~4행 메타데이터, 5행 헤더, 6행부터 가격. 최신일이 위쪽.
- **가격 대조:** Reuters(해당 거래일·정산 월물), 공식 CME/NYMEX 또는 Platts / Investing 가격 이력 등 확인 가능한 근거로 날짜와 **settlement(확정 종가)** 를 교차 검증. 휴장/정산 지연은 명시.
- 월물이 다른 WTI, Brent, 장중/실시간 가격, 시간외 가격, 추정값과 섞지 않는다. 사용자가 명시적으로 제공한 확정 거래소 가격은 우선 확인하되 다른 자료와 충돌하면 무조건 덮어쓰지 말고 불일치를 설명한다.
- **선물 롤오버:** 기존 `NMCL001` 근월물 연결 기록을 유지하고 계약 이월을 보간/백어드저스트하지 않는다. 월물 교체 효과에 대한 주의사항을 유지한다.
- 휴장일은 전 거래일 정산가를 데일리 브리핑에 유지할 수 있지만 **CSV에 휴장 날짜를 새로 추가하지 않는다**. 누락 가격을 임의로 보간·역산하지 않는다.

## 업데이트 절차

1. GitHub 연결에서 `jskimlam/WTI-Research-Terminal`의 `main` 브랜치 및 기존 `data/wti-settlement.csv`를 **먼저 가져온다**. 파일 SHA를 기록한다.
2. Google Drive `Price-Forecast-GPT_DB` `prices` 시트에서 최신 거래일과 `NMCL001` 확정가를 읽는다. WTI 데일리 작성에서 이미 검증된 날짜·종가가 있으면 동일한 사실을 활용한다.
3. 교차 확인하고 최신 날짜를 식별한다. GitHub CSV의 마지막 날짜 이후 **확인된 신규 거래일만** 추가한다. 기존 유효 이력은 보존한다. 사용자가 과거 정정 지시를 하지 않았다면 오래된 행의 값이 바뀌어 있더라도 조용히 수정하지 않고 차이를 보고한다.
4. 파일 규격:
   - 헤더: `date,settlement_usd_bbl`
   - 각 행: `YYYY-MM-DD,정산가격` (USD/bbl)
   - **오름차순**, 날짜 중복 없음, 숫자 양수, 정확한 날짜 형식, 미래 거래일 또는 빈 평가값 없음.
   - 같은 날 동일 값이면 **변경 없음**으로 처리; 쓸데없는 커밋 금지.
5. 변경 전후 검증: 유효 행 개수, 최종 날짜·가격, 신규 건수, 정렬·중복 여부, 오래된 데이터 유지 여부. 이전 최종 데이터 삭제/대량 변경 징후가 있으면 **중단**하고 확인한다.
6. GitHub `update_file`로 현재 파일 SHA를 사용해 CSV 한 파일만 `main`에 커밋한다. 예: `data: append confirmed WTI settlement through 2026-10-12`. 푸시 실패 또는 SHA 충돌 시 다시 가져와 비교한 후 재시도한다.
7. GitHub Pages 자동 배포 작업이 실행되는지 확인하고 **success** 상태인지 점검한다. 실패 시 Actions/job logs를 읽고 원인을 밝혀 해결 가능한 경우 수정 후 재검증한다. 성공만으로 화면까지 확인했다고 주장하지 말고 사이트 접속이 가능하면 마지막 날짜·값을 별도로 점검한다.
8. 응답/보고서 끝에 짧게 결과 표시:
   - `WTI터미널: 2026-10-09 종가 $91.85 반영 · GitHub 배포 성공` 같은 형식. 위 숫자는 예시이며 **당일 검증값으로 대체**한다.
   - 종가 미확정 / 자료 불일치 / 휴장: `WTI터미널: 업데이트 보류(사유)`
   - 반영할 새 날짜 없음: `WTI터미널: 최신일자 동일 · 추가 업데이트 없음`
   - 커밋만 되었을 때: `커밋 완료 · 배포 미확인`이라고 분리해 보고한다.

## 품질 및 안전 규칙

- 매일 아침 한국시간 7시 이후 확인하더라도 **정산가가 실제 확정되었는지** 먼저 판단한다. 시간만 기준으로 확정 가격을 가정하지 않는다.
- *자동 업데이트의 의미*는 사용자가 해당 데일리/위클리 작업을 의뢰하여 ChatGPT가 실제 연결된 GitHub/Drive에 접근할 수 있을 때 해당 작업 안에서 함께 수행한다는 뜻이다. 무인 스케줄이나 자체 백그라운드 실행이 기본 활성화된 것은 아니다.
- GitHub 및 원본 Google Drive 권한/연결이 없거나 데이터를 검증할 수 없을 때는 완료로 보고하지 말고 원인을 설명한다.
- CSV 공개 저장소이므로 Platts 등 자료 사용권한에 유의한다. 새로 확보한 제한적 출처의 원자료를 공개 업로드하면 안 되며, 사용자가 재배포 권한을 가진 기록을 우선한다.
- 웹페이지 URL, 기존 모바일 UI, 차트 토글, 기술지표, 방향 점수·백테스트 알고리즘을 보존한다. CSV 업데이트로 분석 결과가 자동 재계산되도록 설계되어 있으므로 매번 JS를 수정하지 않는다.
- 해석: 0~100은 방향 신호 점수이지 상승 확률이 아니며, 백테스트 적중률도 미래 적중 확률이 아니다.

## 확인 링크

- [WTI터미널](https://jskimlam.github.io/WTI-Research-Terminal/)
- [가격 CSV](https://github.com/jskimlam/WTI-Research-Terminal/blob/main/data/wti-settlement.csv)
- [배포 Actions](https://github.com/jskimlam/WTI-Research-Terminal/actions/workflows/deploy.yml)

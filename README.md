# AI 합금 디지털 트윈 시뮬레이션

조성 비율로 예측한 물성값을 기반으로 합금 모델을 생성하고, 가상 3D 공간에서 강도/휘어짐/늘어짐/온도 테스트를 실행하는 데스크톱 애플리케이션입니다.

## 실행

상위 폴더(`c:\ai_project\ai-materials-discovery-platform-simulation`)에서 실행해도 되고,
앱 폴더(`ai-materials-discovery-platform-simulation`) 안에서 실행해도 됩니다.

```bash
npm install
npm run build
npm start
```

개발 모드로 실행하려면:

```bash
npm run dev
```

## index.html을 바로 열면 안 되는 이유

현재 `index.html`은 정적 HTML 화면이 아니라 Vite/React 앱의 진입점입니다.
파일 안에서 `/src/main.jsx`를 불러오는데, 이 파일은 React JSX와 npm 패키지를 사용하므로 브라우저가 더블클릭 방식으로 직접 실행할 수 없습니다.

따라서 아래 둘 중 하나로 실행해야 합니다.

- 데스크톱 앱 실행: `npm start`
- 개발 서버 실행: `npm run dev`

## 구현된 구조

- `electron/`: Electron 데스크톱 앱 실행, Python 백엔드 자동 실행
- `src/`: React 기반 GUI와 React Three Fiber 3D 시뮬레이션 뷰포트
- `backend/`: Python 표준 라이브러리 기반 물성 예측/시뮬레이션 API
- `dist/`: `npm run build` 결과물

## 구현된 기능

- 조성 비율 기반 합금 생성 전용 플로우
- `ai-materials-platform/ai-materials-discovery-platform` 사전학습 RF 모델 연동
- 예측 모델 출력값 4개를 시뮬레이션 입력으로 사용
  - 0.2% 항복강도
  - 인장강도 UTS
  - 연신율
  - 단면 수축률
- Ni/Ti/Cr, Al/Mg/Si, Fe/Cr/Ni 합금 프리셋
- 조성 비율 슬라이더, 밀도 계수, 모델 스케일 조절
- 용체화 온도, 처리 시간, 테스트 온도 공정 조건 입력
- AI 물성 예측 API:
  - 밀도
  - 강도
  - 탄성 계수
  - 열전도율
  - 용융점
  - 예측 신뢰도
  - 격자 안정성
- 4개 물성 테스트:
  - 강도 테스트: 항복강도/UTS 기반 최대 응력 및 파손 위험 평가
  - 휘어짐 테스트: 탄성 계수와 연성 기반 구조 변형 평가
  - 늘어짐 테스트: 연신율/단면 수축률 기반 인장 변형 평가
  - 온도 테스트: 용융점/열전도율 기반 열 분포 평가
- React Three Fiber 기반 3D 합금 모델:
  - 격자형 합금 구조
  - 열 입자 시각화
  - 응력/열/X-Ray/와이어프레임 모드
  - 강도 테스트 균열 표현
  - 휘어짐/늘어짐 테스트 변형 애니메이션
  - 모델 비교 모드
- 우측 분석 패널:
  - AI 예측 결과
  - 온도 분석 그래프
  - 응력-변형률 그래프
  - 시뮬레이션 통계
  - 실시간 로그
- 하단 타임라인:
  - 재생/일시정지
  - 프레임 이동
  - 열 이벤트/응력 피크/변형률 수렴 마커
- 상태 저장/불러오기

## 백엔드 API

기본 주소:

```text
http://127.0.0.1:8765
```

엔드포인트:

- `GET /health`
- `GET /platform/status`
- `POST /predict`
- `POST /platform/predict`
- `POST /simulate`
- `POST /import-prediction`

예시 요청:

```json
{
  "composition": { "Ni": 42, "Ti": 31, "Cr": 27 },
  "densityScale": 0.62,
  "testType": "strength",
  "scale": 1.0
}
```

## 외부 모델 연결

현재 백엔드는 아래 위치의 사전학습 모델을 자동 탐색합니다.

```text
c:\ai_project\ai-materials-discovery-platform-simulation\_external\ai-materials-discovery-platform\models
```

다른 모델을 연결하려면 `AI_MATERIALS_PLATFORM_DIR` 환경변수에 해당 프로젝트 경로를 지정하면 됩니다.

```powershell
$env:AI_MATERIALS_PLATFORM_DIR="C:\path\to\ai-materials-discovery-platform"
npm start
```

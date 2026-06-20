# AI Materials Discovery Platform Simulation

조성 기반 재료 물성 예측, 3D 시편 시뮬레이션, 시험 모드별 변형 시각화, 보고서 생성까지 하나의 데스크톱 앱으로 통합한 Electron 기반 프로젝트입니다.

이 프로젝트는 다음 흐름을 하나로 연결합니다.

- Excel / JSON 데이터 읽기
- 조성 기반 예측 호출
- 3D 시편 및 시험 장치 렌더링
- 카메라 시점 제어
- 변형 테스트 시각화
- 결과 보고서 생성 및 PDF 저장

## 주요 기능

- 합금 조성 입력 및 프리셋 선택
- Excel / JSON 파일 import
- 외부 예측 결과 URL import
- 백엔드 물성 예측 호출
- ASTM E8 dog-bone 시편 3D 시각화
- 인장, 굽힘, 연신, 온도 테스트 시뮬레이션
- Von Mises 응력 기반 색상 시각화
- 실시간 변형량 / 상태 표시
- 보고서 생성
- PDF / CSV / JSON export

## 기능별 기술 스택

### Excel / JSON 읽어오기

- `xlsx`
- 브라우저 `FileReader`
- `JSON.parse`
- `Blob`

설명:
- Excel 파일은 `xlsx`로 시트를 읽고 JSON 행 데이터로 변환합니다.
- JSON 파일은 텍스트로 읽은 뒤 `JSON.parse`로 처리합니다.
- 결과 내보내기는 `Blob` 기반 다운로드를 사용합니다.

### 예측 수행

- 브라우저 `fetch`
- Electron preload bridge
- Python 표준 라이브러리 기반 HTTP 서버
- 로컬 REST API

설명:
- 프런트엔드는 `fetch`로 로컬 백엔드에 요청합니다.
- 백엔드 URL은 `window.desktopApi.getBackendUrl()` 브리지로 가져옵니다.
- 백엔드는 `backend/simulation_server.py`에서 동작합니다.

### 시편 렌더링

- `three`
- `@react-three/fiber`
- `LatheGeometry`
- `BufferGeometry`

설명:
- ASTM E8 dog-bone 시편과 일부 장치 형상은 Three.js geometry로 구성됩니다.
- 렌더링과 상태 연결은 React Three Fiber 기반입니다.

### 카메라 시점 변환

- `OrbitControls`
- React Three Fiber `useThree`
- React Three Fiber `useFrame`

설명:
- 마우스 기반 회전, 줌, 타깃 제어를 수행합니다.
- 리셋 시 카메라 위치와 타깃도 함께 초기화됩니다.

### 변형 테스트

- vertex deformation
- 시험별 커스텀 근사식
- Von Mises stress coloring

설명:
- FEM이 아니라 버텍스 변형 기반 시각화 방식입니다.
- 원본 버텍스 좌표를 보존하고 시험 타입별 수식으로 변형을 계산합니다.

### 보고서 생성

- React report modal
- SVG 그래프
- Electron `printToPDF`
- IPC bridge

설명:
- 보고서는 React 컴포넌트로 렌더링됩니다.
- 일부 차트는 SVG로 생성됩니다.
- PDF 저장은 Electron 메인 프로세스의 `printToPDF`로 처리합니다.

## 전체 기술 스택

- Electron 34
- React 19
- React DOM 19
- Vite 6
- Three.js r171
- React Three Fiber 9
- lucide-react
- xlsx
- Node.js
- Python

## 실행 방법

### 패키지 설치

```bash
npm install
```

### 개발 모드 실행

```bash
npm run dev
```

개발 모드 동작:
- Vite 개발 서버 실행
- Electron 앱 실행
- Electron이 개발 서버 URL을 로드

### 빌드 후 실행

```bash
npm start
```

동작:
- `vite build`
- Electron에서 `dist/index.html` 로드

### 프런트엔드 빌드 확인

```bash
npm run build
```

## 프로젝트 구조

```text
ai-materials-discovery-platform-simulation/
├─ electron/
│  ├─ main.cjs
│  ├─ main.js
│  └─ preload.cjs
├─ backend/
│  └─ simulation_server.py
├─ scripts/
│  ├─ dev.mjs
│  └─ start.mjs
├─ src/
│  ├─ App.jsx
│  ├─ main.jsx
│  ├─ styles.css
│  ├─ components/
│  │  ├─ ReportModal.jsx
│  │  ├─ ReportModalDigitalTwin.jsx
│  │  ├─ ReportModalKoreanSimple.jsx
│  │  └─ RealSimulationMode.jsx
│  └─ lib/
│     └─ physics.js
└─ package.json
```

## 핵심 파일

### `src/App.jsx`

- 메인 UI
- 파일 import / export
- 예측 호출
- 시뮬레이션 상태 관리
- 3D 씬 구성
- 보고서 모달 호출

### `src/lib/physics.js`

- 응력-변형률 곡선 생성
- Von Mises 계산
- 미세조직 상분율 추정
- 경도 / 파괴인성 추정

### `src/components/ReportModal.jsx`

- 보고서 렌더링
- SVG 차트
- PDF 저장 요청

### `electron/preload.cjs`

- 렌더러용 안전 브리지 제공
- `getBackendUrl`
- `savePDF`

### `electron/main.cjs`

- BrowserWindow 생성
- Python 백엔드 실행
- IPC 등록
- PDF 파일 저장 처리

### `backend/simulation_server.py`

- `/health`
- `/predict`
- `/simulate`
- `/import-prediction`
- `/platform/status`

## 지원 입력 방식

### 수동 입력

- 원소 조성 입력
- 프리셋 선택

### Excel import

- `xlsx` 기반 시트 읽기
- 행 단위 JSON 변환

### JSON import

- 저장 상태 복원
- 외부 예측 payload 읽기

### URL import

- 예측 결과 URL 호출
- 서버에서 정규화

## 예측 및 시뮬레이션 흐름

1. 조성 또는 파일 데이터를 입력합니다.
2. 프런트엔드가 백엔드에 예측 요청을 보냅니다.
3. 결과를 UI 상태로 정규화합니다.
4. 3D 시편과 시험 장치를 렌더링합니다.
5. 사용자가 카메라를 조작하거나 테스트를 실행합니다.
6. 변형과 응력을 시각화합니다.
7. 보고서를 생성하고 PDF로 저장할 수 있습니다.

## 시험 모드

### Strength

- 인장 기반 변형
- necking / fracture 시각화

### Bending

- 중앙 하중 기반 휨
- 지지 fixture + loading head 표시

### Elongation

- 연신 중심 변형

### Temperature

- 열 팽창 기반 시각화

## 보고서 기능

보고서에는 다음 정보가 포함될 수 있습니다.

- 합금 조성
- 예측 물성
- 응력-변형률 그래프
- 미세조직 추정
- 시뮬레이션 결과
- 최대 변형률
- 재료 상태

PDF 저장 방식:

1. 렌더러에서 보고서 HTML 생성
2. Electron IPC로 메인 프로세스 전달
3. 임시 HTML 파일 생성
4. `printToPDF` 실행

## 백엔드 API

기본 주소:

```text
http://127.0.0.1:8765
```

주요 엔드포인트:

- `GET /health`
- `GET /platform/status`
- `POST /predict`
- `POST /simulate`
- `POST /import-prediction`

## 외부 모델 연동

백엔드는 `_external/ai-materials-discovery-platform` 경로나 환경 변수 `AI_MATERIALS_PLATFORM_DIR`에서 외부 모델을 찾을 수 있습니다.

예시:

```powershell
$env:AI_MATERIALS_PLATFORM_DIR = "C:\path\to\ai-materials-discovery-platform"
npm start
```

## 주의 사항

- 이 프로젝트의 3D 시험 시각화는 FEM 솔버가 아니라 vertex deformation 기반입니다.
- 일부 보고서 항목은 경험식 또는 휴리스틱 기반 추정값입니다.
- 미세조직 상분율은 실제 금속조직 측정값이 아니라 조성 기반 근사치입니다.

## 확장 아이디어

- 시험별 리포트 템플릿 분리
- 재료군별 미세조직 모델 분리
- 카메라 프리셋 추가
- 자동 스크린샷 삽입 보고서
- 외부 ML 모델 연동 강화

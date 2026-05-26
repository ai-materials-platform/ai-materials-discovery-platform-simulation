from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
import re
import sys
from urllib.request import Request, urlopen
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 8765

ELEMENT_PROFILES = {
    "Fe": {"strength": 1.05, "elasticity": 0.92, "thermal": 0.76, "density": 7.87},
    "Ni": {"strength": 1.28, "elasticity": 0.95, "thermal": 0.82, "density": 8.90},
    "Ti": {"strength": 1.08, "elasticity": 1.20, "thermal": 0.42, "density": 4.51},
    "Cr": {"strength": 1.36, "elasticity": 0.92, "thermal": 0.58, "density": 7.19},
    "Al": {"strength": 0.74, "elasticity": 1.08, "thermal": 1.35, "density": 2.70},
    "Mg": {"strength": 0.52, "elasticity": 1.12, "thermal": 0.96, "density": 1.74},
    "Si": {"strength": 0.82, "elasticity": 0.88, "thermal": 1.15, "density": 2.33},
    "Mo": {"strength": 1.30, "elasticity": 0.88, "thermal": 0.72, "density": 10.28},
    "Mn": {"strength": 0.92, "elasticity": 0.90, "thermal": 0.60, "density": 7.30},
    "Nb": {"strength": 1.22, "elasticity": 0.86, "thermal": 0.52, "density": 8.57},
    "Zr": {"strength": 0.95, "elasticity": 0.82, "thermal": 0.48, "density": 6.52},
    "Ta": {"strength": 1.18, "elasticity": 0.84, "thermal": 0.50, "density": 16.69},
    "V": {"strength": 1.12, "elasticity": 0.86, "thermal": 0.58, "density": 6.11},
    "W": {"strength": 1.45, "elasticity": 0.78, "thermal": 0.68, "density": 19.25},
    "Cu": {"strength": 0.62, "elasticity": 1.02, "thermal": 1.45, "density": 8.96},
    "N": {"strength": 1.18, "elasticity": 0.96, "thermal": 0.42, "density": 1.25},
    "C": {"strength": 1.16, "elasticity": 0.90, "thermal": 0.35, "density": 2.26},
    "B": {"strength": 1.10, "elasticity": 0.94, "thermal": 0.45, "density": 2.34},
    "P": {"strength": 0.78, "elasticity": 0.82, "thermal": 0.36, "density": 1.82},
    "S": {"strength": 0.70, "elasticity": 0.80, "thermal": 0.34, "density": 2.07},
    "Co": {"strength": 1.20, "elasticity": 0.88, "thermal": 0.68, "density": 8.90},
    "Sn": {"strength": 0.48, "elasticity": 0.76, "thermal": 0.92, "density": 7.31},
    "Pb": {"strength": 0.30, "elasticity": 0.70, "thermal": 0.82, "density": 11.34},
}

TEST_FACTORS = {
    "strength": {"label": "강도 테스트", "thermal_load": 0.52, "stress_load": 1.28, "strain_load": 0.72},
    "bending": {"label": "휘어짐 테스트", "thermal_load": 0.42, "stress_load": 0.86, "strain_load": 1.32},
    "elongation": {"label": "늘어짐 테스트", "thermal_load": 0.47, "stress_load": 0.72, "strain_load": 1.62},
    "temperature": {"label": "온도 테스트", "thermal_load": 1.35, "stress_load": 0.98, "strain_load": 0.94},
}

PLATFORM_TARGETS = [
    "0.2%proof_stress (M Pa)",
    "UTS (M Pa)",
    "Elongation (%)",
    "Area_reduction (%)",
]

PLATFORM_MODEL_CACHE = None
PLATFORM_MODEL_ERROR = None


def read_body(handler):
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return {}
    return json.loads(handler.rfile.read(length).decode("utf-8"))


def normalize_composition(composition):
    clean = {}
    for element, value in composition.items():
        if element in ELEMENT_PROFILES:
            clean[element] = max(float(value), 0.0)
    total = sum(clean.values())
    if total <= 0:
        clean = {"Ni": 42.0, "Ti": 31.0, "Cr": 27.0}
        total = 100.0
    return {element: value / total for element, value in clean.items()}


def weighted(composition, key):
    return sum(ELEMENT_PROFILES[element][key] * ratio for element, ratio in composition.items())


def find_platform_project_dir():
    candidates = [
        os.environ.get("AI_MATERIALS_PLATFORM_DIR"),
        os.path.abspath(os.path.join(os.getcwd(), "..", "_external", "ai-materials-discovery-platform")),
        os.path.abspath(os.path.join(os.getcwd(), "..", "..", "_external", "ai-materials-discovery-platform")),
        os.path.abspath(os.path.join(os.getcwd(), "_external", "ai-materials-discovery-platform")),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        model_path = os.path.join(candidate, "models", "pretrained_material_model.pkl")
        data_engine_path = os.path.join(candidate, "models", "pretrained_data_engine.pkl")
        if os.path.exists(model_path) and os.path.exists(data_engine_path):
            return candidate
    return None


def load_platform_model():
    global PLATFORM_MODEL_CACHE, PLATFORM_MODEL_ERROR
    if PLATFORM_MODEL_CACHE is not None:
        return PLATFORM_MODEL_CACHE
    if PLATFORM_MODEL_ERROR is not None:
        raise RuntimeError(PLATFORM_MODEL_ERROR)

    project_dir = find_platform_project_dir()
    if not project_dir:
        PLATFORM_MODEL_ERROR = (
            "ai-materials-discovery-platform 사전학습 모델을 찾지 못했습니다. "
            "AI_MATERIALS_PLATFORM_DIR 환경변수 또는 _external 폴더를 확인하세요."
        )
        raise RuntimeError(PLATFORM_MODEL_ERROR)

    try:
        if project_dir not in sys.path:
            sys.path.insert(0, project_dir)
        import joblib
        from src.engine.model_engine import ModelEngine

        models_dir = os.path.join(project_dir, "models")
        data_engine = joblib.load(os.path.join(models_dir, "pretrained_data_engine.pkl"))
        data_engine.file_path = None
        model_engine = ModelEngine(model_type="RF", output_dim=4)
        model_engine.load(os.path.join(models_dir, "pretrained_material_model.pkl"))

        meta_path = os.path.join(models_dir, "pretrained_material_model_meta.json")
        meta = {}
        if os.path.exists(meta_path):
            with open(meta_path, "r", encoding="utf-8") as file:
                meta = json.load(file)

        PLATFORM_MODEL_CACHE = {
            "projectDir": project_dir,
            "dataEngine": data_engine,
            "modelEngine": model_engine,
            "meta": meta,
        }
        return PLATFORM_MODEL_CACHE
    except Exception as exc:
        PLATFORM_MODEL_ERROR = str(exc)
        raise


def platform_status():
    try:
        bundle = load_platform_model()
        meta = bundle["meta"]
        return {
            "available": True,
            "projectDir": bundle["projectDir"],
            "modelType": meta.get("model_type", "RF"),
            "r2Avg": meta.get("r2_avg"),
            "maeAvg": meta.get("mae_avg"),
            "targets": PLATFORM_TARGETS,
        }
    except Exception as exc:
        return {"available": False, "error": str(exc), "targets": PLATFORM_TARGETS}


def build_platform_input(raw_composition, process=None):
    process = process or {}
    composition = {element: max(float(value), 0.0) for element, value in raw_composition.items()}
    known_non_fe = sum(value for element, value in composition.items() if element != "Fe")
    composition["Fe"] = float(composition.get("Fe", max(0.0, 100.0 - known_non_fe)))

    defaults = {
        "Mo": 0,
        "Mn": 1.2,
        "Si": 0.5,
        "Nb": 0,
        "Ti": 0,
        "Zr": 0,
        "Ta": 0,
        "V": 0,
        "W": 0,
        "Cu": 0.2,
        "N": 0.04,
        "C": 0.03,
        "B": 0,
        "P": 0.02,
        "S": 0.01,
        "Co": 0,
        "Al": 0,
        "Sn": 0,
        "Pb": 0,
        "Solution_treatment_temperature": 1050,
        "Solution_treatment_time(s)": 3600,
        "Water_Quenched_after_s.t.": 1,
        "Air_Quenched_after_s.t.": 0,
        "Grains mm-2": 12000,
        "Type of melting": 1,
        "Size of ingot": 100,
        "Product form": 1,
        "Temperature (K)": 293,
    }
    platform_input = {**defaults, **composition}
    platform_input.update({key: float(value) for key, value in process.items() if value not in (None, "")})
    return platform_input


def run_platform_prediction(raw_composition, process=None):
    bundle = load_platform_model()
    data_engine = bundle["dataEngine"]
    model_engine = bundle["modelEngine"]
    platform_input = build_platform_input(raw_composition, process)
    scaled_input = data_engine.get_inference_data(platform_input)
    mean_scaled, std_scaled = model_engine.predict(scaled_input.astype("float32"))
    mean = data_engine.inverse_transform_y(mean_scaled)[0]
    std = std_scaled[0] * data_engine.scaler_y.scale_

    result = {
        "yieldStressMpa": round(float(mean[0]), 2),
        "utsMpa": round(float(mean[1]), 2),
        "elongationPercent": round(float(mean[2]), 2),
        "areaReductionPercent": round(float(mean[3]), 2),
        "uncertainty": {
            "yieldStressMpa": round(float(std[0]), 2),
            "utsMpa": round(float(std[1]), 2),
            "elongationPercent": round(float(std[2]), 2),
            "areaReductionPercent": round(float(std[3]), 2),
        },
        "input": platform_input,
        "model": platform_status(),
    }
    return result


def platform_prediction_to_sim_prediction(raw_composition, density_scale, platform_prediction):
    base = predict_properties(raw_composition, density_scale, use_platform=False)
    composition_keys = [
        "Fe", "Cr", "Ni", "Mo", "Mn", "Si", "Nb", "Ti", "Zr", "Ta", "V", "W",
        "Cu", "N", "C", "B", "P", "S", "Co", "Al", "Sn", "Pb",
    ]
    platform_input = platform_prediction.get("input", {})
    composition_total = sum(float(platform_input.get(key, 0) or 0) for key in composition_keys)
    if composition_total > 0:
        base["composition"] = {
            key: round((float(platform_input.get(key, 0) or 0) / composition_total) * 100, 3)
            for key in composition_keys
            if float(platform_input.get(key, 0) or 0) > 0
        }
    yield_stress = platform_prediction["yieldStressMpa"]
    uts = platform_prediction["utsMpa"]
    elongation = platform_prediction["elongationPercent"]
    area_reduction = platform_prediction["areaReductionPercent"]
    uncertainty = platform_prediction["uncertainty"]
    uncertainty_avg = sum(abs(value) for value in uncertainty.values()) / max(len(uncertainty), 1)

    confidence = max(55.0, min(98.5, 96.0 - uncertainty_avg * 0.18))
    elasticity = max(95.0, min(230.0, 110.0 + yield_stress * 0.045 - elongation * 0.28))
    stability = max(35.0, min(99.0, 64.0 + area_reduction * 0.22 + yield_stress * 0.012 - elongation * 0.08))

    return {
        **base,
        "strengthMpa": round(uts, 1),
        "yieldStressMpa": round(yield_stress, 1),
        "utsMpa": round(uts, 1),
        "elongationPercent": round(elongation, 1),
        "areaReductionPercent": round(area_reduction, 1),
        "elasticityGpa": round(elasticity, 1),
        "predictionConfidence": round(confidence, 1),
        "latticeStability": round(stability, 1),
        "platformPrediction": platform_prediction,
        "predictionSource": "ai-materials-discovery-platform pretrained RF model",
    }


def predict_properties(raw_composition, density_scale, use_platform=True, process=None):
    if use_platform:
        try:
            platform_prediction = run_platform_prediction(raw_composition, process)
            return platform_prediction_to_sim_prediction(raw_composition, density_scale, platform_prediction)
        except Exception:
            pass

    composition = normalize_composition(raw_composition)
    density = weighted(composition, "density") * (0.82 + density_scale * 0.36)
    strength_base = weighted(composition, "strength")
    elasticity_base = weighted(composition, "elasticity")
    thermal_base = weighted(composition, "thermal")
    mixing_entropy = -sum(ratio * math.log(max(ratio, 0.0001)) for ratio in composition.values())
    balance_bonus = 1.0 + min(mixing_entropy / 3.0, 0.18)

    strength = 820 * strength_base * balance_bonus * (0.88 + density_scale * 0.22)
    elasticity = 135 * elasticity_base * (1.08 - density_scale * 0.08)
    thermal_conductivity = 118 * thermal_base * (0.92 + density_scale * 0.12)
    melting_point = 1160 + 410 * strength_base - 95 * thermal_base
    prediction_confidence = min(98.0, 86.0 + mixing_entropy * 7.5)

    return {
        "composition": {element: round(ratio * 100, 2) for element, ratio in composition.items()},
        "density": round(density, 2),
        "strengthMpa": round(strength, 1),
        "elasticityGpa": round(elasticity, 1),
        "thermalConductivity": round(thermal_conductivity, 1),
        "meltingPoint": round(melting_point, 1),
        "predictionConfidence": round(prediction_confidence, 1),
        "latticeStability": round(78 + strength_base * 10 + mixing_entropy * 4, 1),
    }


def simulate_test(raw_composition, density_scale, test_type, scale):
    prediction = predict_properties(raw_composition, density_scale)
    factors = TEST_FACTORS.get(test_type, TEST_FACTORS["strength"])
    scale_effect = max(float(scale), 0.4)
    density_effect = prediction["density"] / 7.2

    ductility = prediction.get("elongationPercent", 18.0) / 18.0
    reduction = prediction.get("areaReductionPercent", 45.0) / 45.0
    stress = prediction["strengthMpa"] * factors["stress_load"] * density_effect / scale_effect
    strain = (prediction["elasticityGpa"] / 150) * factors["strain_load"] * scale_effect * max(0.55, ductility)
    temperature = prediction["meltingPoint"] * factors["thermal_load"] * (0.78 + density_scale * 0.26)
    deformation = min(38.0, strain * 5.2 * max(0.72, reduction))
    safety = max(4.0, 100 - deformation * 1.6 - max(0, temperature - 850) * 0.035)

    return {
        "testType": test_type,
        "testLabel": factors["label"],
        "prediction": prediction,
        "result": {
            "maxStressMpa": round(stress, 1),
            "strainPercent": round(strain, 2),
            "temperatureC": round(temperature, 1),
            "deformationMm": round(deformation, 2),
            "safetyIndex": round(safety, 1),
            "thermalGradient": round(temperature / max(scale_effect, 0.5) * 0.18, 1),
            "failureRisk": "낮음" if safety >= 78 else "주의" if safety >= 58 else "높음",
            "yieldStressMpa": prediction.get("yieldStressMpa"),
            "utsMpa": prediction.get("utsMpa"),
            "elongationPercent": prediction.get("elongationPercent"),
            "areaReductionPercent": prediction.get("areaReductionPercent"),
        },
        "timelineEvents": [
            {"time": 12, "type": "thermal", "label": "열 분포 안정화"},
            {"time": 38, "type": "stress", "label": "응력 피크"},
            {"time": 67, "type": "strain", "label": "변형률 수렴"},
        ],
    }


def github_raw_url(source_url):
    if "github.com" not in source_url or "/blob/" not in source_url:
        return source_url
    parsed = urlparse(source_url)
    parts = parsed.path.strip("/").split("/")
    if len(parts) < 5:
        return source_url
    owner, repo, _, branch = parts[:4]
    file_path = "/".join(parts[4:])
    return f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{file_path}"


def extract_json_payload(text):
    stripped = text.strip()
    if stripped.startswith("{") or stripped.startswith("["):
        return json.loads(stripped)

    script_match = re.search(
        r'<script[^>]+id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>',
        text,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if script_match:
        return json.loads(script_match.group(1))

    assignment_match = re.search(
        r"(?:window\.)?(?:__PREDICTION_DATA__|predictionResult|materialPrediction)\s*=\s*(\{.*?\});",
        text,
        flags=re.DOTALL,
    )
    if assignment_match:
        return json.loads(assignment_match.group(1))

    raise ValueError("JSON 예측 결과를 찾을 수 없습니다. raw JSON URL 또는 API URL을 입력해주세요.")


def import_prediction(source_url):
    if not source_url:
        raise ValueError("sourceUrl is required")
    target_url = github_raw_url(source_url)
    request = Request(target_url, headers={"User-Agent": "ai-alloy-simulation/0.1"})
    with urlopen(request, timeout=12) as response:
        body = response.read().decode("utf-8", errors="replace")
    return {
        "sourceUrl": source_url,
        "resolvedUrl": target_url,
        "payload": extract_json_payload(body),
    }


class Handler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self.send_json(200, {"status": "ok", "service": "ai-alloy-simulation"})
            return
        if path == "/platform/status":
            self.send_json(200, platform_status())
            return
        self.send_json(404, {"error": "not_found"})

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = read_body(self)
            composition = body.get("composition", {})
            density_scale = float(body.get("densityScale", 0.62))
            scale = float(body.get("scale", 1.0))
            process = body.get("process", {})
            if path == "/predict":
                self.send_json(200, predict_properties(composition, density_scale, process=process))
                return
            if path == "/platform/predict":
                platform_prediction = run_platform_prediction(composition, process)
                self.send_json(200, {
                    "platformPrediction": platform_prediction,
                    "prediction": platform_prediction_to_sim_prediction(composition, density_scale, platform_prediction),
                })
                return
            if path == "/simulate":
                self.send_json(200, simulate_test(composition, density_scale, body.get("testType", "strength"), scale))
                return
            if path == "/import-prediction":
                self.send_json(200, import_prediction(body.get("sourceUrl", "")))
                return
            self.send_json(404, {"error": "not_found"})
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def log_message(self, *_args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"AI alloy simulation backend running on http://{HOST}:{PORT}")
    server.serve_forever()

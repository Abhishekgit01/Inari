from __future__ import annotations

import json
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

router = APIRouter(prefix="/api/giskard", tags=["giskard"])


def _load_scanner():
    try:
        from ...giskard_harness import scanner
    except Exception as exc:  # pragma: no cover - depends on optional runtime deps
        raise HTTPException(
            status_code=503,
            detail=f"Giskard tooling is unavailable in this environment: {exc}",
        ) from exc
    return scanner


@router.post("/scan/blue")
async def trigger_blue_scan(request: Request, background_tasks: BackgroundTasks):
    """
    Trigger a Blue AI quality scan in the background.
    """

    detector = getattr(request.app.state, "detector", None)
    scorer = getattr(request.app.state, "scorer", None)
    correlator = getattr(request.app.state, "correlator", None)

    if not all([detector, scorer, correlator]):
        raise HTTPException(status_code=503, detail="Detection components are not initialized yet.")

    scanner = _load_scanner()
    background_tasks.add_task(scanner.run_blue_scan, detector, scorer, correlator)
    return {"status": "Blue scan started", "check": "/api/giskard/reports"}


@router.post("/scan/red")
async def trigger_red_scan(request: Request, background_tasks: BackgroundTasks):
    """
    Trigger a Red AI adversarial probe of the live detector.
    """

    detector = getattr(request.app.state, "detector", None)
    if detector is None:
        raise HTTPException(status_code=503, detail="Detector is not initialized yet.")

    scanner = _load_scanner()
    background_tasks.add_task(scanner.run_red_scan, detector)
    return {"status": "Red adversarial scan started", "check": "/api/giskard/reports"}


@router.get("/reports")
async def list_reports():
    """
    Return all available Giskard scan reports.
    """

    scanner = _load_scanner()
    if not scanner.REPORTS_DIR.exists():
        return {"reports": []}

    reports = []
    for path in sorted(scanner.REPORTS_DIR.iterdir(), reverse=True):
        reports.append(
            {
                "name": path.name,
                "type": "red" if path.name.startswith("red") else "blue",
                "format": path.suffix.lstrip("."),
                "size_kb": round(path.stat().st_size / 1024, 1),
            }
        )

    return {"reports": reports}


@router.get("/status")
async def giskard_status():
    scanner = _load_scanner()
    reports = []
    if scanner.REPORTS_DIR.exists():
        reports = sorted(scanner.REPORTS_DIR.iterdir(), reverse=True)

    return {
        "runtime": scanner.GISKARD_RUNTIME,
        "using_real_giskard": scanner.USING_REAL_GISKARD,
        "version": scanner.GISKARD_VERSION,
        "reports_available": len(reports),
    }


@router.get("/blind-spots/latest")
async def get_latest_blind_spots():
    """
    Return the most recent Red scan blind spots for Stage 9 visibility.
    """

    scanner = _load_scanner()
    json_files = sorted(scanner.REPORTS_DIR.glob("red_blind_spots_*.json"), reverse=True)
    if not json_files:
        raise HTTPException(status_code=404, detail="No Red scan results found yet.")

    with json_files[0].open(encoding="utf-8") as handle:
        data = json.load(handle)

    return {"source": json_files[0].name, "blind_spots": scanner._json_safe(data)}

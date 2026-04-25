"""LLM-powered narrative report writer.

Uses NVIDIA API (default) to convert raw simulation JSON into a
human-readable Markdown blog post. NVIDIA's API is OpenAI-compatible.
Falls back to a deterministic template if no API key is configured.

Env vars:
  NVIDIA_API_KEY       — Your NVIDIA API key (build.nvidia.com)
  REPORT_LLM_PROVIDER  — "nvidia" (default) | "gemini" | "groq"
  REPORT_LLM_MODEL     — model override (default: nvidia/llama-3.1-nemotron-70b-instruct)
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── Config ──────────────────────────────────────────────────────────────────

PROVIDER = os.getenv("REPORT_LLM_PROVIDER", "nvidia").lower()
NVIDIA_KEY = os.getenv("NVIDIA_API_KEY", "")
REPORT_KEY = os.getenv("REPORT_LLM_API_KEY", "")
API_KEY = NVIDIA_KEY or REPORT_KEY  # NVIDIA_API_KEY takes precedence
MODEL = os.getenv("REPORT_LLM_MODEL", "")

_SYSTEM_PROMPT = """\
You are a cybersecurity report writer employed by a SOC (Security Operations Centre).
Convert the raw simulation JSON below into a **professional, human-readable Markdown blog post**.
Use clear headings, bullet points, and plain English explanations.
Include: Executive Summary, Threat Timeline, Key Findings (with MITRE ATT&CK references),
Risk Assessment, Recommendations, and a Conclusion.
Do NOT invent data — only use what is provided.
Write in a calm, authoritative tone suitable for both technical staff and C-suite executives.
"""


# ── Main entry point ───────────────────────────────────────────────────────

async def generate_narrative_report(simulation_data: dict[str, Any]) -> str:
    """Generate a Markdown narrative report from simulation data."""
    if API_KEY:
        try:
            return await _call_llm(simulation_data)
        except Exception as exc:
            logger.warning("LLM report generation failed, falling back to template: %s", exc)

    return _template_report(simulation_data)


async def _call_llm(data: dict[str, Any]) -> str:
    """Route to the configured LLM provider."""
    payload_json = json.dumps(data, default=str, indent=2)[:12000]

    if PROVIDER == "gemini":
        return await _call_gemini(payload_json)
    elif PROVIDER == "groq":
        return await _call_groq(payload_json)
    else:
        # Default: NVIDIA (OpenAI-compatible)
        return await _call_nvidia(payload_json)


# ── NVIDIA API (default — OpenAI-compatible) ────────────────────────────────

async def _call_nvidia(payload: str) -> str:
    model = MODEL or "nvidia/llama-3.1-nemotron-70b-instruct"
    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Here is the simulation data:\n\n```json\n{payload}\n```"},
        ],
        "temperature": 0.5,
        "max_tokens": 4096,
        "top_p": 0.7,
    }
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            url,
            json=body,
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
        )
        resp.raise_for_status()
        result = resp.json()
        return result["choices"][0]["message"]["content"]


# ── Gemini API ──────────────────────────────────────────────────────────────

async def _call_gemini(payload: str) -> str:
    model = MODEL or "gemini-2.0-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}"
    body = {
        "contents": [{"parts": [
            {"text": _SYSTEM_PROMPT},
            {"text": f"Here is the simulation data:\n\n```json\n{payload}\n```"},
        ]}],
        "generationConfig": {"temperature": 0.5, "maxOutputTokens": 4096},
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=body)
        resp.raise_for_status()
        result = resp.json()
        return result["candidates"][0]["content"]["parts"][0]["text"]


# ── Groq API ────────────────────────────────────────────────────────────────

async def _call_groq(payload: str) -> str:
    model = MODEL or "llama-3.1-8b-instant"
    url = "https://api.groq.com/openai/v1/chat/completions"
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Here is the simulation data:\n\n```json\n{payload}\n```"},
        ],
        "temperature": 0.5,
        "max_tokens": 4096,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=body, headers={"Authorization": f"Bearer {API_KEY}"})
        resp.raise_for_status()
        result = resp.json()
        return result["choices"][0]["message"]["content"]


# ── Template fallback ───────────────────────────────────────────────────────

def _template_report(data: dict[str, Any]) -> str:
    """Deterministic Markdown report when no LLM key is set."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    sim_id = data.get("simulation_id", "N/A")
    step = data.get("step", 0)
    max_steps = data.get("max_steps", 30)

    kc = data.get("kill_chain") or {}
    stage = kc.get("current_stage_name", "Reconnaissance")
    urgency = kc.get("urgency", "elevated")
    breach = kc.get("breach_countdown_display", "~12 min (estimated)")
    progress = round((kc.get("kill_chain_progress", 0)) * 100)

    alerts = data.get("alerts") or []
    critical = sum(1 for a in alerts if a.get("severity") == "critical")
    high = sum(1 for a in alerts if a.get("severity") == "high")
    medium = sum(1 for a in alerts if a.get("severity") == "medium")

    apt = data.get("apt_attribution") or []
    apt_section = ""
    if apt:
        top = apt[0]
        apt_section = f"""- **Primary Match:** {top.get('name', 'Unknown')} ({top.get('nation', '?')})
  - Confidence: {top.get('confidence', 'N/A')}
  - Risk Note: {top.get('risk_note', 'Manual review recommended')}"""
    else:
        apt_section = "- No strong attribution match detected during this simulation window."

    red = data.get("red_cumulative", 0)
    blue = data.get("blue_cumulative", 0)

    # ── Build Threat Timeline from alerts ──
    timeline_rows = ""
    for a in alerts[:10]:
        sev = a.get("severity", "info").upper()
        mitre = a.get("mitre_id", "—")
        headline = a.get("headline", a.get("threat_type", "Event"))
        target = a.get("target_host_label", a.get("target_host", "—"))
        timeline_rows += f"| Step {a.get('step', '?')} | {sev} | {mitre} | {headline} | {target} |\n"
    if not timeline_rows:
        timeline_rows = "| — | — | — | No alerts recorded yet | — |\n"

    # ── Build Compromised Hosts section ──
    compromised = data.get("compromised_hosts", [])
    if compromised:
        comp_lines = "\n".join(f"- Host ID `{h}` — **COMPROMISED**" for h in compromised)
    else:
        comp_lines = "- No hosts compromised during this simulation window."

    # ── Determine overall risk ──
    if critical >= 3:
        risk_level = "🔴 **CRITICAL** — Immediate incident response required"
    elif critical >= 1 or high >= 3:
        risk_level = "🟠 **HIGH** — Escalate to senior SOC analyst"
    elif high >= 1 or medium >= 3:
        risk_level = "🟡 **MEDIUM** — Monitor closely, prepare containment plan"
    else:
        risk_level = "🟢 **LOW** — Standard monitoring posture"

    return f"""# CyberGuardian AI — Threat Assessment Report

**Generated:** {now}
**Simulation ID:** `{sim_id}` | Step {step}/{max_steps}
**Classification:** CONFIDENTIAL — SOC INTERNAL

---

## Executive Summary

This automated report summarises findings from a Red vs Blue AI-driven simulation exercise
modelling adversarial network penetration against the monitored infrastructure.
The simulation reached the **{stage}** phase of the MITRE ATT&CK kill chain with **{urgency}** urgency.
The modelled breach countdown stands at **{breach}** with {progress}% kill-chain progression.

Overall Risk Assessment: {risk_level}

---

## Key Metrics

| Metric | Value |
|---|---|
| Kill Chain Stage | {stage} |
| Urgency | {urgency} |
| Breach Countdown | {breach} |
| Kill Chain Progress | {progress}% |
| Red Agent Score | {red:.1f} |
| Blue Agent Score | {blue:.1f} |
| Critical Alerts | {critical} |
| High Alerts | {high} |
| Medium Alerts | {medium} |
| Total Alerts | {len(alerts)} |

---

## Threat Timeline

| Step | Severity | MITRE ID | Description | Target |
|---|---|---|---|---|
{timeline_rows}
---

## Compromised Assets

{comp_lines}

---

## Threat Attribution

{apt_section}

---

## Recommendations

1. **Immediate:** Review all {critical} critical-severity alerts for actionable IOCs and initiate containment.
2. **Short-term:** Validate the APT attribution against your own threat intel feeds (STIX/TAXII).
3. **Operational:** If breach countdown is below 5 minutes, escalate to Incident Commander immediately.
4. **Strategic:** Run URL Security surface scan against any external bridge events detected.
5. **Post-Incident:** Archive this simulation for compliance (SOC2, ISO 27001) audit trail.

---

## Conclusion

The Blue defense agent achieved a cumulative score of **{blue:.1f}** against the Red adversary's **{red:.1f}**,
{"indicating successful defense containment." if blue > red else "suggesting the adversary gained significant ground. Immediate review recommended."}

This report was generated automatically by the CyberGuardian AI template engine.
For a richer, narrative-style report powered by LLM analysis, set `NVIDIA_API_KEY` in your `backend/.env` file.

> *Report generated at {now} — CyberGuardian AI v2.0*
"""


"""
Threat DNA — behavioral fingerprint comparison against known APT groups.
Returns structured data for the frontend's APT Attribution panel.
"""

from typing import Dict, List


def format_apt_attribution(apt_similarity: Dict[str, float]) -> List[dict]:
    """
    Format APT similarity scores for frontend rendering.
    Returns list sorted by similarity, with metadata for display.
    """
    APT_METADATA = {
        "APT29 (Cozy Bear)": {
            "nation": "Russia",
            "nation_flag": "🇷🇺",
            "known_targets": ["Government", "Defense", "Think Tanks"],
            "risk_note": "Patient, persistent. Known for long dwell times.",
            "color": "#cc3333",
        },
        "APT28 (Fancy Bear)": {
            "nation": "Russia",
            "nation_flag": "🇷🇺",
            "known_targets": ["Military", "Government", "Aerospace"],
            "risk_note": "Aggressive credential theft. Moves fast once in.",
            "color": "#cc3333",
        },
        "Lazarus Group": {
            "nation": "North Korea",
            "nation_flag": "🇰🇵",
            "known_targets": ["Financial", "Crypto", "Defense"],
            "risk_note": "Financially motivated. Heavy exfiltration focus.",
            "color": "#cc6600",
        },
        "Carbanak": {
            "nation": "Unknown",
            "nation_flag": "🌐",
            "known_targets": ["Banking", "Financial Services"],
            "risk_note": "Slow, methodical. Targets high-value financial data.",
            "color": "#cc9900",
        },
        "Generic Opportunistic": {
            "nation": "Unknown",
            "nation_flag": "🌐",
            "known_targets": ["Any exposed system"],
            "risk_note": "Low sophistication. Unlikely to achieve deep penetration.",
            "color": "#666666",
        },
    }

    result = []
    for apt_name, score in apt_similarity.items():
        meta = APT_METADATA.get(apt_name, {})
        result.append({
            "name": apt_name,
            "score": score,
            "score_percent": int(score * 100),
            "bar_fill": score,
            "nation": meta.get("nation", "Unknown"),
            "flag": meta.get("nation_flag", "🌐"),
            "targets": meta.get("known_targets", []),
            "risk_note": meta.get("risk_note", ""),
            "color": meta.get("color", "#ffffff"),
            "is_top_match": score == max(apt_similarity.values()) if apt_similarity else False,
        })

    return sorted(result, key=lambda x: x["score"], reverse=True)

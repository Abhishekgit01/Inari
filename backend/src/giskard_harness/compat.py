from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import numpy as np
import pandas as pd


@dataclass
class Model:
    model: Callable[[pd.DataFrame], np.ndarray]
    model_type: str
    name: str
    description: str = ""
    classification_labels: list[str] | None = None
    feature_names: list[str] | None = None

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        if self.feature_names:
            available = [name for name in self.feature_names if name in df.columns]
            if available:
                df = df[available].copy()
        return np.asarray(self.model(df))


@dataclass
class Dataset:
    df: pd.DataFrame
    target: str | None = None
    name: str = ""
    cat_columns: list[str] | None = None


@dataclass
class Issue:
    group: str
    description: str
    level: str
    examples: pd.DataFrame = field(default_factory=pd.DataFrame)


@dataclass
class ScanResult:
    issues: list[Issue]
    name: str
    model_name: str

    def has_vulnerabilities(self, level: str = "major") -> bool:
        severity_rank = {"minor": 1, "major": 2, "critical": 3}
        threshold = severity_rank.get(level, 2)
        return any(severity_rank.get(issue.level, 0) >= threshold for issue in self.issues)

    def to_html(self, path: str) -> None:
        rows = []
        for issue in self.issues:
            rows.append(
                "<tr>"
                f"<td>{issue.level.upper()}</td>"
                f"<td>{issue.group}</td>"
                f"<td>{issue.description}</td>"
                f"<td>{len(issue.examples.index)}</td>"
                "</tr>"
            )

        empty_row = "<tr><td colspan='4'>No issues found.</td></tr>"
        body = (
            "<html><head><title>Giskard Compatibility Report</title></head><body>"
            f"<h1>{self.model_name} Scan</h1>"
            f"<p>Dataset: {self.name}</p>"
            "<table border='1' cellpadding='6' cellspacing='0'>"
            "<thead><tr><th>Level</th><th>Group</th><th>Description</th><th>Examples</th></tr></thead>"
            f"<tbody>{''.join(rows) or empty_row}</tbody>"
            "</table></body></html>"
        )
        Path(path).write_text(body, encoding="utf-8")


def scan(model: Model, dataset: Dataset) -> ScanResult:
    df = dataset.df.copy()
    target = dataset.target if dataset.target in df.columns else None
    features = df.drop(columns=[target]) if target else df
    predictions = model.predict(features)
    issues: list[Issue] = []

    if model.model_type == "classification":
        if target:
            labels = df[target].astype(str).to_numpy()
            predicted = predictions.astype(str)
            accuracy = float((predicted == labels).mean())
            mismatches = df[predicted != labels].head(10)

            if accuracy < 0.85:
                issues.append(
                    Issue(
                        group="Performance",
                        description=f"Accuracy dropped to {accuracy:.1%} on {dataset.name}.",
                        level="major",
                        examples=mismatches,
                    )
                )
            elif accuracy < 0.95:
                issues.append(
                    Issue(
                        group="Performance",
                        description=f"Accuracy is {accuracy:.1%}; monitor drift and edge cases.",
                        level="minor",
                        examples=mismatches,
                    )
                )

            if "benign" in set(labels):
                benign_mask = labels == "benign"
                if benign_mask.any():
                    false_positive_rate = float((predicted[benign_mask] != "benign").mean())
                    if false_positive_rate > 0.15:
                        issues.append(
                            Issue(
                                group="Robustness",
                                description=f"False-positive rate on benign traffic is {false_positive_rate:.1%}.",
                                level="major",
                                examples=df[benign_mask & (predicted != "benign")].head(10),
                            )
                        )
                    elif false_positive_rate > 0.05:
                        issues.append(
                            Issue(
                                group="Robustness",
                                description=f"False-positive rate on benign traffic is {false_positive_rate:.1%}.",
                                level="minor",
                                examples=df[benign_mask & (predicted != "benign")].head(10),
                            )
                        )
    else:
        if target:
            labels = df[target]
            scores = predictions.astype(float)
            if pd.api.types.is_numeric_dtype(labels):
                expected = labels.astype(float).to_numpy()
                mae = float(np.mean(np.abs(expected - scores)))
                if mae > 0.22:
                    issues.append(
                        Issue(
                            group="Performance",
                            description=f"Mean absolute error is {mae:.3f}.",
                            level="major",
                            examples=df.head(10),
                        )
                    )
                elif mae > 0.12:
                    issues.append(
                        Issue(
                            group="Performance",
                            description=f"Mean absolute error is {mae:.3f}.",
                            level="minor",
                            examples=df.head(10),
                        )
                    )
            else:
                labels = labels.astype(str).to_numpy()
                benign_mask = labels == "benign"
                malicious_mask = labels != "benign"
                benign_mean = float(scores[benign_mask].mean()) if benign_mask.any() else 0.0
                malicious_mean = float(scores[malicious_mask].mean()) if malicious_mask.any() else 0.0

                if malicious_mean <= benign_mean + 0.1:
                    issues.append(
                        Issue(
                            group="Robustness",
                            description="Confidence scores do not separate malicious and benign events.",
                            level="major",
                            examples=df.head(10),
                        )
                    )
                elif benign_mean > 0.45:
                    issues.append(
                        Issue(
                            group="Performance",
                            description="Benign events are receiving elevated confidence scores.",
                            level="minor",
                            examples=df[benign_mask].head(10),
                        )
                    )

    return ScanResult(issues=issues, name=dataset.name, model_name=model.name)
